// Ground markers of the renewables layer: the flat, terrain-following shapes
// that make a farm readable from the strategic camera.
//
// Two jobs (docs/08 §3–§4):
// - the farm frame — a pale perimeter track around an enabled farm, so a PV
//   hex stops reading as just another dark forest hex and a wind cluster gets
//   a footprint, not three bright pixels;
// - the off twin — a muted grey band and centre boss under a disabled farm:
//   the static, module-owned marker that says "switched off" without waiting
//   for effects' rings. Both are merged static meshes; they never cast shadow.

import * as THREE from "three";
import { hexagon, subdividePolygon, type GroundOffset } from "./layout";

export interface HeightFn {
  (x: number, z: number): number;
}

const LIFT_KM = 0.035;

/**
 * A flat band of `widthKm` along `polygon`, every vertex on the terrain — a
 * perimeter track that follows the relief exactly like the ground it lies on.
 * The band is offset radially from the farm centre, which is exact enough for
 * the near-convex footprints a farm has.
 */
export function polygonBandGeometry(
  centre: { x: number; z: number },
  polygon: GroundOffset[],
  widthKm: number,
  heightAt: HeightFn,
): THREE.BufferGeometry {
  const points = subdividePolygon(polygon, 0.6);
  const n = points.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const push = (p: GroundOffset, half: number): void => {
    const r = Math.max(1e-4, Math.hypot(p.x, p.z));
    const scale = (r + half) / r;
    const x = centre.x + p.x * scale;
    const z = centre.z + p.z * scale;
    positions.push(x, heightAt(x, z) + LIFT_KM, z);
    uvs.push(x / 4, z / 4);
  };
  for (const point of points) push(point, widthKm / 2);
  for (const point of points) push(point, -widthKm / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Facing up: the first build wound the other way and every band was
    // culled from above (front faces down) — invisible at every camera.
    indices.push(i, n + j, j, i, n + i, n + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A band of `widthKm` around the footprint hexagon of `radius`, on the terrain. */
export function hexBandGeometry(
  centre: { x: number; z: number },
  radius: number,
  widthKm: number,
  heightAt: HeightFn,
): THREE.BufferGeometry {
  return polygonBandGeometry(centre, hexagon(radius), widthKm, heightAt);
}

/** A low disc of `radius` lying on the terrain — the centre boss of a marker. */
export function flatDiscGeometry(
  centre: { x: number; z: number },
  radius: number,
  heightAt: HeightFn,
  rings = 3,
  segments = 14,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  positions.push(centre.x, heightAt(centre.x, centre.z) + LIFT_KM + 0.006, centre.z);
  uvs.push(0, 0);
  for (let ring = 1; ring <= rings; ring++) {
    const r = (radius * ring) / rings;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      positions.push(x, heightAt(x, z) + LIFT_KM + 0.006, z);
      uvs.push(x / 2, z / 2);
    }
  }
  for (let s = 0; s < segments; s++) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segments;
    const outer = 1 + ring * segments;
    for (let s = 0; s < segments; s++) {
      const t = (s + 1) % segments;
      indices.push(inner + s, outer + t, outer + s, inner + s, inner + t, outer + t);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The off twin of a disabled farm: a muted band around the footprint and a
 * centre boss — a static ground stencil, day and night, replacing the frame
 * an enabled farm carries.
 */
export function offMarkerGeometry(
  centre: { x: number; z: number },
  radius: number,
  heightAt: HeightFn,
): THREE.BufferGeometry {
  const band = hexBandGeometry(centre, radius, 0.8, heightAt);
  const boss = flatDiscGeometry(centre, Math.min(0.8, radius * 0.4), heightAt);
  const merged = new THREE.BufferGeometry();
  const a = band.attributes.position!.array as Float32Array;
  const b = boss.attributes.position!.array as Float32Array;
  const positions = new Float32Array(a.length + b.length);
  positions.set(a, 0);
  positions.set(b, a.length);
  const index: number[] = [];
  for (const i of band.index!.array) index.push(i);
  const offset = a.length / 3;
  for (const i of boss.index!.array) index.push(i + offset);
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setIndex(index);
  merged.computeVertexNormals();
  band.dispose();
  boss.dispose();
  return merged;
}
