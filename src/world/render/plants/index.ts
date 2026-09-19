// render/plants — nuclear / coal / CCGT / OCGT plants with their internal
// state (docs/08 §2–§3, ARCHITECTURE.md §6, §9, §18). Consumes the `plants`
// slice plus `weather` (wind for the plumes), `time` / `sun` (night) and
// nothing else; stands every site on `ctx.terrain` and reads the light from
// `ctx.environment`. One InstancedMesh per archetype for the whole country,
// one for every puff of every plume, one for the obstruction lights, one for
// the floodlight pools: ~25 draw calls for five plants. A layout is rebuilt
// only when a plant's identity changes (seed, hex, tech, capacity, blocks,
// quality); a turn that changes a block's state rewrites one vec4 per
// instance and eases it over 1,5 s.
//
// State encoding (docs/08 §3): offline = dark unit, cold stack, no plume;
// starting = orange warm-up glow in the windows growing with `warmup`, a thin
// wisp; online = warm windows at night, plume and cooling vapour scaled by
// `load` — the OUTPUT, never the setpoint. Rings, cranes and selection are
// the effects module's: it finds `plants:base:<plantId>` at every site centre
// and `plants:block:<plantId>:<index>` at every unit, numbers in `userData`.

import * as THREE from "three";
import type { WorldBlock, WorldPlant, WorldScene } from "../../bridge/worldScene";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, WorldModule } from "../core/types";
import { hexToWorld } from "../core/units";
import { ARCHETYPES, buildArchetype, type Archetype } from "./geometry";
import { layoutPlant, type PlantLayout, type PlumeKind } from "./layout";
import { createPlantMaterials, createPlantUniforms, type PlantMaterials } from "./materials";

/** docs/08 §4: the one cinematic moment. */
const TRANSITION_SECONDS = 1.5;
/** Detail archetypes (fences, masts, racks, portals) hide beyond this camera distance × quality detail [km]. */
const DETAIL_KM = 300;
/** Beyond this camera distance the big silhouettes stop casting shadows (sub-texel) [km]. */
const SHADOW_CAST_KM = 220;
/** Plume drift [km/s] = base + per m/s of open-country wind. */
const DRIFT_BASE_KM_S = 0.04;
const DRIFT_PER_MS_KM_S = 0.03;
/** Puffs per plume source at full detail. */
const PUFFS: Record<PlumeKind, number> = { smoke: 22, vapour: 30, wisp: 10 };
const DEG = Math.PI / 180;

const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as Archetype[];

/** What a block shows: (windows online, warm-up, load) — the enState of its parts. */
interface BlockShow {
  on: number;
  warm: number;
  load: number;
}

interface PlantEntry {
  plant: WorldPlant;
  layout: PlantLayout;
  /** Instance index → block per archetype. */
  ranges: Partial<Record<Archetype, { start: number; blocks: number[] }>>;
  /** Puff instance range and the block of every puff. */
  plumes: { start: number; blocks: number[]; kinds: PlumeKind[] };
  /** State-glow instance range and the block of every glow. */
  glows: { start: number; blocks: number[] };
  base: THREE.Object3D;
  blockHooks: THREE.Object3D[];
  /** Shown / from / target per block index, plus the plant-level entry at the end. */
  shown: BlockShow[];
  from: BlockShow[];
  target: BlockShow[];
  transitionStart: number;
  transitioning: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function blockShow(block: WorldBlock): BlockShow {
  if (block.status === "online") return { on: 1, warm: 0, load: block.load };
  if (block.status === "starting") return { on: 0, warm: block.warmup, load: 0 };
  return { on: 0, warm: 0, load: 0 };
}

/** The shared structures follow the plant: staffed at night, vapour by the plant's load. */
function plantShow(plant: WorldPlant): BlockShow {
  const anyOnline = plant.blocks.some((block) => block.status === "online");
  const load = plant.capacityMw > 0 ? clamp(plant.outputMw / plant.capacityMw, 0, 1) : 0;
  return { on: anyOnline ? 1 : 0.3, warm: 0, load };
}

/** Plume strength of a block: the load when online, a thin wisp while starting, nothing offline. */
function plumeStrength(show: BlockShow): number {
  if (show.on > 0.5 || show.load > 0) return show.load;
  return show.warm > 0 ? 0.1 + 0.12 * show.warm : 0;
}

function lerpShow(a: BlockShow, b: BlockShow, k: number): BlockShow {
  return {
    on: a.on + (b.on - a.on) * k,
    warm: a.warm + (b.warm - a.warm) * k,
    load: a.load + (b.load - a.load) * k,
  };
}

function sameShow(a: BlockShow, b: BlockShow): boolean {
  return (
    Math.abs(a.on - b.on) < 1e-6 &&
    Math.abs(a.warm - b.warm) < 1e-6 &&
    Math.abs(a.load - b.load) < 1e-6
  );
}

/** What the layouts depend on; anything else is a per-instance refill. */
function buildKey(scene: WorldScene, quality: string): string {
  const plants = scene.plants
    .map(
      (plant) =>
        `${plant.id}:${plant.hex.key}:${plant.tech}:${plant.capacityMw}:${plant.footprint.toFixed(4)}:${plant.blocks
          .map((block) => block.mw)
          .join("/")}`,
    )
    .join(";");
  return `${scene.seed}|${scene.board.cols}x${scene.board.rows}|${quality}|${plants}`;
}

class Pool {
  mesh: THREE.InstancedMesh | null = null;
  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly name: string,
  ) {}

  /** A fresh mesh of exactly `count` instances (a rebuild is rare and whole). */
  rebuild(
    parent: THREE.Object3D,
    count: number,
    stateSize: number,
    stateName: string,
  ): THREE.InstancedMesh | null {
    this.dispose(parent);
    if (count === 0) return null;
    this.geometry.setAttribute(
      stateName,
      new THREE.InstancedBufferAttribute(new Float32Array(count * stateSize), stateSize),
    );
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    mesh.name = this.name;
    mesh.frustumCulled = false;
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

export function createPlantsModule(): WorldModule {
  const uniforms = createPlantUniforms();
  let ctxRef: ModuleContext | null = null;
  let materials: PlantMaterials | null = null;
  let pools: Partial<Record<Archetype, Pool>> = {};
  let plumePool: Pool | null = null;
  let aviationPool: Pool | null = null;
  let glowPool: Pool | null = null;
  let floodPool: Pool | null = null;
  let entries: PlantEntry[] = [];
  let builtKey: string | null = null;
  let sceneDaylight = 1;
  let plumeTime = 0;
  let ambientTime = 0;
  const sunView = new THREE.Vector3();

  const clear = (): void => {
    if (!ctxRef) return;
    for (const pool of Object.values(pools)) pool.dispose(ctxRef.root);
    plumePool?.dispose(ctxRef.root);
    aviationPool?.dispose(ctxRef.root);
    glowPool?.dispose(ctxRef.root);
    floodPool?.dispose(ctxRef.root);
    for (const entry of entries) {
      ctxRef.root.remove(entry.base);
      for (const hook of entry.blockHooks) ctxRef.root.remove(hook);
    }
    entries = [];
  };

  /** Writes the shown state of one plant into its structure and puff instances. */
  const applyShow = (entry: PlantEntry): void => {
    const plantLevel = entry.shown[entry.shown.length - 1]!;
    const showOf = (block: number): BlockShow =>
      block >= 0 ? (entry.shown[block] ?? plantLevel) : plantLevel;
    for (const id of ARCHETYPE_IDS) {
      const range = entry.ranges[id];
      const mesh = pools[id]?.mesh;
      if (!range || !mesh) continue;
      const state = mesh.geometry.getAttribute("enState") as THREE.InstancedBufferAttribute;
      const array = state.array as Float32Array;
      range.blocks.forEach((block, i) => {
        const show = showOf(block);
        const at = (range.start + i) * 4;
        array[at] = show.on;
        array[at + 1] = show.warm;
        array[at + 2] = show.load;
      });
      state.addUpdateRange(range.start * 4, range.blocks.length * 4);
      state.needsUpdate = true;
    }
    const puffs = plumePool?.mesh;
    if (puffs && entry.plumes.blocks.length > 0) {
      const state = puffs.geometry.getAttribute("enPlume") as THREE.InstancedBufferAttribute;
      const array = state.array as Float32Array;
      entry.plumes.blocks.forEach((block, i) => {
        const show = showOf(block);
        // Cooling vapour follows the plant's load; a unit's plume its own block.
        array[(entry.plumes.start + i) * 4 + 2] = block >= 0 ? plumeStrength(show) : show.load;
      });
      state.addUpdateRange(entry.plumes.start * 4, entry.plumes.blocks.length * 4);
      state.needsUpdate = true;
    }
    const glows = glowPool?.mesh;
    if (glows?.instanceColor && entry.glows.blocks.length > 0) {
      const state = glows.geometry.getAttribute("enGlow") as THREE.InstancedBufferAttribute;
      const colors = glows.instanceColor.array as Float32Array;
      entry.glows.blocks.forEach((block, i) => {
        const show = showOf(block);
        const at = entry.glows.start + i;
        // Starting: orange × warm-up, at any hour. Online: warm × night (the shader gates it).
        // Hue-stable under ACES: a saturated orange kept under the bloom threshold
        // reads as orange; a brighter one tone-maps to yellow-white.
        const starting = show.warm > 1e-3;
        const k = starting ? 0.9 + 0.9 * show.warm : 1.1 * show.on;
        const tint = starting ? [1.0, 0.3, 0.02] : [1.0, 0.76, 0.48];
        colors[at * 3] = tint[0]! * k;
        colors[at * 3 + 1] = tint[1]! * k;
        colors[at * 3 + 2] = tint[2]! * k;
        state.setY(at, starting ? 1 : 0);
      });
      glows.instanceColor.addUpdateRange(entry.glows.start * 3, entry.glows.blocks.length * 3);
      glows.instanceColor.needsUpdate = true;
      state.addUpdateRange(entry.glows.start * 2, entry.glows.blocks.length * 2);
      state.needsUpdate = true;
    }
    const data = entry.base.userData as Record<string, unknown>;
    data.shown = entry.shown.slice(0, -1);
  };

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    clear();
    if (!materials) return;
    const profile = QUALITY_PROFILES[ctx.quality];
    const heightAt = (x: number, z: number): number => ctx.terrain.heightAt(x, z);
    const layouts = scene.plants.map((plant) =>
      layoutPlant(plant, hexToWorld(plant.hex), ctx.rng(`plants:${plant.id}`), heightAt),
    );

    // Instance counts per archetype, one mesh each.
    const counts: Record<Archetype, number> = Object.fromEntries(
      ARCHETYPE_IDS.map((id) => [id, 0]),
    ) as Record<Archetype, number>;
    let puffCount = 0;
    let aviationCount = 0;
    let glowCount = 0;
    let floodCount = 0;
    // A plume must stay one body on every tier: the count falls only half as far as the detail.
    const puffsOf = (kind: PlumeKind): number =>
      Math.max(8, Math.round(PUFFS[kind] * (0.5 + 0.5 * profile.detail)));
    for (const layout of layouts) {
      for (const part of layout.parts) counts[part.archetype] += 1;
      for (const source of layout.plumes) puffCount += puffsOf(source.kind);
      aviationCount += layout.aviation.length;
      glowCount += layout.glows.length;
      floodCount += layout.floods.length;
    }
    const cursors: Record<Archetype, number> = { ...counts };
    for (const id of ARCHETYPE_IDS) {
      cursors[id] = 0;
      const pool = pools[id];
      if (!pool) continue;
      const mesh = pool.rebuild(ctx.root, counts[id], 4, "enState");
      if (!mesh) continue;
      const spec = ARCHETYPES[id];
      mesh.castShadow = spec.castShadow && profile.shadows;
      mesh.receiveShadow = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(counts[id] * 3), 3);
      if (id === "pad") mesh.renderOrder = -1;
    }
    const puffMesh = plumePool?.rebuild(ctx.root, puffCount, 4, "enPlume") ?? null;
    if (puffMesh) puffMesh.renderOrder = 20;
    const aviationMesh = aviationPool?.rebuild(ctx.root, aviationCount, 2, "enGlow") ?? null;
    if (aviationMesh) {
      aviationMesh.renderOrder = 22;
      aviationMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(aviationCount * 3),
        3,
      );
    }
    const glowMesh = glowPool?.rebuild(ctx.root, glowCount, 2, "enGlow") ?? null;
    if (glowMesh) {
      glowMesh.renderOrder = 23;
      glowMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(glowCount * 3),
        3,
      );
    }
    const floodMesh = floodPool?.rebuild(ctx.root, floodCount, 1, "enPhase") ?? null;
    if (floodMesh) floodMesh.renderOrder = 21;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let puffCursor = 0;
    let aviationCursor = 0;
    let glowCursor = 0;
    let floodCursor = 0;
    entries = layouts.map((layout, index) => {
      const plant = scene.plants[index]!;
      const rng = ctx.rng(`plants:plumes:${plant.id}`);
      const ranges: PlantEntry["ranges"] = {};
      for (const part of layout.parts) {
        const id = part.archetype;
        const mesh = pools[id]?.mesh;
        if (!mesh) continue;
        const range = (ranges[id] ??= { start: cursors[id], blocks: [] });
        const at = cursors[id];
        cursors[id] += 1;
        mesh.setMatrixAt(at, part.matrix);
        mesh.instanceColor!.setXYZ(at, part.tint[0], part.tint[1], part.tint[2]);
        const state = mesh.geometry.getAttribute("enState") as THREE.InstancedBufferAttribute;
        state.setXYZW(at, 0, 0, 0, Math.floor(rng.next() * 4096));
        range.blocks.push(part.block);
      }
      const plumes: PlantEntry["plumes"] = { start: puffCursor, blocks: [], kinds: [] };
      if (puffMesh) {
        const state = puffMesh.geometry.getAttribute("enPlume") as THREE.InstancedBufferAttribute;
        for (const source of layout.plumes) {
          const n = puffsOf(source.kind);
          const kind = source.kind === "smoke" ? 0 : source.kind === "vapour" ? 1 : 2;
          for (let i = 0; i < n; i++) {
            position.set(source.x, source.y, source.z);
            quaternion.identity();
            const base = source.radius * 2 * (0.85 + 0.3 * rng.next());
            scale.set(base, base, base);
            matrix.compose(position, quaternion, scale);
            puffMesh.setMatrixAt(puffCursor, matrix);
            // Phases spread evenly with a jitter, so the plume is continuous at every clock.
            state.setXYZW(puffCursor, (i + rng.range(-0.3, 0.3)) / n, kind, 0, rng.next());
            plumes.blocks.push(source.block);
            plumes.kinds.push(source.kind);
            puffCursor += 1;
          }
        }
      }
      if (aviationMesh) {
        const state = aviationMesh.geometry.getAttribute(
          "enGlow",
        ) as THREE.InstancedBufferAttribute;
        for (const light of layout.aviation) {
          position.set(light.x, light.y, light.z);
          quaternion.identity();
          scale.set(light.size, light.size, light.size);
          matrix.compose(position, quaternion, scale);
          aviationMesh.setMatrixAt(aviationCursor, matrix);
          state.setXY(aviationCursor, light.phase, 0);
          aviationMesh.instanceColor!.setXYZ(aviationCursor, 1.0, 0.06, 0.02);
          aviationCursor += 1;
        }
      }
      const glows: PlantEntry["glows"] = { start: glowCursor, blocks: [] };
      if (glowMesh) {
        const state = glowMesh.geometry.getAttribute("enGlow") as THREE.InstancedBufferAttribute;
        for (const light of layout.glows) {
          position.set(light.x, light.y, light.z);
          quaternion.identity();
          scale.set(light.size, light.size, light.size);
          matrix.compose(position, quaternion, scale);
          glowMesh.setMatrixAt(glowCursor, matrix);
          state.setXY(glowCursor, light.phase, 0);
          glowMesh.instanceColor!.setXYZ(glowCursor, 0, 0, 0);
          glows.blocks.push(light.block);
          glowCursor += 1;
        }
      }
      if (floodMesh) {
        const phase = floodMesh.geometry.getAttribute("enPhase") as THREE.InstancedBufferAttribute;
        for (const light of layout.floods) {
          position.set(light.x, light.y + 0.02, light.z);
          quaternion.identity();
          scale.set(light.size, 1, light.size);
          matrix.compose(position, quaternion, scale);
          floodMesh.setMatrixAt(floodCursor, matrix);
          phase.setX(floodCursor, light.phase);
          floodCursor += 1;
        }
      }

      // The hooks the effects module dresses: the site centre and every unit.
      const base = new THREE.Object3D();
      base.name = `plants:base:${plant.id}`;
      base.position.set(layout.centre.x, layout.centre.y, layout.centre.z);
      base.userData = {
        plantId: plant.id,
        tech: plant.tech,
        radiusKm: Math.max(layout.pad.rx, layout.pad.rz),
        padKm: { ...layout.pad },
        yaw: layout.yaw,
        outputMw: plant.outputMw,
        usedMw: plant.usedMw,
        dumpMw: plant.dumpMw,
        controlMode: plant.controlMode,
        automation: plant.automation,
      };
      ctx.root.add(base);
      const blockHooks = layout.blocks.map((anchor) => {
        const hook = new THREE.Object3D();
        hook.name = `plants:block:${plant.id}:${anchor.index}`;
        hook.position.set(anchor.x, anchor.y, anchor.z);
        const block = plant.blocks[anchor.index];
        hook.userData = {
          plantId: plant.id,
          index: anchor.index,
          mw: block?.mw ?? 0,
          status: block?.status ?? "offline",
          load: block?.load ?? 0,
          warmup: block?.warmup ?? 0,
        };
        ctx.root.add(hook);
        return hook;
      });

      const target = [...plant.blocks.map(blockShow), plantShow(plant)];
      return {
        plant,
        layout,
        ranges,
        plumes,
        glows,
        base,
        blockHooks,
        shown: target.map((show) => ({ ...show })),
        from: target.map((show) => ({ ...show })),
        target,
        transitionStart: 0,
        transitioning: false,
      };
    });
    for (const pool of Object.values(pools)) {
      const mesh = pool.mesh;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      (mesh.geometry.getAttribute("enState") as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    if (puffMesh) {
      puffMesh.instanceMatrix.needsUpdate = true;
      (puffMesh.geometry.getAttribute("enPlume") as THREE.InstancedBufferAttribute).needsUpdate =
        true;
    }
    if (aviationMesh) {
      aviationMesh.instanceMatrix.needsUpdate = true;
      aviationMesh.instanceColor!.needsUpdate = true;
      (aviationMesh.geometry.getAttribute("enGlow") as THREE.InstancedBufferAttribute).needsUpdate =
        true;
    }
    if (glowMesh) {
      glowMesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceColor!.needsUpdate = true;
      (glowMesh.geometry.getAttribute("enGlow") as THREE.InstancedBufferAttribute).needsUpdate =
        true;
    }
    if (floodMesh) {
      floodMesh.instanceMatrix.needsUpdate = true;
      (floodMesh.geometry.getAttribute("enPhase") as THREE.InstancedBufferAttribute).needsUpdate =
        true;
    }
    for (const entry of entries) applyShow(entry);
  };

  /** The wind the plumes drift with: FROM windFromDeg (clockwise from north), so toward the opposite. */
  const applyWeather = (scene: WorldScene): void => {
    const from = scene.weather.windFromDeg * DEG;
    const speed = DRIFT_BASE_KM_S + DRIFT_PER_MS_KM_S * Math.max(0, scene.weather.windMs.open);
    uniforms.uWind.value.set(-Math.sin(from) * speed, 0, Math.cos(from) * speed);
    uniforms.uGust.value = clamp(scene.weather.gustiness, 0, 1);
  };

  /** The night factor from the sky when it is there, else from the scene's sun. */
  const nightOf = (ctx: ModuleContext): number => {
    const daylight = "envMap" in ctx.environment ? ctx.environment.daylight : sceneDaylight;
    return 1 - smoothstep(0.08, 0.55, daylight);
  };

  return {
    id: "plants",

    init(ctx) {
      ctxRef = ctx;
      materials = createPlantMaterials(uniforms);
      pools = {};
      for (const id of ARCHETYPE_IDS) {
        const spec = ARCHETYPES[id];
        const material = materials.structures[spec.material];
        if (id === "pad") {
          material.polygonOffset = true;
          material.polygonOffsetFactor = -1;
          material.polygonOffsetUnits = -2;
        }
        pools[id] = new Pool(buildArchetype(id), material, `plants:${id}`);
      }
      const puff = new THREE.PlaneGeometry(1, 1);
      plumePool = new Pool(puff, materials.plume, "plants:plumes");
      const dot = new THREE.PlaneGeometry(1, 1);
      aviationPool = new Pool(dot, materials.aviation, "plants:aviation-lights");
      const spark = new THREE.PlaneGeometry(1, 1);
      glowPool = new Pool(spark, materials.glow, "plants:block-glows");
      const pool = new THREE.PlaneGeometry(1, 1);
      pool.rotateX(-Math.PI / 2);
      floodPool = new Pool(pool, materials.flood, "plants:floodlights");
    },

    update(scene, previous, ctx) {
      ctxRef = ctx;
      sceneDaylight = scene.sun.daylight;
      applyWeather(scene);
      const key = buildKey(scene, ctx.quality);
      if (key !== builtKey) {
        builtKey = key;
        rebuild(scene, ctx);
        return;
      }
      const animate =
        previous !== null && ctx.motion.transitions && !ctx.clock.pinned && ctx.clock.scale > 0;
      scene.plants.forEach((plant, index) => {
        const entry = entries[index];
        if (!entry) return;
        entry.plant = plant;
        const data = entry.base.userData as Record<string, unknown>;
        data.outputMw = plant.outputMw;
        data.usedMw = plant.usedMw;
        data.dumpMw = plant.dumpMw;
        data.controlMode = plant.controlMode;
        data.automation = plant.automation;
        entry.blockHooks.forEach((hook, i) => {
          const block = plant.blocks[i];
          if (!block) return;
          const info = hook.userData as Record<string, unknown>;
          info.status = block.status;
          info.load = block.load;
          info.warmup = block.warmup;
        });
        const target = [...plant.blocks.map(blockShow), plantShow(plant)];
        if (
          target.length === entry.target.length &&
          target.every((show, i) => sameShow(show, entry.target[i]!))
        ) {
          return;
        }
        entry.target = target;
        if (animate) {
          entry.from = entry.shown.map((show) => ({ ...show }));
          entry.transitionStart = ctx.clock.time;
          entry.transitioning = true;
        } else {
          entry.transitioning = false;
          entry.shown = target.map((show) => ({ ...show }));
          applyShow(entry);
        }
      });
    },

    frame(_dt, ctx) {
      const night = nightOf(ctx);
      uniforms.uNight.value = night;
      if (ctx.motion.stateful) plumeTime = ctx.clock.time;
      if (ctx.motion.ambient) ambientTime = ctx.clock.time;
      uniforms.uPlumeTime.value = plumeTime;
      uniforms.uAmbientTime.value = ambientTime;
      uniforms.uBlink.value = ctx.motion.ambient ? 1 : 0;
      const camera = ctx.view.camera;
      const height = Math.max(1, ctx.renderer.domElement.height);
      uniforms.uPxKm.value = (2 * Math.tan((camera.fov * DEG) / 2)) / height;
      uniforms.uSnowlineKm.value = ctx.terrain.snowlineKm;
      const env = ctx.environment;
      sunView.copy(env.sunDirection).transformDirection(camera.matrixWorldInverse);
      uniforms.uSunView.value.copy(sunView);
      uniforms.uSunColor.value.copy(env.sunColor);
      uniforms.uSunIntensity.value = env.sunIntensity;
      uniforms.uSkyColor.value.copy(env.skyColor);
      uniforms.uAmbient.value = env.ambientIntensity;

      const profile = QUALITY_PROFILES[ctx.quality];
      const distance = ctx.view.distanceKm;
      const detailVisible = distance < DETAIL_KM * profile.detail;
      const castShadows = profile.shadows && distance < SHADOW_CAST_KM;
      for (const id of ARCHETYPE_IDS) {
        const mesh = pools[id]?.mesh;
        if (!mesh) continue;
        const spec = ARCHETYPES[id];
        if (spec.detail) mesh.visible = detailVisible;
        mesh.castShadow = spec.castShadow && castShadows;
      }
      const lightsOn = night > 0.002;
      if (aviationPool?.mesh) aviationPool.mesh.visible = lightsOn;
      // The state glow shows an orange warm-up by day too; the shader gates the rest by night.
      if (glowPool?.mesh) glowPool.mesh.visible = true;
      if (floodPool?.mesh) floodPool.mesh.visible = lightsOn && detailVisible;

      for (const entry of entries) {
        if (!entry.transitioning) continue;
        const k = smoothstep(0, 1, (ctx.clock.time - entry.transitionStart) / TRANSITION_SECONDS);
        entry.shown = entry.target.map((show, i) => lerpShow(entry.from[i] ?? show, show, k));
        applyShow(entry);
        if (k >= 1) entry.transitioning = false;
      }
    },

    dispose() {
      clear();
      for (const pool of Object.values(pools)) pool.geometry.dispose();
      pools = {};
      plumePool?.geometry.dispose();
      plumePool = null;
      aviationPool?.geometry.dispose();
      aviationPool = null;
      glowPool?.geometry.dispose();
      glowPool = null;
      floodPool?.geometry.dispose();
      floodPool = null;
      materials?.dispose();
      materials = null;
      builtKey = null;
      ctxRef = null;
    },
  };
}
