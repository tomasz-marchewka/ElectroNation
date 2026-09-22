// Lattice steelwork, concrete and tubing for the nodes layer (ARCHITECTURE.md
// §13: instance everything that repeats, merge what does not). A member is an
// open triangular prism between two points — 6 triangles, indistinguishable
// from a box at the pixel or two a member covers — so legs, braces, beams,
// insulator strings and conductor jumpers all come out of one primitive. Parts
// are painted per vertex, which lets one geometry mix steel, porcelain and
// concrete exactly the way the grid's towers do.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** White: the instance colour is the whole tint of galvanised steel. */
export const STEEL_TINT = new THREE.Color(1, 1, 1);
/** Porcelain of a post or dead-end insulator — near-white with a cool cast. */
export const PORCELAIN_TINT = new THREE.Color().setRGB(0.88, 0.9, 0.92, THREE.SRGBColorSpace);
/** Toughened glass, the same dark green the grid's strings use. */
export const GLASS_TINT = new THREE.Color().setRGB(0.16, 0.3, 0.24, THREE.SRGBColorSpace);
/** Concrete: foundations, pads, the control building's plinth. */
export const CONCRETE_TINT = new THREE.Color().setRGB(0.78, 0.78, 0.75, THREE.SRGBColorSpace);
/** Darker concrete of a yard slab worn by service traffic. */
export const SLAB_TINT = new THREE.Color().setRGB(0.68, 0.68, 0.66, THREE.SRGBColorSpace);
/** Painted steel of halls and control buildings — light grey-blue. */
export const PAINT_TINT = new THREE.Color().setRGB(0.7, 0.72, 0.74, THREE.SRGBColorSpace);
/** A warmer painted panel for doors and switchgear cabinets. */
export const PANEL_TINT = new THREE.Color().setRGB(0.66, 0.68, 0.66, THREE.SRGBColorSpace);
/** Bitumen felt of a flat roof. */
export const ROOF_TINT = new THREE.Color().setRGB(0.45, 0.46, 0.48, THREE.SRGBColorSpace);

const UP = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const midpoint = new THREE.Vector3();
const unit = new THREE.Vector3(1, 1, 1);
const matrix = new THREE.Matrix4();
const euler = new THREE.Euler();

function prismGeometry(size: number, length: number): THREE.BufferGeometry {
  const radius = size * 0.62;
  const positions = new Float32Array(6 * 3);
  const normals = new Float32Array(6 * 3);
  for (let k = 0; k < 3; k++) {
    const angle = Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    for (let end = 0; end < 2; end++) {
      const v = (k * 2 + end) * 3;
      positions[v] = nx * radius;
      positions[v + 1] = end === 0 ? -length / 2 : length / 2;
      positions[v + 2] = nz * radius;
      normals[v] = nx;
      normals[v + 1] = 0;
      normals[v + 2] = nz;
    }
  }
  const indices: number[] = [];
  for (let k = 0; k < 3; k++) {
    const b0 = k * 2;
    const t0 = k * 2 + 1;
    const b1 = ((k + 1) % 3) * 2;
    const t1 = ((k + 1) % 3) * 2 + 1;
    indices.push(b0, b1, t0, b1, t1, t0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Paints every vertex and — when the primitive has no UVs of its own (the
 * prism and the slab) — lays a cheap planar set down, because the steel,
 * concrete and earth materials carry procedural maps.
 */
function paint(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const position = geometry.attributes.position;
  const count = position?.count ?? 0;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (!geometry.attributes.uv && position) {
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      uv[i * 2] = (position.getX(i) + position.getZ(i)) * 0.4;
      uv[i * 2 + 1] = position.getY(i) * 0.4;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  return geometry;
}

/**
 * Multiplies a geometry's UVs — box faces come as 0..1 per face, so a hall
 * would wear one stretched texel without this.
 */
export function scaleUv(geometry: THREE.BufferGeometry, fu: number, fv: number): void {
  const uv = geometry.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * fu, uv.getY(i) * fv);
  }
  uv.needsUpdate = true;
}

/** Builds merged, vertex-coloured geometry for one archetype. */
export class Truss {
  private readonly parts: THREE.BufferGeometry[] = [];

  /** An open triangular prism of `size` km between a and b. */
  bar(a: Point, b: Point, size: number, color: THREE.Color = STEEL_TINT): this {
    direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = direction.length();
    if (length < 1e-5) return this;
    direction.divideScalar(length);
    const geometry = prismGeometry(size, length);
    quaternion.setFromUnitVectors(UP, direction);
    midpoint.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    matrix.compose(midpoint, quaternion, unit);
    geometry.applyMatrix4(matrix);
    this.parts.push(paint(geometry, color));
    return this;
  }

  /** A round tube — conductors, busbars, pipe stacks. */
  tube(a: Point, b: Point, radius: number, segments = 6, color: THREE.Color = STEEL_TINT): this {
    direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = direction.length();
    if (length < 1e-5) return this;
    const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
    direction.divideScalar(length);
    quaternion.setFromUnitVectors(UP, direction);
    midpoint.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    matrix.compose(midpoint, quaternion, unit);
    geometry.applyMatrix4(matrix);
    this.parts.push(paint(geometry, color));
    return this;
  }

  /** A sagging conductor between two points: `segments` tubes along a parabola. */
  sag(
    a: Point,
    b: Point,
    sagKm: number,
    radius: number,
    segments = 6,
    color: THREE.Color = STEEL_TINT,
  ): this {
    let previous = a;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const next = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t - sagKm * 4 * t * (1 - t),
        z: a.z + (b.z - a.z) * t,
      };
      this.tube(previous, next, radius, 5, color);
      previous = next;
    }
    return this;
  }

  /** An axis-aligned box centred on (x, y, z) [km]. */
  box(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.Color = STEEL_TINT,
    yaw = 0,
  ): this {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    scaleUv(geometry, Math.max(sx, sz) * 1.6, sy * 1.6);
    euler.set(0, yaw, 0);
    quaternion.setFromEuler(euler);
    midpoint.set(x, y, z);
    matrix.compose(midpoint, quaternion, unit);
    geometry.applyMatrix4(matrix);
    this.parts.push(paint(geometry, color));
    return this;
  }

  /** A capped cylinder standing on Y, centred on (x, y, z) [km]. */
  cylinder(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    segments = 12,
    color: THREE.Color = STEEL_TINT,
  ): this {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
    quaternion.identity();
    midpoint.set(x, y, z);
    matrix.compose(midpoint, quaternion, unit);
    geometry.applyMatrix4(matrix);
    this.parts.push(paint(geometry, color));
    return this;
  }

  /** A cone (gravel heap, insulator cap) standing on Y. */
  cone(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    segments = 10,
    color: THREE.Color = STEEL_TINT,
  ): this {
    const geometry = new THREE.CylinderGeometry(0, radius, height, segments, 1, false);
    quaternion.identity();
    midpoint.set(x, y, z);
    matrix.compose(midpoint, quaternion, unit);
    geometry.applyMatrix4(matrix);
    this.parts.push(paint(geometry, color));
    return this;
  }

  /** A flat slab on the ground: two triangles facing up. */
  slab(
    cx: number,
    cz: number,
    halfX: number,
    halfZ: number,
    y: number,
    color: THREE.Color = CONCRETE_TINT,
    yaw = 0,
  ): this {
    const corners = [
      { x: -halfX, z: -halfZ },
      { x: halfX, z: -halfZ },
      { x: halfX, z: halfZ },
      { x: -halfX, z: halfZ },
    ];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const positions = new Float32Array(corners.length * 3);
    corners.forEach((corner, i) => {
      positions[i * 3] = cx + corner.x * cos - corner.z * sin;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = cz + corner.x * sin + corner.z * cos;
    });
    const normals = new Float32Array(corners.length * 3);
    for (let i = 0; i < corners.length; i++) normals[i * 3 + 1] = 1;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.parts.push(paint(geometry, color));
    return this;
  }

  /** A closed loop of members through the points, in order. */
  ring(points: readonly Point[], size: number, color: THREE.Color = STEEL_TINT): this {
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a && b) this.bar(a, b, size, color);
    }
    return this;
  }

  get partCount(): number {
    return this.parts.length;
  }

  /** Merges every part into one indexed geometry and releases the pieces. */
  build(name: string): THREE.BufferGeometry {
    if (this.parts.length === 0) throw new Error(`nodes: ${name} has no parts`);
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    if (!merged) throw new Error(`nodes: merge failed for ${name}`);
    merged.name = name;
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Corners of a square of half-width `half` at height y, counter-clockwise from +X+Z. */
export function squareCorners(half: number, y: number): Point[] {
  return [
    { x: -half, y, z: half },
    { x: half, y, z: half },
    { x: half, y, z: -half },
    { x: -half, y, z: -half },
  ];
}

/**
 * A tapered lattice panel between two squares: four legs, a tie at the top
 * and an X of bracing on every face — the body of every portal column here.
 */
export function panel(
  truss: Truss,
  lowerHalf: number,
  lowerY: number,
  upperHalf: number,
  upperY: number,
  legSize: number,
  braceSize: number,
  tieTop = true,
): void {
  const lower = squareCorners(lowerHalf, lowerY);
  const upper = squareCorners(upperHalf, upperY);
  for (let i = 0; i < 4; i++) {
    const a = lower[i];
    const b = upper[i];
    const c = lower[(i + 1) % 4];
    const d = upper[(i + 1) % 4];
    if (!a || !b || !c || !d) continue;
    truss.bar(a, b, legSize);
    truss.bar(a, d, braceSize);
    truss.bar(c, b, braceSize);
  }
  if (tieTop) truss.ring(upper, braceSize);
}
