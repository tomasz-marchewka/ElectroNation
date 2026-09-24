// The relief of the country (docs/08 §2, ARCHITECTURE.md §5–§6): a continuous
// heightfield over the board plus a skirt, in kilometres with the ×3 vertical
// exaggeration of render/core/exaggeration.ts already folded into RELIEF_KM.
//
// Every hex contributes its terrain band through a distance kernel over the
// nearest centres, so a hex reads as its own kind in its middle and blends
// into its neighbours over a ~10 km band along the edge. Seeded noise adds
// ridges to mountains, rolling hills to highlands and a faint swell to the
// plains; shores ease to a beach and water basins deepen away from it; every
// land hex gets a flat building pad around its centre. Beyond the board the
// edge profile continues, fades over the skirt to a low plain or the open
// sea, and a geometrically coarsening grid carries it to the horizon. What
// the vertices carry for the ground is only what follows the relief and the
// water — a town's pavement, the beach, the seabed; the hexes' own ground and
// its soft borders are drawn per pixel (blend.ts).
//
// Deterministic: the field depends on the board and the renderer PRNG stream
// only; the noise is trig-free so any engine computes the same bits.

import type { WorldBoard, WorldHex } from "../../bridge/worldScene";
import { RELIEF_KM } from "../core/exaggeration";
import type { Rng } from "../core/prng";
import { HEX_PITCH_KM, HEX_RADIUS_KM, axialToOffset, worldToHex } from "../core/units";
import { clamp, fbm, gradientNoise, lerp, ridged, smoothstep } from "./noise";

type TerrainKind = WorldHex["terrain"];

/** Index of each terrain kind in the weight accumulator. */
const KIND_INDEX: Record<TerrainKind, number> = {
  plains: 0,
  forest: 1,
  highlands: 2,
  swamp: 3,
  urban: 4,
  mountains: 5,
  lake: 6,
  sea: 7,
};
const KINDS: readonly TerrainKind[] = [
  "plains",
  "forest",
  "highlands",
  "swamp",
  "urban",
  "mountains",
  "lake",
  "sea",
];
const LAKE = KIND_INDEX.lake;
const SEA = KIND_INDEX.sea;

/** Kernel radius of the hex blend: 1.2 × pitch — the six neighbours count, the ring beyond does not. */
const KERNEL_KM = 1.2 * HEX_PITCH_KM;
/** Flat building pad around every land hex centre and the radius its blend ends at [km]. */
export const PAD_FLAT_KM = 4;
export const PAD_BLEND_KM = 7;
/** Shore height the land eases to next to water [km]. */
const BEACH_KM = 0.03;
/**
 * Height of the far plain the skirt fades to on land edges [km]. With its
 * noise it stays above sea level: the water reads the border of the uniform
 * grid outward (water.ts) and must find dry land there.
 */
const FAR_PLAIN_KM = 0.06;
/** Sea floor the skirt fades to on sea edges [km]. */
const FAR_SEA_KM = -0.55;
/** Radius of the ring the sky-visibility term compares a vertex against [km]. */
const OCCLUSION_RING_KM = 6;
/** Depth below the ring's mean [km] at which the sky visibility bottoms out. */
const OCCLUSION_DEPTH_KM = 0.9;
/** Sky visibility at the bottom of a hollow. */
const OCCLUSION_FLOOR = 0.55;
/** Distances between the coarsening rows beyond the skirt [km], outward. */
const FAR_STEPS = [3, 5, 8, 12, 18, 27, 40, 60, 90, 130, 200, 300, 450, 700, 1000];

export interface FieldOptions {
  /** Vertex spacing inside the board and the skirt [km]. */
  cellKm: number;
  /** Width of the skirt around the board over which the relief fades [km]. */
  skirtKm: number;
}

interface HexCell {
  hex: WorldHex;
  kind: number;
  neighbours: HexCell[];
  /** Height of the flattened building pad, computed on first use. */
  pad: number;
}

/** One sample of the field: the height and the ground cover. */
export interface FieldSample {
  height: number;
  /** Weights of a town's pavement, the beach and the seabed; the rest is the hexes' own ground. */
  pavement: number;
  beach: number;
  seabed: number;
  /** 0 sea … 1 lake where there is water, 0 on land. */
  lakeness: number;
}

export interface HeightField {
  nx: number;
  nz: number;
  /** Vertex coordinates along each axis [km], ascending, uniform inside the skirt. */
  xs: Float64Array;
  zs: Float64Array;
  /** Row-major (z outer, x inner) vertex data. */
  heights: Float32Array;
  normals: Float32Array;
  /**
   * Four per vertex: the pavement, beach and seabed weights (FieldSample),
   * then the sky visibility 0..1 from the relief — valleys and hollows
   * shaded, crests open.
   */
  cover: Float32Array;
  lakeness: Float32Array;
  /** The uniform part of the grid — what the water reads as a texture. */
  inner: { ix0: number; iz0: number; nx: number; nz: number; x0: number; z0: number; cell: number };
  /** Board rectangle [km]. */
  board: { x0: number; z0: number; x1: number; z1: number };
  minHeight: number;
  maxHeight: number;
  heightAt(x: number, z: number): number;
  /** Bilinear over the field; the pad height of a hex is what objects stand on. */
  padHeightAt(hex: { q: number; r: number }): number;
}

function axisCoordinates(
  from: number,
  to: number,
  cell: number,
): {
  xs: Float64Array;
  i0: number;
  count: number;
  step: number;
} {
  const count = Math.max(2, Math.round((to - from) / cell) + 1);
  const step = (to - from) / (count - 1);
  const tails = FAR_STEPS.length;
  const xs = new Float64Array(count + 2 * tails);
  for (let i = 0; i < count; i++) xs[tails + i] = from + step * i;
  let left = from;
  let right = to;
  for (let k = 0; k < tails; k++) {
    left -= FAR_STEPS[k]!;
    right += FAR_STEPS[k]!;
    xs[tails - 1 - k] = left;
    xs[tails + count + k] = right;
  }
  return { xs, i0: tails, count, step };
}

/** Builds the field for a board; `rng` is the module's relief stream. */
export function buildHeightField(board: WorldBoard, rng: Rng, options: FieldOptions): HeightField {
  const cells = new Map<string, HexCell>();
  const byOffset: HexCell[][] = [];
  for (const hex of board.hexes) {
    const cell: HexCell = {
      hex,
      kind: KIND_INDEX[hex.terrain],
      neighbours: [],
      pad: Number.NaN,
    };
    cells.set(hex.key, cell);
    (byOffset[hex.col] ??= [])[hex.row] = cell;
  }
  const AXIAL_NEIGHBOURS = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ] as const;
  for (const cell of cells.values()) {
    for (const [dq, dr] of AXIAL_NEIGHBOURS) {
      const neighbour = cells.get(`${cell.hex.q + dq},${cell.hex.r + dr}`);
      if (neighbour) cell.neighbours.push(neighbour);
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const hex of board.hexes) {
    minX = Math.min(minX, hex.x);
    maxX = Math.max(maxX, hex.x);
    minZ = Math.min(minZ, hex.z);
    maxZ = Math.max(maxZ, hex.z);
  }
  const rect = {
    x0: minX - HEX_RADIUS_KM,
    x1: maxX + HEX_RADIUS_KM,
    z0: minZ - HEX_PITCH_KM / 2,
    z1: maxZ + HEX_PITCH_KM / 2,
  };

  const reliefNoise = gradientNoise(rng);
  const ridgeNoise = gradientNoise(rng);
  const macroNoise = gradientNoise(rng);
  const crestNoise = gradientNoise(rng);

  const ownCellAt = (x: number, z: number): HexCell => {
    const axial = worldToHex({ x, z });
    const offset = axialToOffset(axial);
    const col = clamp(offset.col, 0, board.cols - 1);
    const row = clamp(offset.row, 0, board.rows - 1);
    const cell = byOffset[col]?.[row];
    if (!cell) throw new Error(`terrain: no hex at offset ${col},${row}`);
    return cell;
  };

  const weights = new Float64Array(8);
  const sharp = new Float64Array(8);
  const newSample = (): FieldSample => ({
    height: 0,
    pavement: 0,
    beach: 0,
    seabed: 0,
    lakeness: 0,
  });
  const sample = newSample();

  const sampleAt = (x: number, z: number, out: FieldSample, withPad: boolean): void => {
    const cx = clamp(x, rect.x0, rect.x1);
    const cz = clamp(z, rect.z0, rect.z1);
    const dOut = Math.hypot(x - cx, z - cz);
    const own = ownCellAt(cx, cz);

    // Two kernels over the same centres: a quadratic one blends the HEIGHT
    // bands softly across a hex border, an eighth-power one keeps a town's
    // pavement and the water's share its own to within ~3 km of the border.
    weights.fill(0);
    sharp.fill(0);
    let sumW = 0;
    let sumS = 0;
    let pave = 0;
    const accumulate = (cell: HexCell): void => {
      const d = Math.hypot(cx - cell.hex.x, cz - cell.hex.z);
      if (d >= KERNEL_KM) return;
      const k = 1 - d / KERNEL_KM;
      const w = k * k;
      const s = w * w * w * w;
      sumW += w;
      sumS += s;
      weights[cell.kind] = (weights[cell.kind] ?? 0) + w;
      sharp[cell.kind] = (sharp[cell.kind] ?? 0) + s;
      if (cell.kind === KIND_INDEX.urban) pave += s * (1 - smoothstep(6, 11.5, d));
    };
    accumulate(own);
    for (const neighbour of own.neighbours) accumulate(neighbour);
    if (sumW < 1e-9) {
      weights.fill(0);
      sharp.fill(0);
      weights[own.kind] = 1;
      sharp[own.kind] = 1;
      sumW = 1;
      sumS = 1;
    }
    for (let k = 0; k < 8; k++) {
      weights[k] = weights[k]! / sumW;
      sharp[k] = sharp[k]! / sumS;
    }
    pave /= sumS;

    const wWater = weights[LAKE]! + weights[SEA]!;
    const landW = Math.max(1 - wWater, 1e-6);
    let landBand = 0;
    for (let k = 0; k < 8; k++) {
      if (k === LAKE || k === SEA) continue;
      landBand += weights[k]! * RELIEF_KM[KINDS[k]!];
    }
    landBand /= landW;
    const waterBand =
      wWater > 1e-6
        ? (weights[SEA]! * RELIEF_KM.sea + weights[LAKE]! * RELIEF_KM.lake) / wWater
        : RELIEF_KM.sea;

    // Relief detail in world kilometres — the same noise on both sides of a
    // hex edge. The ridged terms sit around 0.55 with a spread of 0.2, so the
    // factors below are about five times the crest height they draw [km].
    const nF = fbm(reliefNoise, x / 12, z / 12, 5);
    // Ridges at 13 km: the finest relief a 2–3 km mesh cell still resolves as a crest.
    const nR = ridged(ridgeNoise, x / 13, z / 13, 4);
    const nM = fbm(macroNoise, x / 70, z / 70, 2);
    // Crest lines at the scale of a hex: the range reads as ridges and
    // valleys, not as one dome per mountain hex.
    const nC = ridged(crestNoise, x / 30, z / 30, 3);
    const m = weights[KIND_INDEX.mountains]! / landW;
    const h = weights[KIND_INDEX.highlands]! / landW;
    const f = weights[KIND_INDEX.forest]! / landW;
    const p = weights[KIND_INDEX.plains]! / landW;
    const u = weights[KIND_INDEX.urban]! / landW;
    const s = weights[KIND_INDEX.swamp]! / landW;
    const detail =
      m * (3.0 * (nC - 0.55) + 4.0 * (nR - 0.55) + 0.3 * nF + 0.5 * nM) +
      h * (0.8 * (nC - 0.55) + 0.42 * nF + 0.9 * (nR - 0.55) + 0.28 * nM) +
      f * (0.12 * nF + 0.06 * nM) +
      p * (0.045 * nF + 0.03 * nM) +
      u * 0.03 * nF +
      s * 0.012 * nF;

    // Shore: land eases to a beach toward the edge, water deepens toward its centre.
    const shore = smoothstep(0, 0.5, wWater);
    const landH = lerp(landBand + detail, BEACH_KM + 0.015 * nF, shore);
    const basin = smoothstep(0.5, 0.92, wWater);
    const waterH = lerp(-0.02, waterBand + 0.1 * nF * basin, basin);
    const cross = smoothstep(0.44, 0.56, wWater);
    let height = lerp(landH, waterH, cross);

    // Building pad: flat around a land hex centre, blended out to PAD_BLEND_KM.
    if (withPad && dOut === 0 && own.kind !== LAKE && own.kind !== SEA) {
      const dOwn = Math.hypot(cx - own.hex.x, cz - own.hex.z);
      if (dOwn < PAD_BLEND_KM) {
        if (Number.isNaN(own.pad)) {
          const centre = newSample();
          sampleAt(own.hex.x, own.hex.z, centre, false);
          own.pad = centre.height;
        }
        height = lerp(height, own.pad, 1 - smoothstep(PAD_FLAT_KM, PAD_BLEND_KM, dOwn));
      }
    }

    // Skirt: the edge profile continues and fades to the far plain or the open sea.
    if (dOut > 0) {
      const t = smoothstep(0, options.skirtKm, dOut);
      const band = lerp(landBand, waterBand, cross);
      const far = lerp(
        FAR_SEA_KM + 0.04 * nF,
        FAR_PLAIN_KM + 0.02 * nF + 0.02 * nM,
        smoothstep(-0.2, 0.1, band),
      );
      height = lerp(height, far, t);
    }

    // Ground cover: a town's pavement on the land, then the beach, then the
    // seabed. The land that is left is the hexes' own ground.
    const landS = Math.max(1 - sharp[LAKE]! - sharp[SEA]!, 1e-6);
    const beach =
      smoothstep(0.15, 0.42, wWater) *
      (1 - smoothstep(0.42, 0.56, wWater)) *
      (1 - smoothstep(0.8, 2.0, landBand));
    const seabed = smoothstep(0.44, 0.62, wWater);
    const land = (1 - beach) * (1 - seabed);
    out.pavement = (pave / landS) * land;
    out.beach = beach * (1 - seabed);
    out.seabed = seabed;
    out.height = height;
    out.lakeness = wWater > 1e-6 ? weights[LAKE]! / wWater : 0;
  };

  // --- the grid ---------------------------------------------------------------
  const ax = axisCoordinates(rect.x0 - options.skirtKm, rect.x1 + options.skirtKm, options.cellKm);
  const az = axisCoordinates(rect.z0 - options.skirtKm, rect.z1 + options.skirtKm, options.cellKm);
  const nx = ax.xs.length;
  const nz = az.xs.length;
  const count = nx * nz;
  const heights = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const cover = new Float32Array(count * 4);
  const lakeness = new Float32Array(count);
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (let iz = 0; iz < nz; iz++) {
    const z = az.xs[iz]!;
    for (let ix = 0; ix < nx; ix++) {
      const x = ax.xs[ix]!;
      sampleAt(x, z, sample, true);
      const i = iz * nx + ix;
      heights[i] = sample.height;
      minHeight = Math.min(minHeight, sample.height);
      maxHeight = Math.max(maxHeight, sample.height);
      cover[i * 4] = sample.pavement;
      cover[i * 4 + 1] = sample.beach;
      cover[i * 4 + 2] = sample.seabed;
      lakeness[i] = sample.lakeness;
    }
  }
  // Normals from central differences on the grid itself, so shading matches the mesh.
  for (let iz = 0; iz < nz; iz++) {
    const zPrev = Math.max(0, iz - 1);
    const zNext = Math.min(nz - 1, iz + 1);
    const dz = az.xs[zNext]! - az.xs[zPrev]!;
    for (let ix = 0; ix < nx; ix++) {
      const xPrev = Math.max(0, ix - 1);
      const xNext = Math.min(nx - 1, ix + 1);
      const dx = ax.xs[xNext]! - ax.xs[xPrev]!;
      const dhdx = (heights[iz * nx + xNext]! - heights[iz * nx + xPrev]!) / dx;
      const dhdz = (heights[zNext * nx + ix]! - heights[zPrev * nx + ix]!) / dz;
      const length = Math.hypot(dhdx, 1, dhdz);
      const i = (iz * nx + ix) * 3;
      normals[i] = -dhdx / length;
      normals[i + 1] = 1 / length;
      normals[i + 2] = -dhdz / length;
    }
  }

  // Cavity from the relief: a vertex below the mean of its ~6 km ring sees
  // less sky. Carried per vertex so the valleys keep their read under a flat
  // overcast light, when the sun no longer draws the ridges (docs/08 §3).
  const ring = Math.max(1, Math.round(OCCLUSION_RING_KM / options.cellKm));
  for (let iz = 0; iz < nz; iz++) {
    const zA = Math.max(0, iz - ring);
    const zB = Math.min(nz - 1, iz + ring);
    for (let ix = 0; ix < nx; ix++) {
      const xA = Math.max(0, ix - ring);
      const xB = Math.min(nx - 1, ix + ring);
      const mean =
        (heights[iz * nx + xA]! +
          heights[iz * nx + xB]! +
          heights[zA * nx + ix]! +
          heights[zB * nx + ix]! +
          heights[zA * nx + xA]! +
          heights[zA * nx + xB]! +
          heights[zB * nx + xA]! +
          heights[zB * nx + xB]!) /
        8;
      const cavity = heights[iz * nx + ix]! - mean;
      cover[(iz * nx + ix) * 4 + 3] = lerp(
        OCCLUSION_FLOOR,
        1,
        smoothstep(-OCCLUSION_DEPTH_KM, OCCLUSION_DEPTH_KM * 0.5, cavity),
      );
    }
  }

  const locate = (xs: Float64Array, i0: number, n: number, x0: number, step: number, v: number) => {
    const last = xs.length - 2;
    if (v < xs[0]! || v > xs[last + 1]!) return -1;
    if (v >= x0 && v <= x0 + step * (n - 1)) {
      return i0 + Math.min(n - 2, Math.floor((v - x0) / step));
    }
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (xs[mid]! <= v) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const heightAt = (x: number, z: number): number => {
    const ix = locate(ax.xs, ax.i0, ax.count, ax.xs[ax.i0]!, ax.step, x);
    const iz = locate(az.xs, az.i0, az.count, az.xs[az.i0]!, az.step, z);
    if (ix < 0 || iz < 0) return 0;
    const tx = (x - ax.xs[ix]!) / (ax.xs[ix + 1]! - ax.xs[ix]!);
    const tz = (z - az.xs[iz]!) / (az.xs[iz + 1]! - az.xs[iz]!);
    const h00 = heights[iz * nx + ix]!;
    const h10 = heights[iz * nx + ix + 1]!;
    const h01 = heights[(iz + 1) * nx + ix]!;
    const h11 = heights[(iz + 1) * nx + ix + 1]!;
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  };

  return {
    nx,
    nz,
    xs: ax.xs,
    zs: az.xs,
    heights,
    normals,
    cover,
    lakeness,
    inner: {
      ix0: ax.i0,
      iz0: az.i0,
      nx: ax.count,
      nz: az.count,
      x0: ax.xs[ax.i0]!,
      z0: az.xs[az.i0]!,
      cell: ax.step,
    },
    board: rect,
    minHeight,
    maxHeight,
    heightAt,
    padHeightAt(hex) {
      const cell = cells.get(`${hex.q},${hex.r}`);
      if (!cell) return 0;
      if (Number.isNaN(cell.pad)) {
        const centre = newSample();
        sampleAt(cell.hex.x, cell.hex.z, centre, false);
        cell.pad = centre.height;
      }
      return cell.pad;
    },
  };
}

/** Indexed triangle list of the grid; each cell splits along its flatter diagonal. */
export function fieldIndices(field: HeightField): Uint32Array {
  const { nx, nz, heights } = field;
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      const diagonalAD = Math.abs(heights[a]! - heights[d]!);
      const diagonalBC = Math.abs(heights[b]! - heights[c]!);
      // Counter-clockwise seen from above (+Y), so the faces point up.
      if (diagonalAD <= diagonalBC) {
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = d;
        indices[k++] = a;
        indices[k++] = d;
        indices[k++] = b;
      } else {
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }
  }
  return indices;
}

/** Interleaved xyz positions of the grid vertices. */
export function fieldPositions(field: HeightField): Float32Array {
  const { nx, nz, xs, zs, heights } = field;
  const positions = new Float32Array(nx * nz * 3);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      positions[i * 3] = xs[ix]!;
      positions[i * 3 + 1] = heights[i]!;
      positions[i * 3 + 2] = zs[iz]!;
    }
  }
  return positions;
}
