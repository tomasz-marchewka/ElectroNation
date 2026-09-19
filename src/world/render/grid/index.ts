// render/grid — pylons, conductors, corridors, construction and upgrade
// states (docs/08 §2–§4, ARCHITECTURE.md §6, §9–§10, §18). Consumes
// `scene.lines` and reads `scene.overlay.bottleneck`; the ring, flow particles
// and cranes are the effects module's — this module leaves hooks for them:
//
//   ctx.root.userData.gridPolylines  Map<segmentKey, THREE.Vector3[]>  world space, sag included
//   ctx.root.userData.gridSegments   Map<segmentKey, GridSegmentInfo>
//   ctx.root.userData.gridBottleneckPolyline  THREE.Vector3[] | null  the worst bottleneck's spine
//   an empty Object3D "grid:construction-head:<lineId>" at the last erected
//   tower of a line being built, "grid:upgrade-head:<lineId>" at the last ghost.
//
// Diff: a line is rebuilt only when its id, type, built flag, progress,
// upgrade, lanes (with the corridor sign), segment partition, the board or the
// quality tier change; the load emissive is refreshed on every update.
//
// Level of detail: every structure is built once and kept per line; each
// frame the camera decides which of them are near (full lattice, one tube
// per phase) and which are far (a dozen members, one tube per side), and the
// instance buffers are refilled only when the camera moved. So a closeup
// draws the lattice of the towers in view and not of the whole country.

import * as THREE from "three";
import type { LineLoad, WorldLine, WorldScene } from "../../bridge/worldScene";
import { CONDUCTOR_SAG } from "../core/exaggeration";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, WorldModule } from "../core/types";
import {
  BREATH_AMPLITUDE,
  BREATH_HZ,
  LOAD_EMISSIVE,
  catenaryTubeGeometry,
  catenaryY,
  conductorGlowMaterial,
  conductorMaterial,
  spanMatrix,
  type ConductorUniforms,
} from "./conductors";
import { InstancePool } from "./pool";
import {
  LINE_TYPES,
  PYLON_SPECS,
  buildPylonGeometries,
  disposePylonGeometries,
  type LineType,
  type PylonGeometries,
} from "./pylons";
import {
  PORTAL_INSET_KM,
  attachmentWorld,
  corridorSigns,
  insetEnds,
  laneSignature,
  offsetPolyline,
  placeStructures,
  sagClearanceFactor,
  type Placement,
} from "./route";

export interface GridSegmentInfo {
  lineId: string;
  type: LineType;
  load: LineLoad;
  ratio: number;
  usedMw: number;
  capacityMw: number;
  direction: 1 | -1 | 0;
}

/** Camera distance [km] beyond which nothing draws at the near level of detail, at full detail. */
const NEAR_LOD_KM = 250;
/** Structures within NEAR_FACTOR × view distance + NEAR_BASE_KM of the camera are near. */
const NEAR_FACTOR = 1.2;
const NEAR_BASE_KM = 24;
/** The partition is redone when the camera moved this far [km] or the radius changed this much. */
const REPACK_KM = 3;
/** Ghost towers of an upgrade stand this far beside the old line [km]. */
const GHOST_OFFSET_KM = 0.45;
/** Samples per span of the polyline handed to effects. */
const POLYLINE_SAMPLES = 6;

const DEG = Math.PI / 180;

/**
 * Halo brightness of the warn / over spans at night, and how much of it is
 * left in full daylight — the halo stands in for bloom, which the core dims
 * by day the same way (PostFx.setDaylight), so a hot line is a glow at night
 * and a crisp amber / red wire at noon, never a highlighter stroke.
 */
const NEAR_HALO_GAIN = 0.15;
const FAR_HALO_GAIN = 0.24;
const HALO_DAYLIGHT_SHARE = 0.4;

/**
 * Width of the far tube per line type, relative to the material's pixel
 * radius: a WN trunk is a heavier stroke than an NN feeder even where the
 * towers are dots (docs/08 §3 — silhouette codes the type at every distance).
 */
const FAR_WIDTH_BY_TYPE: Record<LineType, number> = { lv: 0.6, mv: 0.85, hv: 1.15 };

/** Weathered zinc: mid-grey when new, dark with age, an occasional rust tint. */
const STEEL_NEW = new THREE.Color().setRGB(0.5, 0.51, 0.53, THREE.SRGBColorSpace);
const STEEL_OLD = new THREE.Color().setRGB(0.3, 0.31, 0.34, THREE.SRGBColorSpace);
const STEEL_RUST = new THREE.Color().setRGB(0.42, 0.3, 0.24, THREE.SRGBColorSpace);

interface Placed {
  matrix: number[];
  /** Ground position, for the distance partition. */
  x: number;
  z: number;
}

interface TowerInstance extends Placed {
  color: [number, number, number];
}

interface ConductorInstance extends Placed {
  segmentKey: string | null;
  /** Width factor of the tube (`enWidth`). */
  width: number;
}

interface LineBuild {
  key: string;
  towers: Record<LineType, TowerInstance[]>;
  portals: Record<LineType, TowerInstance[]>;
  ghosts: Record<LineType, Placed[]>;
  /** One tube per phase and earth wire — drawn where the span is near. */
  near: ConductorInstance[];
  /** One tube per side at the mean phase height — drawn where the span is far. */
  far: ConductorInstance[];
  polylines: Map<string, THREE.Vector3[]>;
  constructionHead: THREE.Vector3 | null;
  upgradeHead: THREE.Vector3 | null;
}

interface LodState {
  /** Whether any near geometry draws at this view distance. */
  near: boolean;
  x: number;
  z: number;
  radius: number;
}

function emptyByType<T>(): Record<LineType, T[]> {
  return { lv: [], mv: [], hv: [] };
}

function lineKey(line: WorldLine, laneSign: string, scene: WorldScene, quality: string): string {
  const upgrade = line.upgrade ? `${line.upgrade.type}:${line.upgrade.progress.toFixed(4)}` : "-";
  const segments = line.segments.map((s) => `${s.key}:${s.fromIndex}-${s.toIndex}`).join(",");
  return [
    line.id,
    line.type,
    line.built ? 1 : 0,
    line.progress.toFixed(4),
    upgrade,
    laneSign,
    segments,
    scene.seed,
    `${scene.board.cols}x${scene.board.rows}`,
    quality,
  ].join("|");
}

/** The segment a path step belongs to, or null (unbuilt, or not measured). */
function segmentOfStep(line: WorldLine, step: number): string | null {
  for (const segment of line.segments) {
    if (step >= segment.fromIndex && step < segment.toIndex) return segment.key;
  }
  return null;
}

function packMatrices(list: readonly Placed[]): Float32Array {
  const out = new Float32Array(list.length * 16);
  for (let i = 0; i < list.length; i++) out.set(list[i]?.matrix ?? [], i * 16);
  return out;
}

function packColors(list: readonly TowerInstance[]): Float32Array {
  const out = new Float32Array(list.length * 3);
  for (let i = 0; i < list.length; i++) out.set(list[i]?.color ?? [1, 1, 1], i * 3);
  return out;
}

function packWidths(list: readonly ConductorInstance[]): Float32Array {
  const out = new Float32Array(list.length);
  for (let i = 0; i < list.length; i++) out[i] = list[i]?.width ?? 1;
  return out;
}

export function createGridModule(): WorldModule {
  let ctxRef: ModuleContext | null = null;
  let geometries: Record<LineType, PylonGeometries> | null = null;
  let steel: THREE.MeshStandardMaterial | null = null;
  let ghostMaterial: THREE.MeshStandardMaterial | null = null;
  const tubes: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const nearUniforms: ConductorUniforms = {
    uBreath: { value: 1 },
    uPixelRadius: { value: 0.001 },
    uMinRadius: { value: 0.008 },
    uGlowGain: { value: 1 },
  };
  const farUniforms: ConductorUniforms = {
    uBreath: { value: 1 },
    uPixelRadius: { value: 0.0016 },
    uMinRadius: { value: 0.022 },
    uGlowGain: { value: 1 },
  };
  const nearGlowUniforms: ConductorUniforms = {
    uBreath: { value: 1 },
    uPixelRadius: { value: 0.003 },
    uMinRadius: { value: 0.024 },
    uGlowGain: { value: NEAR_HALO_GAIN },
  };
  const farGlowUniforms: ConductorUniforms = {
    uBreath: { value: 1 },
    uPixelRadius: { value: 0.005 },
    uMinRadius: { value: 0.07 },
    uGlowGain: { value: FAR_HALO_GAIN },
  };

  const towersNear = {} as Record<LineType, InstancePool>;
  const towersFar = {} as Record<LineType, InstancePool>;
  const portals = {} as Record<LineType, InstancePool>;
  const ghosts = {} as Record<LineType, InstancePool>;
  let conductorsNear: InstancePool | null = null;
  let conductorsFar: InstancePool | null = null;
  let glowNear: InstancePool | null = null;
  let glowFar: InstancePool | null = null;

  const builds = new Map<string, LineBuild>();
  const heads = new Map<string, THREE.Object3D>();
  /** Segment key per packed conductor instance: cores near and far, halos near and far. */
  let nearSegments: (string | null)[] = [];
  let farSegments: (string | null)[] = [];
  let glowNearSegments: (string | null)[] = [];
  let glowFarSegments: (string | null)[] = [];
  /** The warn / over segments of the last update — the halo set is packed from them. */
  let hotSignature = "";
  const lod: LodState = { near: false, x: Number.NaN, z: Number.NaN, radius: 0 };

  const polylines = new Map<string, THREE.Vector3[]>();
  const segments = new Map<string, GridSegmentInfo>();

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();

  const ensureResources = (ctx: ModuleContext): void => {
    if (geometries) return;
    geometries = buildPylonGeometries();
    steel = new THREE.MeshStandardMaterial({
      color: new THREE.Color(1, 1, 1),
      metalness: 0.55,
      roughness: 0.62,
      vertexColors: true,
    });
    steel.name = "grid-steel";
    ghostMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.7, 0.88, 1, THREE.SRGBColorSpace),
      emissive: new THREE.Color(0.22, 0.55, 0.85),
      emissiveIntensity: 1.1,
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      vertexColors: true,
    });
    ghostMaterial.name = "grid-ghost";
    materials.push(steel, ghostMaterial);
    for (const type of LINE_TYPES) {
      const set = geometries[type];
      towersNear[type] = new InstancePool(set.near, steel, ctx.root, {
        name: `grid-towers-${type}-near`,
        color: true,
        load: false,
        castShadow: true,
        receiveShadow: true,
      });
      towersFar[type] = new InstancePool(set.far, steel, ctx.root, {
        name: `grid-towers-${type}-far`,
        color: true,
        load: false,
        castShadow: false,
        receiveShadow: false,
      });
      portals[type] = new InstancePool(set.portal, steel, ctx.root, {
        name: `grid-portals-${type}`,
        color: true,
        load: false,
        castShadow: true,
        receiveShadow: true,
      });
      ghosts[type] = new InstancePool(set.near, ghostMaterial, ctx.root, {
        name: `grid-ghosts-${type}`,
        color: false,
        load: false,
        castShadow: false,
        receiveShadow: false,
      });
    }
    const nearTube = catenaryTubeGeometry(12, 4, 0.006);
    const farTube = catenaryTubeGeometry(6, 3, 0.03);
    // The halos get their own copies of the tubes: they hold only the warn /
    // over spans, so their instance order — and their enLoad — is their own.
    const nearGlowTube = nearTube.clone();
    const farGlowTube = farTube.clone();
    tubes.push(nearTube, farTube, nearGlowTube, farGlowTube);
    const nearMaterial = conductorMaterial(nearUniforms, "near");
    const farMaterial = conductorMaterial(farUniforms, "far");
    const nearGlow = conductorGlowMaterial(nearGlowUniforms, "near");
    const farGlow = conductorGlowMaterial(farGlowUniforms, "far");
    materials.push(nearMaterial, farMaterial, nearGlow, farGlow);
    const conductorPool = (
      name: string,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
    ) =>
      new InstancePool(geometry, material, ctx.root, {
        name,
        color: false,
        load: true,
        width: true,
        castShadow: false,
        receiveShadow: false,
      });
    conductorsNear = conductorPool("grid-conductors-near", nearTube, nearMaterial);
    conductorsFar = conductorPool("grid-conductors-far", farTube, farMaterial);
    glowNear = conductorPool("grid-conductor-glow-near", nearGlowTube, nearGlow);
    glowFar = conductorPool("grid-conductor-glow-far", farGlowTube, farGlow);
  };

  /** Steel, conductors and ghosts of one line, from its route on the relief. */
  const buildLine = (
    line: WorldLine,
    key: string,
    signs: Map<string, 1 | -1>,
    ctx: ModuleContext,
  ): LineBuild => {
    const build: LineBuild = {
      key,
      towers: emptyByType(),
      portals: emptyByType(),
      ghosts: emptyByType(),
      near: [],
      far: [],
      polylines: new Map(),
      constructionHead: null,
      upgradeHead: null,
    };
    const spec = PYLON_SPECS[line.type];
    const route = insetEnds(offsetPolyline(line, signs), PORTAL_INSET_KM);
    const structures = placeStructures(route, ctx.terrain);
    if (structures.length < 2) return build;
    const totalArc = structures[structures.length - 1]?.arc ?? 0;
    const rng = ctx.rng(`grid:weathering:${line.id}`);

    // Erected structures: everything up to the progress along the route; a
    // finished line has them all, the end portal only when finished.
    const erectedLimit = line.built ? Number.POSITIVE_INFINITY : line.progress * totalArc + 1e-6;
    let lastErected = -1;
    structures.forEach((placement, index) => {
      const erected =
        line.built || (placement.arc <= erectedLimit && index < structures.length - 1);
      if (!erected) return;
      lastErected = index;
      matrix.makeRotationY(placement.yaw).setPosition(placement.x, placement.y, placement.z);
      const age = rng.next();
      tint.copy(STEEL_NEW).lerp(STEEL_OLD, age);
      if (rng.next() < 0.12) tint.lerp(STEEL_RUST, 0.5);
      const instance: TowerInstance = {
        matrix: [...matrix.elements],
        x: placement.x,
        z: placement.z,
        color: [tint.r, tint.g, tint.b],
      };
      (placement.kind === "portal" ? build.portals : build.towers)[line.type].push(instance);
    });
    if (!line.built && lastErected >= 0) {
      const head = structures[lastErected];
      if (head) build.constructionHead = new THREE.Vector3(head.x, head.y, head.z);
    }

    // Spans between erected structures — minus the last one while building.
    const lastSpan = line.built ? structures.length - 2 : lastErected - 2;
    const attachmentsOf = (placement: Placement) =>
      placement.kind === "portal" ? spec.portal.attachments : spec.attachments;
    const conductors = spec.attachments.filter((a) => !a.earth);
    const sides = new Set(conductors.map((a) => Math.sign(a.x)));
    const centreY = conductors.reduce((sum, a) => sum + a.y, 0) / Math.max(1, conductors.length);
    const lowest = conductors.reduce((min, a) => Math.min(min, a.y), Number.POSITIVE_INFINITY);
    for (let s = 0; s <= lastSpan; s++) {
      const from = structures[s];
      const to = structures[s + 1];
      if (!from || !to) continue;
      const segmentKey = segmentOfStep(line, from.step);
      const fromAttachments = attachmentsOf(from);
      const toAttachments = attachmentsOf(to);
      const midX = (from.x + to.x) / 2;
      const midZ = (from.z + to.z) / 2;
      // Clearance from the lowest phase; the whole span shares it.
      attachmentWorld(from, 0, from.kind === "portal" ? spec.portal.beamY : lowest, p0);
      attachmentWorld(to, 0, to.kind === "portal" ? spec.portal.beamY : lowest, p1);
      const sag = sagClearanceFactor(p0, p1, CONDUCTOR_SAG * p0.distanceTo(p1), ctx.terrain);

      for (let c = 0; c < fromAttachments.length; c++) {
        const a = fromAttachments[c];
        const b = toAttachments[c];
        if (!a || !b) continue;
        attachmentWorld(from, a.x, a.y, p0);
        attachmentWorld(to, b.x, b.y, p1);
        spanMatrix(p0, p1, sag, matrix);
        build.near.push({
          matrix: [...matrix.elements],
          x: midX,
          z: midZ,
          segmentKey: a.earth ? null : segmentKey,
          width: 1,
        });
      }
      // The far set: one tube per side at the mean phase height.
      for (const side of sides) {
        const own = conductors.filter((a) => Math.sign(a.x) === side);
        const meanX = own.reduce((sum, a) => sum + a.x, 0) / Math.max(1, own.length);
        const meanY = own.reduce((sum, a) => sum + a.y, 0) / Math.max(1, own.length);
        const fromPortal = from.kind === "portal";
        const toPortal = to.kind === "portal";
        attachmentWorld(
          from,
          fromPortal ? meanX * 1.4 : meanX,
          fromPortal ? spec.portal.beamY : meanY,
          p0,
        );
        attachmentWorld(
          to,
          toPortal ? meanX * 1.4 : meanX,
          toPortal ? spec.portal.beamY : meanY,
          p1,
        );
        spanMatrix(p0, p1, sag, matrix);
        build.far.push({
          matrix: [...matrix.elements],
          x: midX,
          z: midZ,
          segmentKey,
          width: FAR_WIDTH_BY_TYPE[line.type],
        });
      }
      // The spine of the span for effects: sag included, path order.
      if (segmentKey) {
        attachmentWorld(from, 0, from.kind === "portal" ? spec.portal.beamY : centreY, p0);
        attachmentWorld(to, 0, to.kind === "portal" ? spec.portal.beamY : centreY, p1);
        const list = build.polylines.get(segmentKey) ?? [];
        const start = list.length === 0 ? 0 : 1;
        for (let i = start; i <= POLYLINE_SAMPLES; i++) {
          const t = i / POLYLINE_SAMPLES;
          list.push(
            new THREE.Vector3(
              p0.x + (p1.x - p0.x) * t,
              catenaryY(p0, p1, sag, t),
              p0.z + (p1.z - p0.z) * t,
            ),
          );
        }
        build.polylines.set(segmentKey, list);
      }
    }

    // Mid-upgrade: taller ghost towers of the target type beside the old line,
    // as far as the raise has come.
    if (line.upgrade) {
      const target = line.upgrade.type;
      const limit = line.upgrade.progress * totalArc + 1e-6;
      let lastGhost: Placement | null = null;
      for (const placement of structures) {
        if (placement.kind === "portal" || placement.arc > limit) continue;
        attachmentWorld(placement, GHOST_OFFSET_KM, 0, p0);
        matrix.makeRotationY(placement.yaw).setPosition(p0.x, placement.y, p0.z);
        build.ghosts[target].push({ matrix: [...matrix.elements], x: p0.x, z: p0.z });
        lastGhost = placement;
      }
      if (lastGhost) build.upgradeHead = new THREE.Vector3(lastGhost.x, lastGhost.y, lastGhost.z);
    }
    return build;
  };

  /** Whether a structure at (x, z) draws its near geometry under the current partition. */
  const isNear = (p: Placed): boolean =>
    lod.near && Math.hypot(p.x - lod.x, p.z - lod.z) < lod.radius;

  /** The load emissive of every packed conductor instance from the segment map. */
  const applyLoadsToPools = (): void => {
    const encode = (keys: (string | null)[]): Float32Array => {
      const out = new Float32Array(keys.length * 4);
      keys.forEach((key, i) => {
        const load = key ? (segments.get(key)?.load ?? "idle") : "idle";
        out.set(LOAD_EMISSIVE[load], i * 4);
      });
      return out;
    };
    conductorsNear?.setLoads(encode(nearSegments));
    conductorsFar?.setLoads(encode(farSegments));
    glowNear?.setLoads(encode(glowNearSegments));
    glowFar?.setLoads(encode(glowFarSegments));
  };

  /** Whether a conductor instance belongs to a warn / over segment — the halo set. */
  const isHot = (instance: ConductorInstance): boolean => {
    const load = instance.segmentKey ? segments.get(instance.segmentKey)?.load : undefined;
    return load === "warn" || load === "over";
  };

  /** Partitions every line's instances into the near and far pools. */
  const pack = (ctx: ModuleContext): void => {
    if (!conductorsNear || !conductorsFar || !glowNear || !glowFar) return;
    for (const type of LINE_TYPES) {
      const near: TowerInstance[] = [];
      const far: TowerInstance[] = [];
      const portalList: TowerInstance[] = [];
      const ghostList: Placed[] = [];
      for (const build of builds.values()) {
        for (const tower of build.towers[type]) (isNear(tower) ? near : far).push(tower);
        for (const portal of build.portals[type]) if (isNear(portal)) portalList.push(portal);
        for (const ghost of build.ghosts[type]) if (isNear(ghost)) ghostList.push(ghost);
      }
      towersNear[type]?.fill(packMatrices(near), packColors(near));
      towersFar[type]?.fill(packMatrices(far), packColors(far));
      portals[type]?.fill(packMatrices(portalList), packColors(portalList));
      ghosts[type]?.fill(packMatrices(ghostList));
    }
    const near: ConductorInstance[] = [];
    const far: ConductorInstance[] = [];
    for (const build of builds.values()) {
      for (const instance of build.near) if (isNear(instance)) near.push(instance);
      for (const instance of build.far) if (!isNear(instance)) far.push(instance);
    }
    const hotNear = near.filter(isHot);
    const hotFar = far.filter(isHot);
    nearSegments = near.map((instance) => instance.segmentKey);
    farSegments = far.map((instance) => instance.segmentKey);
    glowNearSegments = hotNear.map((instance) => instance.segmentKey);
    glowFarSegments = hotFar.map((instance) => instance.segmentKey);
    conductorsNear.fill(packMatrices(near), undefined, undefined, packWidths(near));
    conductorsFar.fill(packMatrices(far), undefined, undefined, packWidths(far));
    glowNear.fill(packMatrices(hotNear), undefined, undefined, packWidths(hotNear));
    glowFar.fill(packMatrices(hotFar), undefined, undefined, packWidths(hotFar));
    applyLoadsToPools();

    // Hooks for the effects module's cranes.
    for (const [id, head] of heads) {
      const build = builds.get(id);
      if (!build || (!build.constructionHead && !build.upgradeHead)) {
        ctx.root.remove(head);
        heads.delete(id);
      }
    }
    for (const [id, build] of builds) {
      const at = build.constructionHead ?? build.upgradeHead;
      if (!at) continue;
      let head = heads.get(id);
      if (!head) {
        head = new THREE.Object3D();
        heads.set(id, head);
        ctx.root.add(head);
      }
      head.name = build.constructionHead
        ? `grid:construction-head:${id}`
        : `grid:upgrade-head:${id}`;
      head.position.copy(at);
      head.userData = { lineId: id, kind: build.constructionHead ? "construction" : "upgrade" };
    }
  };

  /** The segment map of the scene — what the loads are read from; true when the halo set changed. */
  const readSegments = (scene: WorldScene): boolean => {
    segments.clear();
    const hot: string[] = [];
    for (const line of scene.lines) {
      for (const segment of line.segments) {
        segments.set(segment.key, {
          lineId: line.id,
          type: line.type,
          load: segment.load,
          ratio: segment.ratio,
          usedMw: segment.usedMw,
          capacityMw: segment.capacityMw,
          direction: segment.direction,
        });
        if (segment.load === "warn" || segment.load === "over") hot.push(segment.key);
      }
    }
    const signature = hot.sort().join(",");
    const changed = signature !== hotSignature;
    hotSignature = signature;
    return changed;
  };

  const publish = (scene: WorldScene, ctx: ModuleContext): void => {
    polylines.clear();
    for (const build of builds.values()) {
      for (const [key, points] of build.polylines) polylines.set(key, points);
    }
    ctx.root.userData.gridPolylines = polylines;
    ctx.root.userData.gridSegments = segments;
    // The worst bottleneck's spine (overlay.bottleneck is read, never drawn —
    // the ring is effects'): null when the bottleneck is a node or unknown.
    const key = scene.overlay.bottleneck?.segmentKey ?? null;
    ctx.root.userData.gridBottleneckPolyline = key ? (polylines.get(key) ?? null) : null;
  };

  /** Reads the camera into the partition state; true when the pools must be refilled. */
  const refreshLod = (ctx: ModuleContext): boolean => {
    const threshold = NEAR_LOD_KM * QUALITY_PROFILES[ctx.quality].detail;
    const near = ctx.view.distanceKm < threshold;
    const radius = near ? NEAR_FACTOR * ctx.view.distanceKm + NEAR_BASE_KM : 0;
    const camera = ctx.view.camera.position;
    const moved =
      near !== lod.near ||
      Math.abs(radius - lod.radius) > REPACK_KM ||
      !(Math.hypot(camera.x - lod.x, camera.z - lod.z) <= REPACK_KM);
    if (!moved) return false;
    lod.near = near;
    lod.radius = radius;
    lod.x = camera.x;
    lod.z = camera.z;
    return true;
  };

  return {
    id: "grid",

    init(ctx) {
      ctxRef = ctx;
      ensureResources(ctx);
    },

    update(scene, _previous, ctx) {
      ctxRef = ctx;
      ensureResources(ctx);
      const signs = corridorSigns(scene.lines);
      const seen = new Set<string>();
      let structural = false;
      for (const line of scene.lines) {
        seen.add(line.id);
        const key = lineKey(line, laneSignature(line, signs), scene, ctx.quality);
        if (builds.get(line.id)?.key !== key) {
          builds.set(line.id, buildLine(line, key, signs, ctx));
          structural = true;
        }
      }
      for (const id of [...builds.keys()]) {
        if (!seen.has(id)) {
          builds.delete(id);
          structural = true;
        }
      }
      const hotChanged = readSegments(scene);
      const lodChanged = refreshLod(ctx);
      if (structural || hotChanged || lodChanged) pack(ctx);
      else applyLoadsToPools();
      publish(scene, ctx);
    },

    frame(_dt, ctx) {
      const breath = ctx.motion.ambient
        ? 1 + BREATH_AMPLITUDE * Math.sin(2 * Math.PI * BREATH_HZ * ctx.clock.time)
        : 1;
      for (const uniforms of [nearUniforms, farUniforms, nearGlowUniforms, farGlowUniforms]) {
        uniforms.uBreath.value = breath;
      }
      // A conductor is ≈ 1,1 px wide at closeup and 1,1–2,1 px by type at the
      // strategic view; its halo ≈ 3 px and ≈ 5 px, dimmed by day like bloom.
      const height = ctx.renderer.domElement.clientHeight || 900;
      const perPixel = (2 * Math.tan((ctx.view.camera.fov / 2) * DEG)) / height;
      nearUniforms.uPixelRadius.value = 0.55 * perPixel;
      farUniforms.uPixelRadius.value = 0.9 * perPixel;
      nearGlowUniforms.uPixelRadius.value = 1.6 * perPixel;
      farGlowUniforms.uPixelRadius.value = 2.6 * perPixel;
      const daylight = Math.min(1, Math.max(0, ctx.environment.daylight));
      const haloShare = 1 - (1 - HALO_DAYLIGHT_SHARE) * daylight;
      nearGlowUniforms.uGlowGain.value = NEAR_HALO_GAIN * haloShare;
      farGlowUniforms.uGlowGain.value = FAR_HALO_GAIN * haloShare;
      if (refreshLod(ctx) && builds.size > 0) pack(ctx);
    },

    dispose() {
      for (const type of LINE_TYPES) {
        towersNear[type]?.dispose();
        towersFar[type]?.dispose();
        portals[type]?.dispose();
        ghosts[type]?.dispose();
      }
      for (const pool of [conductorsNear, conductorsFar, glowNear, glowFar]) pool?.dispose();
      conductorsNear = null;
      conductorsFar = null;
      glowNear = null;
      glowFar = null;
      if (ctxRef) {
        for (const head of heads.values()) ctxRef.root.remove(head);
        delete ctxRef.root.userData.gridPolylines;
        delete ctxRef.root.userData.gridSegments;
        delete ctxRef.root.userData.gridBottleneckPolyline;
      }
      heads.clear();
      builds.clear();
      polylines.clear();
      segments.clear();
      nearSegments = [];
      farSegments = [];
      glowNearSegments = [];
      glowFarSegments = [];
      hotSignature = "";
      if (geometries) disposePylonGeometries(geometries);
      geometries = null;
      for (const tube of tubes) tube.dispose();
      tubes.length = 0;
      for (const material of materials) material.dispose();
      materials.length = 0;
      steel = null;
      ghostMaterial = null;
      lod.near = false;
      lod.x = Number.NaN;
      lod.z = Number.NaN;
      lod.radius = 0;
      ctxRef = null;
    },
  };
}
