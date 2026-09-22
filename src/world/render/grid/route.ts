// From a line's hex chain to steel on the ground: corridor lanes that never
// cross, the offset polyline, terminal portals inset from the object, pylons
// every PYLON_SPACING_KM with their feet on the relief, and the spans between
// them. Reads scene.lines and the terrain provider — nothing else.

import * as THREE from "three";
import type { HexRef, WorldLine } from "../../bridge/worldScene";
import { PYLON_SPACING_KM } from "../core/exaggeration";
import type { TerrainProvider } from "../core/types";
import { axialToOffset, hexToWorld, laneOffsetKm } from "../core/units";

export interface Ground {
  x: number;
  z: number;
}

/** How far into the end hex the portal stands [km] — the edge of a plant site. */
export const PORTAL_INSET_KM = 4.5;
/** Feet of a tower at sea stand on a caisson this far above the water [km]. */
const CAISSON_KM = 0.03;

/** Offset key of a hex and the order-free corridor key — the bridge's own keys. */
function offsetKey(hex: HexRef): string {
  const { col, row } = axialToOffset(hex);
  return `${col},${row}`;
}

export function corridorKey(a: HexRef, b: HexRef): string {
  const first = offsetKey(a);
  const second = offsetKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function direction(from: Ground, to: Ground): Ground {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

/** Unit perpendicular of a corridor's canonical direction (smaller key → larger). */
function canonicalPerpendicular(a: HexRef, b: HexRef): Ground {
  const forward = offsetKey(a) < offsetKey(b);
  const d = forward
    ? direction(hexToWorld(a), hexToWorld(b))
    : direction(hexToWorld(b), hexToWorld(a));
  return { x: -d.z, z: d.x };
}

/** Whether the canonical direction of the corridor (smaller key → larger) is a → b. */
function canonicalForward(a: HexRef, b: HexRef): boolean {
  return offsetKey(a) < offsetKey(b);
}

/**
 * Which side of each shared corridor lane 0 takes. The bridge numbers lanes
 * by state order, so the geometry picks the sign: each line prefers the side
 * its continuation leaves toward, and the corridor follows the majority —
 * two lines that fork at the corridor's end never cross each other.
 *
 * The sign is decided per RUN — a chain of consecutive steps shared by the
 * same set of lines — not per step: the lane offsets of a step are symmetric,
 * so a step without a fork scores zero, and a sign of its own there would
 * mirror every lane at the next vertex. Each step's score is taken in the
 * travel frame of the line that walks the run (the canonical direction of a
 * corridor key flips relative to travel, `"10,6" < "9,6"`), summed over the
 * run, and turned back into the canonical sign of every step.
 */
export function corridorSigns(lines: readonly WorldLine[]): Map<string, 1 | -1> {
  const sharing = new Map<string, string>();
  for (const line of lines) {
    for (let i = 0; i + 1 < line.path.length; i++) {
      const a = line.path[i];
      const b = line.path[i + 1];
      if (!a || !b) continue;
      const key = corridorKey(a, b);
      sharing.set(key, `${sharing.get(key) ?? ""}${line.id},`);
    }
  }
  // Every line's preference at every shared step, in the step's canonical frame.
  const scores = new Map<string, number>();
  for (const line of lines) {
    for (let i = 0; i + 1 < line.path.length; i++) {
      const lane = line.lanes[i];
      const a = line.path[i];
      const b = line.path[i + 1];
      if (!lane || lane.count < 2 || !a || !b) continue;
      const perpendicular = canonicalPerpendicular(a, b);
      const offset = laneOffsetKm(lane.index, lane.count);
      let preference = 0;
      const beyondB = line.path[i + 2];
      if (beyondB) {
        const d = direction(hexToWorld(b), hexToWorld(beyondB));
        preference += d.x * perpendicular.x + d.z * perpendicular.z;
      }
      const beyondA = line.path[i - 1];
      if (beyondA) {
        const d = direction(hexToWorld(a), hexToWorld(beyondA));
        preference += d.x * perpendicular.x + d.z * perpendicular.z;
      }
      const key = corridorKey(a, b);
      scores.set(key, (scores.get(key) ?? 0) + offset * preference);
    }
  }
  // Runs: walked along the first line that reaches them, in its travel frame.
  const signs = new Map<string, 1 | -1>();
  for (const line of lines) {
    let i = 0;
    while (i + 1 < line.path.length) {
      const a = line.path[i];
      const b = line.path[i + 1];
      if (!a || !b) {
        i += 1;
        continue;
      }
      const key = corridorKey(a, b);
      const set = sharing.get(key) ?? "";
      if (signs.has(key) || !set.includes(",", set.indexOf(",") + 1)) {
        i += 1;
        continue;
      }
      const run: { key: string; flip: 1 | -1 }[] = [];
      let j = i;
      while (j + 1 < line.path.length) {
        const p = line.path[j];
        const q = line.path[j + 1];
        if (!p || !q) break;
        const stepKey = corridorKey(p, q);
        if (sharing.get(stepKey) !== set || signs.has(stepKey)) break;
        run.push({ key: stepKey, flip: canonicalForward(p, q) ? 1 : -1 });
        j += 1;
      }
      let score = 0;
      for (const step of run) score += (scores.get(step.key) ?? 0) * step.flip;
      const runSign: 1 | -1 = score < 0 ? -1 : 1;
      for (const step of run) signs.set(step.key, (runSign * step.flip) as 1 | -1);
      i = Math.max(i + 1, j);
    }
  }
  return signs;
}

/** The lane sign of every step of a line, for the rebuild key. */
export function laneSignature(line: WorldLine, signs: Map<string, 1 | -1>): string {
  let out = "";
  for (let i = 0; i + 1 < line.path.length; i++) {
    const a = line.path[i];
    const b = line.path[i + 1];
    const lane = line.lanes[i];
    if (!a || !b) continue;
    out += `${lane?.index ?? 0}/${lane?.count ?? 1}${(signs.get(corridorKey(a, b)) ?? 1) < 0 ? "-" : "+"},`;
  }
  return out;
}

/**
 * Centre to centre through the path, each step shifted sideways by its lane;
 * corners mitred, a straight lane change eased at the vertex.
 */
export function offsetPolyline(line: WorldLine, signs: Map<string, 1 | -1>): Ground[] {
  const centres = line.path.map((hex) => hexToWorld(hex));
  const n = centres.length;
  if (n < 2) return centres;
  const steps: { dir: Ground; offset: Ground }[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = line.path[i];
    const b = line.path[i + 1];
    const c0 = centres[i];
    const c1 = centres[i + 1];
    if (!a || !b || !c0 || !c1) continue;
    const lane = line.lanes[i] ?? { index: 0, count: 1 };
    const sign = signs.get(corridorKey(a, b)) ?? 1;
    const perpendicular = canonicalPerpendicular(a, b);
    const offset = laneOffsetKm(lane.index, lane.count) * sign;
    steps.push({
      dir: direction(c0, c1),
      offset: { x: perpendicular.x * offset, z: perpendicular.z * offset },
    });
  }
  const points: Ground[] = [];
  const first = centres[0];
  const firstStep = steps[0];
  if (first && firstStep)
    points.push({ x: first.x + firstStep.offset.x, z: first.z + firstStep.offset.z });
  for (let j = 1; j + 1 < n; j++) {
    const previous = steps[j - 1];
    const next = steps[j];
    const c = centres[j];
    if (!previous || !next || !c) continue;
    const cross = previous.dir.x * next.dir.z - previous.dir.z * next.dir.x;
    if (Math.abs(cross) < 0.05) {
      points.push({
        x: c.x + (previous.offset.x + next.offset.x) / 2,
        z: c.z + (previous.offset.z + next.offset.z) / 2,
      });
      continue;
    }
    const p1 = { x: c.x + previous.offset.x, z: c.z + previous.offset.z };
    const p2 = { x: c.x + next.offset.x, z: c.z + next.offset.z };
    const rx = p2.x - p1.x;
    const rz = p2.z - p1.z;
    const t = (rx * next.dir.z - rz * next.dir.x) / cross;
    points.push({ x: p1.x + previous.dir.x * t, z: p1.z + previous.dir.z * t });
  }
  const last = centres[n - 1];
  const lastStep = steps[steps.length - 1];
  if (last && lastStep)
    points.push({ x: last.x + lastStep.offset.x, z: last.z + lastStep.offset.z });
  return points;
}

/** Moves both ends of the polyline inward so the portals stand at the site edge. */
export function insetEnds(points: Ground[], inset: number): Ground[] {
  if (points.length < 2) return points;
  const out = points.map((p) => ({ ...p }));
  const a = out[0];
  const b = out[1];
  const y = out[out.length - 1];
  const x = out[out.length - 2];
  if (!a || !b || !x || !y) return out;
  const startLength = Math.hypot(b.x - a.x, b.z - a.z);
  const startInset = Math.min(inset, startLength * 0.4);
  const d0 = direction(a, b);
  a.x += d0.x * startInset;
  a.z += d0.z * startInset;
  const endLength = Math.hypot(y.x - x.x, y.z - x.z);
  const endInset = Math.min(inset, endLength * 0.4);
  const d1 = direction(x, y);
  y.x -= d1.x * endInset;
  y.z -= d1.z * endInset;
  return out;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Rotation about Y so the local +Z runs along the line [rad]. */
  yaw: number;
  /** Distance along the route from the first portal [km]. */
  arc: number;
  /** Index of the path step this structure stands in. */
  step: number;
  kind: "portal" | "tower";
}

function groundY(terrain: TerrainProvider, x: number, z: number): number {
  const height = terrain.heightAt(x, z);
  return height < terrain.seaLevelKm ? terrain.seaLevelKm + CAISSON_KM : height - 0.01;
}

/**
 * Portals at both ends, a tower at every polyline vertex (angle towers on the
 * bisector) and towers every ≈ PYLON_SPACING_KM between them.
 */
export function placeStructures(points: Ground[], terrain: TerrainProvider): Placement[] {
  const out: Placement[] = [];
  if (points.length < 2) return out;
  let arc = 0;
  for (let e = 0; e + 1 < points.length; e++) {
    const p = points[e];
    const q = points[e + 1];
    if (!p || !q) continue;
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    const d = direction(p, q);
    const count = Math.max(1, Math.round(length / PYLON_SPACING_KM));
    let vertexDirection = d;
    const previous = points[e - 1];
    if (previous) {
      const back = direction(previous, p);
      const sx = back.x + d.x;
      const sz = back.z + d.z;
      const s = Math.hypot(sx, sz);
      if (s > 1e-3) vertexDirection = { x: sx / s, z: sz / s };
    }
    for (let k = 0; k < count; k++) {
      const t = k / count;
      const x = p.x + (q.x - p.x) * t;
      const z = p.z + (q.z - p.z) * t;
      const dir = k === 0 ? vertexDirection : d;
      out.push({
        x,
        y: groundY(terrain, x, z),
        z,
        yaw: Math.atan2(dir.x, dir.z),
        arc: arc + length * t,
        step: e,
        kind: e === 0 && k === 0 ? "portal" : "tower",
      });
    }
    arc += length;
  }
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  if (last && beforeLast) {
    const d = direction(beforeLast, last);
    out.push({
      x: last.x,
      y: groundY(terrain, last.x, last.z),
      z: last.z,
      // The end portal faces back along the line: its local +Z toward the route.
      yaw: Math.atan2(-d.x, -d.z),
      arc,
      step: points.length - 2,
      kind: "portal",
    });
  }
  return out;
}

/** World position of an attachment (x across the line, y up) on a structure. */
export function attachmentWorld(
  placement: Placement,
  x: number,
  y: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const s = Math.sin(placement.yaw);
  const c = Math.cos(placement.yaw);
  return out.set(placement.x + x * c, placement.y + y, placement.z - x * s);
}

/**
 * Sag factor of a span: 1 for the full CONDUCTOR_SAG, less where the relief
 * between two towers would otherwise cut the wire (a ridge under the span).
 */
export function sagClearanceFactor(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  fullSag: number,
  terrain: TerrainProvider,
): number {
  let factor = 1;
  const clearance = 0.05;
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const x = p0.x + (p1.x - p0.x) * t;
    const z = p0.z + (p1.z - p0.z) * t;
    const ground = Math.max(terrain.heightAt(x, z), terrain.seaLevelKm);
    const chord = p0.y + (p1.y - p0.y) * t;
    const room = chord - ground - clearance;
    const sagHere = 4 * fullSag * t * (1 - t);
    if (sagHere > 1e-6) factor = Math.min(factor, room / sagHere);
  }
  return Math.min(1, Math.max(0.12, factor));
}
