// Building archetypes (docs/08 §2, ARCHITECTURE.md §13): a handful of masses
// every settlement is assembled from, one InstancedMesh each. Every archetype
// is authored in a unit box — x and z in [−0.5, 0.5], y in [0, 1] — and the
// instance matrix carries the real width, height and depth, so one geometry
// serves a 0,2 km cottage and a 0,8 km slab. Heights come from the
// exaggeration table through the layout; nothing here knows a kilometre.
//
// Each vertex carries `enRegion`: 0 = facade (windows, tinted per instance),
// 1 = roof (tone per instance), 2 = courtyard green. The material reads it.
//
// Real references: Polish 1970s slab estates (a bare box with a lift house on
// the roof), 19th-century perimeter blocks around a green courtyard, office
// towers with a stepped crown, suburban houses with 35–40° pitched roofs,
// steel industrial halls with skylight strips along the ridge.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type ArchetypeId = "slab" | "tower" | "perimeter" | "house" | "hall" | "landmark";

export const ARCHETYPE_IDS: readonly ArchetypeId[] = [
  "slab",
  "tower",
  "perimeter",
  "house",
  "hall",
  "landmark",
];

export const REGION = { facade: 0, roof: 1, green: 2 } as const;

/** Stamps the region on every vertex: roofs by normal, unless forced. */
function regioned(geometry: THREE.BufferGeometry, force?: number): THREE.BufferGeometry {
  const normals = geometry.attributes.normal as THREE.BufferAttribute;
  const count = normals.count;
  const region = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    region[i] = force ?? (Math.abs(normals.getY(i)) > 0.5 ? REGION.roof : REGION.facade);
  }
  geometry.setAttribute("enRegion", new THREE.BufferAttribute(region, 1));
  return geometry;
}

/** A box with its base on y = 0, centred on (cx, cz), of the given unit size. */
function box(
  w: number,
  h: number,
  d: number,
  cx = 0,
  cy = 0,
  cz = 0,
  region?: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(cx, cy + h / 2, cz);
  return regioned(geometry, region);
}

/** A gabled roof prism on top of a box of the same footprint, ridge along x. */
function gable(
  w: number,
  rise: number,
  d: number,
  y: number,
  overhang: number,
): THREE.BufferGeometry {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const positions: number[] = [];
  const normals: number[] = [];
  const push = (a: number[], b: number[], c: number[]) => {
    const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const n = [
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ];
    const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    for (const p of [a, b, c]) {
      positions.push(p[0]!, p[1]!, p[2]!);
      normals.push(n[0]! / l, n[1]! / l, n[2]! / l);
    }
  };
  const eaveY = y - 0.02;
  const ridgeY = y + rise;
  const nw = [-hw, eaveY, -hd];
  const ne = [hw, eaveY, -hd];
  const sw = [-hw, eaveY, hd];
  const se = [hw, eaveY, hd];
  const rw = [-hw, ridgeY, 0];
  const re = [hw, ridgeY, 0];
  // North slope (faces −z), south slope (faces +z), two gable ends.
  push(ne, nw, rw);
  push(ne, rw, re);
  push(sw, se, re);
  push(sw, re, rw);
  push(nw, sw, rw);
  push(se, ne, re);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2),
  );
  // The slopes are roofs even though their normals lean; the gable ends are wall.
  const region = new Float32Array(positions.length / 3);
  for (let i = 0; i < region.length; i++) region[i] = i < 12 ? REGION.roof : REGION.facade;
  geometry.setAttribute("enRegion", new THREE.BufferAttribute(region, 1));
  return geometry;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // The prism is authored unindexed; everything merges as flat triangle lists.
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const out = mergeGeometries(flat, false);
  if (!out) throw new Error("archetype parts do not share their attributes");
  for (const part of parts) part.dispose();
  for (const part of flat) if (!parts.includes(part)) part.dispose();
  out.computeBoundingSphere();
  return out;
}

/** Slab: a plain box with a lift house on the roof — 24 triangles. */
function slab(): THREE.BufferGeometry {
  return merged([box(1, 1, 1), box(0.28, 0.06, 0.24, 0.16, 1, -0.12)]);
}

/** Tower: a shaft with a stepped crown — 24 triangles. */
function tower(): THREE.BufferGeometry {
  return merged([box(1, 0.88, 1), box(0.72, 0.12, 0.72, 0, 0.88, 0)]);
}

/** Perimeter block: four wings around a green courtyard — 60 triangles. */
function perimeter(): THREE.BufferGeometry {
  const t = 0.24;
  return merged([
    box(1, 1, t, 0, 0, -0.5 + t / 2),
    box(1, 0.92, t, 0, 0, 0.5 - t / 2),
    box(t, 0.96, 1 - 2 * t, -0.5 + t / 2, 0, 0),
    box(t, 0.9, 1 - 2 * t, 0.5 - t / 2, 0, 0),
    box(1 - 2 * t, 0.03, 1 - 2 * t, 0, 0, 0, REGION.green),
  ]);
}

/** House: a low box under a pitched roof — 18 triangles. */
function house(): THREE.BufferGeometry {
  return merged([box(1, 0.58, 1), gable(1, 0.42, 1, 0.58, 0.06)]);
}

/** Hall: a wide flat shed with two skylight strips — 36 triangles. */
function hall(): THREE.BufferGeometry {
  return merged([
    box(1, 1, 1),
    box(0.9, 0.08, 0.14, 0, 1, -0.22),
    box(0.9, 0.08, 0.14, 0, 1, 0.22),
  ]);
}

/** Landmark: a shaft, a crown and a spire — 40 triangles. */
function landmark(): THREE.BufferGeometry {
  const spire = new THREE.ConeGeometry(0.07, 0.16, 8, 1, false);
  spire.translate(0, 0.92 + 0.08, 0);
  return merged([box(1, 0.72, 1), box(0.72, 0.2, 0.72, 0, 0.72, 0), regioned(spire, REGION.roof)]);
}

const BUILDERS: Record<ArchetypeId, () => THREE.BufferGeometry> = {
  slab,
  tower,
  perimeter,
  house,
  hall,
  landmark,
};

/** Builds every archetype once; the caller disposes them. */
export function buildArchetypes(): Record<ArchetypeId, THREE.BufferGeometry> {
  const out = {} as Record<ArchetypeId, THREE.BufferGeometry>;
  for (const id of ARCHETYPE_IDS) out[id] = BUILDERS[id]();
  return out;
}
