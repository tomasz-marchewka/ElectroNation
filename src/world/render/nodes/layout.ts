// Site plans of the nodes layer: switchyard of a junction station, terminal of
// a border interconnection, and the staged ground of a construction site. One
// deterministic plan per object from one seeded stream (ARCHITECTURE.md §12),
// everything standing on the hex's flat building pad at its centre height so a
// site always sits on one plane (the terrain blends the pad out to 7 km).
//
// Junction: six hex sides, `slots / 6` bay positions per side around a 7 km
// gravel yard. A bay whose side carries a line end is strung — portal gantry,
// dead-end porcelain strings and a slack jumper out to where the grid's own
// terminal portal stands 4,5 km from the centre; the rest are bare steel. A
// dispatcher counts strung against bare bays at a closeup, and an all-strung
// junction is a dense ring of portals from the strategic view (docs/08 §3).
//
// Border: the terminal gantry faces `outward`, the metering hall and its yard
// stand behind it, and the foreign line runs off the board for 1,5 hex with
// towers every 8 km, its conductors dimming into the fog — the polyline effects
// pulse along runs from the foreign end to the portal.
//
// Site: progress picks the stage — cleared earth and stacked materials (0–0,3),
// foundations and the future object's steel skeleton growing with progress
// (0,3–0,7), then cladding and scaffolding (0,7–1) — and the crane hook sits at
// the tallest point for the effects module.

import * as THREE from "three";
import type {
  WorldBorder,
  WorldJunction,
  WorldLine,
  WorldScene,
  WorldSite,
} from "../../bridge/worldScene";
import type { TerrainProvider } from "../core/types";
import { hexToWorld, type AxialHex } from "../core/units";
import {
  FENCE,
  GANTRY,
  GANTRY_SCALE,
  INSULATOR,
  MAST_HEIGHT,
  PORTAL_BEAM_KM,
  WINDOW_BAND_KM,
  sitePeakKm,
  type Archetype,
} from "./geometry";
import {
  PAINT_TINT,
  PANEL_TINT,
  PORCELAIN_TINT,
  SLAB_TINT,
  CONCRETE_TINT,
  type Point,
} from "./lattice";
import type { Rng } from "../core/prng";

const DEG = Math.PI / 180;

/** Radius of the junction's bay ring [km] — inside the 4 km flat pad. */
const BAY_RADIUS_KM = 3;
/** Lateral spread of two bay positions on one side [km]. */
const BAY_SPREAD_KM = 1.1;
/** Radius of the busbar ring and the breaker row [km]. */
const BUSBAR_RADIUS_KM = 2.35;
const BREAKER_RADIUS_KM = 2.75;
/** Gravel yard and its fence [km]. */
const YARD_RADIUS_KM = 3.55;
const FENCE_RADIUS_KM = 3.72;
/** Floodlight masts around the yard. */
const MAST_RADIUS_KM = 3.3;
/** How far from the hex centre the grid's terminal portal stands [km] (grid/route). */
const GRID_PORTAL_KM = 4.5;
/** Conductor radius of a jumper, a busbar and a foreign-line span [km]. */
const JUMPER_RADIUS = 0.022;
const BUSBAR_RADIUS = 0.028;

export type GlowKind = "lamp" | "aviation" | "flow";

export interface GlowSpot {
  x: number;
  y: number;
  z: number;
  /** World size [km] of the billboard; a pixel floor is applied in the shader. */
  size: number;
  kind: GlowKind;
  /** Blink / flicker phase 0..1. */
  phase: number;
}

export interface PoolSpot {
  x: number;
  z: number;
  /** Diameter [km] of the light pool. */
  size: number;
}

export interface InstancePart {
  archetype: Archetype;
  matrix: THREE.Matrix4;
  tint: THREE.Color;
}

export interface HookSpec {
  name: string;
  x: number;
  y: number;
  z: number;
  userData: Record<string, unknown>;
}

export interface JunctionLayout {
  kind: "junction";
  junction: WorldJunction;
  centre: { x: number; y: number; z: number };
  parts: InstancePart[];
  lamps: GlowSpot[];
  aviation: GlowSpot[];
  pools: PoolSpot[];
  hook: HookSpec;
}

export interface BorderLayout {
  kind: "border";
  border: WorldBorder;
  centre: { x: number; y: number; z: number };
  parts: InstancePart[];
  lamps: GlowSpot[];
  pools: PoolSpot[];
  /** Terminal insulator and station emission spots — the flow read. */
  flow: GlowSpot[];
  /** Foreign end → terminal portal, with sag, for the effects pulse. */
  polyline: THREE.Vector3[];
  hook: HookSpec;
}

export interface SiteLayout {
  kind: "site";
  site: WorldSite;
  centre: { x: number; y: number; z: number };
  parts: InstancePart[];
  lamps: GlowSpot[];
  pools: PoolSpot[];
  crane: HookSpec;
  hook: HookSpec;
}

export type NodeLayout = JunctionLayout | BorderLayout | SiteLayout;

// --- small math helpers ---------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The six hex-side unit vectors of a flat-top hex, at 30° + 60°·i. */
function sideDir(side: number): { x: number; z: number } {
  const angle = (30 + 60 * side) * DEG;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/** Which of a hex's six sides a neighbouring hex sits on. */
export function sideOf(hex: AxialHex, neighbour: AxialHex): number {
  const a = hexToWorld(hex);
  const b = hexToWorld(neighbour);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  let best = 0;
  let bestDot = -Infinity;
  for (let side = 0; side < 6; side++) {
    const dir = sideDir(side);
    const dot = dir.x * ux + dir.z * uz;
    if (dot > bestDot) {
      bestDot = dot;
      best = side;
    }
  }
  return best;
}

const LINE_RANK = { lv: 0, mv: 1, hv: 2 } as const;

// --- the builder -----------------------------------------------------------------

/** Collects instances, glow spots, pools and hooks of one plan. */
class Builder {
  readonly parts: InstancePart[] = [];
  readonly lamps: GlowSpot[] = [];
  readonly aviation: GlowSpot[] = [];
  readonly pools: PoolSpot[] = [];
  readonly flow: GlowSpot[] = [];

  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();
  private readonly tint = new THREE.Color();

  /** One instance, uniformly scaled about its own origin, yawed about Y. */
  place(
    archetype: Archetype,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    scale = 1,
    tint: THREE.Color | readonly [number, number, number] = [1, 1, 1],
  ): void {
    this.euler.set(0, yaw, 0);
    this.quaternion.setFromEuler(this.euler);
    this.position.set(x, y, z);
    this.scale.setScalar(scale);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.parts.push({ archetype, matrix: this.matrix.clone(), tint: toColor(this.tint, tint) });
  }

  /** One instance with an explicit local scale (pads, tubes, fence panels). */
  placeScaled(
    archetype: Archetype,
    x: number,
    y: number,
    z: number,
    yaw: number,
    sx: number,
    sy: number,
    sz: number,
    tint: THREE.Color | readonly [number, number, number] = [1, 1, 1],
  ): void {
    this.euler.set(0, yaw, 0);
    this.quaternion.setFromEuler(this.euler);
    this.position.set(x, y, z);
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.parts.push({ archetype, matrix: this.matrix.clone(), tint: toColor(this.tint, tint) });
  }

  /** A straight tube between two points, radius in km. */
  tube(
    a: Point,
    b: Point,
    radius: number,
    tint: THREE.Color | readonly [number, number, number],
  ): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-4) return;
    this.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.quaternion.setFromUnitVectors(UP, TMP.set(dx / length, dy / length, dz / length));
    this.scale.set(radius, length, radius);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.parts.push({
      archetype: "tube",
      matrix: this.matrix.clone(),
      tint: toColor(this.tint, tint),
    });
  }

  /** A sagging conductor between two points, `segments` tubes long. */
  sag(
    a: Point,
    b: Point,
    sagKm: number,
    radius: number,
    tint: THREE.Color | readonly [number, number, number],
    segments = 4,
  ): Point[] {
    const points: Point[] = [a];
    let previous = a;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const next = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t - sagKm * 4 * t * (1 - t),
        z: a.z + (b.z - a.z) * t,
      };
      this.tube(previous, next, radius, tint);
      points.push(next);
      previous = next;
    }
    return points;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();

function toColor(
  target: THREE.Color,
  value: THREE.Color | readonly [number, number, number],
): THREE.Color {
  if (value instanceof THREE.Color) return value.clone();
  return target.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace).clone();
}

/**
 * Height of a site's pad plane: the highest terrain sample within the pad,
 * plus a hair. A flat pad laid at the centre height would be clipped by the
 * relief noise a few hundred metres out (the terrain's own building pad only
 * flattens the inner 4 km), so the plane rides the bumpiest sample instead.
 */
function padY(terrain: TerrainProvider, x: number, z: number, radiusKm = 3.2): number {
  let top = terrain.heightAt(x, z);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    top = Math.max(
      top,
      terrain.heightAt(x + Math.cos(angle) * radiusKm, z + Math.sin(angle) * radiusKm),
    );
    top = Math.max(
      top,
      terrain.heightAt(x + Math.cos(angle) * radiusKm * 0.5, z + Math.sin(angle) * radiusKm * 0.5),
    );
  }
  return top + 0.025;
}

/** Slight per-object weathering so two junctions never read as copies. */
function weather(rng: Rng): THREE.Color {
  const k = rng.range(0.82, 1);
  const warm = rng.range(-0.03, 0.03);
  return new THREE.Color(k + warm, k, k - warm * 0.5);
}

/**
 * The lit-window bands of a control building, on both long facades. The panes
 * are their own unlit archetype: the module paints dark glass by day and warm
 * lit windows at night, so a staffed station reads across the yard.
 */
function hallWindows(
  builder: Builder,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
): void {
  const front = { x: Math.sin(yaw), z: Math.cos(yaw) };
  for (const side of [1, -1]) {
    builder.placeScaled(
      "windows",
      x + front.x * 0.45 * scale * side,
      y + (0.24 - WINDOW_BAND_KM / 2) * scale,
      z + front.z * 0.45 * scale * side,
      side > 0 ? yaw : yaw + Math.PI,
      1.5 * scale,
      WINDOW_BAND_KM * scale,
      1,
    );
  }
}

/** A fence ring of `count` bays around a centre, plus its posts. */
function fenceRing(
  builder: Builder,
  x: number,
  z: number,
  y: number,
  radius: number,
  count: number,
): void {
  const side = (2 * Math.PI * radius) / count;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const mid = {
      x: x + Math.cos(angle) * radius,
      z: z + Math.sin(angle) * radius,
    };
    const yaw = angle + Math.PI / 2;
    builder.placeScaled("fencePanel", mid.x, y, mid.z, yaw, side, FENCE.height, FENCE.height);
    builder.placeScaled("fencePost", mid.x, y, mid.z, yaw, side, FENCE.height, FENCE.height);
  }
}

// --- junction -------------------------------------------------------------------

interface EndInfo {
  /** Ends of finished lines — bays that are strung with a conductor. */
  live: number;
  /** Ends of lines still under construction — bays equipped, not yet strung. */
  reserved: number;
  type: WorldLine["type"] | null;
  reservedType: WorldLine["type"] | null;
}

/**
 * The bay plan of a junction: line ends per hex side from `scene.lines` (a
 * passing line counts twice — 01 §3.3), `slots / 6` positions per side. An end
 * of an unbuilt line is a reserved bay: the engine has allocated the slot, the
 * conductor is not there yet — a dispatcher must see it as occupied (docs/08
 * §3: count free bays), so it gets apparatus and a dead-end string but no
 * jumper.
 */
function junctionEnds(junction: WorldJunction, scene: WorldScene): EndInfo[] {
  const ends: EndInfo[] = Array.from({ length: 6 }, () => ({
    live: 0,
    reserved: 0,
    type: null,
    reservedType: null,
  }));
  for (const line of scene.lines) {
    line.path.forEach((hex, index) => {
      if (hex.key !== junction.hex.key) return;
      const neighbours = [index > 0 ? line.path[index - 1] : null, line.path[index + 1] ?? null];
      for (const neighbour of neighbours) {
        if (!neighbour) continue;
        const side = sideOf(junction.hex, neighbour);
        const entry = ends[side];
        if (!entry) continue;
        const rank = LINE_RANK[line.type];
        if (line.built) {
          entry.live += 1;
          const current = entry.type ? LINE_RANK[entry.type] : -1;
          if (rank > current) entry.type = line.type;
        } else {
          entry.reserved += 1;
          const current = entry.reservedType ? LINE_RANK[entry.reservedType] : -1;
          if (rank > current) entry.reservedType = line.type;
        }
      }
    });
  }
  return ends;
}

/**
 * Compact digest of every line end landing on a junction — the part of the
 * layout that depends on `scene.lines`, so the module's rebuild key catches it.
 */
export function junctionSignature(junction: WorldJunction, scene: WorldScene): string {
  const ends: string[] = [];
  for (const line of scene.lines) {
    line.path.forEach((hex, index) => {
      if (hex.key !== junction.hex.key) return;
      const neighbours = [index > 0 ? line.path[index - 1] : null, line.path[index + 1] ?? null];
      for (const neighbour of neighbours) {
        if (neighbour)
          ends.push(`${sideOf(junction.hex, neighbour)}:${line.type}:${line.built ? 1 : 0}`);
      }
    });
  }
  return ends.sort().join(",");
}

export function layoutJunction(
  junction: WorldJunction,
  scene: WorldScene,
  terrain: TerrainProvider,
  rng: Rng,
): JunctionLayout {
  const builder = new Builder();
  const centre = hexToWorld(junction.hex);
  const y = padY(terrain, centre.x, centre.z);
  const steel = weather(rng);
  const perBay = clamp(Math.ceil(junction.slots / 6), 1, 2);
  const ends = junctionEnds(junction, scene);

  // Busiest side: the transformer bay and the masts gather on it.
  const bayCount = (info: EndInfo | undefined): number => (info?.live ?? 0) + (info?.reserved ?? 0);
  let busiest = 0;
  for (let side = 1; side < 6; side++) {
    if (bayCount(ends[side]) > bayCount(ends[busiest])) busiest = side;
  }

  // Gravel yard, fence, and a service road ring inside the fence.
  builder.placeScaled("pad", centre.x, y, centre.z, 0, YARD_RADIUS_KM, 1, YARD_RADIUS_KM);
  fenceRing(builder, centre.x, centre.z, y, FENCE_RADIUS_KM, 12);
  const roadRadius = YARD_RADIUS_KM - 0.45;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    builder.tube(
      {
        x: centre.x + Math.cos(a0) * roadRadius,
        y: y + 0.035,
        z: centre.z + Math.sin(a0) * roadRadius,
      },
      {
        x: centre.x + Math.cos(a1) * roadRadius,
        y: y + 0.035,
        z: centre.z + Math.sin(a1) * roadRadius,
      },
      0.09,
      SLAB_TINT,
    );
  }

  // Bay ring. Occupied bays (strung or reserved) carry apparatus; bare bays
  // are the steel alone, so the free slots stay countable (docs/08 §3).
  const occupiedBays: {
    x: number;
    z: number;
    lateral: number;
    type: WorldLine["type"];
    live: boolean;
    outward: { x: number; z: number };
  }[] = [];
  for (let side = 0; side < 6; side++) {
    const dir = sideDir(side);
    const perp = { x: -dir.z, z: dir.x };
    const info = ends[side] ?? { live: 0, reserved: 0, type: null, reservedType: null };
    const liveHere = Math.min(info.live, perBay);
    const reservedHere = Math.min(info.reserved, perBay - liveHere);
    for (let k = 0; k < perBay; k++) {
      const lateral = perBay === 1 ? 0 : (k - (perBay - 1) / 2) * 2 * BAY_SPREAD_KM;
      const x = centre.x + dir.x * BAY_RADIUS_KM + perp.x * lateral;
      const z = centre.z + dir.z * BAY_RADIUS_KM + perp.z * lateral;
      const yaw = Math.atan2(dir.x, dir.z);
      const isLive = k < liveHere;
      const isReserved = !isLive && k < liveHere + reservedHere;
      const type: WorldLine["type"] | null = isLive
        ? (info.type ?? "mv")
        : isReserved
          ? (info.reservedType ?? "mv")
          : null;
      const scale = type ? GANTRY_SCALE[type] : 0.95;
      builder.place("gantry", x, y, z, yaw, scale, steel);
      if (!type) continue;
      const bayEnds = isLive ? (k === liveHere - 1 ? info.live - liveHere + 1 : 1) : 1;
      const spread = bayEnds === 1 ? [0] : spreadOffsets(bayEnds, GANTRY.halfSpan);
      const beamY = y + GANTRY.height * scale;
      const perpX = Math.cos(yaw);
      const perpZ = -Math.sin(yaw);
      for (const offset of spread) {
        const stringX = x + perpX * offset;
        const stringZ = z + perpZ * offset;
        builder.place(
          "insulator",
          stringX,
          beamY - 0.02,
          stringZ,
          0,
          type === "lv" ? 0.8 : 1,
          PORCELAIN_TINT,
        );
        // Only a finished line is strung: a slack jumper to the grid's
        // terminal portal, which stands GRID_PORTAL_KM out.
        if (!isLive) continue;
        const anchor = {
          x: centre.x + dir.x * (GRID_PORTAL_KM + 0.4) + perp.x * offset,
          y: y + PORTAL_BEAM_KM[type],
          z: centre.z + dir.z * (GRID_PORTAL_KM + 0.4) + perp.z * offset,
        };
        builder.sag(
          { x: stringX, y: beamY - INSULATOR.length - 0.02, z: stringZ },
          anchor,
          0.05,
          JUMPER_RADIUS,
          steel,
          4,
        );
      }
      if (isReserved) {
        // Reserved for a line under construction: a pile-cap plinth under the
        // portal, dead-end strings hanging free — equipped, not connected.
        builder.placeScaled("foundation", x, y, z, yaw, 0.2, 0.5, 0.24, CONCRETE_TINT);
      }
      occupiedBays.push({ x, z, lateral, type, live: isLive, outward: dir });
    }
  }

  // Busbar ring on insulator posts, and one three-pole breaker per strung bay.
  const ringPoints: Point[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ringPoints.push({
      x: centre.x + Math.cos(angle) * BUSBAR_RADIUS_KM,
      y: y + 0.42,
      z: centre.z + Math.sin(angle) * BUSBAR_RADIUS_KM,
    });
  }
  for (let i = 0; i < 12; i++) {
    const a = ringPoints[i];
    const b = ringPoints[(i + 1) % 12];
    if (!a || !b) continue;
    builder.tube(a, b, BUSBAR_RADIUS, steel);
    if (i % 2 !== 0) continue;
    builder.placeScaled(
      "tube",
      (a.x + b.x) / 2,
      y + 0.21,
      (a.z + b.z) / 2,
      0,
      0.05,
      0.42,
      0.05,
      steel,
    );
    builder.place("insulator", (a.x + b.x) / 2, y + 0.32, (a.z + b.z) / 2, 0, 0.7, PORCELAIN_TINT);
  }
  for (const bay of occupiedBays) {
    const perp = { x: -bay.outward.z, z: bay.outward.x };
    const bayYaw = Math.atan2(bay.outward.x, bay.outward.z);
    // Disconnectors leave the bay radially, so their blades line up with the
    // conductor they interrupt.
    const radialYaw = Math.atan2(-bay.outward.z, bay.outward.x);
    const scale = bay.type === "hv" ? 1.1 : 0.95;
    const at = (radius: number) => ({
      x: centre.x + bay.outward.x * radius + perp.x * bay.lateral,
      z: centre.z + bay.outward.z * radius + perp.z * bay.lateral,
    });
    const breaker = at(BREAKER_RADIUS_KM);
    builder.place("breaker", breaker.x, y, breaker.z, bayYaw, scale, steel);
    const lineDis = at((BAY_RADIUS_KM + BREAKER_RADIUS_KM) / 2);
    const busDis = at((BREAKER_RADIUS_KM + BUSBAR_RADIUS_KM) / 2);
    for (const spot of [lineDis, busDis]) {
      builder.place("disconnector", spot.x, y, spot.z, radialYaw, scale, steel);
    }
  }

  // Cable trench system: a radial run under every bay side converging on a
  // ring inside the busbar, the way the control cables actually reach the hall.
  for (let side = 0; side < 6; side++) {
    const dir = sideDir(side);
    const near = BUSBAR_RADIUS_KM - 0.2;
    const far = BAY_RADIUS_KM + 0.25;
    const mid = (near + far) / 2;
    builder.placeScaled(
      "trench",
      centre.x + dir.x * mid,
      y,
      centre.z + dir.z * mid,
      Math.atan2(-dir.z, dir.x),
      far - near,
      1,
      1,
    );
  }
  const trenchRing = BUSBAR_RADIUS_KM - 0.3;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    const x0 = centre.x + Math.cos(a0) * trenchRing;
    const z0 = centre.z + Math.sin(a0) * trenchRing;
    const x1 = centre.x + Math.cos(a1) * trenchRing;
    const z1 = centre.z + Math.sin(a1) * trenchRing;
    const length = Math.hypot(x1 - x0, z1 - z0);
    builder.placeScaled(
      "trench",
      (x0 + x1) / 2,
      y,
      (z0 + z1) / 2,
      Math.atan2(-(z1 - z0), x1 - x0),
      length,
      1,
      1,
    );
  }

  // The transformer bay, the control building and the lights.
  const busiestDir = sideDir(busiest);
  const hallAngle = busiestDir;
  builder.place(
    "transformer",
    centre.x + busiestDir.x * 1.7,
    y,
    centre.z + busiestDir.z * 1.7,
    Math.atan2(busiestDir.x, busiestDir.z),
    0.62,
    steel,
  );
  const hallX = centre.x - hallAngle.x * 1.35 - hallAngle.z * 0.3;
  const hallZ = centre.z - hallAngle.z * 1.35 + hallAngle.x * 0.3;
  const hallYaw = Math.atan2(-hallAngle.x, -hallAngle.z) + 0.25;
  builder.place("hall", hallX, y, hallZ, hallYaw, 0.85, PAINT_TINT);
  hallWindows(builder, hallX, y, hallZ, hallYaw, 0.85);
  builder.placeScaled(
    "pad",
    centre.x + busiestDir.x * 1.7,
    y + 0.005,
    centre.z + busiestDir.z * 1.7,
    0,
    1.6,
    1,
    1.6,
    CONCRETE_TINT,
  );

  const mastCount = 4;
  for (let i = 0; i < mastCount; i++) {
    const angle = ((busiest + 1) * 60 + 45 + i * 90) * DEG;
    const mx = centre.x + Math.cos(angle) * MAST_RADIUS_KM;
    const mz = centre.z + Math.sin(angle) * MAST_RADIUS_KM;
    builder.place("mast", mx, y, mz, 0, 1, steel);
    builder.lamps.push({
      x: mx,
      y: y + MAST_HEIGHT + 0.3,
      z: mz,
      size: 0.42,
      kind: "lamp",
      phase: rng.next(),
    });
    builder.pools.push({ x: mx, z: mz, size: 5.4 });
  }

  // The aviation light rides the tallest strung gantry (docs/08 §3 silhouette).
  let tallest = 0;
  let aviation: { x: number; z: number } | null = null;
  for (const bay of occupiedBays) {
    if (!bay.live) continue;
    const height = GANTRY.height * GANTRY_SCALE[bay.type];
    if (height > tallest) {
      tallest = height;
      aviation = { x: bay.x, z: bay.z };
    }
  }
  if (aviation) {
    builder.aviation.push({
      x: aviation.x,
      y: y + tallest + 0.12,
      z: aviation.z,
      size: 0.34,
      kind: "aviation",
      phase: rng.next(),
    });
  } else {
    const dir = sideDir(busiest);
    builder.aviation.push({
      x: centre.x + dir.x * MAST_RADIUS_KM,
      y: y + MAST_HEIGHT + 0.45,
      z: centre.z + dir.z * MAST_RADIUS_KM,
      size: 0.34,
      kind: "aviation",
      phase: rng.next(),
    });
  }

  return {
    kind: "junction",
    junction,
    centre: { x: centre.x, y, z: centre.z },
    parts: builder.parts,
    lamps: builder.lamps,
    aviation: builder.aviation,
    pools: builder.pools,
    hook: {
      name: `nodes:base:${junction.id}`,
      x: centre.x,
      y,
      z: centre.z,
      userData: { kind: "junction", slotsUsed: junction.slotsUsed, slots: junction.slots },
    },
  };
}

/** Even offsets across a gantry beam for `count` dead-end strings. */
function spreadOffsets(count: number, halfSpan: number): number[] {
  const reach = halfSpan * 0.45;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(-reach + (2 * reach * i) / (count - 1));
  return offsets;
}

// --- border ---------------------------------------------------------------------

/** Where the foreign line leaves the board along `outward` [km per tower]. */
const FOREIGN_SPACING_KM = 8;
const FOREIGN_TOWERS = 4;

export function layoutBorder(
  border: WorldBorder,
  terrain: TerrainProvider,
  rng: Rng,
): BorderLayout {
  const builder = new Builder();
  const centre = hexToWorld(border.hex);
  const y = padY(terrain, centre.x, centre.z);
  const outward = { x: border.outward.x, z: border.outward.z };
  const perp = { x: -outward.z, z: outward.x };
  const outwardYaw = Math.atan2(outward.x, outward.z);
  const steel = weather(rng);

  builder.placeScaled("pad", centre.x, y, centre.z, 0, 3.4, 1, 3.4);
  fenceRing(builder, centre.x, centre.z, y, 3.55, 12);

  // Terminal gantry: the line's entry portal, inside the yard.
  const gantryX = centre.x + outward.x * 2.6;
  const gantryZ = centre.z + outward.z * 2.6;
  builder.place("gantry", gantryX, y, gantryZ, outwardYaw, 1.2, steel);
  const beamY = y + GANTRY.height * 1.2;

  // Metering hall, transformer and breaker behind it.
  const hallX = centre.x - outward.x * 0.2 + perp.x * 1.7;
  const hallZ = centre.z - outward.z * 0.2 + perp.z * 1.7;
  builder.place("hall", hallX, y, hallZ, outwardYaw + 0.35, 0.95, PAINT_TINT);
  hallWindows(builder, hallX, y, hallZ, outwardYaw + 0.35, 0.95);
  builder.placeScaled(
    "pad",
    hallX,
    y + 0.005,
    hallZ,
    outwardYaw + 0.35,
    2.2,
    1,
    1.6,
    CONCRETE_TINT,
  );
  builder.place(
    "transformer",
    centre.x - outward.x * 0.3 - perp.x * 1.5,
    y,
    centre.z - outward.z * 0.3 - perp.z * 1.5,
    outwardYaw + 0.5,
    0.7,
    steel,
  );
  builder.place(
    "breaker",
    centre.x + outward.x * 1.1 + perp.x * 0.9,
    y,
    centre.z + outward.z * 1.1 + perp.z * 0.9,
    outwardYaw,
    1.05,
    steel,
  );
  builder.place(
    "breaker",
    centre.x + outward.x * 1.1 - perp.x * 0.9,
    y,
    centre.z + outward.z * 1.1 - perp.z * 0.9,
    outwardYaw,
    1.05,
    steel,
  );
  builder.place(
    "mast",
    centre.x + perp.x * 2.5 - outward.x * 0.9,
    y,
    centre.z + perp.z * 2.5 - outward.z * 0.9,
    0,
    1,
    steel,
  );
  builder.place(
    "mast",
    centre.x - perp.x * 2.5 - outward.x * 0.9,
    y,
    centre.z - perp.z * 2.5 - outward.z * 0.9,
    0,
    1.3,
    steel,
  );
  for (const side of [-1, 1]) {
    const mx = centre.x + side * perp.x * 2.5 - outward.x * 0.9;
    const mz = centre.z + side * perp.z * 2.5 - outward.z * 0.9;
    builder.lamps.push({
      x: mx,
      y: y + MAST_HEIGHT * 1.3 + 0.3,
      z: mz,
      size: 0.42,
      kind: "lamp",
      phase: rng.next(),
    });
    builder.pools.push({ x: mx, z: mz, size: 5.4 });
  }
  // Lamps on the metering hall: the station is staffed around the clock, so a
  // border never goes fully dark even when the flow is idle.
  for (const offset of [-0.8, 0.8]) {
    builder.lamps.push({
      x: hallX + Math.cos(outwardYaw + 0.35) * offset,
      y: y + 0.55,
      z: hallZ - Math.sin(outwardYaw + 0.35) * offset,
      size: 0.3,
      kind: "lamp",
      phase: rng.next(),
    });
  }

  // Dead-end strings on the terminal beam — where the flow read sits.
  const stringSpots = [-0.5, 0, 0.5];
  const flow: GlowSpot[] = [];
  for (const offset of stringSpots) {
    const sx = gantryX + perp.x * offset;
    const sz = gantryZ + perp.z * offset;
    builder.place("insulator", sx, beamY - 0.02, sz, 0, 1.1, PORCELAIN_TINT);
    flow.push({
      x: sx,
      y: beamY - INSULATOR.length * 1.05 - 0.05,
      z: sz,
      size: 0.9,
      kind: "flow",
      phase: rng.next(),
    });
  }
  // The station's own read sits on the equipment, not floating above it: the
  // hall's band height and the transformer tank's shoulder.
  flow.push({ x: hallX, y: y + 0.42, z: hallZ, size: 0.62, kind: "flow", phase: rng.next() });
  flow.push({
    x: centre.x - outward.x * 0.3 - perp.x * 1.5,
    y: y + 0.72,
    z: centre.z - outward.z * 0.3 - perp.z * 1.5,
    size: 0.5,
    kind: "flow",
    phase: rng.next(),
  });
  builder.flow.push(...flow);

  // The foreign line: a tower every 8 km, spans sagging between them, dimming
  // into the fog so the eye reads "the grid continues off the board".
  const polyline: THREE.Vector3[] = [];
  const attachments: { x: number; y: number; z: number }[] = [
    { x: gantryX + perp.x * -0.5, y: beamY - 0.05, z: gantryZ + perp.z * -0.5 },
    { x: gantryX, y: beamY - 0.05, z: gantryZ },
    { x: gantryX + perp.x * 0.5, y: beamY - 0.05, z: gantryZ + perp.z * 0.5 },
  ];
  for (let i = 1; i <= FOREIGN_TOWERS; i++) {
    const distance = 2.6 + i * FOREIGN_SPACING_KM;
    const tx = centre.x + outward.x * distance;
    const tz = centre.z + outward.z * distance;
    const ground = terrain.heightAt(tx, tz);
    const base = Math.max(ground, terrain.seaLevelKm) + 0.02;
    const towerScale = 1 - 0.12 * (i - 1);
    builder.place("foreignTower", tx, base, tz, outwardYaw, towerScale, steel);
    const armY = base + 0.78 * towerScale;
    const fade = clamp(1 - (i - 1) / FOREIGN_TOWERS, 0.25, 1);
    const tint = [fade, fade, fade] as const;
    for (let c = 0; c < attachments.length; c++) {
      const from = attachments[c];
      if (!from) continue;
      const target = {
        x: tx + perp.x * ((c - 1) * 0.5 * towerScale),
        y: armY,
        z: tz + perp.z * ((c - 1) * 0.5 * towerScale),
      };
      builder.sag(from, target, 0.7, 0.03 * fade + 0.008, tint, 5);
      attachments[c] = target;
    }
    polyline.push(new THREE.Vector3(tx, armY, tz));
  }
  polyline.push(new THREE.Vector3(gantryX, beamY, gantryZ));

  return {
    kind: "border",
    border,
    centre: { x: centre.x, y, z: centre.z },
    parts: builder.parts,
    lamps: builder.lamps,
    pools: builder.pools,
    flow: builder.flow,
    polyline,
    hook: {
      name: `nodes:base:${border.id}`,
      x: centre.x,
      y,
      z: centre.z,
      userData: {
        kind: "border",
        throughputMw: border.throughputMw,
        importUsedMw: border.importUsedMw,
        exportDeliveredMw: border.exportDeliveredMw,
        usedMw: border.usedMw,
        ratio: border.ratio,
        borderPolyline: polyline,
      },
    },
  };
}

// --- construction site ------------------------------------------------------------

/** Progress thresholds of the three stages (docs/08 §3, brief §21). */
const STAGE_EARTHWORKS = 0.3;
const STAGE_CLAD = 0.7;
/** Radius of the site pad by object kind [km]. */
const SITE_RADIUS: Record<WorldSite["kind"], number> = {
  plant: 3.1,
  farm: 2.7,
  storage: 1.8,
  junction: 1.5,
  border: 1.5,
  expansion: 1.9,
};

/** The steel skeleton the site grows, per technology. */
function skeletonFor(kind: WorldSite["kind"], tech: string | null): Archetype[] {
  switch (kind) {
    case "farm":
      return tech === "pv" ? ["skelRows"] : ["skelTurbine"];
    case "storage":
      return ["skelRows"];
    case "junction":
    case "border":
      return ["skelHall"];
    default:
      if (tech === "nuclear") return ["skelHall", "skelDome"];
      if (tech === "coal") return ["skelHall", "skelStack"];
      if (tech === "ccgt" || tech === "ocgt") return ["skelHall", "skelStack"];
      if (tech === "pv") return ["skelRows"];
      if (tech === "wind") return ["skelTurbine"];
      return ["skelHall"];
  }
}

export function layoutSite(site: WorldSite, terrain: TerrainProvider, rng: Rng): SiteLayout {
  const builder = new Builder();
  const hex = hexToWorld(site.hex);
  // An expansion sits beside the object it grows, smaller.
  const offset = site.kind === "expansion" ? 4.2 : 0;
  const angle = rng.range(0, Math.PI * 2);
  const centre = {
    x: hex.x + (offset ? Math.cos(angle) * offset : 0),
    z: hex.z + (offset ? Math.sin(angle) * offset : 0),
  };
  const y = padY(terrain, centre.x, centre.z);
  const radius = SITE_RADIUS[site.kind] * (site.kind === "expansion" ? 0.62 : 1);
  const progress = clamp(site.progress, 0, 1);
  const stage = progress < STAGE_EARTHWORKS ? 0 : progress < STAGE_CLAD ? 1 : 2;
  const growth = clamp((progress - STAGE_EARTHWORKS) / (STAGE_CLAD - STAGE_EARTHWORKS), 0, 1);
  const steel = weather(rng);
  const primer = new THREE.Color().setRGB(0.72, 0.76, 0.8, THREE.SRGBColorSpace);

  builder.placeScaled("sitePad", centre.x, y, centre.z, 0, radius, 1, radius);
  fenceRing(builder, centre.x, centre.z, y, radius + 0.25, 10);

  // Laydown area: always some material on site (docs/08 §3: a site reads as a site).
  const props = stage === 0 ? 4 : stage === 1 ? 2 : 1;
  for (let i = 0; i < props; i++) {
    const a = (i / props) * Math.PI * 2 + 0.6;
    const px = centre.x + Math.cos(a) * radius * 0.62;
    const pz = centre.z + Math.sin(a) * radius * 0.62;
    const yaw = a + Math.PI / 2;
    // Laydown materials, not buildings: a container stack and a pipe rack are
    // scaled to sit under the site's masts (they read as blocks if left at the
    // archetype's own size — the step-2 site frame showed three white boxes).
    if (i % 3 === 0) builder.place("container", px, y, pz, yaw, 0.45, PANEL_TINT);
    else if (i % 3 === 1) builder.place("pipe", px, y, pz, yaw, 0.6, steel);
    else builder.place("pile", px, y, pz, 0, 1, [0.9, 0.85, 0.75]);
  }
  builder.place(
    "cabin",
    centre.x + Math.cos(angle) * radius * 0.78,
    y,
    centre.z + Math.sin(angle) * radius * 0.78,
    angle,
    1,
    PAINT_TINT,
  );

  // The future object's silhouette, growing with progress.
  let peak = { x: centre.x, y: y + 0.4, z: centre.z };
  if (stage >= 1) {
    const peakKm = sitePeakKm(site.kind, site.tech);
    const px = centre.x + Math.cos(angle + 1.1) * radius * 0.28;
    const pz = centre.z + Math.sin(angle + 1.1) * radius * 0.28;
    builder.place("foundation", px, y, pz, angle, radius * 0.42, steel);
    const skeletons = skeletonFor(site.kind, site.tech);
    let tallest = 0;
    skeletons.forEach((archetype, index) => {
      const height = peakKm * (0.35 + 0.65 * growth);
      const at = {
        x: px + Math.cos(angle + 0.7) * index * radius * 0.5,
        z: pz + Math.sin(angle + 0.7) * index * radius * 0.5,
      };
      const width =
        archetype === "skelRows" ? radius * 0.6 : radius * (archetype === "skelHall" ? 0.55 : 0.3);
      builder.placeScaled(archetype, at.x, y, at.z, angle, width, height, width, primer);
      if (height > tallest) {
        tallest = height;
        peak = { x: at.x, y: y + height, z: at.z };
      }
      if (stage >= 2) {
        const cladArchetype =
          archetype === "skelStack" || archetype === "skelDome" ? "cladCylinder" : "clad";
        builder.placeScaled(
          cladArchetype,
          at.x,
          y,
          at.z,
          angle,
          width * 0.98,
          height * 0.96,
          width * 0.98,
          PAINT_TINT,
        );
        builder.placeScaled(
          "scaffold",
          at.x + width * 0.62,
          y,
          at.z,
          angle,
          width * 0.5,
          height * 0.62,
          width * 0.5,
          steel,
        );
      } else if (growth > 0.55) {
        builder.placeScaled(
          "scaffold",
          at.x + width * 0.62,
          y,
          at.z,
          angle,
          width * 0.5,
          height * 0.55,
          width * 0.5,
          steel,
        );
      }
    });
    if (tallest === 0) peak = { x: px, y: y + 0.4, z: pz };
  } else {
    peak = { x: centre.x, y: y + 0.9, z: centre.z };
  }

  // Site floodlights on the pad corners.
  for (let i = 0; i < 3; i++) {
    const a = angle + 0.4 + (i / 3) * Math.PI * 2;
    const mx = centre.x + Math.cos(a) * (radius + 0.1);
    const mz = centre.z + Math.sin(a) * (radius + 0.1);
    builder.place("mast", mx, y, mz, 0, 0.85, steel);
    builder.lamps.push({
      x: mx,
      y: y + MAST_HEIGHT * 0.85 + 0.3,
      z: mz,
      size: 0.42,
      kind: "lamp",
      phase: rng.next(),
    });
    builder.pools.push({ x: mx, z: mz, size: 5 });
  }

  return {
    kind: "site",
    site,
    centre: { x: centre.x, y, z: centre.z },
    parts: builder.parts,
    lamps: builder.lamps,
    pools: builder.pools,
    crane: {
      name: `site:crane:${site.id}`,
      x: peak.x,
      y: peak.y,
      z: peak.z,
      userData: {
        kind: site.kind,
        tech: site.tech,
        progress,
        remainingDays: site.remainingDays,
      },
    },
    hook: {
      name: `nodes:base:${site.id}`,
      x: centre.x,
      y,
      z: centre.z,
      userData: {
        kind: "site",
        siteKind: site.kind,
        tech: site.tech,
        progress,
        remainingDays: site.remainingDays,
      },
    },
  };
}

/** Panel length [km] a fence bay of `radius` covers at `count` panels. */
export function fenceBayLength(radius: number, count: number): number {
  return (2 * Math.PI * radius) / count;
}
