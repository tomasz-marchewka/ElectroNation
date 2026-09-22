// Procedural textures (ARCHITECTURE.md §14): every surface of the world is
// generated here from seeded noise, so nothing is downloaded, nothing is
// bundled, and every session paints the same pixels. Fixed seeds on purpose —
// a texture is not part of the game's randomness.

import * as THREE from "three";
import { worldRng, type Rng } from "./prng";

export interface NoiseField {
  /** Value in [0, 1] at (x, y) in texture units. */
  at(x: number, y: number): number;
}

/** Tileable value noise: lattice of size n×n, bilinear with smoothstep. */
export function valueNoise(size: number, rng: Rng): NoiseField {
  const lattice = new Float32Array(size * size);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const fade = (t: number) => t * t * (3 - 2 * t);
  return {
    at(x, y) {
      const fx = ((x % size) + size) % size;
      const fy = ((y % size) + size) % size;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = (x0 + 1) % size;
      const y1 = (y0 + 1) % size;
      const tx = fade(fx - x0);
      const ty = fade(fy - y0);
      const a = lattice[y0 * size + x0] ?? 0;
      const b = lattice[y0 * size + x1] ?? 0;
      const c = lattice[y1 * size + x0] ?? 0;
      const d = lattice[y1 * size + x1] ?? 0;
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    },
  };
}

/** Fractal sum of value noise octaves, still tileable over `size`. */
export function fbm(size: number, octaves: number, rng: Rng, gain = 0.5): NoiseField {
  const layers: NoiseField[] = [];
  for (let o = 0; o < octaves; o++) layers.push(valueNoise(size << o, rng));
  return {
    at(x, y) {
      let sum = 0;
      let amplitude = 1;
      let total = 0;
      for (let o = 0; o < layers.length; o++) {
        const scale = 1 << o;
        sum += (layers[o]?.at(x * scale, y * scale) ?? 0) * amplitude;
        total += amplitude;
        amplitude *= gain;
      }
      return sum / total;
    },
  };
}

export interface TextureSpec {
  name: string;
  size: number;
  /**
   * RGB in [0,1] per pixel, from (u, v) in [0,1) and the seeded fields. The
   * texture's own stream is passed too: pixels are visited in a fixed order,
   * so a draw per texel is deterministic (fine grain shared by nothing else).
   */
  pixel(
    u: number,
    v: number,
    fields: Record<string, NoiseField>,
    rng: Rng,
  ): [number, number, number];
  fields?: Record<string, { lattice: number; octaves: number }>;
  colorSpace?: THREE.ColorSpace;
}

const cache = new Map<string, THREE.DataTexture>();

/** Builds (once) a repeating RGBA data texture from a pixel function. */
export function proceduralTexture(spec: TextureSpec): THREE.DataTexture {
  const cached = cache.get(spec.name);
  if (cached) return cached;
  const rng = worldRng(0x5eed, `texture:${spec.name}`);
  const fields: Record<string, NoiseField> = {};
  for (const [key, field] of Object.entries(spec.fields ?? {})) {
    fields[key] = fbm(field.lattice, field.octaves, rng);
  }
  const data = new Uint8Array(spec.size * spec.size * 4);
  for (let y = 0; y < spec.size; y++) {
    for (let x = 0; x < spec.size; x++) {
      const [r, g, b] = spec.pixel(x / spec.size, y / spec.size, fields, rng);
      const i = (y * spec.size + x) * 4;
      data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, spec.size, spec.size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = spec.colorSpace ?? THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cache.set(spec.name, texture);
  return texture;
}

/** A tangent-space normal map from a height function, tileable. */
export function normalMapFromHeight(
  name: string,
  size: number,
  height: (u: number, v: number, fields: Record<string, NoiseField>, rng: Rng) => number,
  fields: Record<string, { lattice: number; octaves: number }>,
  strength = 2,
): THREE.DataTexture {
  return proceduralTexture({
    name,
    size,
    fields,
    colorSpace: THREE.NoColorSpace,
    pixel(u, v, f, rng) {
      const e = 1 / size;
      const hl = height(u - e, v, f, rng);
      const hr = height(u + e, v, f, rng);
      const hd = height(u, v - e, f, rng);
      const hu = height(u, v + e, f, rng);
      const nx = -(hr - hl) * strength;
      const ny = -(hu - hd) * strength;
      const length = Math.hypot(nx, ny, 1);
      return [(nx / length) * 0.5 + 0.5, (ny / length) * 0.5 + 0.5, (1 / length) * 0.5 + 0.5];
    },
  });
}

/** Mixes two RGB colours. */
export function mix(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Disposes every cached texture (renderer teardown). */
export function disposeTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
