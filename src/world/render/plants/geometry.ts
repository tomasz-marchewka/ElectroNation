// Structure archetypes of the four plant technologies (docs/08 §2–§3,
// ARCHITECTURE.md §6): every repeated shape is one merged BufferGeometry,
// drawn once per archetype as an InstancedMesh. Sizes come from real
// dimensions × the shared STRUCTURE_EXAGGERATION of the exaggeration table
// (and directly from HEIGHT_KM where the table names the class), so a stack
// stays taller than a cooling tower, a tower taller than a dome, a dome
// taller than a hall — the silhouettes keep their real ratios. Layout
// spacing is compressed separately (layout.ts) to fit the ×8 site footprint.
//
// Per-vertex attributes every part carries, read by materials.ts:
//   color  — albedo tint (roof darkening, painted bands, weathering),
//   aEmit  — what may glow: 0 nothing, 1 window band, 2 furnace band,
//            3 lamp head, 4 hot exhaust cap,
//   aWall  — 0..1 height along the part, for the bands.
// UVs are in kilometres (planar per face), so one texture tiles at one
// density across every structure regardless of the box it is on.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HEIGHT_KM, STRUCTURE_EXAGGERATION } from "../core/exaggeration";

/** Kilometres per real metre of structure. */
const M = STRUCTURE_EXAGGERATION / 1000;

export type Archetype =
  | "pad"
  | "dome"
  | "tower"
  | "stackTall"
  | "stackMid"
  | "boiler"
  | "hallBrick"
  | "hallSteel"
  | "hallConcrete"
  | "hrsg"
  | "package"
  | "acc"
  | "stockpile"
  | "conveyor"
  | "pipeRack"
  | "fence"
  | "mast"
  | "portal"
  | "transformer"
  | "admin"
  | "aux";

export type MaterialKind = "concrete" | "steel" | "steelPale" | "brick" | "yard" | "coal" | "stack";

export interface ArchetypeSpec {
  material: MaterialKind;
  /** Big silhouettes cast shadows; details do not. */
  castShadow: boolean;
  /** Hidden beyond the detail distance (docs/08 §3 keeps the read on silhouettes). */
  detail: boolean;
}

export const ARCHETYPES: Record<Archetype, ArchetypeSpec> = {
  pad: { material: "yard", castShadow: false, detail: false },
  dome: { material: "concrete", castShadow: true, detail: false },
  tower: { material: "concrete", castShadow: true, detail: false },
  stackTall: { material: "stack", castShadow: true, detail: false },
  stackMid: { material: "stack", castShadow: true, detail: false },
  boiler: { material: "steel", castShadow: true, detail: false },
  hallBrick: { material: "brick", castShadow: true, detail: false },
  hallSteel: { material: "steelPale", castShadow: true, detail: false },
  hallConcrete: { material: "concrete", castShadow: true, detail: false },
  hrsg: { material: "steel", castShadow: true, detail: false },
  package: { material: "steelPale", castShadow: true, detail: false },
  acc: { material: "steel", castShadow: true, detail: false },
  stockpile: { material: "coal", castShadow: true, detail: false },
  conveyor: { material: "steel", castShadow: false, detail: true },
  pipeRack: { material: "steelPale", castShadow: false, detail: true },
  fence: { material: "steelPale", castShadow: false, detail: true },
  mast: { material: "steelPale", castShadow: false, detail: true },
  portal: { material: "steelPale", castShadow: false, detail: true },
  transformer: { material: "steel", castShadow: false, detail: true },
  admin: { material: "brick", castShadow: false, detail: true },
  aux: { material: "concrete", castShadow: true, detail: false },
};

/** Sizes [km] the layout needs to place things without re-deriving them. */
export const SIZE = {
  domeRadius: 22 * M,
  domeHeight: HEIGHT_KM.containment,
  towerBase: 52 * M,
  towerHeight: HEIGHT_KM.coolingTower,
  stackTallHeight: HEIGHT_KM.stack,
  stackTallRadius: 13 * M,
  stackMidHeight: HEIGHT_KM.stack / 2,
  stackMidRadius: 10 * M,
  boiler: { w: 60 * M, h: 100 * M, d: 50 * M },
  hall: { w: 80 * M, h: HEIGHT_KM.hall, d: 40 * M },
  hrsg: { w: 20 * M, h: 30 * M, d: 40 * M },
  package: { w: 12 * M, h: HEIGHT_KM.container, d: 35 * M },
  packageStackHeight: 25 * M,
  acc: { w: 60 * M, h: 30 * M, d: 60 * M },
  stockpile: { l: 2.2, h: 15 * M, w: 0.7 },
  conveyorLength: 2.6,
  pipeRackLength: 2.4,
  mastHeight: 30 * M,
  portalHeight: HEIGHT_KM.portal,
  admin: { w: 0.8, h: 15 * M, d: 0.4 },
  aux: { w: 0.9, h: 30 * M, d: 0.7 },
} as const;

type Rgb = readonly [number, number, number];

interface Stamp {
  color?: Rgb;
  /** 0 none, 1 windows, 2 furnace band, 3 lamp, 4 hot exhaust. */
  emit?: number;
  /** Height range [km] the aWall attribute normalises over; defaults to the part's own. */
  wall?: { y0: number; y1: number };
  /** Windows only on walls: roofs and floors get emit 0. */
  wallsOnly?: boolean;
}

const WHITE: Rgb = [1, 1, 1];

/** Planar UVs in km per face, picked by the dominant normal axis. */
function kmUv(geometry: THREE.BufferGeometry): void {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x;
      uv[i * 2 + 1] = z;
    } else if (nx >= nz) {
      uv[i * 2] = z;
      uv[i * 2 + 1] = y;
    } else {
      uv[i * 2] = x;
      uv[i * 2 + 1] = y;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Adds the colour / emit / wall attributes every merged part must carry. */
function stamp(geometry: THREE.BufferGeometry, options: Stamp = {}): THREE.BufferGeometry {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const count = position.count;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const y0 = options.wall?.y0 ?? box.min.y;
  const y1 = options.wall?.y1 ?? box.max.y;
  const span = Math.max(1e-6, y1 - y0);
  const color = options.color ?? WHITE;
  const colors = new Float32Array(count * 3);
  const emit = new Float32Array(count);
  const wall = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
    const horizontal = Math.abs(normal.getY(i)) > 0.6;
    emit[i] = options.wallsOnly !== false && horizontal ? 0 : (options.emit ?? 0);
    wall[i] = Math.min(1, Math.max(0, (position.getY(i) - y0) / span));
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aEmit", new THREE.BufferAttribute(emit, 1));
  geometry.setAttribute("aWall", new THREE.BufferAttribute(wall, 1));
  return geometry;
}

/** A box standing on y = 0, centred on x/z, km UVs. */
function boxPart(
  w: number,
  h: number,
  d: number,
  at: { x?: number; y?: number; z?: number } = {},
  options: Stamp = {},
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(at.x ?? 0, h / 2 + (at.y ?? 0), at.z ?? 0);
  kmUv(geometry);
  return stamp(geometry, options);
}

/** A lathe with km UVs around and up; `vNormalized` maps v over 0..1 instead. */
function lathePart(
  points: THREE.Vector2[],
  segments: number,
  options: Stamp & { vNormalized?: boolean } = {},
): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(points, segments);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  let maxY = 0;
  let meanR = 0;
  for (const point of points) {
    maxY = Math.max(maxY, point.y);
    meanR += point.x / points.length;
  }
  const circumference = 2 * Math.PI * meanR;
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, uv.getX(i) * circumference, options.vNormalized ? uv.getY(i) : position.getY(i));
  }
  uv.needsUpdate = true;
  return stamp(geometry, { ...options, wallsOnly: false });
}

function cylinderPart(
  rTop: number,
  rBottom: number,
  h: number,
  segments: number,
  at: { x?: number; y?: number; z?: number } = {},
  options: Stamp = {},
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, false);
  geometry.translate(at.x ?? 0, h / 2 + (at.y ?? 0), at.z ?? 0);
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const circumference = Math.PI * (rTop + rBottom);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circumference, uv.getY(i) * h);
  uv.needsUpdate = true;
  return stamp(geometry, options);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("plants: geometry merge failed");
  for (const part of parts) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}

const ROOF: Rgb = [0.72, 0.72, 0.74];
const DARK_ROOF: Rgb = [0.55, 0.56, 0.58];

/** The site apron: a flat disc of yard surface, scaled per plant. */
function padGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, 28);
  geometry.rotateX(-Math.PI / 2);
  // UVs in km for a nominal 3 km radius; the instance scale stretches them mildly.
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
  uv.needsUpdate = true;
  return stamp(geometry, { color: WHITE });
}

/** Reactor building: a cylinder with a hemispherical containment cap. */
function domeGeometry(): THREE.BufferGeometry {
  const r = SIZE.domeRadius;
  const h = SIZE.domeHeight;
  const points: THREE.Vector2[] = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(r, 0)];
  const cylinderTop = h - r;
  points.push(new THREE.Vector2(r, cylinderTop));
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(Math.max(0.0001, r * Math.cos(a)), cylinderTop + r * Math.sin(a)),
    );
  }
  const shell = lathePart(points, 28, { color: [0.98, 0.97, 0.95] });
  // Annex ring at the foot — the fuel-handling floor of every PWR.
  const ring = cylinderPart(r * 1.25, r * 1.3, 0.2, 28, {}, { color: [0.9, 0.9, 0.88] });
  return merge([shell, ring]);
}

/** Natural-draught cooling tower: hyperboloid shell on a ring of raking columns. */
function towerGeometry(): THREE.BufferGeometry {
  const H = SIZE.towerHeight;
  const base = SIZE.towerBase;
  const throat = 33 * M;
  const top = 36 * M;
  const throatY = 0.78 * H;
  const inlet = 0.1 * H;
  const points: THREE.Vector2[] = [];
  const rings = 16;
  for (let i = 0; i <= rings; i++) {
    const y = inlet + (i / rings) * (H - inlet);
    const t = (y - throatY) / (throatY - inlet);
    // Hyperbola through the base, the throat and the lip.
    const a = y < throatY ? base : top;
    const r = throat * Math.sqrt(1 + (t * t * (a * a - throat * throat)) / (throat * throat));
    points.push(new THREE.Vector2(r, y));
  }
  // Slight lip at the top and a thin inner wall so the tower has no visible hole edge.
  points.push(new THREE.Vector2(top * 1.02, H + 0.02), new THREE.Vector2(top * 0.94, H - 0.06));
  const shell = lathePart(points, 36, { color: [0.86, 0.85, 0.83] });
  // Raking columns of the air inlet.
  const columns: THREE.BufferGeometry[] = [];
  const n = 24;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const column = new THREE.BoxGeometry(0.05, inlet * 1.05, 0.05);
    column.translate(0, inlet / 2, 0);
    column.rotateZ(0.18 * (i % 2 === 0 ? 1 : -1));
    column.rotateY(angle);
    column.translate(Math.cos(angle) * base * 0.98, 0, Math.sin(angle) * base * 0.98);
    kmUv(column);
    columns.push(stamp(column, { color: [0.7, 0.7, 0.7] }));
  }
  // Basin: a low wall around the pond.
  const basin = cylinderPart(base * 1.08, base * 1.1, 0.05, 36, {}, { color: [0.6, 0.62, 0.62] });
  return merge([shell, basin, ...columns]);
}

function stackGeometry(height: number, radius: number): THREE.BufferGeometry {
  const points = [
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(radius * 0.86, height * 0.4),
    new THREE.Vector2(radius * 0.7, height * 0.8),
    new THREE.Vector2(radius * 0.62, height),
    new THREE.Vector2(radius * 0.45, height),
    new THREE.Vector2(radius * 0.45, height * 0.985),
  ];
  const shell = lathePart(points, 18, { color: WHITE, vNormalized: true });
  const foot = cylinderPart(radius * 1.3, radius * 1.4, 0.12, 18, {}, { color: [0.7, 0.7, 0.68] });
  return merge([shell, foot]);
}

/** Coal boiler house: tall block with a bunker bay in front and a furnace band. */
function boilerGeometry(): THREE.BufferGeometry {
  const { w, h, d } = SIZE.boiler;
  const main = boxPart(w, h, d, {}, { color: [0.62, 0.64, 0.6], emit: 1 });
  const bunker = boxPart(
    w,
    h * 0.62,
    d * 0.45,
    { z: d / 2 + (d * 0.45) / 2 },
    { color: [0.58, 0.6, 0.57], emit: 2, wall: { y0: 0, y1: h } },
  );
  const roofBox = boxPart(w * 0.5, 0.18, d * 0.5, { y: h }, { color: DARK_ROOF });
  const duct = boxPart(
    0.16,
    h * 0.55,
    0.16,
    { x: -w * 0.42, z: -d / 2 - 0.1 },
    { color: [0.45, 0.46, 0.46] },
  );
  return merge([main, bunker, roofBox, duct]);
}

/** One hall segment per block; segments tile along x with a roof monitor. */
function hallGeometry(color: Rgb, roof: Rgb): THREE.BufferGeometry {
  const { w, h, d } = SIZE.hall;
  const main = boxPart(w, h, d, {}, { color, emit: 1 });
  const monitor = boxPart(
    w,
    0.12,
    d * 0.32,
    { y: h },
    { color: roof, emit: 1, wall: { y0: h, y1: h + 0.12 } },
  );
  return merge([main, monitor]);
}

/** CCGT: HRSG box with its gas-turbine enclosure and intake house in front. */
function hrsgGeometry(): THREE.BufferGeometry {
  const { w, h, d } = SIZE.hrsg;
  const boiler = boxPart(w, h, d, {}, { color: [0.62, 0.63, 0.65] });
  const roofBox = boxPart(w * 0.6, 0.06, d * 0.7, { y: h }, { color: DARK_ROOF });
  const turbine = boxPart(
    w * 0.9,
    h * 0.5,
    d * 0.6,
    { z: d / 2 + (d * 0.6) / 2 },
    { color: [0.7, 0.71, 0.7], emit: 4 },
  );
  const intake = boxPart(
    w * 1.1,
    h * 0.45,
    d * 0.3,
    { y: h * 0.5, z: d / 2 + d * 0.5 },
    { color: [0.76, 0.77, 0.77] },
  );
  return merge([boiler, roofBox, turbine, intake]);
}

/** OCGT: container-sized package, intake filter house and a short exhaust stack. */
function packageGeometry(): THREE.BufferGeometry {
  const { w, h, d } = SIZE.package;
  const body = boxPart(w, h, d, {}, { color: [0.82, 0.8, 0.74], emit: 4 });
  const intake = boxPart(
    w * 1.35,
    h * 1.6,
    d * 0.3,
    { z: -d / 2 - (d * 0.3) / 2 },
    { color: [0.75, 0.76, 0.75] },
  );
  const stack = cylinderPart(
    0.06,
    0.07,
    SIZE.packageStackHeight,
    12,
    { z: d / 2 - 0.08 },
    { color: [0.6, 0.6, 0.6], emit: 4 },
  );
  const skid = boxPart(w * 1.2, 0.03, d * 1.1, {}, { color: [0.45, 0.45, 0.45] });
  return merge([body, intake, stack, skid]);
}

/** Air-cooled condenser: a fan deck on legs with a row of fan rings. */
function accGeometry(): THREE.BufferGeometry {
  const { w, h, d } = SIZE.acc;
  const legH = h * 0.55;
  const deck = boxPart(w, h - legH, d, { y: legH }, { color: [0.58, 0.6, 0.62] });
  const parts = [deck];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x = (i - 1) * (w / 3);
      const z = (j - 1) * (d / 3);
      parts.push(
        cylinderPart(w / 7, w / 7, 0.03, 12, { x, y: h, z }, { color: [0.35, 0.36, 0.38] }),
      );
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        boxPart(
          0.08,
          legH,
          0.08,
          { x: sx * w * 0.42, z: sz * d * 0.42 },
          { color: [0.5, 0.5, 0.5] },
        ),
      );
    }
  }
  return merge(parts);
}

/** A long coal mound. */
function stockpileGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.scale(SIZE.stockpile.l / 2, SIZE.stockpile.h, SIZE.stockpile.w / 2);
  geometry.computeVertexNormals();
  kmUv(geometry);
  return stamp(geometry, { color: WHITE, wallsOnly: false });
}

/** Inclined conveyor gallery; the instance matrix tilts it. */
function conveyorGeometry(): THREE.BufferGeometry {
  const L = SIZE.conveyorLength;
  const gallery = new THREE.BoxGeometry(0.1, 0.1, L);
  gallery.translate(0, 0.05, 0);
  kmUv(gallery);
  return stamp(gallery, { color: [0.6, 0.6, 0.58] });
}

function pipeRackGeometry(): THREE.BufferGeometry {
  const L = SIZE.pipeRackLength;
  const parts: THREE.BufferGeometry[] = [];
  for (const y of [0.22, 0.3]) {
    parts.push(boxPart(L, 0.04, 0.05, { y, z: -0.06 }, { color: [0.75, 0.7, 0.4] }));
    parts.push(boxPart(L, 0.04, 0.05, { y, z: 0.06 }, { color: [0.75, 0.7, 0.4] }));
  }
  for (let i = 0; i <= 6; i++) {
    const x = -L / 2 + (i / 6) * L;
    parts.push(boxPart(0.04, 0.34, 0.18, { x }, { color: [0.6, 0.6, 0.6] }));
  }
  return merge(parts);
}

/** One metre of fence; the instance scales it to length. */
function fenceGeometry(): THREE.BufferGeometry {
  return boxPart(1, 0.06, 0.02, {}, { color: [0.55, 0.56, 0.58] });
}

function mastGeometry(): THREE.BufferGeometry {
  const h = SIZE.mastHeight;
  const pole = cylinderPart(0.012, 0.02, h, 6, {}, { color: [0.7, 0.7, 0.72] });
  const head = boxPart(
    0.16,
    0.05,
    0.1,
    { y: h },
    { color: [0.9, 0.9, 0.9], emit: 3, wallsOnly: false },
  );
  return merge([pole, head]);
}

/** Switchyard gantry: two posts and a beam. */
function portalGeometry(): THREE.BufferGeometry {
  const h = SIZE.portalHeight;
  const posts = [-0.45, 0.45].map((x) => boxPart(0.05, h, 0.05, { x }, { color: [0.8, 0.8, 0.8] }));
  const beam = boxPart(1.0, 0.05, 0.05, { y: h - 0.05 }, { color: [0.8, 0.8, 0.8] });
  return merge([...posts, beam]);
}

function transformerGeometry(): THREE.BufferGeometry {
  const tank = boxPart(0.24, 0.24, 0.34, {}, { color: [0.45, 0.47, 0.45] });
  const fins = boxPart(0.06, 0.2, 0.3, { x: -0.16 }, { color: [0.4, 0.42, 0.4] });
  const conservator = cylinderPart(0.04, 0.04, 0.3, 8, { y: 0.24 }, { color: [0.45, 0.47, 0.45] });
  return merge([tank, fins, conservator]);
}

function adminGeometry(): THREE.BufferGeometry {
  const { w, h, d } = SIZE.admin;
  const main = boxPart(w, h, d, {}, { color: [0.85, 0.84, 0.82], emit: 1 });
  const roof = boxPart(w, 0.02, d, { y: h }, { color: ROOF });
  return merge([main, roof]);
}

function auxGeometry(): THREE.BufferGeometry {
  const { w, h, d } = SIZE.aux;
  const main = boxPart(w, h, d, {}, { color: [0.92, 0.91, 0.89], emit: 1 });
  const roof = boxPart(w * 0.4, 0.1, d * 0.4, { y: h }, { color: DARK_ROOF });
  return merge([main, roof]);
}

const BUILDERS: Record<Archetype, () => THREE.BufferGeometry> = {
  pad: padGeometry,
  dome: domeGeometry,
  tower: towerGeometry,
  stackTall: () => stackGeometry(SIZE.stackTallHeight, SIZE.stackTallRadius),
  stackMid: () => stackGeometry(SIZE.stackMidHeight, SIZE.stackMidRadius),
  boiler: boilerGeometry,
  hallBrick: () => hallGeometry([0.98, 0.98, 0.98], [0.5, 0.5, 0.52]),
  hallSteel: () => hallGeometry([0.86, 0.9, 0.94], [0.62, 0.64, 0.66]),
  hallConcrete: () => hallGeometry([0.9, 0.89, 0.86], [0.6, 0.6, 0.6]),
  hrsg: hrsgGeometry,
  package: packageGeometry,
  acc: accGeometry,
  stockpile: stockpileGeometry,
  conveyor: conveyorGeometry,
  pipeRack: pipeRackGeometry,
  fence: fenceGeometry,
  mast: mastGeometry,
  portal: portalGeometry,
  transformer: transformerGeometry,
  admin: adminGeometry,
  aux: auxGeometry,
};

export function buildArchetype(kind: Archetype): THREE.BufferGeometry {
  const geometry = BUILDERS[kind]();
  geometry.name = `plants:${kind}`;
  return geometry;
}
