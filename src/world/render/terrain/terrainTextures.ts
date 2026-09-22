// Procedural surfaces of the relief model (ARCHITECTURE.md §14): every ground
// material is painted here from the seeded, tileable noise of
// render/core/textures.ts — nothing is downloaded, nothing is bundled and
// every session paints the same pixels. The eight ground layers live in two
// texture arrays (albedo + roughness in alpha, tangent-space normals), so the
// terrain shader blends them with two samplers instead of sixteen.
//
// Legibility first (docs/08 §3): each layer has its own hue family, so a hex
// reads as its biome from the strategic view — fresh green-and-straw fields,
// dark saturated forest floor, ochre heather moor, olive-teal marsh, grey
// granite, pale concrete, sand and snow.

import * as THREE from "three";
import { worldRng, type Rng } from "../core/prng";
import { fbm, normalMapFromHeight, proceduralTexture, type NoiseField } from "../core/textures";

export const LAYER_SIZE = 512;

/** Ground layers in the order of the vertex weights and the array slices. */
export const LAYERS = [
  "grass",
  "canopy",
  "rock",
  "moor",
  "wet",
  "pavement",
  "sand",
  "snow",
] as const;

/** World size of one tile of each layer [km], LAYERS order. */
export const LAYER_TILE_KM: readonly number[] = [9, 5.5, 11, 8, 6, 4.2, 6, 6];

/**
 * World size of the range's relief normal tile [km]: its ridges run 5–8 km
 * apart, one octave under the 2–3 km mesh, and still cover ~15 px at the
 * strategic view (0,4 km per pixel), so the crest read survives the mips.
 */
export const RELIEF_TILE_KM = 40;

type Rgb = [number, number, number];
type Fields = Record<string, number>;

interface LayerSpec {
  fields: Record<string, { lattice: number; octaves: number }>;
  /** Relief of the surface, 0..1. */
  height(u: number, v: number, f: Fields): number;
  /** sRGB colour and roughness at a pixel. */
  surface(u: number, v: number, f: Fields, h: number): [number, number, number, number];
  /** Normal-map strength. */
  bump: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** Triangle wave 0..1 with period 1. */
function tri(x: number): number {
  return Math.abs(fract(x) * 2 - 1);
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function scaleRgb(a: Rgb, k: number): Rgb {
  return [a[0] * k, a[1] * k, a[2] * k];
}

interface Cell {
  id: number;
  d1: number;
  d2: number;
}

/**
 * Tileable cellular pattern: nu × nv jittered cell centres; returns the id of
 * the nearest and the distances to the nearest two — fields and hedgerows.
 */
function worley(nu: number, nv: number, rng: Rng): (u: number, v: number) => Cell {
  const centres = new Float32Array(nu * nv * 2);
  for (let i = 0; i < nu * nv; i++) {
    centres[i * 2] = 0.15 + rng.next() * 0.7;
    centres[i * 2 + 1] = 0.15 + rng.next() * 0.7;
  }
  return (u, v) => {
    const cu = Math.floor(u * nu);
    const cv = Math.floor(v * nv);
    let d1 = Number.POSITIVE_INFINITY;
    let d2 = Number.POSITIVE_INFINITY;
    let id = 0;
    for (let dv = -1; dv <= 1; dv++) {
      for (let du = -1; du <= 1; du++) {
        const gu = cu + du;
        const gv = cv + dv;
        const wu = ((gu % nu) + nu) % nu;
        const wv = ((gv % nv) + nv) % nv;
        const index = wv * nu + wu;
        const px = (gu + centres[index * 2]!) / nu;
        const py = (gv + centres[index * 2 + 1]!) / nv;
        const d = Math.hypot((u - px) * nu, (v - py) * nv);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = index;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    return { id, d1, d2 };
  };
}

/** Crop palette of the lowland fields: pasture, crops, stubble, plough. */
const CROPS: readonly Rgb[] = [
  [0.34, 0.52, 0.17],
  [0.3, 0.49, 0.15],
  [0.42, 0.56, 0.19],
  [0.7, 0.6, 0.27],
  [0.64, 0.57, 0.32],
  [0.4, 0.3, 0.18],
  [0.6, 0.6, 0.2],
  [0.5, 0.52, 0.24],
  [0.36, 0.5, 0.18],
  [0.56, 0.55, 0.26],
];
const HEDGE: Rgb = [0.12, 0.2, 0.07];
const COPSE: Rgb = [0.1, 0.19, 0.06];

/** Per-cell traits of the field pattern, drawn once from the texture seed. */
interface FieldTraits {
  crop: Uint8Array;
  angle: Float32Array;
  /** Strips per tile unit along the cell's furrow direction; 0 = pasture. */
  strips: Float32Array;
}

function fieldTraits(count: number, rng: Rng): FieldTraits {
  const crop = new Uint8Array(count);
  const angle = new Float32Array(count);
  const strips = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    crop[i] = rng.int(CROPS.length);
    angle[i] = rng.next() * Math.PI;
    strips[i] = rng.next() < 0.3 ? 0 : 28 + rng.next() * 30;
  }
  return { crop, angle, strips };
}

function layerSpecs(): Record<(typeof LAYERS)[number], LayerSpec> {
  const fieldRng = worldRng(0x5eed, "texture:terrain-fields");
  const FIELD_U = 5;
  const FIELD_V = 7;
  const fieldsOf = worley(FIELD_U, FIELD_V, fieldRng);
  const traits = fieldTraits(FIELD_U * FIELD_V, fieldRng);
  const fieldAt = (u: number, v: number, f: Fields) => {
    const w = f.warp! - 0.5;
    const cell = fieldsOf(fract(u + w * 0.05), fract(v + w * 0.035));
    const hedge = 1 - smoothstep(0.008, 0.022, cell.d2 - cell.d1);
    const angle = traits.angle[cell.id]!;
    const strips = traits.strips[cell.id]!;
    const along = u * Math.cos(angle) + v * Math.sin(angle);
    const furrow = strips > 0 ? tri(along * strips) : 0.5;
    const copse = smoothstep(0.72, 0.77, f.copse!) * (1 - hedge);
    return { cell, hedge, furrow, copse, strips };
  };
  return {
    grass: {
      fields: {
        grain: { lattice: 48, octaves: 3 },
        warp: { lattice: 5, octaves: 2 },
        copse: { lattice: 14, octaves: 2 },
      },
      height(u, v, f) {
        const { hedge, furrow, copse, strips } = fieldAt(u, v, f);
        const rows = strips > 0 ? furrow * 0.12 : 0;
        return clamp01(0.3 + f.grain! * 0.25 + rows + hedge * 0.35 + copse * 0.45);
      },
      surface(u, v, f) {
        const { cell, hedge, furrow, copse, strips } = fieldAt(u, v, f);
        const tone = CROPS[traits.crop[cell.id]!]!;
        const rows = strips > 0 ? 0.94 + 0.12 * furrow : 1;
        let rgb = scaleRgb(tone, (0.92 + 0.16 * f.grain!) * rows);
        rgb = mixRgb(rgb, HEDGE, hedge * 0.55);
        rgb = mixRgb(rgb, COPSE, copse * 0.85);
        return [rgb[0], rgb[1], rgb[2], 0.92 - 0.04 * copse];
      },
      bump: 2.5,
    },
    canopy: {
      fields: { clumps: { lattice: 24, octaves: 4 }, big: { lattice: 5, octaves: 2 } },
      height(_u, _v, f) {
        return Math.pow(f.clumps!, 1.4) * 0.8 + f.big! * 0.2;
      },
      surface(_u, _v, f) {
        // Saturated green crowns: the forest must not share the marsh's olive.
        const crown = smoothstep(0.32, 0.8, f.clumps!);
        let rgb = mixRgb([0.035, 0.1, 0.03], [0.1, 0.3, 0.07], crown);
        rgb = scaleRgb(rgb, 0.8 + 0.4 * f.big!);
        rgb = mixRgb(rgb, [0.16, 0.36, 0.08], smoothstep(0.6, 0.8, f.big!) * 0.45);
        return [rgb[0], rgb[1], rgb[2], 0.95];
      },
      bump: 4,
    },
    rock: {
      fields: {
        strata: { lattice: 7, octaves: 3 },
        grain: { lattice: 40, octaves: 4 },
        cracks: { lattice: 14, octaves: 3 },
      },
      height(_u, v, f) {
        const step = smoothstep(0, 0.12, fract(v * 8 + f.strata! * 1.6));
        const crack = smoothstep(0.47, 0.5, f.cracks!) * (1 - smoothstep(0.5, 0.535, f.cracks!));
        return clamp01(f.grain! * 0.45 + step * 0.35 - crack * 0.5 + 0.2);
      },
      surface(_u, v, f) {
        const step = smoothstep(0, 0.12, fract(v * 8 + f.strata! * 1.6));
        const crack = smoothstep(0.47, 0.5, f.cracks!) * (1 - smoothstep(0.5, 0.535, f.cracks!));
        let rgb = mixRgb([0.4, 0.4, 0.41], [0.5, 0.44, 0.37], smoothstep(0.55, 0.75, f.strata!));
        rgb = scaleRgb(rgb, (0.72 + 0.4 * f.grain!) * (0.8 + 0.2 * step) * (1 - crack * 0.55));
        return [rgb[0], rgb[1], rgb[2], 0.9 + 0.08 * (1 - f.grain!)];
      },
      bump: 5,
    },
    moor: {
      fields: {
        blotch: { lattice: 6, octaves: 3 },
        grain: { lattice: 40, octaves: 3 },
        stones: { lattice: 26, octaves: 2 },
        heather: { lattice: 12, octaves: 2 },
      },
      height(_u, _v, f) {
        const stone = smoothstep(0.68, 0.74, f.stones!);
        return clamp01(f.grain! * 0.4 + stone * 0.5 + f.blotch! * 0.15 + f.heather! * 0.1);
      },
      surface(_u, _v, f) {
        const stone = smoothstep(0.68, 0.74, f.stones!);
        const heather = smoothstep(0.55, 0.7, f.heather!);
        let rgb = mixRgb([0.56, 0.4, 0.18], [0.48, 0.42, 0.2], smoothstep(0.35, 0.65, f.blotch!));
        rgb = mixRgb(rgb, [0.44, 0.27, 0.22], heather * 0.6);
        rgb = scaleRgb(rgb, 0.85 + 0.3 * f.grain!);
        rgb = mixRgb(rgb, [0.5, 0.48, 0.44], stone);
        return [rgb[0], rgb[1], rgb[2], 0.94];
      },
      bump: 3.5,
    },
    wet: {
      fields: { pools: { lattice: 5, octaves: 3 }, grain: { lattice: 36, octaves: 3 } },
      height(_u, _v, f) {
        const pool = smoothstep(0.56, 0.62, f.pools!);
        const tussock = smoothstep(0.55, 0.8, f.grain!);
        return (1 - pool) * (f.grain! * 0.5 + tussock * 0.45);
      },
      surface(_u, _v, f) {
        // Dark olive sedge with teal pools — the marsh reads apart from the forest.
        const pool = smoothstep(0.52, 0.58, f.pools!);
        const tussock = smoothstep(0.55, 0.8, f.grain!);
        let rgb = scaleRgb([0.24, 0.27, 0.1], 0.85 + 0.3 * f.grain!);
        rgb = mixRgb(rgb, [0.36, 0.38, 0.13], tussock * 0.8);
        rgb = mixRgb(rgb, [0.1, 0.22, 0.24], pool);
        return [rgb[0], rgb[1], rgb[2], 0.9 + (0.25 - 0.9) * pool];
      },
      bump: 3,
    },
    pavement: {
      fields: { grain: { lattice: 48, octaves: 3 }, patch: { lattice: 8, octaves: 2 } },
      height(u, v, f) {
        const gu = fract(u * 6);
        const gv = fract(v * 6);
        const road = Math.max(
          1 - smoothstep(0, 0.04, Math.min(gu, 1 - gu)),
          1 - smoothstep(0, 0.04, Math.min(gv, 1 - gv)),
        );
        return clamp01(0.8 - road * 0.5 + f.grain! * 0.15);
      },
      surface(u, v, f) {
        const gu = fract(u * 6);
        const gv = fract(v * 6);
        const road = Math.max(
          1 - smoothstep(0, 0.04, Math.min(gu, 1 - gu)),
          1 - smoothstep(0, 0.04, Math.min(gv, 1 - gv)),
        );
        let rgb = scaleRgb([0.4, 0.39, 0.37], 0.88 + 0.24 * f.grain!);
        rgb = mixRgb(rgb, [0.47, 0.45, 0.42], smoothstep(0.6, 0.7, f.patch!) * 0.7);
        rgb = mixRgb(rgb, [0.24, 0.24, 0.25], road);
        return [rgb[0], rgb[1], rgb[2], 0.82 + 0.06 * road];
      },
      bump: 3,
    },
    sand: {
      fields: { ripple: { lattice: 5, octaves: 2 }, grain: { lattice: 40, octaves: 3 } },
      height(u, v, f) {
        return tri(u * 22 + v * 7 + f.ripple! * 3) * 0.35 + f.grain! * 0.4;
      },
      surface(u, v, f) {
        const ripple = tri(u * 22 + v * 7 + f.ripple! * 3);
        const rgb = scaleRgb([0.8, 0.74, 0.57], (0.92 + 0.1 * ripple) * (0.92 + 0.16 * f.grain!));
        return [rgb[0], rgb[1], rgb[2], 0.9];
      },
      bump: 2,
    },
    snow: {
      fields: {
        dunes: { lattice: 6, octaves: 3 },
        grain: { lattice: 48, octaves: 3 },
        sparkle: { lattice: 128, octaves: 1 },
      },
      height(_u, _v, f) {
        return f.dunes! * 0.7 + f.grain! * 0.3;
      },
      surface(_u, _v, f) {
        // Sparkle stays in the roughness only: bright specks in the albedo
        // moiré into a grey speckle from the strategic view.
        const spark = smoothstep(0.86, 0.92, f.sparkle!);
        // Calm: the drifts are a faint tone shift, never blotches — from the
        // strategic view a snowed-in range must read by its relief, not by
        // the texture. The albedo stays below 0.85 so the sun still has
        // headroom to draw the slopes before tone mapping clips the white.
        let rgb = scaleRgb([0.8, 0.84, 0.9], 0.95 + 0.05 * f.dunes!);
        rgb = mixRgb(rgb, [0.74, 0.8, 0.9], (1 - smoothstep(0.3, 0.5, f.dunes!)) * 0.12);
        return [rgb[0], rgb[1], rgb[2], 0.55 - 0.15 * spark];
      },
      bump: 1.2,
    },
  };
}

/** Paints one layer into the albedo and normal slices at `slice`. */
function paintLayer(
  name: string,
  spec: LayerSpec,
  slice: number,
  albedo: Uint8Array,
  normal: Uint8Array,
): void {
  const size = LAYER_SIZE;
  const rng = worldRng(0x5eed, `texture:terrain-${name}`);
  const fields = new Map<string, Float32Array>();
  for (const [key, field] of Object.entries(spec.fields)) {
    const noise: NoiseField = fbm(field.lattice, field.octaves, rng);
    const values = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        values[y * size + x] = noise.at((x / size) * field.lattice, (y / size) * field.lattice);
      }
    }
    fields.set(key, values);
  }
  const keys = [...fields.keys()];
  const f: Fields = {};
  const heights = new Float32Array(size * size);
  const base = slice * size * size * 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      for (const key of keys) f[key] = fields.get(key)![i]!;
      const u = x / size;
      const v = y / size;
      const h = spec.height(u, v, f);
      heights[i] = h;
      const [r, g, b, rough] = spec.surface(u, v, f, h);
      const o = base + i * 4;
      albedo[o] = Math.round(clamp01(r) * 255);
      albedo[o + 1] = Math.round(clamp01(g) * 255);
      albedo[o + 2] = Math.round(clamp01(b) * 255);
      albedo[o + 3] = Math.round(clamp01(rough) * 255);
    }
  }
  for (let y = 0; y < size; y++) {
    const yu = (y + 1) % size;
    const yd = (y - 1 + size) % size;
    for (let x = 0; x < size; x++) {
      const xr = (x + 1) % size;
      const xl = (x - 1 + size) % size;
      const nx = -(heights[y * size + xr]! - heights[y * size + xl]!) * spec.bump;
      const ny = -(heights[yu * size + x]! - heights[yd * size + x]!) * spec.bump;
      const length = Math.hypot(nx, ny, 1);
      const o = base + (y * size + x) * 4;
      normal[o] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }
}

/**
 * Mean linear albedo and mean roughness of each layer, from the painted
 * slices: what a tier that drops a layer's fetch multiplies by its weight.
 * The sRGB bytes are decoded the way the sampler decodes them, so a folded
 * layer lands at the same brightness as a sampled one.
 */
function layerMeans(albedo: Uint8Array): THREE.Vector4[] {
  const pixels = LAYER_SIZE * LAYER_SIZE;
  const colour = new THREE.Color();
  return LAYERS.map((_, slice) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const base = slice * pixels * 4;
    for (let i = 0; i < pixels; i++) {
      const o = base + i * 4;
      colour.setRGB(
        albedo[o]! / 255,
        albedo[o + 1]! / 255,
        albedo[o + 2]! / 255,
        THREE.SRGBColorSpace,
      );
      r += colour.r;
      g += colour.g;
      b += colour.b;
      a += albedo[o + 3]! / 255;
    }
    return new THREE.Vector4(r / pixels, g / pixels, b / pixels, a / pixels);
  });
}

function arrayTexture(data: Uint8Array, colorSpace: THREE.ColorSpace): THREE.DataArrayTexture {
  const texture = new THREE.DataArrayTexture(data, LAYER_SIZE, LAYER_SIZE, LAYERS.length);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface TerrainTextureSet {
  /** sRGB albedo, roughness in alpha; one slice per layer. */
  albedo: THREE.DataArrayTexture;
  /** Tangent-space normals; one slice per layer. */
  normal: THREE.DataArrayTexture;
  /**
   * Linear mean albedo (rgb) and mean roughness (a) per layer, LAYERS order:
   * the lower tiers drop a layer's fetch and fold this in instead, so the
   * biome keeps its hue without paying for the tile.
   */
  layerMean: readonly THREE.Vector4[];
  /** Low-frequency variation over the whole country: R brightness, G snow edge, B hue. */
  macro: THREE.DataTexture;
  /** Ridged relief normal of the range, tile RELIEF_TILE_KM. */
  relief: THREE.DataTexture;
  /** Wave normals of the water surface. */
  waves: THREE.DataTexture;
  /** A 1×1 white texture — the cloud shadow sampler when the sky has none. */
  white: THREE.DataTexture;
  /** Milliseconds the generation took, for the diagnostics. */
  buildMs: number;
}

let cached: TerrainTextureSet | null = null;

/** The whole set, generated once per page and shared by every rebuild. */
export function terrainTextures(): TerrainTextureSet {
  if (cached) return cached;
  const started = performance.now();
  const pixels = LAYER_SIZE * LAYER_SIZE * 4;
  const albedoData = new Uint8Array(pixels * LAYERS.length);
  const normalData = new Uint8Array(pixels * LAYERS.length);
  const specs = layerSpecs();
  LAYERS.forEach((name, slice) => paintLayer(name, specs[name], slice, albedoData, normalData));
  const layerMean = layerMeans(albedoData);

  const macro = proceduralTexture({
    name: "terrain-macro",
    size: 256,
    colorSpace: THREE.NoColorSpace,
    fields: {
      a: { lattice: 4, octaves: 3 },
      b: { lattice: 3, octaves: 2 },
      c: { lattice: 5, octaves: 2 },
    },
    pixel(u, v, f) {
      return [f.a!.at(u * 4, v * 4), f.b!.at(u * 3, v * 3), f.c!.at(u * 5, v * 5)];
    },
  });
  // Ridged crests (folded value noise) with a coarse warp and a fine grain:
  // the alpine silhouette one octave under the mesh, as a normal only.
  const ridge = (n: number): number => 1 - Math.abs(n * 2 - 1);
  const relief = normalMapFromHeight(
    "terrain-relief",
    512,
    (u, v, f) => {
      const warp = (f.w!.at(u * 3, v * 3) - 0.5) * 0.08;
      const crest = ridge(f.a!.at((u + warp) * 6, (v - warp) * 6));
      const spur = ridge(f.b!.at(u * 13 + crest * 0.3, v * 13));
      return crest * crest * 0.62 + spur * 0.26 + f.c!.at(u * 40, v * 40) * 0.12;
    },
    {
      a: { lattice: 6, octaves: 2 },
      b: { lattice: 13, octaves: 2 },
      c: { lattice: 40, octaves: 2 },
      w: { lattice: 3, octaves: 2 },
    },
    16,
  );
  const waves = normalMapFromHeight(
    "terrain-waves",
    256,
    (u, v, f) => {
      const swell = f.w!.at(u * 6, v * 6);
      return swell * 0.6 + f.c!.at(u * 14, v * 14) * 0.25 + tri(u * 9 + v * 4 + swell * 1.5) * 0.15;
    },
    { w: { lattice: 6, octaves: 4 }, c: { lattice: 14, octaves: 2 } },
    3,
  );
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  white.needsUpdate = true;

  cached = {
    albedo: arrayTexture(albedoData, THREE.SRGBColorSpace),
    normal: arrayTexture(normalData, THREE.NoColorSpace),
    layerMean,
    macro,
    relief,
    waves,
    white,
    buildMs: performance.now() - started,
  };
  return cached;
}

/** Releases the module's own textures; the core cache disposes the rest. */
export function disposeTerrainTextures(): void {
  if (!cached) return;
  cached.albedo.dispose();
  cached.normal.dispose();
  cached.white.dispose();
  cached = null;
}
