// Site plans of the four technologies (docs/08 §2–§3, ARCHITECTURE.md §6,
// §12): one deterministic layout per plant from one seeded stream, so the
// same seed builds the same site on any machine. Every block gets one unit —
// a dome with its turbine-hall bay, a boiler house with its stack, an HRSG
// with its stack, a package unit — in a row along the site's own axis; the
// structures a plant shares (cooling towers, coal yard, condenser bank,
// switchyard, offices, fence, masts) stand around the row. The pad is an
// ellipse sized by the plan's extent, never wider than the terrain's flat
// building pad (PLANT_SITE_KM / 2 = PAD_FLAT_KM), so a site always stands on
// one plane at the hex centre's height.
//
// Real references: Temelín / Dukovany (nuclear), Bełchatów / Kozienice
// (coal), Płock / Stalowa Wola (CCGT), LM6000 / TM2500 peaker yards (OCGT).
// Local frame: +x along the row, +z the front (offices, switchyard), y up.

import * as THREE from "three";
import type { WorldPlant } from "../../bridge/worldScene";
import { PLANT_SITE_KM } from "../core/exaggeration";
import type { Rng } from "../core/prng";
import { SIZE, type Archetype } from "./geometry";

export type PlumeKind = "smoke" | "vapour" | "wisp" | "heat";

export interface PartInstance {
  archetype: Archetype;
  /** World matrix of the instance. */
  matrix: THREE.Matrix4;
  /** Block the part belongs to; −1 for structures shared by the plant. */
  block: number;
  /** Albedo multiplier — weathering varies per instance. */
  tint: [number, number, number];
}

export interface PlumeSource {
  /** World position of the mouth. */
  x: number;
  y: number;
  z: number;
  kind: PlumeKind;
  /** Block it belongs to; −1 for a cooling tower (plant-level). */
  block: number;
  /** Mouth radius [km] — the base size of a puff. */
  radius: number;
}

export interface LightInstance {
  x: number;
  y: number;
  z: number;
  /** Diameter [km]. */
  size: number;
  /** 0..1 — blink phase (aviation) or brightness variation (floods). */
  phase: number;
  /** 1 for a cool white pool (dome and tower bases), 0 for the warm yard lamps. */
  cool?: number;
}

export interface BlockAnchor {
  index: number;
  x: number;
  y: number;
  z: number;
}

export interface PlantLayout {
  id: string;
  centre: { x: number; y: number; z: number };
  yaw: number;
  /** Ellipse semi-axes of the pad [km], in the site frame. */
  pad: { rx: number; rz: number };
  /** Site-halo diameter [km] — the warm dome of the strategic night read. */
  haloSize: number;
  parts: PartInstance[];
  plumes: PlumeSource[];
  aviation: LightInstance[];
  floods: LightInstance[];
  /** One state glow per block over its unit — the legibility floor of docs/08 §3. */
  glows: (LightInstance & { block: number })[];
  blocks: BlockAnchor[];
}

/** Height over the pad and diameter [km] of a block's state glow, per technology. */
const GLOW: Record<WorldPlant["tech"], { y: number; size: number }> = {
  nuclear: { y: 1.3, size: 0.5 },
  coal: { y: 2.15, size: 0.5 },
  ccgt: { y: 0.75, size: 0.32 },
  ocgt: { y: 0.38, size: 0.2 },
};

interface LocalPart {
  archetype: Archetype;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  block: number;
  /** A full local rotation overrides `yaw` (inclined conveyor). */
  quaternion?: THREE.Quaternion;
}

interface LocalPoint {
  x: number;
  y: number;
  z: number;
}

interface Plan {
  parts: LocalPart[];
  plumes: (LocalPoint & { kind: PlumeKind; block: number; radius: number })[];
  aviation: LocalPoint[];
  /** Extra ground pools the plan wants beyond the perimeter ring (coal yard, dome feet). */
  floods: (LocalPoint & { size: number; cool?: number })[];
  blocks: (LocalPoint & { index: number })[];
  /** Extent of the plan in the local frame [km]. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Maximum semi-axis of a pad — the terrain's flat building pad. */
const PAD_MAX_KM = PLANT_SITE_KM / 2;
const PAD_MIN_KM = 1.5;
/** Apron around the outermost structure [km]. */
const PAD_MARGIN_KM = 0.55;
/** The pad is lifted a little over the terrain so it never z-fights the ground. */
export const PAD_LIFT_KM = 0.03;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

class PlanBuilder implements Plan {
  parts: LocalPart[] = [];
  plumes: Plan["plumes"] = [];
  aviation: LocalPoint[] = [];
  floods: Plan["floods"] = [];
  blocks: Plan["blocks"] = [];
  minX = 0;
  maxX = 0;
  minZ = 0;
  maxZ = 0;

  part(
    archetype: Archetype,
    x: number,
    z: number,
    options: Partial<Omit<LocalPart, "archetype" | "x" | "z">> & { w?: number; d?: number } = {},
  ): void {
    const sx = options.sx ?? 1;
    const sz = options.sz ?? 1;
    this.parts.push({
      archetype,
      x,
      y: options.y ?? 0,
      z,
      yaw: options.yaw ?? 0,
      sx,
      sy: options.sy ?? 1,
      sz,
      block: options.block ?? -1,
      quaternion: options.quaternion,
    });
    // Extent by the archetype's nominal half sizes (rotation ignored: an upper bound).
    const half = Math.max((options.w ?? 0) * sx, (options.d ?? 0) * sz) / 2;
    this.minX = Math.min(this.minX, x - half);
    this.maxX = Math.max(this.maxX, x + half);
    this.minZ = Math.min(this.minZ, z - half);
    this.maxZ = Math.max(this.maxZ, z + half);
  }
}

/** The switchyard: a grid of portals with the step-up transformers in front of it. */
function switchyard(plan: PlanBuilder, x0: number, z0: number, cols: number, rows: number): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      plan.part("portal", x0 + c * 1.1, z0 - r * 0.7, { w: 1.0, d: 0.05 });
    }
  }
  const transformers = Math.max(2, cols);
  for (let i = 0; i < transformers; i++) {
    plan.part("transformer", x0 - 0.35 + i * 0.5, z0 + 0.55, { w: 0.24, d: 0.34 });
  }
}

/** Unit width scale for a block's rung: 0,55 for the smallest, 1 for the largest. */
function rungScale(plant: WorldPlant, mw: number): number {
  // footprint = capacity / (6 × xlarge) unless clamped at 0,15 — then the plant's own
  // largest block stands in for the ladder's top rung.
  const largest =
    plant.footprint > 0.1501
      ? plant.capacityMw / (6 * plant.footprint)
      : Math.max(1, ...plant.blocks.map((block) => block.mw));
  return clamp(0.55 + 0.45 * Math.sqrt(mw / Math.max(1, largest)), 0.55, 1);
}

function nuclearPlan(plant: WorldPlant): Plan {
  const plan = new PlanBuilder();
  const n = Math.max(1, plant.blocks.length);
  const pitch = 1.45;
  const xs = plant.blocks.map((_, i) => (i - (n - 1) / 2) * pitch);
  plant.blocks.forEach((block, i) => {
    const w = rungScale(plant, block.mw);
    const x = xs[i]!;
    plan.part("dome", x, 0.55, { sx: w, sz: w, block: i, w: SIZE.domeRadius * 2 });
    // The turbine hall tiles into one long building along the row of domes.
    plan.part("hallConcrete", x, -0.65, {
      sx: pitch / SIZE.hall.w,
      sz: 1.15,
      block: i,
      w: SIZE.hall.w,
      d: SIZE.hall.d,
    });
    plan.part("aux", x + 0.62 * w, 1.42, { sx: 0.7, sy: 0.9, sz: 0.7, block: i, w: SIZE.aux.w });
    plan.blocks.push({ index: i, x, y: 0, z: 0.55 });
    // A cool pool at each containment's foot: the domes stay the mass of the
    // site at night instead of the perimeter floodlights alone.
    plan.floods.push({ x, y: 0, z: 1.15, size: 0.42, cool: 1 });
  });
  // Two natural-draught cooling towers behind the hall.
  const towerZ = -2.7;
  for (const sx of [-1, 1]) {
    const x = sx * 1.18;
    plan.part("tower", x, towerZ, { w: SIZE.towerBase * 2 });
    plan.plumes.push({ x, y: SIZE.towerHeight, z: towerZ, kind: "vapour", block: -1, radius: 0.7 });
    plan.aviation.push({ x, y: SIZE.towerHeight + 0.03, z: towerZ });
    plan.floods.push({ x, y: 0, z: towerZ + 0.95, size: 0.5, cool: 1 });
  }
  const east = xs[n - 1]! + pitch / 2 + 0.9;
  switchyard(plan, east, -0.55, 2, 2);
  const west = xs[0]! - pitch / 2 - 0.6;
  plan.part("admin", west - 0.3, 1.4, { yaw: Math.PI / 2, w: SIZE.admin.w, d: SIZE.admin.d });
  plan.part("aux", west - 0.4, -0.2, { sx: 0.8, sz: 0.9, w: SIZE.aux.w });
  return plan;
}

function coalPlan(plant: WorldPlant): Plan {
  const plan = new PlanBuilder();
  const n = Math.max(1, plant.blocks.length);
  const pitch = 1.6;
  const xs = plant.blocks.map((_, i) => (i - (n - 1) / 2) * pitch);
  plant.blocks.forEach((block, i) => {
    const w = rungScale(plant, block.mw);
    const x = xs[i]!;
    plan.part("boiler", x, 0, { sx: w, sz: w, block: i, w: SIZE.boiler.w, d: SIZE.boiler.d * 1.5 });
    const stackX = x + 0.32 * w;
    const stackZ = -1.05;
    plan.part("stackTall", stackX, stackZ, { block: i, w: SIZE.stackTallRadius * 2 });
    plan.plumes.push({
      x: stackX,
      y: SIZE.stackTallHeight,
      z: stackZ,
      kind: "smoke",
      block: i,
      // Wider than the stack mouth: a soot plume spreads as it leaves the lip,
      // and the puffs must overlap into one column from the first metres. The
      // column is the coal plant's map signal by day, so it carries width.
      radius: SIZE.stackTallRadius * 2.4,
    });
    plan.aviation.push({ x: stackX, y: SIZE.stackTallHeight + 0.03, z: stackZ });
    plan.aviation.push({
      x: stackX + SIZE.stackTallRadius * 0.8,
      y: SIZE.stackTallHeight * 0.62,
      z: stackZ,
    });
    plan.part("hallBrick", x, 1.5, {
      sx: pitch / SIZE.hall.w,
      sz: 1.05,
      block: i,
      w: SIZE.hall.w,
      d: SIZE.hall.d,
    });
    plan.blocks.push({ index: i, x, y: 0, z: 0 });
  });
  // One cooling tower west of the row; a second one east for four blocks and up.
  const towers = n >= 4 ? [-1, 1] : [-1];
  for (const side of towers) {
    const x = side < 0 ? xs[0]! - pitch / 2 - 1.35 : xs[n - 1]! + pitch / 2 + 1.35;
    const z = -0.8;
    plan.part("tower", x, z, { w: SIZE.towerBase * 2 });
    plan.plumes.push({ x, y: SIZE.towerHeight, z, kind: "vapour", block: -1, radius: 0.7 });
    plan.aviation.push({ x, y: SIZE.towerHeight + 0.03, z });
  }
  // The coal yard stands on the WEST flank, beside the row and in front of the
  // stacks, so the game's south camera reads the piles, their floodlighting and
  // the gallery climbing to the bunkers. Behind the reheaters (the first pass)
  // the yard was invisible from every preset. Piles run along z — the long axis
  // faces the camera instead of turning edge-on to it.
  const piles = Math.min(3, 1 + Math.ceil(n / 2));
  const pileScale = clamp((n * pitch + 0.4) / SIZE.stockpile.l, 0.8, 1.7);
  const pileLength = SIZE.stockpile.l * pileScale; // along z, after the yaw
  const yardX = xs[0]! - pitch / 2 - 1.95;
  const yardZ = 0.5;
  for (let j = 0; j < piles; j++) {
    const x = yardX - j * 0.85;
    plan.part("stockpile", x, yardZ, {
      yaw: Math.PI / 2,
      sz: pileScale,
      // The extent bound cannot see the yaw: give it the long axis on both sides.
      w: SIZE.stockpile.l,
      d: pileLength,
    });
    // The yard works in shifts: floodlights over the piles (the piles' own
    // sheen is emitted in materials.ts) and lamps on the gallery below.
    plan.floods.push(
      { x, y: 0, z: yardZ - pileLength / 2 + 0.4, size: 0.3 },
      { x, y: 0, z: yardZ + pileLength / 2 - 0.4, size: 0.3 },
      { x: x - 0.55, y: 0, z: yardZ, size: 0.26 },
    );
  }
  plan.floods.push({ x: xs[0]!, y: 0, z: -1.0, size: 0.24 });
  const from = { x: yardX + 0.2, y: 0.28, z: yardZ - 0.3 };
  const to = { x: xs[0]!, y: SIZE.boiler.h * 0.85, z: -0.35 };
  const run = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
  const length = run.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    run.normalize(),
  );
  plan.parts.push({
    archetype: "conveyor",
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2,
    yaw: 0,
    sx: 1,
    sy: 1,
    sz: length / SIZE.conveyorLength,
    block: -1,
    quaternion,
  });
  const east = (n >= 4 ? xs[n - 1]! + pitch / 2 + 2.7 : xs[n - 1]! + pitch / 2 + 0.9) + 0.2;
  switchyard(plan, east, 1.0, 2, 2);
  // Offices south of the yard, clear of the piles.
  plan.part("admin", xs[0]! - pitch / 2 - 0.7, yardZ + pileLength / 2 + 0.9, {
    w: SIZE.admin.w,
    d: SIZE.admin.d,
  });
  plan.part("aux", 0.9 + xs[n - 1]!, -2.6, { sx: 0.8, sz: 0.8, w: SIZE.aux.w });
  return plan;
}

function ccgtPlan(plant: WorldPlant): Plan {
  const plan = new PlanBuilder();
  const n = Math.max(1, plant.blocks.length);
  const pitch = 1.05;
  const xs = plant.blocks.map((_, i) => (i - (n - 1) / 2) * pitch);
  plant.blocks.forEach((block, i) => {
    const w = rungScale(plant, block.mw);
    const x = xs[i]!;
    plan.part("hrsg", x, -0.35, {
      sx: w,
      sz: w,
      block: i,
      w: SIZE.hrsg.w * 1.4,
      d: SIZE.hrsg.d * 2.3,
    });
    const stackZ = -1.1;
    plan.part("stackMid", x, stackZ, { block: i, w: SIZE.stackMidRadius * 2 });
    plan.plumes.push({
      x,
      y: SIZE.stackMidHeight,
      z: stackZ,
      kind: "heat",
      block: i,
      radius: SIZE.stackMidRadius * 0.35,
    });
    plan.aviation.push({ x, y: SIZE.stackMidHeight + 0.03, z: stackZ });
    plan.part("hallSteel", x, 1.6, {
      sx: pitch / SIZE.hall.w,
      sz: 1.0,
      block: i,
      w: SIZE.hall.w,
      d: SIZE.hall.d,
    });
    plan.blocks.push({ index: i, x, y: 0, z: -0.35 });
  });
  // Air-cooled condenser banks east of the hall, one per two blocks.
  const banks = Math.ceil(n / 2);
  const east = xs[n - 1]! + pitch / 2 + 0.95;
  for (let j = 0; j < banks; j++) {
    plan.part("acc", east + j * 1.35, 1.5, { w: SIZE.acc.w, d: SIZE.acc.d });
  }
  // The gas pipe rack runs along the west edge; the metering station at its end.
  const west = xs[0]! - pitch / 2 - 0.75;
  plan.part("pipeRack", west, -0.5, { yaw: Math.PI / 2, w: 0.2, d: SIZE.pipeRackLength });
  plan.part("aux", west - 0.1, -2.0, { sx: 0.6, sy: 0.6, sz: 0.6, w: SIZE.aux.w });
  switchyard(plan, xs[0]! - 0.3, 3.0, Math.max(2, Math.min(3, n)), 1);
  plan.part("admin", west - 0.2, 2.0, { yaw: Math.PI / 2, w: SIZE.admin.w, d: SIZE.admin.d });
  return plan;
}

function ocgtPlan(plant: WorldPlant): Plan {
  const plan = new PlanBuilder();
  const n = Math.max(1, plant.blocks.length);
  const pitch = 0.55;
  const xs = plant.blocks.map((_, i) => (i - (n - 1) / 2) * pitch);
  plant.blocks.forEach((block, i) => {
    const w = rungScale(plant, block.mw);
    const x = xs[i]!;
    plan.part("package", x, 0, {
      sx: w,
      sz: w,
      block: i,
      w: SIZE.package.w * 1.4,
      d: SIZE.package.d * 1.4,
    });
    plan.plumes.push({
      x,
      y: SIZE.packageStackHeight,
      z: (SIZE.package.d / 2 - 0.08) * w,
      kind: "heat",
      block: i,
      radius: 0.06,
    });
    plan.part("transformer", x, 0.8, { w: 0.24, d: 0.34 });
    plan.blocks.push({ index: i, x, y: 0, z: 0 });
  });
  const rackScale = clamp((n * pitch + 0.9) / SIZE.pipeRackLength, 0.5, 1.5);
  plan.part("pipeRack", 0, -0.8, { sx: rackScale, w: SIZE.pipeRackLength, d: 0.2 });
  plan.part("portal", -0.55, 1.35, { w: 1.0, d: 0.05 });
  plan.part("portal", 0.55, 1.35, { w: 1.0, d: 0.05 });
  plan.part("aux", xs[0]! - 0.95, 0.7, { sx: 0.5, sy: 0.55, sz: 0.5, w: SIZE.aux.w });
  plan.part("admin", xs[n - 1]! + 0.95, 0.9, {
    sx: 0.55,
    sz: 0.6,
    w: SIZE.admin.w,
    d: SIZE.admin.d,
  });
  return plan;
}

const PLANS: Record<WorldPlant["tech"], (plant: WorldPlant) => Plan> = {
  nuclear: nuclearPlan,
  coal: coalPlan,
  ccgt: ccgtPlan,
  ocgt: ocgtPlan,
};

/** Masts and a fence around the pad's ellipse, floodlight pools inside it. */
function perimeter(
  plan: PlanBuilder,
  rx: number,
  rz: number,
  rng: Rng,
  floods: LightInstance[],
  tech: WorldPlant["tech"],
): void {
  const fenceSegments = 28;
  const fenceR = 0.93;
  for (let i = 0; i < fenceSegments; i++) {
    const a0 = (i / fenceSegments) * Math.PI * 2;
    const a1 = ((i + 1) / fenceSegments) * Math.PI * 2;
    const x0 = rx * fenceR * Math.cos(a0);
    const z0 = rz * fenceR * Math.sin(a0);
    const x1 = rx * fenceR * Math.cos(a1);
    const z1 = rz * fenceR * Math.sin(a1);
    const dx = x1 - x0;
    const dz = z1 - z0;
    plan.parts.push({
      archetype: "fence",
      x: (x0 + x1) / 2,
      y: 0,
      z: (z0 + z1) / 2,
      yaw: Math.atan2(-dz, dx),
      sx: Math.hypot(dx, dz),
      sy: 1,
      sz: 1,
      block: -1,
    });
  }
  const masts = tech === "ocgt" ? 6 : 10;
  for (let i = 0; i < masts; i++) {
    const a = ((i + 0.5) / masts) * Math.PI * 2;
    const x = rx * 0.86 * Math.cos(a);
    const z = rz * 0.86 * Math.sin(a);
    plan.parts.push({ archetype: "mast", x, y: 0, z, yaw: -a, sx: 1, sy: 1, sz: 1, block: -1 });
    floods.push({ x, y: 0, z, size: 0.36, phase: rng.next() });
  }
  const pools = tech === "ocgt" ? 3 : 5 + Math.round(rx / 2);
  for (let i = 0; i < pools; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.range(0.05, 0.7));
    floods.push({
      x: rx * r * Math.cos(a),
      y: 0,
      z: rz * r * Math.sin(a),
      size: rng.range(0.2, 0.32),
      phase: rng.next(),
    });
  }
}

/**
 * Lays out one plant: its plan in the site frame, rotated by a per-plant yaw
 * from the stream and stood on the pad height of the hex centre.
 */
export function layoutPlant(
  plant: WorldPlant,
  centre: { x: number; z: number },
  rng: Rng,
  heightAt: (x: number, z: number) => number,
): PlantLayout {
  const plan = PLANS[plant.tech](plant) as PlanBuilder;
  // The front (offices, switchyard) faces south, where every close preset stands,
  // so the tall structures at the back never hide the units; ±30° of variety.
  const yaw = rng.range(-0.55, 0.55);
  const rx = clamp(Math.max(-plan.minX, plan.maxX) + PAD_MARGIN_KM, PAD_MIN_KM, PAD_MAX_KM);
  const rz = clamp(Math.max(-plan.minZ, plan.maxZ) + PAD_MARGIN_KM, PAD_MIN_KM, PAD_MAX_KM);
  const floodsLocal: LightInstance[] = plan.floods.map((light) => ({
    ...light,
    phase: rng.next(),
  }));
  perimeter(plan, rx, rz, rng, floodsLocal, plant.tech);

  const y = Math.max(0, heightAt(centre.x, centre.z)) + PAD_LIFT_KM;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const toWorld = (p: LocalPoint): { x: number; y: number; z: number } => ({
    x: centre.x + p.x * cosY + p.z * sinY,
    y: y + p.y,
    z: centre.z - p.x * sinY + p.z * cosY,
  });

  const siteRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const parts: PartInstance[] = [];
  // The pad first, so it draws under everything of its own site.
  position.set(centre.x, y, centre.z);
  scale.set(rx, 1, rz);
  parts.push({
    archetype: "pad",
    matrix: new THREE.Matrix4().compose(position, siteRotation, scale),
    block: -1,
    tint: [1, 1, 1],
  });
  for (const part of plan.parts) {
    const world = toWorld(part);
    position.set(world.x, world.y, world.z);
    if (part.quaternion) rotation.copy(siteRotation).multiply(part.quaternion);
    else
      rotation.copy(siteRotation).multiply(new THREE.Quaternion().setFromAxisAngle(up, part.yaw));
    scale.set(part.sx, part.sy, part.sz);
    const weather = 0.82 + 0.18 * rng.next();
    parts.push({
      archetype: part.archetype,
      matrix: new THREE.Matrix4().compose(position, rotation, scale),
      block: part.block,
      tint: [weather, weather * (0.98 + 0.02 * rng.next()), weather * (0.96 + 0.04 * rng.next())],
    });
  }
  const plumes: PlumeSource[] = plan.plumes.map((source) => ({
    ...toWorld(source),
    kind: source.kind,
    block: source.block,
    radius: source.radius,
  }));
  const aviation: LightInstance[] = plan.aviation.map((light) => ({
    ...toWorld(light),
    size: 0.05,
    phase: rng.next(),
  }));
  const floods: LightInstance[] = floodsLocal.map((light) => ({
    ...toWorld(light),
    size: light.size,
    phase: light.phase,
    cool: light.cool,
  }));
  const blocks: BlockAnchor[] = plan.blocks.map((anchor) => ({
    index: anchor.index,
    ...toWorld(anchor),
  }));
  const glowSpec = GLOW[plant.tech];
  const glows = plan.blocks.map((anchor) => ({
    ...toWorld({ x: anchor.x, y: glowSpec.y, z: anchor.z }),
    size: glowSpec.size,
    phase: rng.next(),
    block: anchor.index,
  }));
  return {
    id: plant.id,
    centre: { x: centre.x, y, z: centre.z },
    yaw,
    pad: { rx, rz },
    // The dome covers the built-up site, not the whole fenced pad: the halo
    // must sit ON the plant at map distance, not blur into its neighbours.
    haloSize: Math.max(rx, rz) * 2.0,
    parts,
    plumes,
    aviation,
    floods,
    glows,
    blocks,
  };
}
