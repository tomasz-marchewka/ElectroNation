// Hook reading (docs/STATUS.json effectsHooks): the effects module owns no
// objects of its own state — it dresses what the other modules publish. This
// file finds those hooks with ONE scene traverse and turns the scene slice
// plus the hooks' `userData` into the compact structures ./index.ts draws.
//
// The published hooks, by name:
//   grid    grid:construction-head:<lineId>, grid:upgrade-head:<lineId>,
//           <grid root>.userData.gridPolylines (Map<segmentKey, Vector3[]>)
//   cities  cities:base:<cityId>   { cityId, radiusKm, connected, blackout, ensMw }
//   plants  plants:base:<plantId>  { radiusKm, padKm, yaw, dumpMw, … }
//   res     res:base:<farmId>      { farmId, tech, offshore, radiusKm }
//   storage storage:base:<id>      { storageId, tech, mode, soc, flowMw, powerMw, radiusKm }
//   nodes   nodes:base:<id>, site:crane:<siteId> { kind, tech, progress, remainingDays }
//
// A missing hook is not an error — the world boots with modules disabled — so
// every read falls back to the scene slice alone.

import * as THREE from "three";
import type { HexRef, WorldScene } from "../../bridge/worldScene";

export interface HookIndex {
  names: Map<string, THREE.Object3D>;
  gridRoot: THREE.Object3D | null;
}

/** One traverse; module roots are indexed too, the grid root is remembered. */
export function buildHookIndex(root: THREE.Object3D): HookIndex {
  const names = new Map<string, THREE.Object3D>();
  let gridRoot: THREE.Object3D | null = null;
  root.traverse((object) => {
    if (object.name === "module:grid") gridRoot = object;
    if (object.name) names.set(object.name, object);
  });
  return { names, gridRoot };
}

export function hookNumber(hook: THREE.Object3D | undefined, key: string): number {
  const value = hook?.userData?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export interface CityMark {
  id: string;
  name: string;
  /** Engine hex key — the bottleneck ring skips a hex a city already rings. */
  hexKey: string;
  x: number;
  z: number;
  radiusKm: number;
  blackout: boolean;
}

export interface FarmMark {
  id: string;
  name: string;
  x: number;
  z: number;
  radiusKm: number;
  curtailed: boolean;
  disabled: boolean;
}

export interface PlantMark {
  id: string;
  name: string;
  x: number;
  z: number;
  radiusKm: number;
  dump: boolean;
}

export type StorageDirection = "charge" | "discharge" | "idle";

export interface StorageMark {
  id: string;
  name: string;
  x: number;
  z: number;
  radiusKm: number;
  direction: StorageDirection;
  /** |flowMw| / powerMw, 0..1. */
  magnitude: number;
}

export type CraneKind = "construction" | "upgrade" | "site";

export interface CraneMark {
  key: string;
  kind: CraneKind;
  x: number;
  z: number;
}

export interface BorderMark {
  id: string;
  name: string;
  spine: THREE.Vector3[];
  /** 0..1 share of the throughput in use. */
  ratio: number;
  /** True when the import flow is the live direction this turn. */
  importing: boolean;
  exporting: boolean;
}

export interface FlowMark {
  key: string;
  lineId: string;
  spine: THREE.Vector3[];
  ratio: number;
  usedMw: number;
  capacityMw: number;
  load: "ok" | "warn" | "over";
  /** True when the (heuristic) flow runs against the polyline's own order. */
  reverse: boolean;
  /** The segment's stretch of hexes — the ends the bottleneck ring marks. */
  pathHexes: HexRef[];
}

export interface EffectsState {
  cities: CityMark[];
  farms: FarmMark[];
  plants: PlantMark[];
  storages: StorageMark[];
  cranes: CraneMark[];
  borders: BorderMark[];
  flows: FlowMark[];
  /** Segment keys whose flow changed shape — part of the module's rebuild key. */
  flowSignature: string;
  /** Everything that changes within a day and forces a ring rebuild. */
  ringSignature: string;
}

/**
 * A hook's world centre, or null when the hook is missing. A module without
 * its hook draws nothing — the world boots with modules disabled, and a mark
 * at (0, 0) would be worse than no mark.
 */
function centreOf(hook: THREE.Object3D | undefined): { x: number; z: number } | null {
  return hook ? { x: hook.position.x, z: hook.position.z } : null;
}

/**
 * The per-turn state of every overlay, in scene order (deterministic), read
 * from the hooks' `userData` refreshed this turn plus the scene slice.
 */
export function readEffectsState(scene: WorldScene, index: HookIndex): EffectsState {
  const cities: CityMark[] = [];
  const farms: FarmMark[] = [];
  const plants: PlantMark[] = [];
  const storages: StorageMark[] = [];
  const cranes: CraneMark[] = [];
  const borders: BorderMark[] = [];
  const flows: FlowMark[] = [];

  for (const city of scene.cities) {
    const hook = index.names.get(`cities:base:${city.id}`);
    const at = centreOf(hook);
    if (!at) continue;
    cities.push({
      id: city.id,
      name: city.name,
      hexKey: city.hex.key,
      x: at.x,
      z: at.z,
      radiusKm: hookNumber(hook, "radiusKm"),
      blackout: city.blackout,
    });
  }

  for (const farm of scene.farms) {
    const hook = index.names.get(`res:base:${farm.id}`);
    const at = centreOf(hook);
    if (!at) continue;
    farms.push({
      id: farm.id,
      name: farm.name,
      x: at.x,
      z: at.z,
      radiusKm: hookNumber(hook, "radiusKm"),
      curtailed: farm.curtailedMw > 0.5,
      disabled: !farm.enabled,
    });
  }

  for (const plant of scene.plants) {
    const hook = index.names.get(`plants:base:${plant.id}`);
    const at = centreOf(hook);
    if (!at) continue;
    plants.push({
      id: plant.id,
      name: plant.name,
      x: at.x,
      z: at.z,
      radiusKm: hookNumber(hook, "radiusKm"),
      dump: plant.dumpMw > 0.5,
    });
  }

  for (const storage of scene.storages) {
    const hook = index.names.get(`storage:base:${storage.id}`);
    const at = centreOf(hook);
    if (!at) continue;
    const magnitude =
      storage.powerMw > 0
        ? Math.min(1, Math.abs(storage.flowMw) / storage.powerMw)
        : Math.abs(storage.flowMw) > 0.5
          ? 1
          : 0;
    storages.push({
      id: storage.id,
      name: storage.name,
      x: at.x,
      z: at.z,
      radiusKm: hookNumber(hook, "radiusKm"),
      direction:
        storage.mode === "charge" ? "charge" : storage.mode === "discharge" ? "discharge" : "idle",
      magnitude,
    });
  }

  // Cranes: one per line head (construction beats upgrade) and one per site.
  for (const line of scene.lines) {
    const construction = index.names.get(`grid:construction-head:${line.id}`);
    const upgrade = index.names.get(`grid:upgrade-head:${line.id}`);
    const hook = construction ?? upgrade;
    if (!hook) continue;
    cranes.push({
      key: hook.name,
      kind: construction ? "construction" : "upgrade",
      x: hook.position.x,
      z: hook.position.z,
    });
  }
  for (const site of scene.sites) {
    const hook = index.names.get(`site:crane:${site.id}`);
    if (!hook) continue;
    cranes.push({
      key: `site:crane:${site.id}`,
      kind: "site",
      x: hook.position.x,
      z: hook.position.z,
    });
  }

  for (const border of scene.borders) {
    const hook = index.names.get(`nodes:base:${border.id}`);
    const spine = hook?.userData?.borderPolyline;
    if (!(spine instanceof Array) || spine.length < 2) continue;
    borders.push({
      id: border.id,
      name: border.name,
      spine: spine as THREE.Vector3[],
      ratio: border.ratio,
      importing: border.importUsedMw > border.exportDeliveredMw,
      exporting: border.exportDeliveredMw > border.importUsedMw,
    });
  }

  const polylines = index.gridRoot?.userData?.gridPolylines as
    Map<string, THREE.Vector3[]> | undefined;
  const flowParts: string[] = [];
  if (polylines) {
    for (const line of scene.lines) {
      for (const segment of line.segments) {
        if (segment.usedMw <= 0.5 || segment.ratio < 0.02) continue;
        const spine = polylines.get(segment.key);
        if (!spine || spine.length < 2) continue;
        const load = segment.load === "idle" ? "ok" : segment.load;
        flows.push({
          key: segment.key,
          lineId: line.id,
          spine,
          ratio: segment.ratio,
          usedMw: segment.usedMw,
          capacityMw: segment.capacityMw,
          load,
          reverse: segment.direction === -1,
          pathHexes: line.path.slice(segment.fromIndex, segment.toIndex + 1),
        });
        flowParts.push(
          `${segment.key}:${segment.load}:${segment.ratio.toFixed(2)}:${segment.direction}`,
        );
      }
    }
  }

  const ringParts: string[] = [];
  for (const mark of cities) {
    if (mark.blackout) ringParts.push(`c${mark.id}:${mark.radiusKm.toFixed(2)}`);
  }
  for (const mark of farms) {
    if (mark.curtailed || mark.disabled) {
      ringParts.push(`f${mark.id}:${mark.curtailed ? "cut" : "off"}:${mark.radiusKm.toFixed(2)}`);
    }
  }
  for (const mark of plants) {
    if (mark.dump) ringParts.push(`p${mark.id}:${mark.radiusKm.toFixed(2)}`);
  }
  for (const mark of storages) {
    if (mark.magnitude > 0.02)
      ringParts.push(`s${mark.id}:${mark.direction}:${mark.magnitude.toFixed(2)}`);
  }
  for (const mark of borders) {
    ringParts.push(
      `b${mark.id}:${mark.ratio.toFixed(2)}:${mark.importing ? "i" : mark.exporting ? "e" : "-"}`,
    );
  }
  for (const mark of cranes) ringParts.push(`k${mark.key}`);

  return {
    cities,
    farms,
    plants,
    storages,
    cranes,
    borders,
    flows,
    flowSignature: flowParts.join("|"),
    ringSignature: ringParts.join("|"),
  };
}
