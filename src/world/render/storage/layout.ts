// Site plans for render/storage (docs/08 §2, §3): deterministic layouts from
// the storage's identity and the terrain under it. The BESS yard is a gravel
// pad with container rows, power skids, a switchyard portal, a fence, masts and
// the unit-status light bar. The pumped plant is an upper reservoir on a bench:
// the crest sits DAM_RISE_KM above the highest ground under the basin, the
// basin narrows toward the floor (so the water disc shrinks as the level
// drops), the penstock run follows the outer face down to a powerhouse at the
// foot, and a tailrace pond closes the circuit.
//
// Every ground height comes from ctx.terrain.heightAt; nothing floats.

import * as THREE from "three";
import type { WorldStorage } from "../../bridge/worldScene";
import type { Rng } from "../core/prng";
import type { TerrainProvider } from "../core/types";
import { hexToWorld } from "../core/units";
import {
  CONTAINER_H_KM,
  CONTAINER_L_KM,
  CONTAINER_W_KM,
  DAM_RISE_KM,
  MAST_H_KM,
  type EmbankmentSpec,
  type Rect,
} from "./geometry";

export interface Site {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface BessPlan {
  kind: "bess";
  id: string;
  centre: THREE.Vector3;
  rect: Rect;
  /** Outer radius for the effects hook [km]. */
  radiusKm: number;
  containers: Site[];
  skids: Site[];
  portals: Site[];
  masts: Site[];
  /** The SOC bar: one lamp per container, in container order. */
  lamps: Site[];
  /** Backing bar for the lamp run, merged into the fence mesh. */
  bar: { x: number; y: number; z: number; length: number; yaw: number };
  yardGlows: { x: number; y: number; z: number; size: number }[];
}

export interface PumpedPlan {
  kind: "pumped";
  id: string;
  centre: THREE.Vector3;
  spec: EmbankmentSpec;
  /** Effects hook radius [km]. */
  radiusKm: number;
  floorY: number;
  floorRadius: number;
  /** Dead storage (empty mark) and full mark [world Y]. */
  emptyY: number;
  fullY: number;
  /** Water disc radius at the full mark [km]. */
  waterRadius: number;
  /** Gated spillway: bay angle and half width [km]. */
  spillway: { angle: number; halfWidth: number };
  powerhouses: Site[];
  intakes: Site[];
  crestLights: { x: number; y: number; z: number }[];
  masts: Site[];
  yardGlows: { x: number; y: number; z: number; size: number }[];
  penstock: THREE.Vector3[];
  /** The concrete tailrace channel from the powerhouse to the pond. */
  outfall: THREE.Vector3[];
  tailrace: { x: number; y: number; z: number; rx: number; rz: number; yaw: number };
  foam: { x: number; y: number; z: number };
  swirl: { x: number; y: number; z: number };
}

export type StoragePlan = BessPlan | PumpedPlan;

const CONTAINER_SPACING_KM = CONTAINER_L_KM + 0.2;
const ROW_PITCH_KM = CONTAINER_W_KM + 0.72;

export function storagePlan(
  storage: WorldStorage,
  terrain: TerrainProvider,
  rng: Rng,
): StoragePlan {
  const ground = hexToWorld(storage.hex);
  return storage.tech === "battery"
    ? bessPlan(storage, ground.x, ground.z, terrain, rng)
    : pumpedPlan(storage, ground.x, ground.z, terrain, rng);
}

function bessPlan(
  storage: WorldStorage,
  gx: number,
  gz: number,
  terrain: TerrainProvider,
  rng: Rng,
): BessPlan {
  const count = Math.max(4, Math.min(24, Math.round(4 + storage.footprint * 20)));
  const rows = count <= 12 ? 2 : 3;
  const perRow = Math.ceil(count / rows);
  const rowLength = perRow * CONTAINER_SPACING_KM - (CONTAINER_SPACING_KM - CONTAINER_L_KM);
  const yaw = rng.range(-0.16, 0.16);
  const rect: Rect = {
    x: gx,
    z: gz,
    hw: rowLength / 2 + 1.0,
    hd: (rows * ROW_PITCH_KM) / 2 + 0.85,
    yaw,
  };
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const toWorld = (lx: number, lz: number): { x: number; z: number } => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return { x: rect.x + lx * c - lz * s, z: rect.z + lx * s + lz * c };
  };

  const containers: Site[] = [];
  const lamps: Site[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const lx = -rowLength / 2 + CONTAINER_L_KM / 2 + col * CONTAINER_SPACING_KM;
    const lz = -((rows - 1) * ROW_PITCH_KM) / 2 + row * ROW_PITCH_KM;
    const p = toWorld(lx, lz);
    containers.push({
      x: p.x,
      y: ground(p.x, p.z) + rng.range(-0.01, 0.01),
      z: p.z,
      yaw: yaw + rng.range(-0.02, 0.02),
    });
  }
  // The SOC bar runs along the front edge, one lamp per container evenly
  // spaced: the lit share is the state of charge, the lit run a length. The
  // lamps sit right on the bar's dark housing so the lit run and the dark run
  // are the same element at every distance (the daylight read).
  for (let i = 0; i < count; i++) {
    const lampX = -rowLength / 2 + ((i + 0.5) * rowLength) / count;
    const lp = toWorld(lampX, rect.hd + 0.4);
    lamps.push({ x: lp.x, y: ground(lp.x, lp.z) + 0.19, z: lp.z, yaw });
  }

  const skids: Site[] = [];
  for (let row = 0; row < rows; row++) {
    const lz = -((rows - 1) * ROW_PITCH_KM) / 2 + row * ROW_PITCH_KM;
    const p = toWorld(rowLength / 2 + 1.05, lz);
    skids.push({ x: p.x, y: ground(p.x, p.z), z: p.z, yaw: yaw + Math.PI / 2 });
  }

  const portals: Site[] = [];
  for (let i = 0; i < 2; i++) {
    const p = toWorld(rowLength / 2 + 2.3, -0.9 + i * 1.8);
    portals.push({ x: p.x, y: ground(p.x, p.z), z: p.z, yaw });
  }

  const masts: Site[] = [];
  const yardGlows: BessPlan["yardGlows"] = [];
  for (const [lx, lz] of [
    [-rect.hw + 0.5, -rect.hd + 0.5],
    [rect.hw - 0.5, -rect.hd + 0.5],
    [rect.hw - 0.5, rect.hd - 0.5],
    [-rect.hw + 0.5, rect.hd - 0.5],
  ] as const) {
    const p = toWorld(lx, lz);
    masts.push({ x: p.x, y: ground(p.x, p.z), z: p.z, yaw });
    yardGlows.push({ x: p.x, y: ground(p.x, p.z) + 0.04, z: p.z, size: 2.6 });
  }
  const barPoint = toWorld(0, rect.hd + 0.3);
  const bar = {
    x: barPoint.x,
    y: ground(barPoint.x, barPoint.z) + 0.13,
    z: barPoint.z,
    length: rowLength + 0.6,
    yaw,
  };

  return {
    kind: "bess",
    id: storage.id,
    centre: new THREE.Vector3(gx, ground(gx, gz), gz),
    rect,
    radiusKm: Math.max(rect.hw, rect.hd) + 0.6,
    containers,
    skids,
    portals,
    masts,
    lamps,
    bar,
    yardGlows,
  };
}

function pumpedPlan(
  storage: WorldStorage,
  gx: number,
  gz: number,
  terrain: TerrainProvider,
  rng: Rng,
): PumpedPlan {
  // The reservoir goes on the highest side of the hex: sample the rim, take
  // the direction that rises, and put the basin there. The powerhouse then
  // sits on the opposite (falling) side. The score also rewards dry ground at
  // the foot and the tailrace, so a lakeside hex cannot half-drown the works.
  let bestAngle = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const basin = terrain.heightAt(gx + cos * 4.6, gz + sin * 4.6);
    const foot = terrain.heightAt(gx - cos * 2.4, gz - sin * 2.4);
    const tail = terrain.heightAt(gx - cos * 5.9, gz - sin * 5.9);
    const score = basin + 0.8 * foot + 0.6 * tail;
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  const highX = Math.cos(bestAngle);
  const highZ = Math.sin(bestAngle);
  const lowX = -highX;
  const lowZ = -highZ;
  const centreX = gx + highX * 4.6;
  const centreZ = gz + highZ * 4.6;

  const baseRadius = 4.0;
  const crestRadiusOut = 3.05;
  const crestRadiusIn = 2.72;
  // Highest ground under the basin footprint decides the crest: the dam
  // crests just above the hill, never buried in it.
  let hill = -Infinity;
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    for (const radius of [1.5, 2.6, 3.4]) {
      const h = terrain.heightAt(
        centreX + Math.cos(angle) * radius,
        centreZ + Math.sin(angle) * radius,
      );
      if (h > hill) hill = h;
    }
  }
  const crestY = hill + DAM_RISE_KM;
  const floorY = crestY - 0.95;
  const floorRadius = 0.95;
  const emptyY = crestY - 0.82;
  const fullY = crestY - 0.06;
  const radiusAt = (y: number) =>
    floorRadius + (crestRadiusIn - floorRadius) * ((y - floorY) / (crestY + 0.02 - floorY));
  const waterRadius = radiusAt(fullY);

  const jitterAmp = rng.range(0.03, 0.09);
  const jitterPhase = rng.range(0, Math.PI * 2);
  const spec: EmbankmentSpec = {
    x: centreX,
    z: centreZ,
    baseRadius,
    crestRadiusOut,
    crestRadiusIn,
    crestY,
    jitter: (angle) => 1 + jitterAmp * Math.sin(angle * 3 + jitterPhase),
  };

  // Penstocks: intake at the crest's downhill edge, powerhouse at the foot.
  const intakeX = centreX + lowX * (crestRadiusOut - 0.1);
  const intakeZ = centreZ + lowZ * (crestRadiusOut - 0.1);
  const houseX = centreX + lowX * 7.0;
  const houseZ = centreZ + lowZ * 7.0;
  // The penstock runs down the outer face: for every radius its height is the
  // higher of the embankment surface and the ground, so the tube is never
  // buried in the dam and never floats over the slope.
  const baseGround = terrain.heightAt(centreX + lowX * baseRadius, centreZ + lowZ * baseRadius);
  const faceY = (radius: number): number => {
    const t = Math.max(0, Math.min(1, (radius - crestRadiusOut) / (baseRadius - crestRadiusOut)));
    return crestY - (crestY - baseGround) * t;
  };
  const penstock: THREE.Vector3[] = [];
  const runLength = Math.hypot(houseX - intakeX, houseZ - intakeZ);
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const radius = crestRadiusOut - 0.1 + (runLength + 0.1) * t;
    const x = centreX + lowX * radius;
    const z = centreZ + lowZ * radius;
    const groundY = terrain.heightAt(x, z);
    // The first point is the intake port at the crest; the rest hug the face.
    const y = i === 0 ? crestY - 0.12 : Math.max(groundY + 0.2, faceY(radius) + 0.05);
    penstock.push(new THREE.Vector3(x, y, z));
  }

  const houseYaw = Math.atan2(-lowX, -lowZ);
  const house = {
    x: houseX,
    y: terrain.heightAt(houseX, houseZ),
    z: houseZ,
    yaw: houseYaw,
  };

  const tailX = centreX + lowX * 10.5;
  const tailZ = centreZ + lowZ * 10.5;
  // A tailrace pond is an excavated basin: hold the water at the level of the
  // ground it sits in (the median sample, so a shore slope cannot drag the
  // whole sheet under a lake), and let the bund bank it in.
  const tailSamples: number[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    for (const t of [0.4, 1]) {
      const x = tailX + Math.cos(angle) * 2.0 * t;
      const z = tailZ + Math.sin(angle) * 1.4 * t;
      tailSamples.push(terrain.heightAt(x, z));
    }
  }
  tailSamples.sort((a, b) => a - b);
  const tailMedian =
    tailSamples[Math.floor(tailSamples.length / 2)] ?? terrain.heightAt(tailX, tailZ);
  const tailrace = {
    x: tailX,
    y: tailMedian + 0.02,
    z: tailZ,
    rx: 2.0,
    rz: 1.4,
    yaw: Math.atan2(lowZ, lowX),
  };
  // The concrete outfall channel: from the powerhouse's downstream face down
  // to the pond, sampling the terrain so the floor never floats.
  const channelFrom = 6.4;
  const channelTo = 8.7;
  const outfall: THREE.Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const radius = channelFrom + (channelTo - channelFrom) * t;
    const x = centreX + lowX * radius;
    const z = centreZ + lowZ * radius;
    outfall.push(new THREE.Vector3(x, terrain.heightAt(x, z) + 0.02, z));
  }
  const foamX = houseX + lowX * 1.1;
  const foamZ = houseZ + lowZ * 1.1;
  const foam = {
    x: foamX,
    y: terrain.heightAt(foamX, foamZ) + 0.12,
    z: foamZ,
  };

  const crestLights: PumpedPlan["crestLights"] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const jitter = spec.jitter(angle);
    crestLights.push({
      x: centreX + Math.cos(angle) * (crestRadiusOut - 0.12) * jitter,
      y: crestY + 0.09,
      z: centreZ + Math.sin(angle) * (crestRadiusOut - 0.12) * jitter,
    });
  }

  const masts: Site[] = [];
  const yardGlows: PumpedPlan["yardGlows"] = [];
  for (const [ox, oz] of [
    [1.5, -0.7],
    [-1.5, -0.7],
    [1.5, 0.9],
  ] as const) {
    const x = houseX + lowX * oz - lowZ * ox;
    const z = houseZ + lowZ * oz + lowX * ox;
    const y = terrain.heightAt(x, z);
    masts.push({ x, y, z, yaw: houseYaw });
    yardGlows.push({ x, y: y + 0.04, z, size: 2.2 });
  }

  return {
    kind: "pumped",
    id: storage.id,
    centre: new THREE.Vector3(centreX, crestY, centreZ),
    spec,
    radiusKm: 8.5,
    floorY,
    floorRadius,
    emptyY,
    fullY,
    waterRadius,
    spillway: { angle: bestAngle + 1.15, halfWidth: 0.3 },
    powerhouses: [house],
    intakes: [
      {
        x: intakeX,
        y: crestY - 0.14,
        z: intakeZ,
        yaw: Math.atan2(lowZ, lowX),
      },
    ],
    crestLights,
    masts,
    yardGlows,
    penstock,
    outfall,
    tailrace,
    foam,
    swirl: { x: intakeX - lowX * 0.9, y: fullY + 0.03, z: intakeZ - lowZ * 0.9 },
  };
}

/** Height of the container stack used by the lamps (kept next to the plan). */
export const LAMP_HEIGHT_KM = 0.17;
export const MAST_HEIGHT_KM = MAST_H_KM;
export { CONTAINER_H_KM };
