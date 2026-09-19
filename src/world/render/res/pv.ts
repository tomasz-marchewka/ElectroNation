// Photovoltaic archetypes (docs/08 §2–§3): the utility-scale fixed-tilt farm
// of the Polish plains — south-facing tables (south is +Z: north = −Z per
// ARCHITECTURE.md §5) at 30°, a torque tube on single posts, inverter
// stations on the perimeter road, a chain-link fence, a gravel pad. Sizes
// follow the exaggeration table: the container class for the inverter
// station, the footprint class for the rows. Everything repeated is one
// geometry drawn as instances; the fence and the pad are merged per farm.

import * as THREE from "three";
import { HEIGHT_KM } from "../core/exaggeration";
import type { GroundOffset } from "./layout";
import { PV_SEGMENT_KM, PV_TABLE_DEPTH_KM, subdividePolygon } from "./layout";
import { merged, paint } from "./turbine";

const DEG = Math.PI / 180;
/** Fixed tilt of the tables. */
export const PV_TILT_DEG = 30;
/** Height of the low (south) edge above the ground [km]. */
const CLEARANCE_KM = 0.05;
/** Cells per texture repeat: 12 along the row, 4 down the slope. */
const CELL_KM = 0.02;
const CELLS_U = 12;
const CELLS_V = 4;

const GALVANISED: readonly [number, number, number] = [0.6, 0.61, 0.62];
const RAL7035: readonly [number, number, number] = [0.8, 0.8, 0.78];
const TRANSFORMER: readonly [number, number, number] = [0.32, 0.38, 0.36];
const DARK: readonly [number, number, number] = [0.2, 0.21, 0.22];
const GRAVEL: readonly [number, number, number] = [0.55, 0.53, 0.48];

/** Height of the table's centre line above the ground [km]. */
export const PV_CENTRE_HEIGHT_KM =
  CLEARANCE_KM + (PV_TABLE_DEPTH_KM / 2) * Math.sin(PV_TILT_DEG * DEG);

/**
 * One 1 km table: a thin glass plate tilted about the row axis so its
 * normal leans south, origin on the ground under the row's centre line.
 * The cell texture repeats at real module size along both axes.
 */
export function pvTableGeometry(): THREE.BufferGeometry {
  const plate = new THREE.BoxGeometry(PV_SEGMENT_KM, 0.012, PV_TABLE_DEPTH_KM);
  const uv = plate.attributes.uv as THREE.BufferAttribute;
  const repeatU = PV_SEGMENT_KM / (CELL_KM * CELLS_U);
  const repeatV = PV_TABLE_DEPTH_KM / (CELL_KM * CELLS_V);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * repeatU, uv.getY(i) * repeatV);
  }
  uv.needsUpdate = true;
  plate.rotateX(PV_TILT_DEG * DEG);
  plate.translate(0, PV_CENTRE_HEIGHT_KM, 0);
  return plate;
}

/** The mounting: three posts and the torque tube under the plate, vertex-coloured steel. */
export function pvFrameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tubeY = PV_CENTRE_HEIGHT_KM - 0.025;
  const tube = new THREE.BoxGeometry(PV_SEGMENT_KM, 0.024, 0.024);
  tube.translate(0, tubeY, 0);
  parts.push(paint(tube, GALVANISED));
  for (const x of [-PV_SEGMENT_KM / 3, 0, PV_SEGMENT_KM / 3]) {
    const post = new THREE.CylinderGeometry(0.013, 0.013, tubeY + 0.04, 6, 1);
    post.translate(x, (tubeY - 0.04) / 2, 0);
    parts.push(paint(post, GALVANISED));
  }
  return merged(parts);
}

/** An inverter station: gravel pad, container, transformer, vents. Origin on the ground. */
export function inverterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pad = new THREE.BoxGeometry(0.72, 0.02, 0.5);
  pad.translate(0, 0.01, 0);
  parts.push(paint(pad, GRAVEL));
  const container = new THREE.BoxGeometry(0.42, HEIGHT_KM.container, 0.24);
  container.translate(-0.1, HEIGHT_KM.container / 2 + 0.02, 0);
  parts.push(paint(container, RAL7035));
  const vent = new THREE.BoxGeometry(0.12, 0.06, 0.02);
  vent.translate(-0.1, HEIGHT_KM.container * 0.7, 0.125);
  parts.push(paint(vent, DARK));
  const transformer = new THREE.BoxGeometry(0.16, 0.18, 0.16);
  transformer.translate(0.22, 0.11, 0);
  parts.push(paint(transformer, TRANSFORMER));
  const radiator = new THREE.BoxGeometry(0.03, 0.14, 0.14);
  radiator.translate(0.32, 0.1, 0);
  parts.push(paint(radiator, DARK));
  return merged(parts);
}

export interface HeightFn {
  (x: number, z: number): number;
}

/**
 * A chain-link fence as a vertical ribbon along the farm polygon (world
 * space, feet on the terrain); double-sided, semi-transparent material.
 */
export function fenceGeometry(
  centre: { x: number; z: number },
  polygon: GroundOffset[],
  heightAt: HeightFn,
): THREE.BufferGeometry {
  const points = subdividePolygon(polygon, 0.5);
  const count = points.length;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices: number[] = [];
  const FENCE_H = 0.06;
  let run = 0;
  for (let i = 0; i < count; i++) {
    const point = points[i]!;
    const x = centre.x + point.x;
    const z = centre.z + point.z;
    const y = heightAt(x, z);
    if (i > 0) {
      const previous = points[i - 1]!;
      run += Math.hypot(point.x - previous.x, point.z - previous.z);
    }
    positions.set([x, y - 0.01, z, x, y + FENCE_H, z], i * 6);
    uvs.set([run, 0, run, 1], i * 4);
    const next = (i + 1) % count;
    indices.push(i * 2, i * 2 + 1, next * 2 + 1, i * 2, next * 2 + 1, next * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The gravel pad under a farm: the convex polygon as a radial grid (rings ×
 * edge points) with every vertex on the terrain, so the relief shows through
 * and the boundary is exact. Slightly above the ground; the material carries
 * the polygon offset.
 */
export function padGeometry(
  centre: { x: number; z: number },
  polygon: GroundOffset[],
  heightAt: HeightFn,
  liftKm = 0.02,
): THREE.BufferGeometry {
  const ring = subdividePolygon(polygon, 0.6);
  const RINGS = 12;
  const n = ring.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const cy = heightAt(centre.x, centre.z) + liftKm;
  positions.push(centre.x, cy, centre.z);
  uvs.push(0, 0);
  for (let r = 1; r <= RINGS; r++) {
    const t = r / RINGS;
    for (const point of ring) {
      const x = centre.x + point.x * t;
      const z = centre.z + point.z * t;
      positions.push(x, heightAt(x, z) + liftKm, z);
      uvs.push((point.x * t) / 2, (point.z * t) / 2);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(0, 1 + ((i + 1) % n), 1 + i);
  for (let r = 1; r < RINGS; r++) {
    const inner = 1 + (r - 1) * n;
    const outer = 1 + r * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(inner + i, outer + j, outer + i, inner + i, inner + j, outer + j);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
