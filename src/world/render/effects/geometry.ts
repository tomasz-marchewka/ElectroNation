// Effects geometry (docs/08 §3): everything the overlay draws is either a
// band on the ground (hex outlines, route ribbons, alarm rings, dashed
// curtailment rings) or a small instanced prop (waypoint posts, chevrons,
// crane parts, flow dashes). Nothing here knows about the scene — it turns
// ground-plane spines into terrain-conforming geometry that the materials in
// ./materials.ts shade.
//
// A band is a triangle strip along a spine: two vertices per spine point
// (left and right of the path), carrying the arc length in `aUv.x` for dashes
// and a per-vertex record of the spine point in `aCentre`, which the vertex
// shader uses to grow the band to a screen-space minimum width at distance
// (the conductors' trick, grid/conductors.ts).

import * as THREE from "three";
import { HEIGHT_KM } from "../core/exaggeration";
import { HEX_RADIUS_KM, hexCorners, type GroundPoint } from "../core/units";

/** Just what a band needs from the terrain provider. */
export interface GroundSampler {
  heightAt(x: number, z: number): number;
}

/** How far a ground overlay floats above the sampled terrain [km]. */
export const BAND_LIFT_KM = 0.22;

/** Longest edge of a conformed spine before it is subdivided [km]. */
const MAX_STEP_KM = 1.5;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Subdivides a ground-plane polyline to at most `maxStepKm` edges and samples
 * the terrain under every point, lifted by `liftKm` so the band never z-fights
 * the ground. Closed spines repeat their first point.
 */
export function conformSpine(
  points: readonly GroundPoint[],
  terrain: GroundSampler,
  liftKm = BAND_LIFT_KM,
  closed = false,
  maxStepKm = MAX_STEP_KM,
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const count = points.length;
  if (count < 2) return out;
  const last = closed ? count : count - 1;
  for (let i = 0; i < last; i++) {
    const from = points[i];
    const to = points[(i + 1) % count];
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / maxStepKm));
    // The first point of the run, then every interpolated point; `closed`
    // repeats the start so the seam is drawn like any other edge.
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      out.push(new THREE.Vector3(x, terrain.heightAt(x, z) + liftKm, z));
    }
  }
  return out;
}

/** Closed hex outline around a hex centre, flat-top, clockwise from east. */
export function hexSpine(centre: GroundPoint, radiusKm = HEX_RADIUS_KM): GroundPoint[] {
  return hexCorners(centre, radiusKm);
}

/** Closed circle around a centre — alarm and status rings. */
export function ringSpine(centre: GroundPoint, radiusKm: number, segments = 40): GroundPoint[] {
  const points: GroundPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: centre.x + Math.cos(angle) * radiusKm,
      z: centre.z + Math.sin(angle) * radiusKm,
    });
  }
  return points;
}

/**
 * Resamples a world-space polyline every `stepKm` of arc length (the last
 * point kept when it would otherwise be dropped). Flow dashes travel between
 * consecutive samples, so a resampled spine of 25 km steps gives every dash
 * the same 1 hex/s speed whatever the segment's own sampling is.
 */
export function resampleByArc(points: readonly THREE.Vector3[], stepKm: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  if (points.length < 2) return out;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return out;
  out.push(first.clone());
  let travelled = 0;
  let target = stepKm;
  const scratch = new THREE.Vector3();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const segment = a.distanceTo(b);
    if (segment <= 1e-6) continue;
    while (travelled + segment >= target) {
      out.push(scratch.lerpVectors(a, b, (target - travelled) / segment).clone());
      target += stepKm;
    }
    travelled += segment;
  }
  const tail = out[out.length - 1];
  if (tail && tail.distanceTo(last) > stepKm * 0.25) out.push(last.clone());
  return out;
}

/** Spine of a hex chain: the centres, so the route reads as one straight band. */
export function chainSpine(centres: readonly GroundPoint[]): GroundPoint[] {
  return centres.map((point) => ({ x: point.x, z: point.z }));
}

// --- small props -----------------------------------------------------------------

/** A flat chevron pointing along +X in the ground plane; unit footprint. */
export function chevronGeometry(): THREE.BufferGeometry {
  // A solid arrowhead: a 45° head plus a short tail, 1 km long, 0.6 km wide.
  const positions = new Float32Array([
    // head
    0.5, 0, 0, -0.14, 0, 0.3, -0.14, 0, -0.3,
    // tail
    -0.14, 0, 0.16, -0.52, 0, 0.16, -0.52, 0, -0.16, -0.14, 0, 0.16, -0.52, 0, -0.16, -0.14, 0,
    -0.16,
  ]);
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.name = "effects-chevron";
  return geometry;
}

/** A waypoint post: a thin square column, base at y = 0, height 1 (scaled). */
export function postGeometry(): THREE.BufferGeometry {
  const half = 0.12;
  const positions = new Float32Array([
    -half,
    0,
    -half,
    half,
    0,
    -half,
    half,
    0,
    half,
    -half,
    0,
    half,
    -half,
    1,
    -half,
    half,
    1,
    -half,
    half,
    1,
    half,
    -half,
    1,
    half,
  ]);
  const indices = new Uint16Array([
    0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6, 3, 7, 6, 3, 0, 7, 0, 4, 7, 4, 5, 7, 5, 6, 7,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.name = "effects-post";
  return geometry;
}

/** A unit quad in the XY plane, corners at ±1, for the billboarded dashes. */
export function dashQuadGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  geometry.setAttribute(
    "aUv",
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
  );
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.name = "effects-dash";
  return geometry;
}

// --- tower crane -------------------------------------------------------------------
//
// One lattice tower crane in four instanced parts, separated where the motion
// is: mast + ballast are static, the slewing unit (jib, counter-jib, cab,
// counterweight, trolley) turns about the mast top, the rope stretches with
// the hook height and the hook block hangs at its end. Heights follow
// HEIGHT_KM.crane; the members are the same open triangular prisms the grid
// uses, so the crane reads as lattice at the detail camera and as a yellow
// silhouette at the strategic view.

const CRANE_MAST = HEIGHT_KM.crane;
const CRANE_HALF = 0.052;
const CRANE_TOP_HALF = 0.036;
const CRANE_BAYS = 7;
const CRANE_JIB = CRANE_MAST * 1.25;
const CRANE_COUNTER = CRANE_MAST * 0.34;
const CRANE_APEX = CRANE_MAST * 0.22;

interface Members {
  positions: number[];
  normals: number[];
  indices: number[];
}

/** Appends an open triangular prism between two points. */
function pushPrism(
  members: Members,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
): void {
  _a.set(bx - ax, by - ay, bz - az);
  const length = _a.length();
  if (length < 1e-5) return;
  _a.divideScalar(length);
  // Any vector not parallel to the axis, crossed with it, gives the ring basis.
  _b.set(Math.abs(_a.y) > 0.9 ? 1 : 0, Math.abs(_a.y) > 0.9 ? 0 : 1, 0);
  const ux = _a.y * _b.z - _a.z * _b.y;
  const uy = _a.z * _b.x - _a.x * _b.z;
  const uz = _a.x * _b.y - _a.y * _b.x;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const nx = ux / ul;
  const ny = uy / ul;
  const nz = uz / ul;
  const vx = _a.y * nz - _a.z * ny;
  const vy = _a.z * nx - _a.x * nz;
  const vz = _a.x * ny - _a.y * nx;
  const base = members.positions.length / 3;
  const sides = 3;
  for (let end = 0; end < 2; end++) {
    const cx = end === 0 ? ax : bx;
    const cy = end === 0 ? ay : by;
    const cz = end === 0 ? az : bz;
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const ca = Math.cos(angle) * radius;
      const sa = Math.sin(angle) * radius;
      const ox = nx * ca + vx * sa;
      const oy = ny * ca + vy * sa;
      const oz = nz * ca + vz * sa;
      members.positions.push(cx + ox, cy + oy, cz + oz);
      members.normals.push(ox, oy, oz);
    }
  }
  for (let j = 0; j < sides; j++) {
    const j2 = (j + 1) % sides;
    members.indices.push(
      base + j,
      base + j2,
      base + sides + j,
      base + j2,
      base + sides + j2,
      base + sides + j,
    );
  }
}

function membersToGeometry(members: Members, name: string): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(members.positions), 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(members.normals), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(members.indices), 1));
  geometry.name = name;
  return geometry;
}

/** A box into the member list, as six quads with flat per-face normals. */
function pushBox(
  members: Members,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): void {
  const faces: [number, number, number][][] = [
    [
      [-hx, -hy, hz],
      [hx, -hy, hz],
      [hx, hy, hz],
      [-hx, hy, hz],
    ],
    [
      [hx, -hy, -hz],
      [-hx, -hy, -hz],
      [-hx, hy, -hz],
      [hx, hy, -hz],
    ],
    [
      [hx, -hy, hz],
      [hx, -hy, -hz],
      [hx, hy, -hz],
      [hx, hy, hz],
    ],
    [
      [-hx, -hy, -hz],
      [-hx, -hy, hz],
      [-hx, hy, hz],
      [-hx, hy, -hz],
    ],
    [
      [-hx, hy, hz],
      [hx, hy, hz],
      [hx, hy, -hz],
      [-hx, hy, -hz],
    ],
    [
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [hx, -hy, hz],
      [-hx, -hy, hz],
    ],
  ];
  for (const face of faces) {
    const [p0, p1, p2, p3] = face;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const e1 = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const e2 = new THREE.Vector3(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    const normal = new THREE.Vector3().crossVectors(e2, e1).normalize();
    for (const point of [p0, p1, p2, p0, p2, p3]) {
      members.positions.push(cx + point[0], cy + point[1], cz + point[2]);
      members.normals.push(normal.x, normal.y, normal.z);
    }
  }
}

/** Mast + ballast: origin at the ground, height CRANE_MAST. */
export function craneMastGeometry(): THREE.BufferGeometry {
  const members: Members = { positions: [], normals: [], indices: [] };
  const r = 0.017;
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const baseY = 0.12;
  const taper = (y: number): number =>
    CRANE_HALF + (CRANE_TOP_HALF - CRANE_HALF) * ((y - baseY) / (CRANE_MAST - baseY));
  for (const [sx, sz] of corners) {
    pushPrism(
      members,
      sx * CRANE_HALF,
      baseY,
      sz * CRANE_HALF,
      sx * CRANE_TOP_HALF,
      CRANE_MAST,
      sz * CRANE_TOP_HALF,
      r,
    );
  }
  const bay = (CRANE_MAST - baseY) / CRANE_BAYS;
  for (let i = 0; i < CRANE_BAYS; i++) {
    const y0 = baseY + bay * i;
    const y1 = y0 + bay;
    const w0 = taper(y0);
    const w1 = taper(y1);
    for (let c = 0; c < 4; c++) {
      const a = corners[c];
      const b = corners[(c + 1) % 4];
      if (!a || !b) continue;
      pushPrism(members, a[0] * w1, y1, a[1] * w1, b[0] * w1, y1, b[1] * w1, r * 0.85);
      pushPrism(members, a[0] * w0, y0, a[1] * w0, b[0] * w1, y1, b[1] * w1, r * 0.7);
    }
  }
  // Ballast and its plinth: a tower crane stands on a small block, not a shed.
  pushBox(members, 0, 0.05, 0, 0.24, 0.05, 0.24);
  pushBox(members, 0, 0.11, 0, 0.15, 0.035, 0.15);
  return membersToGeometry(members, "effects-crane-mast");
}

/**
 * The slewing unit: origin at the mast top (y = 0), jib along +X, counter-jib
 * along −X. Rotated about Y by the slew angle.
 */
export function craneSlewGeometry(): THREE.BufferGeometry {
  const members: Members = { positions: [], normals: [], indices: [] };
  const r = 0.016;
  const yA = 0.0;
  const yB = -0.1;
  const zA = 0.045;
  const bays = 12;
  for (let i = 0; i < bays; i++) {
    const x0 = (i / bays) * CRANE_JIB;
    const x1 = ((i + 1) / bays) * CRANE_JIB;
    for (const z of [-zA, zA]) {
      pushPrism(members, x0, yA, z, x1, yA, z, r);
      pushPrism(members, x0, yA, z, x1, yB, 0, r * 0.8);
    }
    pushPrism(members, x0, yB, 0, x1, yB, 0, r * 1.1);
  }
  pushPrism(members, 0, yA, -zA, 0, yA, zA, r);
  pushPrism(members, CRANE_JIB, yA, -zA, CRANE_JIB, yA, zA, r);
  // Counter-jib with its ballast and the machine deck.
  pushPrism(members, 0, yA, -zA, -CRANE_COUNTER, yA, -zA, r);
  pushPrism(members, 0, yA, zA, -CRANE_COUNTER, yA, zA, r);
  pushPrism(members, -CRANE_COUNTER, yA, -zA, -CRANE_COUNTER, yA, zA, r);
  pushPrism(members, -CRANE_COUNTER, yA, 0, -CRANE_COUNTER, -0.14, 0, r * 1.4);
  pushBox(members, -CRANE_COUNTER, -0.08, 0, 0.075, 0.055, 0.11);
  pushBox(members, 0.11, 0.05, 0, 0.055, 0.05, 0.045);
  // The apex with its tie bars to the jib and the counter-jib — the silhouette
  // that says "tower crane" at 18 km.
  pushPrism(members, 0, yA, 0, 0, CRANE_APEX, 0, r * 1.3);
  pushPrism(members, 0, CRANE_APEX, 0, CRANE_JIB * 0.62, yA, 0, r * 0.6);
  pushPrism(members, 0, CRANE_APEX, 0, -CRANE_COUNTER * 0.9, yA, 0, r * 0.6);
  // The trolley parked at 55 % of the jib.
  pushBox(members, CRANE_JIB * 0.55, yB + 0.012, 0, 0.026, 0.02, 0.03);
  return membersToGeometry(members, "effects-crane-slew");
}

/** Hook rope: unit length from the trolley down, scaled by the hang height. */
export function craneRopeGeometry(): THREE.BufferGeometry {
  const members: Members = { positions: [], normals: [], indices: [] };
  pushPrism(members, 0, 0, 0, 0, -1, 0, 0.009);
  return membersToGeometry(members, "effects-crane-rope");
}

/** Hook block at the rope end. */
export function craneHookGeometry(): THREE.BufferGeometry {
  const members: Members = { positions: [], normals: [], indices: [] };
  pushBox(members, 0, -0.025, 0, 0.03, 0.025, 0.026);
  pushPrism(members, 0, -0.05, 0, 0, -0.095, 0, 0.013);
  return membersToGeometry(members, "effects-crane-hook");
}
