// Archetype geometry of the nodes layer, built once and instanced per site
// (ARCHITECTURE.md §13). Everything is modelled from real substation and
// construction practice at marker scale: a portal gantry is two lattice
// columns under a truss beam, a dead-end string is a stack of porcelain discs
// on a yoke, a live-tank breaker is three post-insulator poles with horizontal
// chambers, a transformer is a tank between radiator banks under bushings.
//
// Proportions live here once; a junction scales a gantry uniformly (0,85 / 1 /
// 1,2 for NN / SN / WN) so silhouettes keep their real ratios (docs/08 §2).

import * as THREE from "three";
import { HEIGHT_KM } from "../core/exaggeration";
import { CONCRETE_TINT, PORCELAIN_TINT, SLAB_TINT, Truss, type Point } from "./lattice";

export type Archetype =
  | "gantry"
  | "insulator"
  | "breaker"
  | "disconnector"
  | "transformer"
  | "hall"
  | "windows"
  | "trench"
  | "mast"
  | "fencePost"
  | "fencePanel"
  | "foreignTower"
  | "tube"
  | "pad"
  | "sitePad"
  | "container"
  | "pipe"
  | "pile"
  | "cabin"
  | "foundation"
  | "skelStack"
  | "skelHall"
  | "skelDome"
  | "skelTurbine"
  | "skelRows"
  | "clad"
  | "cladCylinder"
  | "scaffold";

/** Natural portal of a bay: half-span across the beam, beam height [km]. */
export const GANTRY = { halfSpan: 0.62, height: 0.5, depth: 0.1 } as const;
/** Uniform scale of a gantry per line class — silhouettes keep their ratios. */
export const GANTRY_SCALE = { lv: 0.85, mv: 1, hv: 1.2 } as const;
/** Beam attachment height [km] of the grid's own terminal portal per class. */
export const PORTAL_BEAM_KM = { lv: 0.46, mv: 0.6, hv: 0.8 } as const;
/** Dead-end string: length and disc count. */
export const INSULATOR = { length: 0.44, discs: 7 } as const;
/** Height of a floodlight mast [km] — taller than any gantry, the night read. */
export const MAST_HEIGHT = 0.8;
/** Fence: panel height [km] and the marker-scale post spacing. */
export const FENCE = { height: 0.16, postSize: 0.035 } as const;
/** Cable trench: unit length 1 km, outer width and height [km]. */
export const TRENCH = { width: 0.17, height: 0.075 } as const;
/** Window band of a control building: real band height [km]. */
export const WINDOW_BAND_KM = 0.09;

const DEG = Math.PI / 180;

function paint(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position?.count ?? 0;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const steel = new THREE.Color(1, 1, 1);

// --- junction pieces -----------------------------------------------------------

/**
 * A portal gantry ("brama") of a bay: two lattice columns, a truss beam of two
 * chords with a zig-zag web, foundation pads and a cable trough stub. The beam
 * is what a dead-end string hangs from.
 */
function gantryGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const H = GANTRY.halfSpan;
  const T = GANTRY.height;
  const leg = 0.018;
  const brace = 0.011;
  const panels = [0, T * 0.42, T * 0.78, T];
  for (const side of [-1, 1]) {
    for (let i = 0; i + 1 < panels.length; i++) {
      const lower = panels[i] ?? 0;
      const upper = panels[i + 1] ?? T;
      const lowerHalf = 0.085 - (0.085 - 0.045) * (lower / T);
      const upperHalf = 0.085 - (0.085 - 0.045) * (upper / T);
      const shift = side * H;
      const lowerCorners = [
        { x: shift - lowerHalf, y: lower, z: lowerHalf },
        { x: shift + lowerHalf, y: lower, z: lowerHalf },
        { x: shift + lowerHalf, y: lower, z: -lowerHalf },
        { x: shift - lowerHalf, y: lower, z: -lowerHalf },
      ];
      const upperCorners = [
        { x: shift - upperHalf, y: upper, z: upperHalf },
        { x: shift + upperHalf, y: upper, z: upperHalf },
        { x: shift + upperHalf, y: upper, z: -upperHalf },
        { x: shift - upperHalf, y: upper, z: -upperHalf },
      ];
      for (let c = 0; c < 4; c++) {
        const a = lowerCorners[c];
        const b = upperCorners[c];
        const d = lowerCorners[(c + 1) % 4];
        const e = upperCorners[(c + 1) % 4];
        if (!a || !b || !d || !e) continue;
        t.bar(a, b, leg, steel);
        t.bar(a, e, brace, steel);
        t.bar(d, b, brace, steel);
      }
      t.ring(upperCorners as Point[], brace, steel);
    }
    t.slab(side * H, 0, 0.24, 0.24, 0.012);
  }
  // The beam: two chords with a zig-zag web, plus verticals at both ends.
  const chordZ = GANTRY.depth;
  const topY = T;
  const lowY = T - GANTRY.depth * 0.9;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const x = -H + (2 * H * i) / steps;
    const top = { x, y: topY, z: 0 };
    const low = { x, y: lowY, z: 0 };
    t.bar({ ...top, z: chordZ * 0.5 }, { ...top, z: -chordZ * 0.5 }, brace, steel);
    t.bar({ ...low, z: chordZ * 0.5 }, { ...low, z: -chordZ * 0.5 }, brace * 0.8, steel);
    if (i < steps) {
      const nextX = -H + (2 * H * (i + 1)) / steps;
      t.bar(top, { x: nextX, y: topY, z: 0 }, leg * 0.8, steel);
      t.bar(low, { x: nextX, y: lowY, z: 0 }, leg * 0.8, steel);
      t.bar(top, { x: nextX, y: lowY, z: 0 }, brace * 0.7, steel);
      t.bar({ x: nextX, y: topY, z: 0 }, low, brace * 0.7, steel);
    }
  }
  // Span between the column tops and the beam.
  t.bar({ x: -H, y: topY - 0.04, z: 0 }, { x: H, y: topY - 0.04, z: 0 }, leg, steel);
  // A cable trough leaving the bay inboard: the ground link to the yard.
  t.box(0, 0.03, 0.55, H * 1.2, 0.05, 0.18, steel);
  const geometry = t.build("nodes-gantry");
  return geometry;
}

/**
 * A dead-end string: discs on a spindle between a yoke and the line clamp.
 * The bottom carries a strain clamp (a yoke plate, the clamp body and the
 * arcing horn) — the hardware a conductor would be bolted into, so an empty
 * string reads as "equipped, no line" and not as a broken model.
 */
function insulatorGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const length = INSULATOR.length;
  const step = length / INSULATOR.discs;
  t.bar({ x: -0.16, y: 0, z: 0 }, { x: 0.16, y: 0, z: 0 }, 0.028, steel);
  for (let i = 0; i < INSULATOR.discs; i++) {
    const y = -step * (i + 0.5);
    const radius = 0.055 - 0.02 * (i / INSULATOR.discs);
    t.cylinder(0, y, 0, radius, step * 0.42, 10, PORCELAIN_TINT);
  }
  // Strain clamp: yoke plate across the last disc, clamp body below it.
  t.box(0, -length + 0.01, 0, 0.34, 0.03, 0.05, steel);
  t.box(0, -length - 0.04, 0, 0.13, 0.09, 0.1, steel);
  t.bar(
    { x: -0.09, y: -length - 0.02, z: 0 },
    { x: -0.09, y: -length - 0.16, z: 0.06 },
    0.02,
    steel,
  );
  return t.build("nodes-insulator");
}

/**
 * A two-column disconnector (odłącznik): a base frame, two porcelain posts,
 * the blade pair meeting at the contact and the motor drive. It is the piece
 * that separates a bay from the busbar in every real switchyard, and it makes
 * an occupied bay read as apparatus rather than a bare portal.
 */
function disconnectorGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const h = 0.34;
  t.box(0, 0.03, 0, 0.62, 0.05, 0.3, steel);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      t.cylinder(side * 0.2, 0.09 + i * (h / 3), 0, 0.042, h / 3, 8, PORCELAIN_TINT);
    }
    t.box(side * 0.2, 0.06, 0, 0.16, 0.04, 0.16, steel);
    // Blade arm leaning toward the contact at the centre.
    t.tube(
      { x: side * 0.2, y: h + 0.03, z: 0 },
      { x: side * 0.04, y: h + 0.1, z: 0 },
      0.028,
      6,
      steel,
    );
  }
  t.box(0, h + 0.1, 0, 0.09, 0.07, 0.09, steel);
  t.bar({ x: 0.2, y: h * 0.55, z: 0.1 }, { x: 0.34, y: h * 0.55, z: 0.1 }, 0.025, steel);
  t.box(0.34, h * 0.52, 0.1, 0.14, 0.14, 0.12, steel);
  return t.build("nodes-disconnector");
}

/**
 * A cable trench run (unit length 1 km along X): a concrete channel with its
 * cover plates. Cable trenches tie every bay of a switchyard to the control
 * building — they are the ground-plane structure that makes a yard read as
 * engineered rather than a pad with objects on it.
 */
function trenchGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const half = 0.5;
  t.box(0, 0.02, 0, 1, 0.04, TRENCH.width, CONCRETE_TINT);
  for (const side of [-1, 1]) {
    t.box(0, TRENCH.height * 0.5, side * (TRENCH.width / 2 - 0.012), 1, TRENCH.height, 0.024);
  }
  for (let i = 0; i < 4; i++) {
    const x = -half + 0.125 + i * 0.25;
    t.box(x, TRENCH.height + 0.008, 0, 0.2, 0.016, TRENCH.width + 0.02, SLAB_TINT);
  }
  return t.build("nodes-trench");
}

/**
 * A window band of a control building: a thin box the layout scales to the
 * facade. Its own material is unlit, so the module paints dark glass by day
 * and warm lit panes at night without touching the walls' PBR path.
 */
function windowBandGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 0.04);
  geometry.translate(0, 0.5, 0);
  paint(geometry, steel);
  geometry.name = "nodes-windows";
  return geometry;
}

/** A live-tank circuit breaker: three post-insulator poles under horizontal chambers. */
function breakerGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const height = 0.55;
  t.box(0, 0.03, 0, 1.5, 0.06, 0.7, steel);
  for (const x of [-0.5, 0, 0.5]) {
    for (let i = 0; i < 3; i++) {
      t.cylinder(x, 0.09 + i * 0.13, 0, 0.045, 0.13, 8, PORCELAIN_TINT);
    }
    t.cylinder(x, height, 0, 0.07, 0.3, 10, steel);
    t.bar({ x: x - 0.15, y: height, z: 0 }, { x: x + 0.15, y: height, z: 0 }, 0.05, steel);
  }
  return t.build("nodes-breaker");
}

/** A power transformer: tank between two radiator banks, bushings on top. */
function transformerGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  t.slab(0, 0, 1.1, 0.85, 0.02);
  t.box(0, 0.34, 0, 1.5, 0.62, 1.15, steel);
  t.box(0, 0.67, 0, 1.6, 0.06, 1.25, steel);
  for (const side of [-1, 1]) {
    t.box(side * 0.95, 0.36, 0, 0.32, 0.55, 1.1, steel);
    for (let i = 0; i < 7; i++) {
      t.box(side * 1.14, 0.36, -0.45 + i * 0.15, 0.06, 0.5, 0.04, steel);
    }
  }
  for (const x of [-0.42, 0, 0.42]) {
    t.cylinder(x, 0.86, 0, 0.09, 0.3, 8, PORCELAIN_TINT);
    t.cylinder(x, 1.06, 0, 0.055, 0.16, 8, PORCELAIN_TINT);
  }
  t.cylinder(0.72, 0.84, 0, 0.05, 0.22, 6, PORCELAIN_TINT);
  return t.build("nodes-transformer");
}

/** A hall: the control building of a junction, the metering hall of a border. */
function hallGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const walls = steel;
  const roof = new THREE.Color().setRGB(0.42, 0.44, 0.46, THREE.SRGBColorSpace);
  const glass = new THREE.Color().setRGB(0.22, 0.3, 0.36, THREE.SRGBColorSpace);
  t.box(0, 0.16, 0, 1.8, 0.32, 0.9, walls);
  t.box(0, 0.35, 0, 1.92, 0.06, 1.0, roof);
  t.box(0, 0.12, 0.47, 0.5, 0.24, 0.05, walls);
  // A window band that catches the light — the building reads as staffed.
  t.box(0, 0.24, 0.45, 1.5, 0.1, 0.03, glass);
  t.box(-0.55, 0.42, -0.2, 0.34, 0.16, 0.3, walls);
  t.box(0.4, 0.42, 0.1, 0.26, 0.14, 0.24, walls);
  return t.build("nodes-hall");
}

/** A floodlight mast with a four-lamp head. */
function mastGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const h = MAST_HEIGHT;
  const leg = 0.02;
  const panels = [0, h * 0.45, h * 0.82, h];
  for (let i = 0; i + 1 < panels.length; i++) {
    const lower = panels[i] ?? 0;
    const upper = panels[i + 1] ?? h;
    const half = 0.055 * (1 - lower / h) + 0.03;
    const upperHalf = 0.055 * (1 - upper / h) + 0.03;
    const corners: Point[] = [
      { x: -half, y: lower, z: half },
      { x: half, y: lower, z: half },
      { x: half, y: lower, z: -half },
      { x: -half, y: lower, z: -half },
    ];
    const tops: Point[] = [
      { x: -upperHalf, y: upper, z: upperHalf },
      { x: upperHalf, y: upper, z: upperHalf },
      { x: upperHalf, y: upper, z: -upperHalf },
      { x: -upperHalf, y: upper, z: -upperHalf },
    ];
    for (let c = 0; c < 4; c++) {
      const a = corners[c];
      const b = tops[c];
      const d = corners[(c + 1) % 4];
      const e = tops[(c + 1) % 4];
      if (!a || !b || !d || !e) continue;
      t.bar(a, b, leg, steel);
      t.bar(a, e, leg * 0.6, steel);
      t.bar(d, b, leg * 0.6, steel);
    }
    t.ring(tops, leg * 0.6, steel);
  }
  t.box(0, h + 0.07, 0, 0.05, 0.14, 0.05, steel);
  t.box(0, h + 0.16, 0, 0.7, 0.09, 0.28, steel);
  for (const x of [-0.24, 0, 0.24]) {
    t.box(x, h + 0.24, 0.1, 0.16, 0.12, 0.06, steel);
    t.cylinder(x, h + 0.3, 0.1, 0.055, 0.04, 8, PORCELAIN_TINT);
  }
  return t.build("nodes-mast");
}

/** A fence bay: two posts and a top rail — the mesh is its own alpha plane. */
function fencePostGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const h = FENCE.height;
  for (const x of [-0.5, 0.5]) {
    t.bar({ x, y: 0, z: 0 }, { x, y: h, z: 0 }, FENCE.postSize, steel);
  }
  t.bar({ x: -0.5, y: h, z: 0 }, { x: 0.5, y: h, z: 0 }, FENCE.postSize * 0.8, steel);
  t.bar({ x: -0.5, y: h * 0.45, z: 0 }, { x: 0.5, y: h * 0.45, z: 0 }, FENCE.postSize * 0.6, steel);
  return t.build("nodes-fence-post");
}

/** The chain-link plane of a fence bay: unit size, alpha-mapped. */
function fencePanelGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);
  geometry.name = "nodes-fence-panel";
  return geometry;
}

/** A lattice tower of the foreign line off the board: a delta with one arm. */
function foreignTowerGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const h = 0.95;
  const leg = 0.028;
  const brace = 0.016;
  const panels = [0, 0.42, 0.76, h];
  for (let i = 0; i + 1 < panels.length; i++) {
    const lower = panels[i] ?? 0;
    const upper = panels[i + 1] ?? h;
    const lowerHalf = 0.16 - 0.09 * (lower / h);
    const upperHalf = 0.16 - 0.09 * (upper / h);
    const corners: Point[] = [
      { x: -lowerHalf, y: lower, z: lowerHalf },
      { x: lowerHalf, y: lower, z: lowerHalf },
      { x: lowerHalf, y: lower, z: -lowerHalf },
      { x: -lowerHalf, y: lower, z: -lowerHalf },
    ];
    const tops: Point[] = [
      { x: -upperHalf, y: upper, z: upperHalf },
      { x: upperHalf, y: upper, z: upperHalf },
      { x: upperHalf, y: upper, z: -upperHalf },
      { x: -upperHalf, y: upper, z: -upperHalf },
    ];
    for (let c = 0; c < 4; c++) {
      const a = corners[c];
      const b = tops[c];
      const d = corners[(c + 1) % 4];
      const e = tops[(c + 1) % 4];
      if (!a || !b || !d || !e) continue;
      t.bar(a, b, leg, steel);
      t.bar(a, e, brace, steel);
      t.bar(d, b, brace, steel);
    }
    t.ring(tops, brace, steel);
  }
  t.slab(0, 0, 0.3, 0.3, 0.012);
  const armY = h * 0.82;
  for (const side of [-1, 1]) {
    t.bar({ x: side * 0.1, y: armY, z: 0 }, { x: side * 0.5, y: armY, z: 0 }, leg * 0.8, steel);
    t.bar({ x: side * 0.1, y: armY - 0.08, z: 0 }, { x: side * 0.5, y: armY, z: 0 }, brace, steel);
  }
  t.bar({ x: 0, y: h, z: 0 }, { x: 0, y: h + 0.05, z: 0 }, leg * 0.7, steel);
  return t.build("nodes-foreign-tower");
}

// --- shared primitives ---------------------------------------------------------

/** A unit cylinder along Y: instances scale it to any radius, length and yaw. */
function tubeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
  paint(geometry, steel);
  geometry.name = "nodes-tube";
  return geometry;
}

/**
 * A switchyard gravel pad: a 24-gon the junction scales to its fence. The UVs
 * are multiplied so the gravel keeps its real grain instead of stretching over
 * the whole yard.
 */
function padGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, 24);
  geometry.rotateX(-Math.PI / 2);
  scaleUv(geometry, 22);
  geometry.name = "nodes-pad";
  return geometry;
}

/** The cleared earth of a construction site. */
function sitePadGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, 20);
  geometry.rotateX(-Math.PI / 2);
  scaleUv(geometry, 16);
  geometry.name = "nodes-site-pad";
  return geometry;
}

/** Multiplies the UVs of a geometry — texture density independent of instance size. */
function scaleUv(geometry: THREE.BufferGeometry, factor: number): void {
  const uv = geometry.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * factor, uv.getY(i) * factor);
  }
  uv.needsUpdate = true;
}

// --- construction site pieces --------------------------------------------------

/** Three stacked site containers with corner posts. */
function containerGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  t.box(0, 0.19, 0, 1.2, 0.38, 0.5, steel);
  t.box(0, 0.58, 0, 1.2, 0.38, 0.5, steel);
  t.box(0.05, 0.96, 0, 1.15, 0.36, 0.5, steel);
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.25, 0.25]) {
      t.bar({ x, y: 0, z }, { x, y: 1.12, z }, 0.02, steel);
    }
  }
  return t.build("nodes-container");
}

/** A stack of pipes on timber wedges. */
function pipeGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  t.box(0, 0.06, 0, 2.2, 0.12, 1.0, steel);
  for (const z of [-0.34, 0, 0.34]) {
    t.tube({ x: -1.2, y: 0.24, z }, { x: 1.2, y: 0.24, z }, 0.15, 7, steel);
  }
  t.box(0, 0.1, -0.62, 2.4, 0.2, 0.14, steel);
  t.box(0, 0.1, 0.62, 2.4, 0.2, 0.14, steel);
  return t.build("nodes-pipe");
}

/** A gravel heap: a cone on a spread skirt. */
function pileGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  t.cone(0, 0.3, 0, 0.75, 0.6, 10, steel);
  t.slab(0, 0, 0.95, 0.85, 0.015);
  return t.build("nodes-pile");
}

/** A site cabin: box on a plinth with a roof, door and steps. */
function cabinGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  t.box(0, 0.08, 0, 1.0, 0.16, 0.55, steel);
  t.box(0, 0.34, 0, 1.1, 0.36, 0.6, steel);
  t.box(0, 0.55, 0, 1.2, 0.06, 0.68, steel);
  t.box(0.35, 0.34, 0.31, 0.3, 0.3, 0.04, steel);
  t.box(0.35, 0.18, 0.45, 0.4, 0.1, 0.28, steel);
  return t.build("nodes-cabin");
}

/** Pile caps and a plinth field of the future object's foundations. */
function foundationGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  t.slab(0, 0, 1.1, 1.1, 0.02);
  for (const x of [-0.7, 0, 0.7]) {
    for (const z of [-0.7, 0.7]) {
      t.box(x, 0.13, z, 0.34, 0.26, 0.34, steel);
      for (const dx of [-0.1, 0.1]) {
        for (const dz of [-0.1, 0.1]) {
          t.bar({ x: x + dx, y: 0.26, z: z + dz }, { x: x + dx, y: 0.62, z: z + dz }, 0.014, steel);
        }
      }
    }
  }
  t.box(0, 0.13, 0, 0.5, 0.26, 0.5, steel);
  return t.build("nodes-foundation");
}

/** The future stack's steel shell: verticals, rings and a top cap, no cladding. */
function skelStackGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const radius = 0.26;
  const segments = 14;
  const rings = [0.06, 0.34, 0.62, 0.86, 1];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    t.bar({ x, y: 0, z }, { x, y: 1, z }, 0.014, steel);
  }
  for (const y of rings) {
    const corners: Point[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      corners.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius });
    }
    t.ring(corners, 0.012, steel);
  }
  return t.build("nodes-skel-stack");
}

/** The future hall's steel frame: columns, roof beams and purlins. */
function skelHallGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const h = 0.7;
  const cols = [-1, -0.5, 0, 0.5, 1];
  for (const x of cols) {
    for (const z of [-0.5, 0.5]) {
      t.bar({ x, y: 0, z }, { x, y: h, z }, 0.026, steel);
      t.bar({ x, y: h, z }, { x, y: 0, z: z * 1.6 }, 0.014, steel);
    }
    t.bar({ x, y: h, z: -0.5 }, { x, y: h, z: 0.5 }, 0.022, steel);
  }
  for (let i = 0; i + 1 < cols.length; i++) {
    const a = cols[i] ?? 0;
    const b = cols[i + 1] ?? 0;
    t.bar({ x: a, y: h, z: -0.5 }, { x: b, y: h, z: 0.5 }, 0.012, steel);
    t.bar({ x: a, y: h, z: 0.5 }, { x: b, y: h, z: -0.5 }, 0.012, steel);
  }
  return t.build("nodes-skel-hall");
}

/** The future containment's steel shell. */
function skelDomeGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const radius = 0.42;
  const segments = 16;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    t.bar({ x, y: 0, z }, { x, y: 0.95, z }, 0.018, steel);
  }
  for (const y of [0.3, 0.62, 0.95]) {
    const corners: Point[] = [];
    const r = y > 0.9 ? radius * 0.85 : radius;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      corners.push({ x: Math.cos(angle) * r, y, z: Math.sin(angle) * r });
    }
    t.ring(corners, 0.014, steel);
  }
  for (let i = 0; i < segments; i += 2) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    t.bar({ x, y: 0.3, z }, { x: x * 0.6, y: 0.95, z: z * 0.6 }, 0.012, steel);
  }
  return t.build("nodes-skel-dome");
}

/** The future wind turbine's tapered tower shell. */
function skelTurbineGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.16;
    const z = Math.sin(angle) * 0.16;
    const topX = Math.cos(angle) * 0.07;
    const topZ = Math.sin(angle) * 0.07;
    t.bar({ x, y: 0, z }, { x: topX, y: 1, z: topZ }, 0.014, steel);
  }
  for (const y of [0.25, 0.55, 0.8]) {
    const r = 0.16 - (0.09 * y) / 1;
    const corners: Point[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      corners.push({ x: Math.cos(angle) * r, y, z: Math.sin(angle) * r });
    }
    t.ring(corners, 0.012, steel);
  }
  return t.build("nodes-skel-turbine");
}

/** The future storage or PV yard's low rack field. */
function skelRowsGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  for (let row = 0; row < 5; row++) {
    const z = -0.8 + row * 0.4;
    for (const x of [-0.9, -0.3, 0.3, 0.9]) {
      t.bar({ x, y: 0, z }, { x, y: 0.22, z }, 0.016, steel);
    }
    t.bar({ x: -0.9, y: 0.22, z }, { x: 0.9, y: 0.22, z }, 0.014, steel);
  }
  return t.build("nodes-skel-rows");
}

/** Cladding of the future object: four walls and a roof edge, no interior. */
function cladGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const h = 0.7;
  for (const side of [-1, 1]) {
    t.box(0, h / 2, side * 0.5, 1.04, h, 0.06, steel);
    t.box(side * 0.52, h / 2, 0, 0.06, h, 1.0, steel);
  }
  t.box(0, h + 0.04, 0, 1.12, 0.08, 1.12, steel);
  return t.build("nodes-clad");
}

/** A cylinder shell — the clad of a future stack or containment. */
function cladCylinderGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, true);
  geometry.translate(0, 0.5, 0);
  paint(geometry, steel);
  geometry.name = "nodes-clad-cylinder";
  return geometry;
}

/** A scaffold cage: four standards, three lifts, diagonals and a deck edge. */
function scaffoldGeometry(): THREE.BufferGeometry {
  const t = new Truss();
  const h = 1;
  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.5, 0.5]) {
      t.bar({ x, y: 0, z }, { x, y: h, z }, 0.022, steel);
    }
  }
  for (const y of [0.32, 0.64, 0.98]) {
    t.ring(
      [
        { x: -0.5, y, z: 0.5 },
        { x: 0.5, y, z: 0.5 },
        { x: 0.5, y, z: -0.5 },
        { x: -0.5, y, z: -0.5 },
      ],
      0.016,
      steel,
    );
  }
  for (const side of [-1, 1]) {
    t.bar({ x: -0.5, y: 0.06, z: side * 0.5 }, { x: 0.5, y: 0.6, z: side * 0.5 }, 0.014, steel);
    t.bar({ x: 0.5, y: 0.38, z: side * 0.5 }, { x: -0.5, y: 0.9, z: side * 0.5 }, 0.014, steel);
  }
  return t.build("nodes-scaffold");
}

/** Every archetype geometry, built once per module instance. */
export function buildArchetypes(): Record<Archetype, THREE.BufferGeometry> {
  return {
    gantry: gantryGeometry(),
    insulator: insulatorGeometry(),
    breaker: breakerGeometry(),
    disconnector: disconnectorGeometry(),
    transformer: transformerGeometry(),
    hall: hallGeometry(),
    windows: windowBandGeometry(),
    trench: trenchGeometry(),
    mast: mastGeometry(),
    fencePost: fencePostGeometry(),
    fencePanel: fencePanelGeometry(),
    foreignTower: foreignTowerGeometry(),
    tube: tubeGeometry(),
    pad: padGeometry(),
    sitePad: sitePadGeometry(),
    container: containerGeometry(),
    pipe: pipeGeometry(),
    pile: pileGeometry(),
    cabin: cabinGeometry(),
    foundation: foundationGeometry(),
    skelStack: skelStackGeometry(),
    skelHall: skelHallGeometry(),
    skelDome: skelDomeGeometry(),
    skelTurbine: skelTurbineGeometry(),
    skelRows: skelRowsGeometry(),
    clad: cladGeometry(),
    cladCylinder: cladCylinderGeometry(),
    scaffold: scaffoldGeometry(),
  };
}

/** Height [km] of the tallest element of a finished plant of this tech. */
export function plantPeakKm(tech: string): number {
  if (tech === "coal") return HEIGHT_KM.stack;
  if (tech === "nuclear") return HEIGHT_KM.containment * 1.6;
  return HEIGHT_KM.stack * 0.6;
}

/** The tallest structure of a construction site's future object [km]. */
export function sitePeakKm(kind: string, tech: string | null): number {
  if (kind === "farm" || tech === "wind") return HEIGHT_KM.turbineTip;
  if (kind === "storage") return HEIGHT_KM.container * 6;
  if (kind === "junction" || kind === "border") return HEIGHT_KM.portal;
  if (kind === "expansion") return plantPeakKm(tech ?? "ccgt") * 0.6;
  return plantPeakKm(tech ?? "ccgt");
}

/** Yaw of the arm of a foreign tower toward a direction on the ground plane. */
export function yawToward(x: number, z: number): number {
  return Math.atan2(x, z) - DEG * 90;
}
