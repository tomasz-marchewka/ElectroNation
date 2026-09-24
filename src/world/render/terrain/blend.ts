// Soft borders between hexes (docs/08 §3). The ground of a point is not the
// ground of the one hex it lies in: it is a blend of the three hexes around it
// — the corners of its cell in the triangular lattice of hex centres, the way
// hex tiling blends a texture with itself (Mikkelsen, JCGT 2022), here on the
// board's own grid. Each hex weighs in with its barycentric coordinate, pushed
// by its own channel of a slow noise so the border wanders around the straight
// hex edge instead of following it, and frayed by a fine one — hard where the
// ground is wild (a forest's edge, heath, scree, marsh: tongues, bays and
// islands), gently where fields meet (the border of two field systems bends
// like the road that runs along it). A narrow band around that border keeps
// the edge crisp: two patterns never cross-fade into a double exposure.
// Biomes and the variants of one biome both meet this way, never along the
// board outline. Water has no ground of its own and never takes part.
//
// The hex centre stays its own: a border wanders at most ~8 km off the
// straight edge (±2 km typically), so no neighbour weighs in within ~4 km of
// a centre — the flat building pad is always the hex's alone — and most of
// the hex reads as its biome (tests/unit/world/terrain-blend.test.ts).
//
// The shader (terrainMaterial.ts) draws the blend per pixel; this module is the
// same arithmetic on the CPU — the trees stand where the forest's share is
// (forest.ts) — and the noise both of them read, a texture painted once per
// page from a fixed seed.

import * as THREE from "three";
import type { WorldHex } from "../../bridge/worldScene";
import { worldRng } from "../core/prng";
import { fbm } from "../core/textures";
import { COLUMN_STEP_KM, ROW_STEP_KM } from "../core/units";

/** World size of one tile of the blend noise [km]: 16, 8 and 4 km features. */
export const BLEND_TILE_KM = 160;
/**
 * World size of the tile the fine fray reads the same noise at [km], turned
 * by FINE_TURN so its lattice never lines up with the coarse one: 2.3, 1.2
 * and 0.6 km features.
 */
export const FINE_TILE_KM = 23;
const FINE_TURN = 0.6;
const FINE_COS = Math.cos(FINE_TURN);
const FINE_SIN = Math.sin(FINE_TURN);
/**
 * How far the slow noise pushes a hex's weight [barycentric units]. Along
 * the line between two centres a unit is the 25 km pitch and the border sits
 * where the two pushed weights meet, so it wanders by about ±2 km typically.
 */
export const BLEND_WANDER = 0.22;
/** How far the fine noise frays it, times the hex's own fray (BLEND_FRAY_OF). */
export const BLEND_FRAY = 0.1;
/**
 * Fray of each kind of ground: wild ground frays fully; fields — and the
 * town among them — meet along gentle bends.
 */
export const BLEND_FRAY_OF: Readonly<Record<WorldHex["terrain"], number>> = {
  plains: 0.3,
  urban: 0.3,
  forest: 1,
  highlands: 1,
  mountains: 1,
  swamp: 1,
  lake: -1,
  sea: -1,
};
/**
 * Width of the blend band at its narrowest [barycentric units]: a weight
 * falls from even to nothing over 12.5 × this [km] — a crisp, bent edge
 * like a forest's or a field's, not a cross-fade of two patterns. The shader
 * widens it to a pixel and a half where a pixel is wider, so the edge never
 * stair-steps at the strategic view.
 */
export const BLEND_WIDTH = 0.024;
/**
 * How fast two hexes' barycentric weights part away from their border [per
 * km] — two slopes of one per 21.65 km (a cell's height) at 120°: 0.08 per
 * km. The noise bends it, so a distance read from it is an estimate.
 */
export const BLEND_PER_KM = Math.sqrt(3) / COLUMN_STEP_KM;
/** Where a hex that has no ground puts its weight, far below any land's. */
const NO_GROUND = -8;
/** Texels across the noise tile, and the lattice of its coarsest octave. */
const NOISE_SIZE = 512;
const NOISE_LATTICE = 10;
const NOISE_OCTAVES = 3;
/** Bins of the histogram that spreads a channel evenly — far finer than its 256 levels. */
const HISTOGRAM_BINS = 4096;

/** Three independent noise channels over the ground, 0..1, evenly spread. */
export interface BlendNoise {
  texture: THREE.DataTexture;
  /** The channels at (u, v) in tiles, as the shader reads them (bilinear, no mips). */
  sample(u: number, v: number, out: Float64Array): void;
}

/**
 * How a hex takes part in the blend: its fray, or a negative number where it
 * has no ground (water).
 */
export type FrayOf = (q: number, r: number) => number;

/** The three hexes around a ground point and their weights. */
export interface HexBlend {
  /** Axial coordinates of the three hexes. */
  q: Int32Array;
  r: Int32Array;
  /** Their weights, summing to 1 over the land; all zero where none of them is land. */
  w: Float64Array;
  /**
   * Their pushed barycentric weights: the border between two hexes is where
   * theirs meet, and they part by about BLEND_PER_KM away from it.
   */
  pushed: Float64Array;
  /** How far the point is from the nearest border, in pushed weight. */
  gap: number;
}

export function newHexBlend(): HexBlend {
  return {
    q: new Int32Array(3),
    r: new Int32Array(3),
    w: new Float64Array(3),
    pushed: new Float64Array(3),
    gap: 0,
  };
}

let painted: BlendNoise | null = null;

/**
 * The blend noise, painted once per page: three fractal value-noise channels
 * (fixed seed — a texture is not part of the game's randomness), each spread
 * evenly over 0..1 through its own histogram, so the wander of a border does
 * not depend on how a channel happens to be distributed.
 */
export function blendNoise(): BlendNoise {
  if (painted) return painted;
  const rng = worldRng(0x5eed, "texture:terrain-blend");
  const count = NOISE_SIZE * NOISE_SIZE;
  const data = new Uint8Array(count * 4);
  const raw = new Float64Array(count);
  const bins = new Float64Array(HISTOGRAM_BINS);
  for (let channel = 0; channel < 3; channel++) {
    const field = fbm(NOISE_LATTICE, NOISE_OCTAVES, rng);
    for (let y = 0; y < NOISE_SIZE; y++) {
      for (let x = 0; x < NOISE_SIZE; x++) {
        raw[y * NOISE_SIZE + x] = field.at(
          (x / NOISE_SIZE) * NOISE_LATTICE,
          (y / NOISE_SIZE) * NOISE_LATTICE,
        );
      }
    }
    // Each value to the share of values below it: the middle of its bin in
    // the cumulative histogram.
    const bin = (value: number): number =>
      Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor(value * HISTOGRAM_BINS)));
    bins.fill(0);
    for (let i = 0; i < count; i++) bins[bin(raw[i]!)]! += 1;
    let below = 0;
    for (let b = 0; b < HISTOGRAM_BINS; b++) {
      const inBin = bins[b]!;
      bins[b] = (below + inBin / 2) / count;
      below += inBin;
    }
    for (let i = 0; i < count; i++) {
      data[i * 4 + channel] = Math.min(255, Math.floor(bins[bin(raw[i]!)]! * 256));
    }
  }
  for (let i = 0; i < count; i++) data[i * 4 + 3] = 255;

  const texture = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  texture.name = "terrain-blend";
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  const wrap = (i: number): number => ((i % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
  painted = {
    texture,
    sample(u, v, out) {
      // Texel centres at (i + ½) / size, as the GPU filters.
      const x = u * NOISE_SIZE - 0.5;
      const y = v * NOISE_SIZE - 0.5;
      const i0 = Math.floor(x);
      const j0 = Math.floor(y);
      const tx = x - i0;
      const ty = y - j0;
      const a = (wrap(j0) * NOISE_SIZE + wrap(i0)) * 4;
      const b = (wrap(j0) * NOISE_SIZE + wrap(i0 + 1)) * 4;
      const c = (wrap(j0 + 1) * NOISE_SIZE + wrap(i0)) * 4;
      const d = (wrap(j0 + 1) * NOISE_SIZE + wrap(i0 + 1)) * 4;
      for (let k = 0; k < 3; k++) {
        const top = data[a + k]! + (data[b + k]! - data[a + k]!) * tx;
        const bottom = data[c + k]! + (data[d + k]! - data[c + k]!) * tx;
        out[k] = (top + (bottom - top) * ty) / 255;
      }
    },
  };
  return painted;
}

/** Releases the noise texture (the next build paints it again). */
export function disposeBlendNoise(): void {
  painted?.texture.dispose();
  painted = null;
}

const coarse = new Float64Array(3);
const fine = new Float64Array(3);

/**
 * The three hexes around (x, z) and their blend weights — the arithmetic of
 * the shader's `enHexCorners` and `enHexWeights`, which do the same (and skip
 * a noise tap only where it cannot change the result).
 *
 * In axial coordinates the hex centres are the integer lattice; the unit
 * rhombus at floor(q, r) splits along its short diagonal into two triangles
 * of mutually neighbouring hexes. Each hex reads the noise channel of its
 * colour (q − r) mod 3 — every triangle has one hex of each colour, so a hex
 * reads the same channel in all six triangles around it and its weight is
 * continuous across them.
 */
export function hexBlend(
  x: number,
  z: number,
  noise: BlendNoise,
  frayOf: FrayOf,
  out: HexBlend,
): HexBlend {
  const q = x / COLUMN_STEP_KM;
  const r = z / ROW_STEP_KM - 0.5 * q;
  const q0 = Math.floor(q);
  const r0 = Math.floor(r);
  const fq = q - q0;
  const fr = r - r0;
  const upper = fq + fr > 1;
  out.q[0] = upper ? q0 + 1 : q0;
  out.r[0] = upper ? r0 + 1 : r0;
  out.q[1] = q0 + 1;
  out.r[1] = r0;
  out.q[2] = q0;
  out.r[2] = r0 + 1;
  const bary = [upper ? fq + fr - 1 : 1 - fq - fr, upper ? 1 - fr : fq, upper ? 1 - fq : fr];
  const colour = (((q0 - r0) % 3) + 3) % 3;
  noise.sample(x / BLEND_TILE_KM, z / BLEND_TILE_KM, coarse);
  noise.sample(
    (FINE_COS * x - FINE_SIN * z) / FINE_TILE_KM,
    (FINE_SIN * x + FINE_COS * z) / FINE_TILE_KM,
    fine,
  );
  const pushed = out.pushed;
  for (let i = 0; i < 3; i++) {
    const fray = frayOf(out.q[i]!, out.r[i]!);
    const channel = (colour + i) % 3;
    pushed[i] =
      fray < 0
        ? NO_GROUND
        : bary[i]! +
          BLEND_WANDER * (2 * coarse[channel]! - 1) +
          BLEND_FRAY * fray * (2 * fine[channel]! - 1);
  }
  const top = Math.max(pushed[0]!, pushed[1]!, pushed[2]!);
  const middle = Math.max(
    Math.min(pushed[0]!, pushed[1]!),
    Math.min(Math.max(pushed[0]!, pushed[1]!), pushed[2]!),
  );
  out.gap = top - middle;
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    const t = Math.min(1, Math.max(0, (pushed[i]! - top) / BLEND_WIDTH + 1));
    const w = pushed[i] === NO_GROUND ? 0 : t * t * (3 - 2 * t);
    out.w[i] = w;
    sum += w;
  }
  for (let i = 0; i < 3; i++) out.w[i] = sum > 0 ? out.w[i]! / sum : 0;
  return out;
}

/** GLSL constants of the blend, so the shader and this module never disagree. */
export const BLEND_GLSL = {
  tile: BLEND_TILE_KM.toFixed(1),
  fineTile: FINE_TILE_KM.toFixed(1),
  fineCos: FINE_COS.toFixed(6),
  fineSin: FINE_SIN.toFixed(6),
  wander: BLEND_WANDER.toFixed(4),
  fray: BLEND_FRAY.toFixed(4),
  width: BLEND_WIDTH.toFixed(4),
  perKm: BLEND_PER_KM.toFixed(6),
  noGround: NO_GROUND.toFixed(1),
  columnStep: COLUMN_STEP_KM.toFixed(6),
  rowStep: ROW_STEP_KM.toFixed(6),
};
