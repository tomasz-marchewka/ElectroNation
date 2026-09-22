// Geometry for render/storage (docs/08 §2, §3). Every archetype that repeats
// is built once, instanced by index.ts and never per model: BESS containers
// (HEIGHT_KM.container), power skids, switchyard portals (HEIGHT_KM.portal),
// floodlight masts, the powerhouse (HEIGHT_KM.hall), the intake, the window
// band. Per-site geometry (the embankment, the basin, the penstock run, the
// gravel pad, the fence) is generated from the terrain and merged into one
// mesh per material, so the whole layer stays inside the draw-call budget.
//
// Heights come from render/core/exaggeration.ts and nowhere else; the dam
// embankment's rise above the local ground is the "hall" class, so a dam never
// outgrows a power-plant building in the same frame.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HEIGHT_KM } from "../core/exaggeration";

export const CONTAINER_L_KM = 1.0;
export const CONTAINER_W_KM = 0.28;
export const CONTAINER_H_KM = HEIGHT_KM.container;
export const SKID_H_KM = 0.24;
export const PORTAL_H_KM = HEIGHT_KM.portal;
export const MAST_H_KM = 0.42;
export const POWERHOUSE_H_KM = HEIGHT_KM.hall;
/** Height of the dam crest above the highest ground under the basin. */
export const DAM_RISE_KM = HEIGHT_KM.hall;

export function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts, false);
  if (!result) throw new Error("storage: geometry merge failed");
  for (const part of parts) part.dispose();
  result.computeBoundingSphere();
  return result;
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

function cylinder(
  radius: number,
  height: number,
  segments: number,
  x = 0,
  y = 0,
  z = 0,
  rotationZ = 0,
): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments, 1);
  if (rotationZ !== 0) geometry.rotateZ(rotationZ);
  geometry.translate(x, y, z);
  return geometry;
}

/** A BESS container: body, roof cap, skid rails. Origin at the pad. */
export function containerGeometry(): THREE.BufferGeometry {
  const body = box(CONTAINER_L_KM, CONTAINER_H_KM, CONTAINER_W_KM, 0, CONTAINER_H_KM / 2, 0);
  const cap = box(CONTAINER_L_KM + 0.02, 0.03, CONTAINER_W_KM + 0.02, 0, CONTAINER_H_KM + 0.015, 0);
  const railL = box(CONTAINER_L_KM, 0.03, 0.03, 0, 0.015, -CONTAINER_W_KM / 2 + 0.03);
  const railR = box(CONTAINER_L_KM, 0.03, 0.03, 0, 0.015, CONTAINER_W_KM / 2 - 0.03);
  return merged([body, cap, railL, railR]);
}

/**
 * The detail panels on both long sides of a container: louvred vent grilles
 * and the dark end door, sampling two regions of one grille texture (v < 0,5
 * is the louvre, v > 0,5 the door).
 */
export function ventGeometry(): THREE.BufferGeometry {
  const louvre = (uvY: (v: number) => number): THREE.PlaneGeometry => {
    const panel = new THREE.PlaneGeometry(0.3, 0.1);
    const uv = panel.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uvY(uv.getY(i)));
    return panel;
  };
  const door = (): THREE.PlaneGeometry => {
    const panel = new THREE.PlaneGeometry(0.2, 0.22);
    const uv = panel.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5);
    panel.translate(CONTAINER_L_KM / 2 - 0.17, CONTAINER_H_KM / 2, 0);
    return panel;
  };
  const front = louvre((v) => v * 0.5);
  front.translate(-CONTAINER_L_KM / 4, 0.18, CONTAINER_W_KM / 2 + 0.004);
  const back = louvre((v) => v * 0.5);
  back.rotateY(Math.PI);
  back.translate(-CONTAINER_L_KM / 4, 0.18, -CONTAINER_W_KM / 2 - 0.004);
  const doorFront = door();
  doorFront.translate(0, 0, CONTAINER_W_KM / 2 + 0.004);
  const doorBack = door();
  doorBack.rotateY(Math.PI);
  doorBack.translate(0, 0, -CONTAINER_W_KM / 2 - 0.004);
  return merged([front, back, doorFront, doorBack]);
}

/** A power skid: inverter container + radiator-bank transformer on a plinth. */
export function skidGeometry(): THREE.BufferGeometry {
  const plinth = box(1.0, 0.05, 0.4, 0.1, 0.025, 0);
  const inverter = box(0.34, 0.2, 0.22, -0.28, 0.15, 0);
  const louvre = box(0.28, 0.12, 0.012, -0.28, 0.14, 0.115);
  const transformer = box(0.22, 0.24, 0.18, 0.24, 0.17, 0);
  const radiator = box(0.03, 0.2, 0.26, 0.42, 0.17, 0);
  const bushingA = cylinder(0.02, 0.14, 6, 0.18, 0.36, 0);
  const bushingB = cylinder(0.02, 0.14, 6, 0.3, 0.36, 0);
  return merged([plinth, inverter, louvre, transformer, radiator, bushingA, bushingB]);
}

/** A switchyard portal: two lattice posts, two beams, insulator strings. */
export function portalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.6, 0.6]) parts.push(box(0.07, PORTAL_H_KM, 0.07, x, PORTAL_H_KM / 2, 0));
  parts.push(box(1.3, 0.05, 0.07, 0, PORTAL_H_KM, 0));
  parts.push(box(1.3, 0.04, 0.05, 0, PORTAL_H_KM * 0.72, 0));
  for (let i = 0; i < 3; i++) {
    const x = -0.35 + i * 0.35;
    parts.push(cylinder(0.022, 0.14, 6, x, PORTAL_H_KM - 0.1, 0));
    parts.push(cylinder(0.022, 0.12, 6, x, PORTAL_H_KM * 0.72 - 0.09, 0));
  }
  parts.push(box(1.3, 0.014, 0.014, 0, PORTAL_H_KM - 0.2, 0));
  return merged(parts);
}

/** A floodlight mast: pole and a tilted head. */
export function mastGeometry(): THREE.BufferGeometry {
  const pole = cylinder(0.028, MAST_H_KM, 6, 0, MAST_H_KM / 2, 0);
  const head = box(0.22, 0.06, 0.12, 0, MAST_H_KM, 0.02);
  head.rotateX(0.45);
  return merged([pole, head]);
}

/** The powerhouse hall: hall, pitched roof, annex, door, plinth. Front is −Z. */
export function powerhouseGeometry(): THREE.BufferGeometry {
  const plinth = box(2.9, 0.06, 1.3, 0, 0.03, 0);
  const hall = box(2.6, POWERHOUSE_H_KM, 1.1, 0, POWERHOUSE_H_KM / 2 + 0.06, 0);
  const roof = cylinder(0.62, 2.72, 3, 0, POWERHOUSE_H_KM + 0.06, 0, Math.PI / 2);
  roof.scale(1, 0.45, 1);
  const annex = box(0.9, POWERHOUSE_H_KM * 0.6, 0.8, -1.55, POWERHOUSE_H_KM * 0.3 + 0.06, 0.1);
  const door = box(0.5, 0.32, 0.03, 0.72, 0.22, -0.565);
  const gantry = portalGeometry();
  gantry.scale(0.8, 0.8, 0.8);
  gantry.translate(1.0, 0.06, 0.9);
  return merged([plinth, hall, roof, annex, door, gantry]);
}

/** The window band on the powerhouse front and the annex. */
export function windowGeometry(): THREE.BufferGeometry {
  const front = new THREE.PlaneGeometry(2.0, 0.2);
  front.translate(0, 0.34, -0.556);
  const annex = new THREE.PlaneGeometry(0.5, 0.14);
  annex.translate(-1.55, 0.24, -0.301);
  const side = new THREE.PlaneGeometry(0.7, 0.16);
  side.rotateY(Math.PI / 2);
  side.translate(-2.0, 0.3, 0.1);
  return merged([front, annex, side]);
}

/** A reservoir intake head with a trash rack and a gate. */
export function intakeGeometry(): THREE.BufferGeometry {
  const head = box(0.5, 0.4, 0.42, 0, 0.2, 0);
  const cap = box(0.56, 0.05, 0.48, 0, 0.42, 0);
  const parts: THREE.BufferGeometry[] = [head, cap];
  for (let i = 0; i < 4; i++) parts.push(box(0.5, 0.3, 0.012, 0, 0.2, -0.16 + i * 0.1));
  return merged(parts);
}

// --- terrain-following ground ------------------------------------------------

export interface Rect {
  x: number;
  z: number;
  hw: number;
  hd: number;
  yaw: number;
}

/** Rotates a local pad offset into world space. */
export function padPoint(rect: Rect, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(rect.yaw);
  const s = Math.sin(rect.yaw);
  return { x: rect.x + lx * c - lz * s, z: rect.z + lx * s + lz * c };
}

/** A gravel pad that follows the terrain under it. */
export function padGeometry(
  rect: Rect,
  heightAt: (x: number, z: number) => number,
  lift = 0.035,
): THREE.BufferGeometry {
  const nx = 12;
  const nz = 8;
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
  const uvs = new Float32Array((nx + 1) * (nz + 1) * 2);
  const indices: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const lx = -rect.hw + (2 * rect.hw * i) / nx;
      const lz = -rect.hd + (2 * rect.hd * j) / nz;
      const p = padPoint(rect, lx, lz);
      const k = (j * (nx + 1) + i) * 3;
      positions[k] = p.x;
      positions[k + 1] = heightAt(p.x, p.z) + lift;
      positions[k + 2] = p.z;
      // Texture repeat is world-locked: one gravel tile per 1,5 km.
      uvs[(j * (nx + 1) + i) * 2] = lx / 1.5;
      uvs[(j * (nx + 1) + i) * 2 + 1] = lz / 1.5;
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A fence line around the pad: posts and three wires, following the ground. */
export function fenceGeometry(
  rect: Rect,
  heightAt: (x: number, z: number) => number,
  margin = 0.5,
): THREE.BufferGeometry {
  const hw = rect.hw + margin;
  const hd = rect.hd + margin;
  const parts: THREE.BufferGeometry[] = [];
  const corners: { x: number; z: number }[] = [
    padPoint(rect, -hw, -hd),
    padPoint(rect, hw, -hd),
    padPoint(rect, hw, hd),
    padPoint(rect, -hw, hd),
  ];
  for (let side = 0; side < 4; side++) {
    const from = corners[side] as { x: number; z: number };
    const to = corners[(side + 1) % 4] as { x: number; z: number };
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const spans = Math.max(1, Math.round(length / 0.7));
    // The wire box runs along local X; yaw must map +X onto the span.
    const yaw = Math.atan2(-(to.z - from.z), to.x - from.x);
    for (let s = 0; s <= spans; s++) {
      const t = s / spans;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      const y = heightAt(x, z);
      const post = box(0.05, 0.18, 0.05);
      post.rotateY(yaw);
      post.translate(x, y + 0.09, z);
      parts.push(post);
    }
    for (let s = 0; s < spans; s++) {
      const t0 = s / spans;
      const t1 = (s + 1) / spans;
      const x0 = from.x + (to.x - from.x) * t0;
      const z0 = from.z + (to.z - from.z) * t0;
      const x1 = from.x + (to.x - from.x) * t1;
      const z1 = from.z + (to.z - from.z) * t1;
      const span = Math.hypot(x1 - x0, z1 - z0);
      for (const h of [0.05, 0.1, 0.15]) {
        const wire = box(span, 0.02, 0.02, 0, 0, 0);
        wire.rotateY(yaw);
        wire.translate((x0 + x1) / 2, (heightAt(x0, z0) + heightAt(x1, z1)) / 2 + h, (z0 + z1) / 2);
        parts.push(wire);
      }
    }
  }
  return merged(parts);
}

// --- pumped storage ----------------------------------------------------------

export interface EmbankmentSpec {
  x: number;
  z: number;
  /** Outer base radius, averaged over the rim [km]. */
  baseRadius: number;
  crestRadiusOut: number;
  crestRadiusIn: number;
  /** Crest height [km, world Y]. */
  crestY: number;
  /** Deterministic per-angle radius factor (a rim is never a circle). */
  jitter(angle: number): number;
}

/**
 * The outer rock-fill face profile: t runs 0 at the toe (widest) to 1 at the
 * crest (narrowest), yf is the height share climbed. Two benches hold the fill
 * back as it rises, so the embankment reads as a built dam, not a cone.
 */
const FACE_PROFILE: readonly { t: number; yf: number }[] = [
  { t: 0, yf: 0 },
  { t: 0.33, yf: 0.34 },
  { t: 0.42, yf: 0.34 },
  { t: 0.7, yf: 0.68 },
  { t: 0.78, yf: 0.68 },
  { t: 1, yf: 1 },
];

/** The face's height factor at t along the profile [0..1]. */
export function faceAt(t: number): { rf: number; yf: number } {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < FACE_PROFILE.length - 1; i++) {
    const a = FACE_PROFILE[i] as { t: number; yf: number };
    const b = FACE_PROFILE[i + 1] as { t: number; yf: number };
    if (clamped <= b.t) {
      const k = (clamped - a.t) / (b.t - a.t || 1);
      return { rf: clamped, yf: a.yf + (b.yf - a.yf) * k };
    }
  }
  return { rf: 1, yf: 1 };
}

/**
 * A point on the outer rock-fill face at angle `angle` and parameter `t`
 * (0 = toe, 1 = crest), on the real terrain under each angular segment.
 */
export function facePoint(
  spec: EmbankmentSpec,
  heightAt: (x: number, z: number) => number,
  angle: number,
  t: number,
): THREE.Vector3 {
  const jitter = spec.jitter(angle);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const baseRadius = spec.baseRadius * jitter;
  const baseY = heightAt(spec.x + cos * baseRadius, spec.z + sin * baseRadius);
  const { rf, yf } = faceAt(t);
  const radius = baseRadius + (spec.crestRadiusOut * jitter - baseRadius) * rf;
  return new THREE.Vector3(
    spec.x + cos * radius,
    baseY + (spec.crestY - baseY) * yf,
    spec.z + sin * radius,
  );
}

/**
 * The outer rock-fill face: a skirt whose toe follows the terrain and whose
 * top is the crest. The dam never floats over a slope because each angular
 * segment starts on its own ground sample.
 */
export function embankmentSkirtGeometry(
  spec: EmbankmentSpec,
  heightAt: (x: number, z: number) => number,
  segments = 72,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringCount = FACE_PROFILE.length;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const jitter = spec.jitter(angle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const baseRadius = spec.baseRadius * jitter;
    const baseY = heightAt(spec.x + cos * baseRadius, spec.z + sin * baseRadius);
    for (const p of FACE_PROFILE) {
      const radius = baseRadius + (spec.crestRadiusOut * jitter - baseRadius) * p.t;
      const y = baseY + (spec.crestY - baseY) * p.yf;
      positions.push(spec.x + cos * radius, y, spec.z + sin * radius);
      const u = (angle * spec.baseRadius) / 9;
      uvs.push(u, p.yf * ((spec.crestY - baseY) / 9 + 0.5));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let level = 0; level < ringCount - 1; level++) {
      const a = i * ringCount + level;
      const b = a + ringCount;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return toGeometry(positions, uvs, indices);
}

/**
 * The crest road: an asphalt band on the crown, broken around the spillway
 * bay. Kerb skirts on both edges keep it from reading as a decal.
 */
export function crestRoadGeometry(
  spec: EmbankmentSpec,
  skipAngle: number,
  skipHalfWidth: number,
  segments = 96,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const inner = spec.crestRadiusIn + 0.07;
  const outer = spec.crestRadiusOut - 0.07;
  const crown = (radius: number) =>
    spec.crestY +
    0.035 -
    0.04 * ((radius - spec.crestRadiusIn) / (spec.crestRadiusOut - spec.crestRadiusIn));
  const inBay = (angle: number): boolean =>
    Math.abs(((angle - skipAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < skipHalfWidth;
  // Contiguous runs of the ring outside the spillway bay become road strips.
  let runStart: number | null = null;
  const flush = (from: number, to: number): void => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const steps = Math.max(2, Math.round((segments * (to - from)) / (Math.PI * 2)));
    const ring = (t: number): void => {
      const angle = from + (to - from) * t;
      const jitter = spec.jitter(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const ri = inner * jitter;
      const ro = outer * jitter;
      positions.push(
        spec.x + cos * ri,
        crown(inner),
        spec.z + sin * ri,
        spec.x + cos * ro,
        crown(outer),
        spec.z + sin * ro,
        spec.x + cos * ri,
        crown(inner) - 0.055,
        spec.z + sin * ri,
        spec.x + cos * ro,
        crown(outer) - 0.055,
        spec.z + sin * ro,
      );
      uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    };
    for (let i = 0; i <= steps; i++) ring(i / steps);
    for (let i = 0; i < steps; i++) {
      const a = i * 4;
      const b = a + 4;
      // Top band: next angle before the radial step keeps the normal up.
      indices.push(a, b, a + 1, a + 1, b, b + 1);
      // Kerb skirt, facing outward.
      indices.push(a + 2, a + 3, b + 2, b + 2, a + 3, b + 3);
    }
    parts.push(toGeometry(positions, uvs, indices));
  };
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    if (inBay(angle)) {
      if (runStart !== null) {
        flush(runStart, (i / segments) * Math.PI * 2);
        runStart = null;
      }
    } else if (runStart === null) {
      runStart = (i / segments) * Math.PI * 2;
    }
  }
  return merged(parts);
}

/**
 * A gated spillway: a concrete chute with parapet walls down the outer face at
 * `angle`, a gate bay on the crest (two piers, a deck and a hoist), and an
 * apron slab at the toe that spreads the jet away from the fill.
 */
export function spillwayGeometry(
  spec: EmbankmentSpec,
  heightAt: (x: number, z: number) => number,
  angle: number,
  halfWidth = 0.3,
  steps = 9,
): THREE.BufferGeometry {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Local frame: +n outward radial, +t the tangent along the crest.
  const tx = -sin;
  const tz = cos;
  const parts: THREE.BufferGeometry[] = [];
  const at = (t: number, side: number, up: number): THREE.Vector3 => {
    const p = facePoint(spec, heightAt, angle, t);
    p.x += tx * side;
    p.z += tz * side;
    p.y += up + 0.04;
    return p;
  };
  // A closed U-section swept down the face: inner walls, floor, caps, and a
  // return path under the ground that keeps the loop simple (no lid).
  const section: readonly [number, number][] = [
    [-halfWidth, 0.13],
    [-halfWidth, 0],
    [halfWidth, 0],
    [halfWidth, 0.13],
    [halfWidth + 0.07, 0.13],
    [halfWidth + 0.07, -0.35],
    [-halfWidth - 0.07, -0.35],
    [-halfWidth - 0.07, 0.13],
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringCount = section.length;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (const [side, up] of section) {
      const p = at(t, side, up);
      positions.push(p.x, p.y, p.z);
      uvs.push(t * 2, (side + halfWidth) / (halfWidth * 2));
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < ringCount; j++) {
      const a = i * ringCount + j;
      const b = a + ringCount;
      const c = i * ringCount + ((j + 1) % ringCount);
      const d = b - j + ((j + 1) % ringCount);
      indices.push(a, c, b, c, d, b);
    }
  }
  parts.push(toGeometry(positions, uvs, indices));
  // Gate bay: piers flanking the chute on the crest, a deck and a hoist block.
  const crest = facePoint(spec, heightAt, angle, 1);
  for (const side of [-1, 1] as const) {
    const pier = box(0.22, 0.5, 0.22);
    pier.translate(
      crest.x + tx * side * (halfWidth + 0.07),
      crest.y + 0.2,
      crest.z + tz * side * (halfWidth + 0.07),
    );
    parts.push(pier);
  }
  const deckYaw = Math.atan2(-tz, tx);
  const deck = box(halfWidth * 2 + 0.5, 0.07, 0.17);
  deck.rotateY(deckYaw);
  deck.translate(crest.x, crest.y + 0.47, crest.z);
  parts.push(deck);
  const hoist = box(0.26, 0.22, 0.17);
  hoist.rotateY(deckYaw);
  hoist.translate(crest.x + cos * 0.07, crest.y + 0.61, crest.z + sin * 0.07);
  parts.push(hoist);
  // Apron at the toe: a slab the jet lands on, wider than the chute.
  const toe = facePoint(spec, heightAt, angle, 0);
  const apronX = toe.x + cos * 0.34;
  const apronZ = toe.z + sin * 0.34;
  const apron = box(halfWidth * 2.6, 0.08, 0.8);
  apron.rotateY(deckYaw);
  apron.translate(apronX, Math.min(toe.y, heightAt(apronX, apronZ)) + 0.045, apronZ);
  parts.push(apron);
  return merged(parts);
}

/**
 * A concrete tailrace channel: a closed U-section (floor, two walls, caps)
 * swept along a terrain-following centreline, closed by a headwall where it
 * meets the pond.
 */
export function outfallGeometry(
  points: THREE.Vector3[],
  halfWidth = 0.3,
  depth = 0.17,
  wall = 0.07,
): THREE.BufferGeometry {
  const first = points[0] as THREE.Vector3;
  const last = points[points.length - 1] as THREE.Vector3;
  const dx = last.x - first.x;
  const dz = last.z - first.z;
  const length = Math.hypot(dx, dz) || 1;
  const px = -dz / length;
  const pz = dx / length;
  // The cross-section: inner walls, floor, caps, and a return path under the
  // ground that keeps the loop simple, so every face winds consistently.
  const section: readonly [number, number][] = [
    [-halfWidth, depth],
    [-halfWidth, 0.02],
    [halfWidth, 0.02],
    [halfWidth, depth],
    [halfWidth + wall, depth],
    [halfWidth + wall, -0.6],
    [-halfWidth - wall, -0.6],
    [-halfWidth - wall, depth],
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringCount = section.length;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as THREE.Vector3;
    const along = i / (points.length - 1);
    for (const [side, lift] of section) {
      positions.push(p.x + px * side, p.y + lift, p.z + pz * side);
      uvs.push(along * (length / 0.9), (side + halfWidth + wall) / (halfWidth + wall));
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < ringCount; j++) {
      const a = i * ringCount + j;
      const b = a + ringCount;
      const c = i * ringCount + ((j + 1) % ringCount);
      const d = b - j + ((j + 1) % ringCount);
      indices.push(a, c, b, c, d, b);
    }
  }
  const parts = [toGeometry(positions, uvs, indices)];
  const headwall = new THREE.BoxGeometry(halfWidth * 2 + wall * 2, depth + 0.24, 0.2);
  headwall.rotateY(Math.atan2(-pz, px));
  headwall.translate(last.x, last.y + (depth + 0.24) / 2 - 0.08, last.z);
  parts.push(headwall);
  return merged(parts);
}

/**
 * A flat tailrace pond: an ellipse fan at the water line with normalised UVs,
 * so the water shader's rim fade reads. A working pond is an excavated basin —
 * its surface is level, and the earth bund hides where it cuts into the bank.
 */
export function pondGeometry(rect: Rect, waterY: number, segments = 56): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  positions.push(rect.x, waterY, rect.z);
  uvs.push(0.5, 0.5);
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const p = padPoint(rect, cos * rect.hw, sin * rect.hd);
    positions.push(p.x, waterY, p.z);
    uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(0, i + 2, i + 1);
  }
  return toGeometry(positions, uvs, indices);
}

/** A low earth bund around the tailrace pond, hiding the water's edge. */
export function pondRimGeometry(
  x: number,
  z: number,
  rx: number,
  rz: number,
  waterY: number,
  heightAt: (x: number, z: number) => number,
  segments = 36,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ix = x + cos * (rx - 0.62);
    const iz = z + sin * (rz - 0.62);
    const ox = x + cos * (rx + 0.55);
    const oz = z + sin * (rz + 0.55);
    // The bund is always a bank: it rises above the water even when the pond
    // cuts into a slope, so the level surface never shows a buried crescent.
    positions.push(ix, waterY - 0.05, iz, ox, Math.max(heightAt(ox, oz) + 0.24, waterY + 0.34), oz);
    uvs.push(i / segments, 0, i / segments, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 2;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The crest ring: a crowned annulus between the inner and outer crest radii. */
export function crestGeometry(spec: EmbankmentSpec, segments = 72): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const jitter = spec.jitter(angle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(
      spec.x + cos * spec.crestRadiusOut * jitter,
      spec.crestY - 0.02,
      spec.z + sin * spec.crestRadiusOut * jitter,
      spec.x + cos * spec.crestRadiusIn * jitter,
      spec.crestY + 0.02,
      spec.z + sin * spec.crestRadiusIn * jitter,
    );
    uvs.push(i / segments, 0, i / segments, 1);
  }
  for (let i = 0; i < segments; i++) {
    const outer = i * 2;
    const next = outer + 2;
    indices.push(outer, outer + 1, next, next, outer + 1, next + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The inner basin face (floor to inner crest) plus the floor. */
export function basinGeometry(
  spec: EmbankmentSpec,
  floorRadius: number,
  floorY: number,
  segments = 72,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const jitter = spec.jitter(angle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(
      spec.x + cos * floorRadius * jitter,
      floorY,
      spec.z + sin * floorRadius * jitter,
      spec.x + cos * spec.crestRadiusIn * jitter,
      spec.crestY + 0.02,
      spec.z + sin * spec.crestRadiusIn * jitter,
    );
    const u = (angle * spec.crestRadiusIn) / 7;
    uvs.push(u, 0, u, (spec.crestY - floorY) / 7);
  }
  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    const next = base + 2;
    indices.push(base, next, next + 1, base, next + 1, base + 1);
  }
  const floor = new THREE.CircleGeometry(floorRadius, segments);
  floor.rotateX(-Math.PI / 2);
  floor.translate(spec.x, floorY, spec.z);
  const geometry = merged([toGeometry(positions, uvs, indices), floor]);
  return geometry;
}

function toGeometry(positions: number[], uvs: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A penstock run: tubes through the given world points, merged. */
export function penstockGeometry(
  points: THREE.Vector3[],
  radius: number,
  count = 2,
  offset = 0.11,
): THREE.BufferGeometry {
  const first = points[0] as THREE.Vector3;
  const last = points[points.length - 1] as THREE.Vector3;
  const dx = last.x - first.x;
  const dz = last.z - first.z;
  const length = Math.hypot(dx, dz) || 1;
  const px = -dz / length;
  const pz = dx / length;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const shift = (i - (count - 1) / 2) * offset;
    const shifted = points.map((p) => new THREE.Vector3(p.x + px * shift, p.y, p.z + pz * shift));
    const curve = new THREE.CatmullRomCurve3(shifted, false, "catmullrom", 0.2);
    parts.push(new THREE.TubeGeometry(curve, 24, radius, 7, false));
  }
  return merged(parts);
}
