// render/nodes — junction stations, border interconnectors and construction
// sites (docs/08 §2–§3, ARCHITECTURE.md §6, §9, §18). Consumes the `junctions`,
// `borders` and `sites` slices plus `lines` (only to learn which hex side a
// line leaves a node from, for the portal orientation), `sun`/`weather` for the
// night, and stands everything on `ctx.terrain`. One InstancedMesh per
// archetype for the whole country: 17–18 main-pass draw calls for two
// junctions, a border and a site (measured step 2). A layout is rebuilt only
// when an object's identity changes (seed,
// hex, slots, line ends, site progress bucket, quality); a turn that changes a
// flow rewrites a handful of colours and eases them over 1,5 s.
//
// State encoding (docs/08 §3): a junction reads by its bays — a strung portal
// with dead-end porcelain strings against a bare steel one, and a reserved bay
// (an end of an unbuilt line: apparatus and strings, no jumper) — by the number
// of lit floodlight masts and the brightness of the yard glow, both scaled by
// `slotsUsed`, and by the red obstruction light on the tallest gantry; a border
// reads by the emission of its terminal insulators and metering hall (cyan when
// importing, amber when exporting, intensity ∝ the throughput ratio, dim when
// idle) and by the foreign line running off the board into the fog; a site
// reads by its stage (earthworks → foundations and skeleton → cladding).
// Rings, flow particles, cranes and selection are the effects module's: it
// finds `nodes:base:<id>` at every junction and border (with
// `userData.borderPolyline`, foreign end → portal) and `site:crane:<siteId>` at
// the tallest point of a site.

import * as THREE from "three";
import type { WorldScene } from "../../bridge/worldScene";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, WorldModule } from "../core/types";
import { buildArchetypes, type Archetype } from "./geometry";
import {
  layoutBorder,
  layoutJunction,
  layoutSite,
  junctionSignature,
  type GlowKind,
  type GlowSpot,
  type NodeLayout,
} from "./layout";
import {
  createGlowMaterial,
  createNodeMaterials,
  createPoolMaterial,
  glowGeometry,
  poolGeometry,
  type GlowUniforms,
  type NodeMaterials,
} from "./materials";

/** docs/08 §4: the one cinematic moment (border flow, night lights settle). */
const TRANSITION_SECONDS = 1.5;
/** Detail archetypes hide beyond this camera distance × quality detail [km]. */
const DETAIL_KM = 300;
/** Beyond this the big silhouettes stop casting shadows (sub-texel) [km]. */
const SHADOW_CAST_KM = 220;
/** The warm white of a yard floodlight. */
const LAMP_TINT = new THREE.Color(1.0, 0.74, 0.42);
/** Obstruction red, kept moderate so ACES never turns it salmon. */
const AVIATION_TINT = new THREE.Color(1.5, 0.05, 0.02);
/** Import: cool cyan pole to pole. */
const IMPORT_TINT = new THREE.Color(0.06, 0.8, 1.0);
/** Export: a deep amber, kept clear of the floodlights' pale yellow. */
const EXPORT_TINT = new THREE.Color(1.0, 0.28, 0.02);
/** Idle: a cold standby glow, so a dead border still reads as a border. */
const IDLE_TINT = new THREE.Color(0.3, 0.42, 0.55);
/** Dark glass of a control building by day. */
const WINDOW_DAY_TINT = new THREE.Color(0.05, 0.07, 0.09);
/** Warm lit panes of a staffed station at night. */
const WINDOW_LIT_TINT = new THREE.Color(1.0, 0.68, 0.34);
/** Blink of the obstruction light [Hz] (docs/08 §4). */
const BLINK_HZ = 0.5;
/** Pulse of an active flow [Hz] — the static twin is the steady value. */
const PULSE_HZ = 0.42;

/** Archetypes that are detail only: hidden at strategic distance. */
const DETAIL_ARCHETYPES: ReadonlySet<Archetype> = new Set([
  "fencePost",
  "fencePanel",
  "disconnector",
  "trench",
  "container",
  "pipe",
  "pile",
  "cabin",
  "foundation",
  "skelStack",
  "skelHall",
  "skelDome",
  "skelTurbine",
  "skelRows",
  "clad",
  "cladCylinder",
  "scaffold",
]);

/** Archetypes that cast a shadow when the tier and the distance allow it. */
const SHADOW_ARCHETYPES: ReadonlySet<Archetype> = new Set([
  "gantry",
  "transformer",
  "hall",
  "mast",
  "foreignTower",
  "breaker",
  "container",
  "cabin",
  "skelHall",
  "skelDome",
  "skelStack",
  "clad",
]);

const MATERIAL_OF: Record<Archetype, Exclude<keyof NodeMaterials, "dispose">> = {
  gantry: "steel",
  insulator: "porcelain",
  breaker: "steel",
  disconnector: "steel",
  transformer: "steel",
  hall: "painted",
  windows: "window",
  trench: "concrete",
  mast: "steel",
  fencePost: "steel",
  fencePanel: "fence",
  foreignTower: "steel",
  tube: "steel",
  pad: "gravel",
  sitePad: "earth",
  container: "painted",
  pipe: "steel",
  pile: "gravel",
  cabin: "painted",
  foundation: "concrete",
  skelStack: "primer",
  skelHall: "primer",
  skelDome: "primer",
  skelTurbine: "primer",
  skelRows: "primer",
  clad: "painted",
  cladCylinder: "painted",
  scaffold: "zinc",
};

const ARCHETYPE_IDS = Object.keys(MATERIAL_OF) as Archetype[];

/** Local X axis — the light pools are quads rotated flat onto the ground. */
const FLAT = new THREE.Vector3(1, 0, 0);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** What a glow instance shows: lamps, obstruction lights, border flow. */
interface GlowRecord {
  kind: GlowKind;
  phase: number;
  /** Index of the border entry that owns a flow glow, −1 otherwise. */
  flow: number;
  /** Index of the entry that owns a lamp — its occupancy scales the glow. */
  owner: number;
}

interface Entry {
  layout: NodeLayout;
  /** Glow pool ranges: yard lamps and obstruction/flow lights. */
  lampStart: number;
  lampCount: number;
  lightStart: number;
  lightCount: number;
  poolStart: number;
  poolCount: number;
  /** Border flow: signed eased value, + import / − export. */
  flowShown: number;
  flowFrom: number;
  flowTarget: number;
  flowTransition: number;
  flowTransitioning: boolean;
  /** How used a node is: junction bays used, 1 for a site, 0,65 a border. */
  occupancy: number;
  hooks: THREE.Object3D[];
}

/** What the layouts depend on; anything else is a per-turn refresh. */
function buildKey(scene: WorldScene, quality: string): string {
  const junctions = scene.junctions
    .map(
      (junction) =>
        `${junction.id}:${junction.hex.key}:${junction.slotsUsed}/${junction.slots}:${junctionSignature(junction, scene)}`,
    )
    .join(";");
  const borders = scene.borders
    .map((border) => `${border.id}:${border.hex.key}:${border.outward.x},${border.outward.z}`)
    .join(";");
  const sites = scene.sites
    .map(
      (site) =>
        `${site.id}:${site.hex.key}:${site.kind}:${site.tech ?? "-"}:${Math.round(site.progress * 20)}:${site.remainingDays}`,
    )
    .join(";");
  return `${scene.seed}|${scene.board.cols}x${scene.board.rows}|${quality}|${junctions}|${borders}|${sites}`;
}

class Pool {
  mesh: THREE.InstancedMesh | null = null;
  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly name: string,
  ) {}

  /** A fresh mesh of exactly `count` instances (a rebuild is rare and whole). */
  rebuild(parent: THREE.Object3D, count: number, colored: boolean): THREE.InstancedMesh | null {
    this.dispose(parent);
    if (count === 0) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    mesh.name = this.name;
    mesh.frustumCulled = false;
    if (colored) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    }
    parent.add(mesh);
    this.mesh = mesh;
    return mesh;
  }

  dispose(parent: THREE.Object3D): void {
    if (!this.mesh) return;
    parent.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }
}

export function createNodesModule(): WorldModule {
  const glowUniforms: GlowUniforms = { uMinKm: { value: 0 }, uMinPx: { value: 6 } };
  let ctxRef: ModuleContext | null = null;
  let materials: NodeMaterials | null = null;
  let pools: Partial<Record<Archetype, Pool>> = {};
  let glowPool: Pool | null = null;
  let poolPool: Pool | null = null;
  let glowRecords: GlowRecord[] = [];
  /** Owning entry of each window-band instance, in pool order. */
  let windowsOwners: number[] = [];
  let entries: Entry[] = [];
  let builtKey: string | null = null;
  let night = 1;
  let ambientTime = 0;
  let flowTime = 0;

  const clear = (): void => {
    if (!ctxRef) return;
    for (const pool of Object.values(pools)) pool.dispose(ctxRef.root);
    glowPool?.dispose(ctxRef.root);
    poolPool?.dispose(ctxRef.root);
    for (const entry of entries) {
      for (const hook of entry.hooks) ctxRef.root.remove(hook);
    }
    entries = [];
    glowRecords = [];
    windowsOwners = [];
  };

  /** Per-turn refresh of everything that is not geometry: flow targets, hooks. */
  const applyState = (scene: WorldScene): void => {
    for (const entry of entries) {
      const layout = entry.layout;
      if (layout.kind === "junction") {
        const junction = scene.junctions.find((item) => item.id === layout.junction.id);
        if (!junction) continue;
        entry.occupancy = junction.slots > 0 ? clamp(junction.slotsUsed / junction.slots, 0, 1) : 1;
        const hook = entry.hooks[0];
        if (hook) {
          hook.userData.slotsUsed = junction.slotsUsed;
          hook.userData.slots = junction.slots;
        }
        continue;
      }
      if (layout.kind === "border") {
        const border = scene.borders.find((item) => item.id === layout.border.id);
        if (!border) continue;
        const signed =
          border.importUsedMw > border.exportDeliveredMw
            ? border.ratio
            : border.exportDeliveredMw > border.importUsedMw
              ? -border.ratio
              : 0;
        if (Math.abs(signed - entry.flowTarget) > 1e-6) {
          entry.flowFrom = entry.flowShown;
          entry.flowTarget = signed;
          entry.flowTransition = ctxRef?.clock.time ?? 0;
          entry.flowTransitioning = true;
        }
        const hook = entry.hooks[0];
        if (hook) {
          hook.userData.throughputMw = border.throughputMw;
          hook.userData.importUsedMw = border.importUsedMw;
          hook.userData.exportDeliveredMw = border.exportDeliveredMw;
          hook.userData.usedMw = border.usedMw;
          hook.userData.ratio = border.ratio;
        }
        continue;
      }
      const site = scene.sites.find((item) => item.id === layout.site.id);
      if (!site) continue;
      for (const hook of entry.hooks) {
        hook.userData.progress = site.progress;
        hook.userData.remainingDays = site.remainingDays;
      }
    }
  };

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    clear();
    if (!materials) return;
    const profile = QUALITY_PROFILES[ctx.quality];
    const layouts: NodeLayout[] = [];
    for (const junction of scene.junctions) {
      layouts.push(
        layoutJunction(junction, scene, ctx.terrain, ctx.rng(`nodes:junction:${junction.id}`)),
      );
    }
    for (const border of scene.borders) {
      layouts.push(layoutBorder(border, ctx.terrain, ctx.rng(`nodes:border:${border.id}`)));
    }
    for (const site of scene.sites) {
      layouts.push(layoutSite(site, ctx.terrain, ctx.rng(`nodes:site:${site.id}`)));
    }

    const counts: Record<Archetype, number> = Object.fromEntries(
      ARCHETYPE_IDS.map((id) => [id, 0]),
    ) as Record<Archetype, number>;
    let glowCount = 0;
    let poolCount = 0;
    for (const layout of layouts) {
      for (const part of layout.parts) counts[part.archetype] += 1;
      if (layout.kind === "junction") {
        glowCount += layout.lamps.length + layout.aviation.length;
        poolCount += layout.pools.length;
      } else if (layout.kind === "border") {
        glowCount += layout.lamps.length + layout.flow.length;
        poolCount += layout.pools.length;
      } else {
        glowCount += layout.lamps.length;
        poolCount += layout.pools.length;
      }
    }

    const cursors: Record<Archetype, number> = { ...counts };
    for (const id of ARCHETYPE_IDS) {
      cursors[id] = 0;
      const pool = pools[id];
      if (!pool) continue;
      const mesh = pool.rebuild(ctx.root, counts[id], true);
      if (!mesh) continue;
      if (SHADOW_ARCHETYPES.has(id)) mesh.castShadow = profile.shadows;
      mesh.receiveShadow = true;
      if (id === "pad" || id === "sitePad") mesh.renderOrder = -1;
      if (id === "fencePanel") mesh.renderOrder = 2;
    }
    const glowMesh = glowPool?.rebuild(ctx.root, glowCount, true) ?? null;
    if (glowMesh) glowMesh.renderOrder = 24;
    const poolMesh = poolPool?.rebuild(ctx.root, poolCount, true) ?? null;
    if (poolMesh) poolMesh.renderOrder = 10;

    glowRecords = [];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const identity = new THREE.Quaternion();
    let glowCursor = 0;
    let poolCursor = 0;

    windowsOwners = [];
    entries = layouts.map((layout, entryIndex) => {
      for (const part of layout.parts) {
        const mesh = pools[part.archetype]?.mesh;
        if (!mesh) continue;
        const at = cursors[part.archetype];
        cursors[part.archetype] = at + 1;
        mesh.setMatrixAt(at, part.matrix);
        mesh.instanceColor?.setXYZ(at, part.tint.r, part.tint.g, part.tint.b);
        if (part.archetype === "windows") windowsOwners.push(entryIndex);
      }
      const entry: Entry = {
        layout,
        lampStart: glowCursor,
        lampCount: 0,
        lightStart: glowCursor,
        lightCount: 0,
        poolStart: poolCursor,
        poolCount: 0,
        flowShown: 0,
        flowFrom: 0,
        flowTarget: 0,
        flowTransition: 0,
        flowTransitioning: false,
        occupancy: layout.kind === "border" ? 0.65 : 1,
        hooks: [],
      };
      const pushGlow = (spot: GlowSpot, kind: GlowKind): void => {
        if (!glowMesh) return;
        position.set(spot.x, spot.y, spot.z);
        scale.setScalar(spot.size);
        matrix.compose(position, identity, scale);
        glowMesh.setMatrixAt(glowCursor, matrix);
        glowMesh.instanceColor?.setXYZ(glowCursor, 0, 0, 0);
        glowRecords.push({
          kind,
          phase: spot.phase,
          // A flow glow belongs to its own entry: index it directly (indexing
          // entries by border ordinal silently parked every border on the
          // first junction's eased value — found in the s2 export capture).
          flow: kind === "flow" ? entryIndex : -1,
          owner: entryIndex,
        });
        glowCursor += 1;
      };
      if (layout.kind === "junction") {
        entry.lampStart = glowCursor;
        for (const lamp of layout.lamps) pushGlow(lamp, "lamp");
        entry.lampCount = layout.lamps.length;
        entry.lightStart = glowCursor;
        for (const light of layout.aviation) pushGlow(light, "aviation");
        entry.lightCount = layout.aviation.length;
      } else if (layout.kind === "border") {
        entry.lampStart = glowCursor;
        for (const lamp of layout.lamps) pushGlow(lamp, "lamp");
        entry.lampCount = layout.lamps.length;
        entry.lightStart = glowCursor;
        for (const light of layout.flow) pushGlow(light, "flow");
        entry.lightCount = layout.flow.length;
      } else {
        entry.lampStart = glowCursor;
        for (const lamp of layout.lamps) pushGlow(lamp, "lamp");
        entry.lampCount = layout.lamps.length;
      }
      entry.poolStart = poolCursor;
      if (poolMesh) {
        for (const spot of layout.pools) {
          position.set(spot.x, layout.centre.y + 0.04, spot.z);
          quaternion.setFromAxisAngle(FLAT, -Math.PI / 2);
          scale.set(spot.size, spot.size, 1);
          matrix.compose(position, quaternion, scale);
          poolMesh.setMatrixAt(poolCursor, matrix);
          poolMesh.instanceColor?.setXYZ(poolCursor, 0, 0, 0);
          poolCursor += 1;
        }
      }
      entry.poolCount = layout.pools.length;

      // Hooks.
      const hook = new THREE.Object3D();
      hook.name = layout.hook.name;
      hook.position.set(layout.hook.x, layout.hook.y, layout.hook.z);
      hook.userData = layout.hook.userData;
      ctx.root.add(hook);
      entry.hooks.push(hook);
      if (layout.kind === "site") {
        const crane = new THREE.Object3D();
        crane.name = layout.crane.name;
        crane.position.set(layout.crane.x, layout.crane.y, layout.crane.z);
        crane.userData = layout.crane.userData;
        ctx.root.add(crane);
        entry.hooks.push(crane);
      }
      return entry;
    });

    for (const id of ARCHETYPE_IDS) {
      const mesh = pools[id]?.mesh;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (glowMesh) {
      glowMesh.instanceMatrix.needsUpdate = true;
      if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
    }
    if (poolMesh) {
      poolMesh.instanceMatrix.needsUpdate = true;
      if (poolMesh.instanceColor) poolMesh.instanceColor.needsUpdate = true;
    }
    applyState(scene);
    paintWindows();
  };

  /** Writes the lamp/aviation/flow colours for the current clock and night. */
  const paintGlows = (ctx: ModuleContext, animate: boolean): void => {
    const mesh = glowPool?.mesh;
    if (!mesh?.instanceColor) return;
    const colors = mesh.instanceColor.array as Float32Array;
    const time = ctx.clock.time;
    const pulse =
      ctx.motion.ambient && animate ? 0.82 + 0.18 * Math.sin(time * Math.PI * 2 * PULSE_HZ) : 1;
    glowRecords.forEach((record, index) => {
      let r: number;
      let g: number;
      let b: number;
      if (record.kind === "lamp") {
        // A slow shimmer while ambient motion runs; the static twin is the
        // mid value, so a frozen frame loses nothing (docs/08 §4). The yard's
        // brightness follows occupancy: a full junction is a bright beacon at
        // the strategic view, an empty one only embers (docs/08 §3), and the
        // number of lit floodlight masts counts the used bays up close.
        const entry = entries[record.owner];
        const flicker = animate ? 0.75 + 0.25 * Math.sin(time * 0.7 + record.phase * 6.28) : 0.85;
        let lit = 0.3 + 0.7 * (entry?.occupancy ?? 1);
        if (entry && entry.layout.kind === "junction" && entry.lampCount > 2) {
          const wanted = 2 + Math.round(2 * entry.occupancy);
          if (index - entry.lampStart >= wanted) lit = 0;
        }
        const k = night * flicker * lit;
        r = LAMP_TINT.r * k;
        g = LAMP_TINT.g * k;
        b = LAMP_TINT.b * k;
      } else if (record.kind === "aviation") {
        const blink =
          ctx.motion.ambient && animate
            ? Math.sin(time * Math.PI * 2 * BLINK_HZ + record.phase * 6.28) > -0.2
              ? 1
              : 0.12
            : 0.7;
        const k = night * blink;
        r = AVIATION_TINT.r * k;
        g = AVIATION_TINT.g * k;
        b = AVIATION_TINT.b * k;
      } else {
        const entry = entries[record.flow];
        const signed = entry?.flowShown ?? 0;
        const magnitude = Math.min(1, Math.abs(signed));
        const tint = signed > 0.02 ? IMPORT_TINT : signed < -0.02 ? EXPORT_TINT : IDLE_TINT;
        // Idle is a cold standby whisper; an active flow is several times
        // brighter and pulses — the dispatcher reads direction and effort.
        const k = magnitude > 0.02 ? (0.35 + 1.6 * magnitude) * pulse : 0.22;
        r = tint.r * k;
        g = tint.g * k;
        b = tint.b * k;
      }
      colors[index * 3] = r;
      colors[index * 3 + 1] = g;
      colors[index * 3 + 2] = b;
    });
    mesh.instanceColor.needsUpdate = true;
  };

  /**
   * Writes the ground light pools: warm, night-scaled, and per node scaled by
   * occupancy so the yards of a busy grid pool visibly more light than a
   * freshly strung one.
   */
  const paintPools = (): void => {
    const mesh = poolPool?.mesh;
    if (!mesh?.instanceColor) return;
    const colors = mesh.instanceColor.array as Float32Array;
    for (const entry of entries) {
      const k = night * 0.5 * (0.3 + 0.7 * entry.occupancy);
      for (let i = entry.poolStart; i < entry.poolStart + entry.poolCount; i++) {
        colors[i * 3] = LAMP_TINT.r * k;
        colors[i * 3 + 1] = LAMP_TINT.g * k;
        colors[i * 3 + 2] = LAMP_TINT.b * k;
      }
    }
    mesh.instanceColor.needsUpdate = true;
  };

  /**
   * The control buildings' panes: dark glass by day, warm lit windows at
   * night (scaled by the owning station's occupancy — an empty station keeps
   * only its night watch).
   */
  const paintWindows = (): void => {
    const mesh = pools.windows?.mesh;
    if (!mesh?.instanceColor) return;
    const colors = mesh.instanceColor.array as Float32Array;
    for (let i = 0; i < windowsOwners.length && i < colors.length / 3; i++) {
      const occupancy = entries[windowsOwners[i] ?? 0]?.occupancy ?? 1;
      const k = night * (0.45 + 0.55 * occupancy);
      colors[i * 3] = WINDOW_DAY_TINT.r + (WINDOW_LIT_TINT.r - WINDOW_DAY_TINT.r) * k;
      colors[i * 3 + 1] = WINDOW_DAY_TINT.g + (WINDOW_LIT_TINT.g - WINDOW_DAY_TINT.g) * k;
      colors[i * 3 + 2] = WINDOW_DAY_TINT.b + (WINDOW_LIT_TINT.b - WINDOW_DAY_TINT.b) * k;
    }
    mesh.instanceColor.needsUpdate = true;
  };

  return {
    id: "nodes",

    init(ctx) {
      ctxRef = ctx;
      materials = createNodeMaterials();
      pools = {};
      const geometries = buildArchetypes();
      for (const id of ARCHETYPE_IDS) {
        const material = materials[MATERIAL_OF[id]];
        const pool = new Pool(geometries[id], material, `nodes:${id}`);
        if (id === "pad" || id === "sitePad") {
          material.polygonOffset = true;
          material.polygonOffsetFactor = -1;
          material.polygonOffsetUnits = -2;
        }
        pools[id] = pool;
      }
      const glow = createGlowMaterial();
      glowUniforms.uMinKm = glow.uniforms.uMinKm;
      glowUniforms.uMinPx = glow.uniforms.uMinPx;
      glowPool = new Pool(glowGeometry(), glow.material, "nodes:glows");
      poolPool = new Pool(poolGeometry(), createPoolMaterial(), "nodes:light-pools");
    },

    update(scene, _previous, ctx) {
      ctxRef = ctx;
      const key = buildKey(scene, ctx.quality);
      if (key !== builtKey) {
        builtKey = key;
        rebuild(scene, ctx);
        return;
      }
      applyState(scene);
    },

    frame(_dt, ctx) {
      const environment = ctx.environment;
      night = 1 - smoothstep(0.08, 0.55, environment.daylight);
      // Floodlit steel: the layer's pools are additive quads, so nothing
      // actually lights the lattice at night — a whisper of warm emissive on
      // the materials stands in for the yard floodlights, so a station reads
      // as lit engineering and not as a black cut-out (docs/08 §3 silhouette).
      if (materials) {
        const flood = night * 0.035;
        materials.steel.emissive.copy(LAMP_TINT).multiplyScalar(flood);
        materials.porcelain.emissive.copy(LAMP_TINT).multiplyScalar(flood * 1.6);
        materials.concrete.emissive.copy(LAMP_TINT).multiplyScalar(flood * 0.5);
        materials.painted.emissive.copy(LAMP_TINT).multiplyScalar(flood * 0.8);
      }
      if (ctx.motion.ambient) ambientTime = ctx.clock.time;
      if (ctx.motion.stateful) flowTime = ctx.clock.time;
      // Flow pulse is ambience; the eased value itself is state (stateful motion).
      const animateFlow = ctx.clock.scale > 0 && !ctx.clock.pinned;
      for (const entry of entries) {
        if (!entry.flowTransitioning) continue;
        const k = animateFlow
          ? smoothstep(0, 1, (ctx.clock.time - entry.flowTransition) / TRANSITION_SECONDS)
          : 1;
        entry.flowShown = entry.flowFrom + (entry.flowTarget - entry.flowFrom) * k;
        if (k >= 1) entry.flowTransitioning = false;
      }
      paintGlows(ctx, ctx.motion.ambient);
      paintPools();
      paintWindows();
      void ambientTime;
      void flowTime;

      const camera = ctx.view.camera;
      const height = Math.max(1, ctx.renderer.domElement.height);
      const DEG = Math.PI / 180;
      glowUniforms.uMinKm.value = (2 * Math.tan((camera.fov * DEG) / 2)) / height;

      const profile = QUALITY_PROFILES[ctx.quality];
      const distance = ctx.view.distanceKm;
      const detailVisible = distance < DETAIL_KM * profile.detail;
      const castShadows = profile.shadows && distance < SHADOW_CAST_KM;
      for (const id of ARCHETYPE_IDS) {
        const mesh = pools[id]?.mesh;
        if (!mesh) continue;
        if (DETAIL_ARCHETYPES.has(id)) mesh.visible = detailVisible;
        if (SHADOW_ARCHETYPES.has(id)) mesh.castShadow = castShadows;
      }
      if (poolPool?.mesh) poolPool.mesh.visible = night > 0.002;
      if (glowPool?.mesh) glowPool.mesh.visible = true;
    },

    dispose() {
      clear();
      for (const pool of Object.values(pools)) pool.geometry.dispose();
      pools = {};
      glowPool?.geometry.dispose();
      glowPool = null;
      poolPool?.geometry.dispose();
      poolPool = null;
      materials?.dispose();
      materials = null;
      builtKey = null;
      ctxRef = null;
    },
  };
}
