// Farm layouts (docs/08 §2: a farm fills 40–70 % of its hex by size rung). Pure
// geometry over the hex's own flat-top hexagon, so a farm keeps the map's
// silhouette from the strategic view: turbines on a staggered lattice trimmed
// to the footprint, PV rows as east–west chords of it. Every random number
// comes from the caller's seeded stream (ARCHITECTURE.md §12); the terrain
// only filters (offshore sites must stand in water) and never feeds the
// stream, so a relief change moves no turbine.

import { FARM_FOOTPRINT } from "../core/exaggeration";
import type { Rng } from "../core/prng";
import { HEX_RADIUS_KM } from "../core/units";

const SQRT3 = Math.sqrt(3);

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Circumradius [km] of the hexagon a farm fills for its 0..1 footprint. */
export function farmRadiusKm(footprint: number): number {
  const share = FARM_FOOTPRINT.min + (FARM_FOOTPRINT.max - FARM_FOOTPRINT.min) * clamp01(footprint);
  return share * HEX_RADIUS_KM;
}

/** Half-width along x of a flat-top hexagon of circumradius `radius` at offset `z`; 0 outside. */
export function hexHalfWidth(radius: number, z: number): number {
  const limit = (radius * SQRT3) / 2;
  const dz = Math.abs(z);
  return dz > limit ? 0 : radius - dz / SQRT3;
}

export interface GroundOffset {
  /** Offset from the hex centre [km]; +x east, +z south. */
  x: number;
  z: number;
}

// --- wind ---------------------------------------------------------------------

export interface TurbineSite extends GroundOffset {
  /** Per-turbine yaw error [rad] — nacelles never align perfectly. */
  yawError: number;
  /** 0..1 rotor phase of a spinning turbine. */
  phase: number;
  /** Rotor speed multiplier around 1 — no two machines turn in lockstep. */
  speedFactor: number;
}

/** Minimum spacing between turbines: the 2 km rotor plus clearance. */
export const TURBINE_MIN_SPACING_KM = 2.6;
/** Radius kept clear around the substation or platform at the farm centre. */
const CENTRE_CLEAR_KM = 1.5;
/** Blades never poke past the footprint: sites keep this margin from its edge. */
const EDGE_MARGIN_KM = 1.1;
/** Uniform jitter of a lattice site, as a share of the spacing. */
const JITTER = 0.12;

/**
 * `units` sites on a staggered lattice inside the hexagon of `radius`,
 * spacing chosen so the units fill it, the innermost candidates kept.
 * `admissible` rejects a site the ground forbids (an offshore site on land).
 */
export function turbineSites(
  units: number,
  radius: number,
  rng: Rng,
  admissible: (offset: GroundOffset) => boolean,
): TurbineSite[] {
  const inner = Math.max(radius - EDGE_MARGIN_KM, 1);
  const area = ((3 * SQRT3) / 2) * inner * inner;
  const spacing = Math.max(TURBINE_MIN_SPACING_KM, Math.sqrt(area / (units * (SQRT3 / 2))) * 0.92);
  const rowStep = (spacing * SQRT3) / 2;
  const rows = Math.ceil(inner / rowStep) + 1;
  const cols = Math.ceil(inner / spacing) + 1;
  const candidates: { x: number; z: number; d: number }[] = [];
  for (let j = -rows; j <= rows; j++) {
    const z0 = j * rowStep + rowStep / 2;
    for (let i = -cols; i <= cols; i++) {
      const x0 = i * spacing + (j % 2 !== 0 ? spacing / 2 : 0) + spacing / 4;
      const x = x0 + rng.range(-JITTER, JITTER) * spacing;
      const z = z0 + rng.range(-JITTER, JITTER) * spacing;
      if (Math.abs(x) > hexHalfWidth(inner, z)) continue;
      const d = Math.hypot(x, z);
      if (d < CENTRE_CLEAR_KM) continue;
      if (!admissible({ x, z })) continue;
      candidates.push({ x, z, d });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  return candidates.slice(0, units).map((site) => ({
    x: site.x,
    z: site.z,
    yawError: rng.range(-0.06, 0.06),
    phase: rng.next(),
    speedFactor: 0.96 + rng.next() * 0.08,
  }));
}

// --- PV -------------------------------------------------------------------------

/** Length of one instanced table segment [km]. */
export const PV_SEGMENT_KM = 1;
/** Row pitch [km]; with the 0,55 km table this is a ground coverage of ≈ 0,6 (a dense modern farm). */
export const PV_PITCH_KM = 0.9;
/** Depth of a table along the slope [km]. */
export const PV_TABLE_DEPTH_KM = 0.55;
/** Internal north–south access road down the middle of the field. */
const PV_ROAD_KM = 0.45;
/** Distance from the fence to the first table end / row. */
const PV_FENCE_MARGIN_KM = 0.6;
/** The substation yard at the centre: rows leave this box free. */
const PV_YARD_HALF_X = 1.3;
const PV_YARD_HALF_Z = 0.75;

export interface PvLayout {
  /** Row centre lines: offset z and half-length. */
  rows: { z: number; halfWidth: number }[];
  /** Centres of the 1 km table segments. */
  segments: GroundOffset[];
  /** Inverter stations at the east ends of every fourth row. */
  inverters: GroundOffset[];
  /** Fence polygon around the rows, clockwise seen from above. */
  fence: GroundOffset[];
}

/**
 * `units` east–west rows at a fixed pitch, centred in the hexagon of
 * `radius` and clipped to its chords, a road down the middle, the yard
 * free; the fence hugs the rows' band so a small farm is a small farm.
 */
export function pvLayout(units: number, radius: number): PvLayout {
  const inner = radius - PV_FENCE_MARGIN_KM;
  const depth = units * PV_PITCH_KM;
  const rows: PvLayout["rows"] = [];
  const segments: GroundOffset[] = [];
  const inverters: GroundOffset[] = [];
  for (let i = 0; i < units; i++) {
    const z = -depth / 2 + PV_PITCH_KM * (i + 0.5);
    const halfWidth = hexHalfWidth(inner, z) - 0.2;
    if (halfWidth < PV_ROAD_KM / 2 + PV_SEGMENT_KM) continue;
    rows.push({ z, halfWidth });
    for (
      let x = PV_ROAD_KM / 2 + PV_SEGMENT_KM / 2;
      x + PV_SEGMENT_KM / 2 <= halfWidth;
      x += PV_SEGMENT_KM
    ) {
      for (const sx of [-x, x]) {
        if (Math.abs(z) < PV_YARD_HALF_Z && Math.abs(sx) < PV_YARD_HALF_X) continue;
        segments.push({ x: sx, z });
      }
    }
    if (i % 4 === 2) inverters.push({ x: halfWidth + 0.15, z });
  }
  const bandZ = Math.min(depth / 2 + 0.5, (inner * SQRT3) / 2 + 0.3);
  const w = hexHalfWidth(radius, bandZ);
  const fence: GroundOffset[] =
    bandZ >= (radius * SQRT3) / 2 - 1e-6
      ? hexagon(radius)
      : [
          { x: -w, z: -bandZ },
          { x: w, z: -bandZ },
          { x: radius, z: 0 },
          { x: w, z: bandZ },
          { x: -w, z: bandZ },
          { x: -radius, z: 0 },
        ];
  return { rows, segments, inverters, fence };
}

/** Flat-top hexagon corners, clockwise from due east. */
export function hexagon(radius: number): GroundOffset[] {
  const corners: GroundOffset[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    corners.push({ x: radius * Math.cos(angle), z: radius * Math.sin(angle) });
  }
  return corners;
}

/** Points along a closed polygon, every `stepKm` at most, corners included. */
export function subdividePolygon(polygon: GroundOffset[], stepKm: number): GroundOffset[] {
  const points: GroundOffset[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / stepKm));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return points;
}
