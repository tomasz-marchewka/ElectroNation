// Lattice steelwork: a tower is a few dozen members merged into one geometry
// (ARCHITECTURE.md §13 — instance everything that repeats, merge what does
// not). A member is a thin box between two points, so legs, ties, bracing,
// crossarm chords and insulator strings are all the same primitive, painted
// per vertex: galvanised steel takes the instance's weathering tint, glass
// insulators keep their own colour.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Vertex colour of steel: white, so the instance colour is the whole tint. */
export const STEEL_TINT = new THREE.Color(1, 1, 1);
/** Toughened-glass insulator string, dark green with a wet gloss. */
export const GLASS_TINT = new THREE.Color().setRGB(0.16, 0.3, 0.24, THREE.SRGBColorSpace);
/** Weathered concrete of a tower foundation, darker than the steel above it. */
export const CONCRETE_TINT = new THREE.Color().setRGB(0.3, 0.29, 0.27, THREE.SRGBColorSpace);
/** The poles of an upgrade ghost — dim cool, the cage around the hatch bands. */
export const GHOST_TINT = new THREE.Color().setRGB(0.26, 0.42, 0.55, THREE.SRGBColorSpace);
/** The hatch bands of an upgrade ghost — bright cool, drives its own emission. */
export const GHOST_HATCH_TINT = new THREE.Color().setRGB(0.62, 0.9, 1, THREE.SRGBColorSpace);
/** Hazard paint of the construction head's scaffolding and gin pole. */
export const MARKING_TINT = new THREE.Color().setRGB(0.95, 0.6, 0.12, THREE.SRGBColorSpace);

const UP = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const midpoint = new THREE.Vector3();
const unit = new THREE.Vector3(1, 1, 1);
const matrix = new THREE.Matrix4();

/** Three-sided prism along +Y, centred, `size` across; no caps — a member never shows its end. */
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

function paint(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const count = geometry.attributes.position?.count ?? 0;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");
}

export class Truss {
  private readonly parts: THREE.BufferGeometry[] = [];

  /**
   * A member of `size` km from a to b: an open triangular prism (6 triangles),
   * which at the pixel or two a member ever covers is indistinguishable from
   * a box at half the triangles.
   */
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
    paint(geometry, color);
    this.parts.push(geometry);
    return this;
  }

  /**
   * A flat slab on the ground: a foundation pad under a tower or a portal,
   * two triangles facing up, painted concrete. It gives the structure a dark
   * foot the eye can find when the lattice itself thins to a pixel.
   */
  slab(
    cx: number,
    cz: number,
    halfX: number,
    halfZ: number,
    y: number,
    color = CONCRETE_TINT,
  ): this {
    const positions = new Float32Array([
      cx - halfX,
      y,
      cz + halfZ,
      cx + halfX,
      y,
      cz + halfZ,
      cx + halfX,
      y,
      cz - halfZ,
      cx - halfX,
      y,
      cz - halfZ,
    ]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    paint(geometry, color);
    this.parts.push(geometry);
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

  get memberCount(): number {
    return this.parts.length;
  }

  /** Merges every member into one indexed geometry and releases the parts. */
  build(name: string): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    if (!merged) throw new Error(`grid: truss ${name} has no members`);
    merged.name = name;
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Corners of a square of half-width `half` at height y, front-left first, clockwise. */
export function square(half: number, y: number): Point[] {
  return [
    { x: -half, y, z: half },
    { x: half, y, z: half },
    { x: half, y, z: -half },
    { x: -half, y, z: -half },
  ];
}

/**
 * A tapered lattice panel between two squares: the four legs, the tie at the
 * top and an X of bracing on every face — the body of every tower here.
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
  const lower = square(lowerHalf, lowerY);
  const upper = square(upperHalf, upperY);
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
