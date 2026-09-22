// Settlement layout (docs/08 §2–§3, ARCHITECTURE.md §6, §12): a deterministic
// plan per city from one seeded stream — the street grid, its districts and
// every building and lamp — so the same seed lays the same town on any
// machine. The footprint follows the exaggeration table (CITY_FOOTPRINT ×
// log-scale of households); the heights follow HEIGHT_KM; the class must be
// tellable from the strategic view by footprint, density and skyline.
//
// Plan, from the centre out (Polish cities as the reference):
//   core      d < 0,30  tight grid, slabs and towers up to cityBlockHigh,
//                       curtain-wall towers in the bigger cities, the metro's
//                       landmark tower near the middle;
//   mid ring  d < 0,62  perimeter blocks around green courtyards, estates of
//                       slabs, the odd park; a ring road cuts the grid;
//   suburbs   d < 1,0   detached and row houses under pitched roofs, thinning
//                       to fields, industrial halls along the outer arterials.
// The edge is not a circle: three harmonics of noise push the outline in and
// out, and water or steep ground simply gets no block.

import type { WorldCity } from "../../bridge/worldScene";
import { CITY_FOOTPRINT, HEIGHT_KM } from "../core/exaggeration";
import type { Rng } from "../core/prng";
import type { TerrainProvider } from "../core/types";
import { HEX_PITCH_KM } from "../core/units";
import type { ArchetypeId } from "./archetypes";

/** Inradius of the hex [km] — the footprint share is measured across the flats. */
const HEX_INRADIUS_KM = HEX_PITCH_KM / 2;

/** Linear albedo the facade palettes are scaled to: plaster and concrete, never paper. */
const WALL_ALBEDO = 0.45;

/** Roof tones the material knows (materials.ts enRoofTone). */
export const ROOF = { gravel: 0, terracotta: 1, membrane: 2, bitumen: 3, green: 4 } as const;

export interface BuildingInstance {
  archetype: ArchetypeId;
  x: number;
  /** Base height [km] — the terrain under the block, sunk a little on slopes. */
  y: number;
  z: number;
  /** Yaw [rad]. */
  rotation: number;
  w: number;
  h: number;
  d: number;
  /** Facade tint, linear RGB. */
  tint: [number, number, number];
  /** 0..65535 — the window hash seed. */
  seed: number;
  roof: number;
  /** 0 punched windows, 1 curtain wall. */
  style: number;
}

export interface LampInstance {
  x: number;
  y: number;
  z: number;
  /** Pool diameter [km]. */
  size: number;
  /** Linear RGB × brightness. */
  color: [number, number, number];
  /** 0..1 — which lamps go out first when the city is short. */
  hash: number;
}

export interface CityLayout {
  id: string;
  centre: { x: number; y: number; z: number };
  radiusKm: number;
  /** Halo colour: sodium orange for towns, LED-white for the big cities. */
  glow: [number, number, number];
  buildings: BuildingInstance[];
  lamps: LampInstance[];
}

interface Street {
  /** Centre line coordinate in the grid frame [km]. */
  at: number;
  /** Full width [km]. */
  width: number;
  avenue: boolean;
}

type Palette = readonly (readonly [number, number, number])[];

const CORE_TINTS: Palette = [
  [0.62, 0.62, 0.6],
  [0.5, 0.52, 0.55],
  [0.72, 0.68, 0.62],
  [0.42, 0.44, 0.47],
  [0.8, 0.76, 0.7],
];
const MID_TINTS: Palette = [
  [0.86, 0.78, 0.66],
  [0.82, 0.7, 0.5],
  [0.62, 0.42, 0.34],
  [0.88, 0.86, 0.8],
  [0.7, 0.68, 0.64],
  [0.76, 0.62, 0.5],
];
const HOUSE_TINTS: Palette = [
  [0.92, 0.9, 0.85],
  [0.9, 0.84, 0.66],
  [0.84, 0.8, 0.72],
  [0.78, 0.7, 0.6],
  [0.88, 0.8, 0.74],
];
const HALL_TINTS: Palette = [
  [0.7, 0.72, 0.74],
  [0.62, 0.66, 0.7],
  [0.78, 0.78, 0.76],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Off-grid settlements are greyer: desaturated, a touch paler — under the
 * moon a pale silhouette, by day a colourless one.
 */
function greyed(tint: readonly [number, number, number], amount: number): [number, number, number] {
  const l = (0.3 * tint[0] + 0.59 * tint[1] + 0.11 * tint[2]) * 1.12;
  return [
    lerp(tint[0], l, amount) * WALL_ALBEDO,
    lerp(tint[1], l, amount) * WALL_ALBEDO,
    lerp(tint[2], l, amount) * WALL_ALBEDO,
  ];
}

/** Street coordinates across the grid frame with jittered spacing and avenues. */
function streets(extent: number, pitch: number, rng: Rng): Street[] {
  const out: Street[] = [];
  const avenueEvery = 4 + rng.int(2);
  const avenuePhase = rng.int(avenueEvery);
  let index = 0;
  for (let at = -extent; at <= extent; at += pitch * (0.85 + 0.3 * rng.next())) {
    const avenue = (index + avenuePhase) % avenueEvery === 0;
    out.push({ at, width: pitch * (avenue ? 0.3 : 0.16 + 0.05 * rng.next()), avenue });
    index += 1;
  }
  return out;
}

export interface LayoutOptions {
  /** QUALITY_PROFILES[tier].detail — thins the suburbs and the lamps. */
  detail: number;
}

export function layoutCity(
  city: WorldCity,
  centre: { x: number; z: number },
  rng: Rng,
  terrain: TerrainProvider,
  options: LayoutOptions,
): CityLayout {
  const scale = clamp(city.scale, 0, 1);
  const radius = lerp(CITY_FOOTPRINT.min, CITY_FOOTPRINT.max, scale) * HEX_INRADIUS_KM;
  const off = !city.connected;
  const grey = off ? 1 : 0;
  const detail = clamp(options.detail, 0.15, 1);

  // Outline harmonics and the grid frame.
  const harmonics = [0, 1, 2].map((k) => ({
    amp: (0.13 - 0.03 * k) * (0.6 + 0.8 * rng.next()),
    phase: rng.next() * Math.PI * 2,
  }));
  const edgeAt = (theta: number): number => {
    let e = 1;
    harmonics.forEach((h, k) => {
      e += h.amp * Math.cos((k + 1) * theta - h.phase);
    });
    return radius * e;
  };
  const rotation = rng.next() * (Math.PI / 3);
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const toWorld = (u: number, v: number): { x: number; z: number } => ({
    x: centre.x + u * cosR - v * sinR,
    z: centre.z + u * sinR + v * cosR,
  });
  const pitch = 0.7 + 0.3 * scale;
  const extent = radius * 1.32;
  const us = streets(extent, pitch, rng);
  const vs = streets(extent, pitch, rng);
  const ringRoad = scale > 0.3 ? 0.56 + 0.06 * rng.next() : -1;
  const centreY = terrain.heightAt(centre.x, centre.z);
  const seaLevel = terrain.seaLevelKm;

  /** Normalised distance from the centre against the noisy outline. */
  const shape = (u: number, v: number): number => {
    const r = Math.hypot(u, v);
    if (r < 1e-6) return 0;
    const theta = Math.atan2(v, u) + rotation;
    return r / edgeAt(theta);
  };

  /** Ground under a block, or null where nothing can stand. */
  const ground = (x: number, z: number, span: number): number | null => {
    const y = terrain.heightAt(x, z);
    if (y < seaLevel + 0.03) return null;
    const dx = terrain.heightAt(x + span, z) - terrain.heightAt(x - span, z);
    const dz = terrain.heightAt(x, z + span) - terrain.heightAt(x, z - span);
    const slope = Math.hypot(dx, dz) / (2 * span);
    if (slope > 0.32) return null;
    if (Math.abs(y - centreY) > 2.2) return null;
    return y - 0.04 - slope * span * 0.6;
  };

  const buildings: BuildingInstance[] = [];
  const lamps: LampInstance[] = [];
  // The metro's landmark stands in the cell under a point near the middle.
  const landmarkAngle = rng.next() * Math.PI * 2;
  const landmarkU = 0.14 * radius * Math.cos(landmarkAngle);
  const landmarkV = 0.14 * radius * Math.sin(landmarkAngle);
  const cellOf = (list: Street[], at: number): number => {
    for (let i = 0; i < list.length - 1; i++) {
      if (at >= list[i]!.at && at < list[i + 1]!.at) return i;
    }
    return -1;
  };
  const landmarkI = city.sizeClass === "metro" && !off ? cellOf(us, landmarkU) : -1;
  const landmarkJ = landmarkI >= 0 ? cellOf(vs, landmarkV) : -1;

  // A skyline that tells the class: the core climbs to cityBlockHigh in a
  // metro and stays near cityBlockLow in a town; the mid ring sits below it.
  const coreHeight = lerp(0.5, 1, scale) * HEIGHT_KM.cityBlockHigh * (off ? 0.75 : 1);
  const midHeight = HEIGHT_KM.cityBlockLow * lerp(0.7, 1, scale) * (off ? 0.8 : 1);
  const houseHeight = HEIGHT_KM.cityBlockLow * 0.4;

  const place = (
    archetype: ArchetypeId,
    u: number,
    v: number,
    w: number,
    h: number,
    d: number,
    tint: readonly [number, number, number],
    roof: number,
    style: number,
    yaw = 0,
  ): boolean => {
    const p = toWorld(u, v);
    const y = ground(p.x, p.z, Math.max(w, d) * 0.5);
    if (y === null) return false;
    buildings.push({
      archetype,
      x: p.x,
      y,
      z: p.z,
      rotation: -rotation + yaw,
      w,
      h,
      d,
      tint: greyed(tint, grey),
      seed: rng.int(65536),
      roof,
      style,
    });
    return true;
  };

  for (let i = 0; i < us.length - 1; i++) {
    const su0 = us[i]!;
    const su1 = us[i + 1]!;
    const u0 = su0.at + su0.width / 2;
    const u1 = su1.at - su1.width / 2;
    if (u1 - u0 < pitch * 0.35) continue;
    for (let j = 0; j < vs.length - 1; j++) {
      const sv0 = vs[j]!;
      const sv1 = vs[j + 1]!;
      const v0 = sv0.at + sv0.width / 2;
      const v1 = sv1.at - sv1.width / 2;
      if (v1 - v0 < pitch * 0.35) continue;
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      const cw = u1 - u0;
      const cd = v1 - v0;
      const d = shape(cu, cv);
      // Every cell draws its numbers whether or not it builds, so the plan of
      // a cell never depends on what its neighbours decided.
      const roll = rng.next();
      const roll2 = rng.next();
      if (d > 1) continue;
      if (ringRoad > 0 && d > ringRoad && d < ringRoad + 0.028) continue;

      if (d < 0.3) {
        // Core.
        if (i === landmarkI && j === landmarkJ) {
          const side = Math.min(cw, cd) * 0.5;
          place(
            "landmark",
            cu,
            cv,
            side,
            HEIGHT_KM.landmark,
            side,
            CORE_TINTS[3]!,
            ROOF.bitumen,
            1,
          );
          continue;
        }
        if (roll > 0.97) continue;
        const h = coreHeight * (0.55 + 0.45 * roll2);
        if (roll < 0.5 && !off) {
          const inset = 0.5 + 0.25 * rng.next();
          const w = cw * inset;
          const dd = cd * inset;
          const ox = (rng.next() - 0.5) * (cw - w);
          const oz = (rng.next() - 0.5) * (cd - dd);
          const style = scale > 0.4 && rng.next() < 0.6 ? 1 : 0;
          place("tower", cu + ox, cv + oz, w, h, dd, rng.pick(CORE_TINTS), ROOF.bitumen, style);
        } else if (roll < 0.8) {
          place(
            "slab",
            cu,
            cv,
            cw * 0.92,
            h * 0.85,
            cd * 0.92,
            rng.pick(CORE_TINTS),
            ROOF.gravel,
            0,
          );
        } else {
          place(
            "perimeter",
            cu,
            cv,
            cw * 0.96,
            h * 0.7,
            cd * 0.96,
            rng.pick(MID_TINTS),
            ROOF.gravel,
            0,
          );
        }
      } else if (d < 0.62) {
        // Mid ring.
        if (roll > 0.9) continue; // a park
        const h = midHeight * (0.6 + 0.5 * roll2);
        if (roll < 0.55) {
          const roof = rng.next() < 0.62 ? ROOF.terracotta : ROOF.gravel;
          place("perimeter", cu, cv, cw * 0.95, h, cd * 0.95, rng.pick(MID_TINTS), roof, 0);
        } else if (roll < 0.82 || off || scale < 0.5) {
          // An estate: two or three slabs across the cell.
          const n = cw > pitch * 0.9 ? 3 : 2;
          const gap = cw * 0.1;
          const w = (cw - gap * (n - 1)) / n;
          for (let k = 0; k < n; k++) {
            const ox = -cw / 2 + w / 2 + k * (w + gap);
            place(
              "slab",
              cu + ox,
              cv,
              w * 0.9,
              h * (0.9 + 0.2 * rng.next()),
              cd * 0.55,
              rng.pick(CORE_TINTS),
              ROOF.gravel,
              0,
            );
          }
        } else {
          const side = Math.min(cw, cd) * 0.62;
          place("tower", cu, cv, side, h * 1.5, side, rng.pick(CORE_TINTS), ROOF.bitumen, 1);
        }
      } else {
        // Suburbs, thinning to the fields.
        const keep = (off ? 0.6 : 0.9) - 0.65 * smoothstep(0.62, 1.02, d);
        if (roll > keep) continue;
        if (roll2 < 0.1 && d > 0.7) {
          place(
            "hall",
            cu,
            cv,
            cw * 0.9,
            houseHeight * 1.1,
            cd * 0.86,
            rng.pick(HALL_TINTS),
            ROOF.membrane,
            0,
          );
        } else if (roll2 < 0.2) {
          const h = midHeight * (0.55 + 0.25 * rng.next());
          place("slab", cu, cv, cw * 0.8, h, cd * 0.5, rng.pick(MID_TINTS), ROOF.gravel, 0);
        } else {
          // A cluster of houses on a small plot grid; fewer at lower detail.
          const nx = Math.max(1, Math.round((cw / 0.34) * (0.6 + 0.4 * detail)));
          const nz = Math.max(1, Math.round((cd / 0.34) * (0.6 + 0.4 * detail)));
          const px = cw / nx;
          const pz = cd / nz;
          for (let a = 0; a < nx; a++) {
            for (let b = 0; b < nz; b++) {
              const r = rng.next();
              const yaw = (rng.next() - 0.5) * 0.25;
              if (r > 0.78) continue;
              const w = px * (0.42 + 0.22 * rng.next());
              const dd = pz * (0.42 + 0.22 * rng.next());
              const roof = rng.next() < 0.7 ? ROOF.terracotta : ROOF.bitumen;
              place(
                "house",
                cu - cw / 2 + px * (a + 0.5),
                cv - cd / 2 + pz * (b + 0.5),
                w,
                houseHeight * (0.8 + 0.4 * rng.next()),
                dd,
                rng.pick(HOUSE_TINTS),
                roof,
                0,
                yaw,
              );
            }
          }
        }
      }
    }
  }
  // Lamps along every street inside the outline; avenues carry LED white on
  // both sides, side streets sodium orange; the suburbs keep fewer.
  if (!off) {
    const spacing = 0.26 / Math.sqrt(detail);
    const sodium: [number, number, number] = [1.0, 0.55, 0.16];
    const led: [number, number, number] = [0.9, 0.9, 0.82];
    // Only the arterials went LED in Poland: a few side streets in a metro,
    // none worth mentioning in a town — the sodium orange stays the signature.
    const ledShare = 0.02 + 0.16 * scale;
    const along = (fixed: Street, axis: "u" | "v"): void => {
      const lines = fixed.avenue
        ? [fixed.at - fixed.width * 0.35, fixed.at + fixed.width * 0.35]
        : [fixed.at];
      const ledLine = fixed.avenue || rng.next() < ledShare;
      for (const line of lines) {
        for (let t = -extent; t <= extent; t += spacing) {
          const s = t + (rng.next() - 0.5) * spacing * 0.4;
          const u = axis === "u" ? line : s;
          const v = axis === "u" ? s : line;
          const hash = rng.next();
          const d = shape(u, v);
          if (d > 1.02) continue;
          if (d > 0.62 && hash > 0.78 - 0.5 * smoothstep(0.62, 1.02, d)) continue;
          const p = toWorld(u, v);
          const y = terrain.heightAt(p.x, p.z);
          if (y < seaLevel + 0.03) continue;
          const bright = 0.4 + 0.3 * rng.next();
          const base = ledLine ? led : sodium;
          lamps.push({
            x: p.x,
            y: y + 0.05,
            z: p.z,
            size: fixed.avenue ? 0.16 : 0.12,
            color: [base[0] * bright, base[1] * bright, base[2] * bright],
            hash,
          });
        }
      }
    };
    for (const street of us) along(street, "u");
    for (const street of vs) along(street, "v");
  }

  // Amber over every town; the metros' cores drift toward LED white only a little.
  const glow: [number, number, number] = [1.0, lerp(0.58, 0.72, scale), lerp(0.2, 0.42, scale)];
  return {
    id: city.id,
    centre: { x: centre.x, y: centreY, z: centre.z },
    radiusKm: radius,
    glow,
    buildings,
    lamps,
  };
}
