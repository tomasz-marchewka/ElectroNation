// The three pylon silhouettes (docs/08 §2–§3: silhouette codes the type,
// never colour) and the terminal portal every line ends on. Heights come from
// the exaggeration table and nothing else; the proportions of legs, arms and
// peaks follow real towers:
//
//   NN  ~110 kV  single circuit — slim lattice tower, one crossarm level with a
//       conductor at each arm tip and the third hung from the peak (the
//       triangle silhouette of Polish 110 kV series B2/O24 towers).
//   SN  ~220 kV  double circuit — two-level tower ("Zweiebenenmast"): a wide
//       lower crossarm with two phases per side, a narrow upper arm with one.
//   WN  ~400 kV  double circuit, bundled — barrel tower ("Tonnenmast" / PSE
//       series Y52): three crossarm levels, the middle one widest, and a
//       cat-head with two earth-wire peaks.
//
// Every tower is built twice: a near geometry with real bracing (≤ 2 k
// triangles) and a far one of a dozen members for the strategic view.

import * as THREE from "three";
import type { WorldLine } from "../../bridge/worldScene";
import { HEIGHT_KM } from "../core/exaggeration";
import {
  GHOST_HATCH_TINT,
  GHOST_TINT,
  GLASS_TINT,
  MARKING_TINT,
  Truss,
  panel,
  square,
  type Point,
} from "./lattice";

export type LineType = WorldLine["type"];

export interface Attachment {
  /** Across the line, positive to the local +X (right of the line direction). */
  x: number;
  /** Above the feet [km], insulator string already subtracted. */
  y: number;
  /** An earth wire: carries no load, never glows. */
  earth: boolean;
}

interface ArmLevel {
  y: number;
  reach: number;
  /** Where conductors hang along the arm, as distances from the axis (mirrored). */
  hangs: number[];
}

interface Peak {
  x: number;
  y: number;
  carries: "conductor" | "earth" | "none";
}

export interface PylonSpec {
  type: LineType;
  height: number;
  baseHalf: number;
  topHalf: number;
  /** Panel boundaries of the body from the ground up; the last is the body top. */
  panels: number[];
  arms: ArmLevel[];
  peaks: Peak[];
  /** Insulator string length [km]. */
  insulator: number;
  /** Two parallel strings per attachment — how a 220/400 kV tower hangs them. */
  doubleStrings?: boolean;
  member: { leg: number; brace: number; chord: number };
  /** Conductor attachments, left to right; earth wires last. */
  attachments: Attachment[];
  portal: PortalSpec;
}

export interface PortalSpec {
  /** Half-width of the beam [km]. */
  halfWidth: number;
  /** Beam height [km]. */
  beamY: number;
  /** Dead-end string length toward the line [km]. */
  insulator: number;
  attachments: Attachment[];
}

function attachmentsOf(arms: ArmLevel[], peaks: Peak[], insulator: number): Attachment[] {
  const conductors: Attachment[] = [];
  for (const arm of arms) {
    for (const hang of arm.hangs) {
      conductors.push({ x: -hang, y: arm.y - insulator, earth: false });
      conductors.push({ x: hang, y: arm.y - insulator, earth: false });
    }
  }
  for (const peak of peaks) {
    if (peak.carries === "conductor") {
      conductors.push({ x: peak.x, y: peak.y - insulator, earth: false });
    }
  }
  conductors.sort((a, b) => a.x - b.x || a.y - b.y);
  const earth = peaks
    .filter((peak) => peak.carries === "earth")
    .map((peak): Attachment => ({ x: peak.x, y: peak.y, earth: true }))
    .sort((a, b) => a.x - b.x);
  return [...conductors, ...earth];
}

function portalOf(
  halfWidth: number,
  beamY: number,
  insulator: number,
  attachments: Attachment[],
): PortalSpec {
  const conductors = attachments.filter((a) => !a.earth);
  const earth = attachments.filter((a) => a.earth);
  const bays = conductors.length;
  const spread = halfWidth * 0.82;
  const list: Attachment[] = conductors.map((_, i) => ({
    x: bays === 1 ? 0 : -spread + (2 * spread * i) / (bays - 1),
    y: beamY,
    earth: false,
  }));
  for (const wire of earth) list.push({ x: wire.x, y: beamY + 0.22, earth: true });
  return { halfWidth, beamY, insulator, attachments: list };
}

function spec(
  type: LineType,
  height: number,
  baseHalf: number,
  topHalf: number,
  panels: number[],
  arms: ArmLevel[],
  peaks: Peak[],
  insulator: number,
  member: PylonSpec["member"],
  portal: { halfWidth: number; beamY: number; insulator: number },
  doubleStrings = false,
): PylonSpec {
  const attachments = attachmentsOf(arms, peaks, insulator);
  return {
    type,
    height,
    baseHalf,
    topHalf,
    panels,
    arms,
    peaks,
    insulator,
    doubleStrings,
    member,
    attachments,
    portal: portalOf(portal.halfWidth, portal.beamY, portal.insulator, attachments),
  };
}

export const PYLON_SPECS: Record<LineType, PylonSpec> = {
  lv: spec(
    "lv",
    HEIGHT_KM.pylonLv,
    0.06,
    0.025,
    [0, 0.2, 0.36, 0.5],
    [{ y: 0.5, reach: 0.22, hangs: [0.19] }],
    [{ x: 0, y: HEIGHT_KM.pylonLv, carries: "conductor" }],
    0.03,
    { leg: 0.036, brace: 0.019, chord: 0.026 },
    { halfWidth: 0.3, beamY: 0.46, insulator: 0.05 },
  ),
  mv: spec(
    "mv",
    HEIGHT_KM.pylonMv,
    0.1,
    0.035,
    [0, 0.2, 0.4, 0.58, 0.78],
    [
      { y: 0.58, reach: 0.38, hangs: [0.18, 0.35] },
      { y: 0.78, reach: 0.22, hangs: [0.19] },
    ],
    [{ x: 0, y: HEIGHT_KM.pylonMv, carries: "none" }],
    0.045,
    { leg: 0.042, brace: 0.022, chord: 0.029 },
    { halfWidth: 0.5, beamY: 0.6, insulator: 0.07 },
    true,
  ),
  hv: spec(
    "hv",
    HEIGHT_KM.pylonHv,
    0.15,
    0.05,
    [0, 0.2, 0.4, 0.6, 0.82, 1.02, 1.1],
    [
      { y: 0.6, reach: 0.27, hangs: [0.25] },
      { y: 0.82, reach: 0.38, hangs: [0.36] },
      { y: 1.02, reach: 0.27, hangs: [0.25] },
    ],
    [
      { x: -0.12, y: HEIGHT_KM.pylonHv, carries: "earth" },
      { x: 0.12, y: HEIGHT_KM.pylonHv, carries: "earth" },
    ],
    0.07,
    { leg: 0.05, brace: 0.025, chord: 0.034 },
    { halfWidth: 0.64, beamY: 0.8, insulator: 0.1 },
    true,
  ),
};

export const LINE_TYPES: readonly LineType[] = ["lv", "mv", "hv"];

function halfAt(specification: PylonSpec, y: number): number {
  const top = specification.panels[specification.panels.length - 1] ?? specification.height;
  const t = Math.min(1, Math.max(0, y / top));
  return specification.baseHalf + (specification.topHalf - specification.baseHalf) * t;
}

/** One crossarm on one side: two top chords, a bottom chord, the tip tie, a diagonal, the insulator. */
function arm(truss: Truss, s: PylonSpec, level: ArmLevel, side: 1 | -1): void {
  const body = halfAt(s, level.y);
  const depth = Math.min(0.12, level.reach * 0.32);
  const root = { x: side * body, y: level.y, z: 0 };
  const tip = { x: side * level.reach, y: level.y, z: 0 };
  const rootLow = { x: side * body, y: level.y - depth, z: 0 };
  const tipLow = { x: side * level.reach, y: level.y - depth * 0.3, z: 0 };
  const chordZ = body * 0.75;
  truss.bar({ ...root, z: chordZ }, { ...tip, z: chordZ * 0.5 }, s.member.chord);
  truss.bar({ ...root, z: -chordZ }, { ...tip, z: -chordZ * 0.5 }, s.member.chord);
  truss.bar(rootLow, tipLow, s.member.chord);
  truss.bar(tip, tipLow, s.member.brace);
  truss.bar(rootLow, { x: side * (body + level.reach) * 0.5, y: level.y, z: 0 }, s.member.brace);
  for (const hang of level.hangs) {
    const at = { x: side * hang, y: level.y - 0.005, z: 0 };
    const size = s.member.brace * 1.5;
    if (s.doubleStrings) {
      // Two strings in parallel: the wide, short skirt of a 220/400 kV set
      // reads at 18 km where a single thin bar is lost in the haze.
      const spread = Math.max(0.012, s.insulator * 0.35);
      truss.bar(
        { ...at, z: spread, y: at.y },
        { x: at.x, y: level.y - s.insulator, z: 0 },
        size,
        GLASS_TINT,
      );
      truss.bar(
        { ...at, z: -spread, y: at.y },
        { x: at.x, y: level.y - s.insulator, z: 0 },
        size,
        GLASS_TINT,
      );
      continue;
    }
    truss.bar(at, { x: at.x, y: level.y - s.insulator, z: 0 }, size, GLASS_TINT);
  }
}

/** Foundation pad size relative to the base half-width, and its lift off the relief [km]. */
const PAD_SCALE = 1.35;
const PAD_LIFT = 0.006;

/**
 * The near geometry draws close enough that a member covers a pixel or more,
 * so its steel is 25 % heavier there: the lattice reads as steel, not as a
 * hairline (the far geometry already thickens its dozen members, × 1,6–1,8).
 */
const NEAR_MEMBER_SCALE = 1.25;

function heavierMember(member: PylonSpec["member"]): PylonSpec["member"] {
  return {
    leg: member.leg * NEAR_MEMBER_SCALE,
    brace: member.brace * NEAR_MEMBER_SCALE,
    chord: member.chord * NEAR_MEMBER_SCALE,
  };
}

/** The near geometry: the full lattice of the tower on its foundation pad. */
export function nearPylonGeometry(specification: PylonSpec): THREE.BufferGeometry {
  const s: PylonSpec = { ...specification, member: heavierMember(specification.member) };
  const truss = new Truss();
  truss.slab(0, 0, s.baseHalf * PAD_SCALE, s.baseHalf * PAD_SCALE, PAD_LIFT);
  for (let i = 0; i + 1 < s.panels.length; i++) {
    const lowerY = s.panels[i] ?? 0;
    const upperY = s.panels[i + 1] ?? s.height;
    panel(
      truss,
      halfAt(s, lowerY),
      lowerY,
      halfAt(s, upperY),
      upperY,
      s.member.leg,
      s.member.brace,
    );
  }
  for (const level of s.arms) {
    arm(truss, s, level, -1);
    arm(truss, s, level, 1);
  }
  const bodyTop = s.panels[s.panels.length - 1] ?? s.height;
  const corners = square(s.topHalf, bodyTop);
  for (const peak of s.peaks) {
    const apex = { x: peak.x, y: peak.y, z: 0 };
    const own = corners.filter((c) => Math.sign(c.x) === Math.sign(peak.x) || peak.x === 0);
    for (const corner of own) truss.bar(corner, apex, s.member.brace);
    if (peak.carries === "conductor") {
      truss.bar(
        apex,
        { x: peak.x, y: peak.y - s.insulator, z: 0 },
        s.member.brace * 1.5,
        GLASS_TINT,
      );
    }
  }
  if (s.peaks.length === 2) {
    const [a, b] = s.peaks;
    if (a && b) truss.bar({ x: a.x, y: a.y, z: 0 }, { x: b.x, y: b.y, z: 0 }, s.member.brace);
  }
  return truss.build(`grid-pylon-${s.type}-near`);
}

/** The far geometry: legs, one tie, arms as single members, the peaks. */
export function farPylonGeometry(s: PylonSpec): THREE.BufferGeometry {
  const truss = new Truss();
  const bodyTop = s.panels[s.panels.length - 1] ?? s.height;
  const lower = square(s.baseHalf, 0);
  const upper = square(s.topHalf, bodyTop);
  const legSize = s.member.leg * 1.6;
  for (let i = 0; i < 4; i++) {
    const a = lower[i];
    const b = upper[i];
    if (a && b) truss.bar(a, b, legSize);
  }
  truss.ring(upper, legSize);
  for (const level of s.arms) {
    truss.bar(
      { x: -level.reach, y: level.y, z: 0 },
      { x: level.reach, y: level.y, z: 0 },
      s.member.chord * 1.8,
    );
  }
  for (const peak of s.peaks) {
    truss.bar({ x: peak.x * 0.5, y: bodyTop, z: 0 }, { x: peak.x, y: peak.y, z: 0 }, legSize);
  }
  return truss.build(`grid-pylon-${s.type}-far`);
}

/**
 * The mid-upgrade ghost: an unbuilt cage of the target tower — corner poles,
 * hatch rings and the arm bars of every level, nothing else. It is drawn as a
 * wireframe with hatched (dashed) bands, so a ghost can never be taken for a
 * finished pylon beside the live line.
 */
export function ghostPylonGeometry(s: PylonSpec): THREE.BufferGeometry {
  const truss = new Truss();
  const bodyTop = s.panels[s.panels.length - 1] ?? s.height;
  const hatch = Math.max(0.02, s.baseHalf * 0.2);
  const lower = square(s.baseHalf, 0.01);
  const upper = square(s.topHalf, bodyTop);
  for (let i = 0; i < 4; i++) {
    const a = lower[i];
    const b = upper[i];
    if (a && b) truss.bar(a, b, hatch, GHOST_TINT);
  }
  const bands = 5;
  for (let i = 1; i <= bands; i++) {
    const y = (bodyTop * i) / (bands + 1);
    truss.ring(square(halfAt(s, y), y), hatch * 1.5, GHOST_HATCH_TINT);
  }
  for (const level of s.arms) {
    truss.bar(
      { x: -level.reach, y: level.y, z: 0 },
      { x: level.reach, y: level.y, z: 0 },
      hatch * 1.6,
      GHOST_TINT,
    );
    for (const hang of level.hangs) {
      truss.bar(
        { x: -hang, y: level.y, z: 0 },
        { x: -hang, y: bodyTop * 0.1, z: 0 },
        hatch,
        GHOST_HATCH_TINT,
      );
      truss.bar(
        { x: hang, y: level.y, z: 0 },
        { x: hang, y: bodyTop * 0.1, z: 0 },
        hatch,
        GHOST_HATCH_TINT,
      );
    }
  }
  for (const peak of s.peaks) {
    truss.bar(
      { x: peak.x * 0.5, y: bodyTop, z: 0 },
      { x: peak.x, y: peak.y, z: 0 },
      hatch,
      GHOST_TINT,
    );
  }
  return truss.build(`grid-pylon-${s.type}-ghost`);
}

/**
 * The construction head: scaffolding around the last erected tower — a caged
 * work platform up the body and a gin pole with a jib above it. Amber hazard
 * paint (its own vertex colour) so the head is the one structure that reads
 * as "not finished yet" by day and by night; the crane itself is effects'.
 */
export function constructionMarkerGeometry(s: PylonSpec): THREE.BufferGeometry {
  const truss = new Truss();
  const bodyTop = s.panels[s.panels.length - 1] ?? s.height;
  const cage = s.baseHalf * 1.9;
  const pole = Math.max(0.02, s.member.brace * 1.3);
  const corners = square(cage, 0.01);
  const top = square(cage * 0.86, bodyTop * 1.12);
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = top[i];
    if (a && b) truss.bar(a, b, pole, MARKING_TINT);
  }
  for (const share of [0.34, 0.62, 0.9]) {
    truss.ring(square(cage * (1 - share * 0.12), bodyTop * share), pole * 1.1, MARKING_TINT);
  }
  const front = square(cage, 0.01);
  const frontTop = square(cage * 0.86, bodyTop * 1.12);
  for (const i of [0, 3]) {
    const a = front[i];
    const b = frontTop[3 - i];
    if (a && b) truss.bar(a, b, pole * 0.8, MARKING_TINT);
  }
  const mastTop = s.height * 1.32;
  truss.bar({ x: 0, y: bodyTop, z: 0 }, { x: 0, y: mastTop, z: 0 }, pole * 1.2, MARKING_TINT);
  truss.bar(
    { x: 0, y: mastTop, z: 0 },
    { x: Math.max(0.25, s.baseHalf * 2.4), y: mastTop * 0.93, z: 0 },
    pole,
    MARKING_TINT,
  );
  return truss.build(`grid-pylon-${s.type}-head`);
}

/** A lattice column of a portal: four legs with X bracing in two panels and a tie. */
function column(truss: Truss, x: number, height: number, half: number, leg: number, brace: number) {
  const shift = (points: Point[]): Point[] => points.map((p) => ({ ...p, x: p.x + x }));
  const mid = height * 0.5;
  const rings = [
    shift(square(half, 0)),
    shift(square(half * 0.85, mid)),
    shift(square(half * 0.7, height)),
  ];
  for (let r = 0; r + 1 < rings.length; r++) {
    const lower = rings[r];
    const upper = rings[r + 1];
    if (!lower || !upper) continue;
    for (let i = 0; i < 4; i++) {
      const a = lower[i];
      const b = upper[i];
      const c = lower[(i + 1) % 4];
      const d = upper[(i + 1) % 4];
      if (!a || !b || !c || !d) continue;
      truss.bar(a, b, leg);
      truss.bar(a, d, brace);
      truss.bar(c, b, brace);
    }
    truss.ring(upper, brace);
  }
}

/**
 * The terminal portal (substation gantry): two lattice columns, a truss beam
 * at the type's conductor height with one dead-end string per phase, and a
 * short lightning mast for the earth wires. Local +Z faces the line.
 */
export function portalGeometry(specification: PylonSpec): THREE.BufferGeometry {
  const s: PylonSpec = { ...specification, member: heavierMember(specification.member) };
  const p = s.portal;
  const truss = new Truss();
  const columnHeight = p.beamY + 0.1;
  const columnHalf = Math.max(0.035, s.baseHalf * 0.45);
  // One apron under the whole gantry: the switchyard's gravel and concrete.
  truss.slab(0, 0, p.halfWidth + columnHalf * 2, columnHalf * 3, PAD_LIFT);
  column(truss, -p.halfWidth, columnHeight, columnHalf, s.member.leg, s.member.brace);
  column(truss, p.halfWidth, columnHeight, columnHalf, s.member.leg, s.member.brace);
  const depth = 0.05;
  const z = columnHalf * 0.6;
  truss.bar({ x: -p.halfWidth, y: p.beamY, z }, { x: p.halfWidth, y: p.beamY, z }, s.member.chord);
  truss.bar(
    { x: -p.halfWidth, y: p.beamY, z: -z },
    { x: p.halfWidth, y: p.beamY, z: -z },
    s.member.chord,
  );
  truss.bar(
    { x: -p.halfWidth, y: p.beamY - depth, z: 0 },
    { x: p.halfWidth, y: p.beamY - depth, z: 0 },
    s.member.chord,
  );
  const bays = Math.max(2, Math.round((2 * p.halfWidth) / 0.12));
  for (let i = 0; i <= bays; i++) {
    const x = -p.halfWidth + (2 * p.halfWidth * i) / bays;
    const next = -p.halfWidth + (2 * p.halfWidth * Math.min(bays, i + 1)) / bays;
    truss.bar({ x, y: p.beamY, z }, { x, y: p.beamY - depth, z: 0 }, s.member.brace);
    truss.bar({ x, y: p.beamY, z: -z }, { x, y: p.beamY - depth, z: 0 }, s.member.brace);
    if (i < bays)
      truss.bar({ x, y: p.beamY - depth, z: 0 }, { x: next, y: p.beamY, z }, s.member.brace);
  }
  for (const a of p.attachments) {
    if (a.earth) continue;
    truss.bar(
      { x: a.x, y: a.y, z: 0 },
      { x: a.x, y: a.y, z: p.insulator },
      s.member.brace * 1.4,
      GLASS_TINT,
    );
  }
  const earth = p.attachments.filter((a) => a.earth);
  if (earth.length > 0) {
    const top = (earth[0]?.y ?? p.beamY + 0.22) + 0.02;
    truss.bar({ x: 0, y: p.beamY, z: 0 }, { x: 0, y: top, z: 0 }, s.member.leg);
    truss.bar({ x: -0.02, y: p.beamY, z: 0.04 }, { x: 0, y: top - 0.08, z: 0 }, s.member.brace);
    truss.bar({ x: 0.02, y: p.beamY, z: -0.04 }, { x: 0, y: top - 0.08, z: 0 }, s.member.brace);
    const left = earth[0];
    const right = earth[earth.length - 1];
    if (left && right) {
      truss.bar({ x: left.x, y: left.y, z: 0 }, { x: right.x, y: right.y, z: 0 }, s.member.brace);
    }
  }
  return truss.build(`grid-portal-${s.type}`);
}

export interface PylonGeometries {
  near: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  portal: THREE.BufferGeometry;
  ghost: THREE.BufferGeometry;
  marker: THREE.BufferGeometry;
}

export function buildPylonGeometries(): Record<LineType, PylonGeometries> {
  const out = {} as Record<LineType, PylonGeometries>;
  for (const type of LINE_TYPES) {
    const s = PYLON_SPECS[type];
    out[type] = {
      near: nearPylonGeometry(s),
      far: farPylonGeometry(s),
      portal: portalGeometry(s),
      ghost: ghostPylonGeometry(s),
      marker: constructionMarkerGeometry(s),
    };
  }
  return out;
}

export function disposePylonGeometries(geometries: Record<LineType, PylonGeometries>): void {
  for (const type of LINE_TYPES) {
    const set = geometries[type];
    set.near.dispose();
    set.far.dispose();
    set.portal.dispose();
    set.ghost.dispose();
    set.marker.dispose();
  }
}

/** Triangle count of a geometry — the budget line of PROGRESS.md. */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
}
