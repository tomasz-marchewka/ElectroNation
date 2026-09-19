// Seeded 2-D gradient noise for the relief (ARCHITECTURE.md §12): the
// permutation table comes from a renderer PRNG stream, the gradients are
// literal constants and nothing here calls a transcendental function, so the
// same seed gives the same heights on every JavaScript engine, bit for bit.
// The tileable value noise of render/core/textures.ts is for textures; this
// one runs in world kilometres and never repeats inside the field.

import type { Rng } from "../core/prng";

export interface Noise2D {
  /** Gradient noise in about [−1, 1] at (x, y). */
  at(x: number, y: number): number;
}

/** Sixteen unit gradients 22.5° apart, offset by half a step from the lattice axes. */
const GRADIENTS: readonly (readonly [number, number])[] = [
  [0.98078528, 0.19509032],
  [0.83146961, 0.55557023],
  [0.55557023, 0.83146961],
  [0.19509032, 0.98078528],
  [-0.19509032, 0.98078528],
  [-0.55557023, 0.83146961],
  [-0.83146961, 0.55557023],
  [-0.98078528, 0.19509032],
  [-0.98078528, -0.19509032],
  [-0.83146961, -0.55557023],
  [-0.55557023, -0.83146961],
  [-0.19509032, -0.98078528],
  [0.19509032, -0.98078528],
  [0.55557023, -0.83146961],
  [0.83146961, -0.55557023],
  [0.98078528, -0.19509032],
];

/** Perlin-style gradient noise with a permutation table shuffled by `rng`. */
export function gradientNoise(rng: Rng): Noise2D {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = table[i]!;
    table[i] = table[j]!;
    table[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = table[i & 255]!;
  const gx = new Float64Array(16);
  const gy = new Float64Array(16);
  GRADIENTS.forEach(([x, y], i) => {
    gx[i] = x;
    gy[i] = y;
  });

  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (hash: number, x: number, y: number): number => {
    const g = hash & 15;
    return gx[g]! * x + gy[g]! * y;
  };

  return {
    at(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const X = xi & 255;
      const Y = yi & 255;
      const aa = perm[perm[X]! + Y]!;
      const ab = perm[perm[X]! + Y + 1]!;
      const ba = perm[perm[X + 1]! + Y]!;
      const bb = perm[perm[X + 1]! + Y + 1]!;
      const u = fade(xf);
      const v = fade(yf);
      const x1 = dot(aa, xf, yf) + (dot(ba, xf - 1, yf) - dot(aa, xf, yf)) * u;
      const x2 = dot(ab, xf, yf - 1) + (dot(bb, xf - 1, yf - 1) - dot(ab, xf, yf - 1)) * u;
      // Unit gradients keep 2-D Perlin inside ±0.71; rescaled to about ±1.
      return (x1 + (x2 - x1) * v) * 1.41;
    },
  };
}

/** Fractal sum of octaves, about [−1, 1]. */
export function fbm(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2.03,
  gain = 0.5,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise.at(x * frequency + o * 17.3, y * frequency - o * 11.7) * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / total;
}

/**
 * Ridged multifractal (Musgrave): sharp crests with the finer octaves
 * damped in the valleys — the alpine silhouette. Range about [0, 1].
 */
export function ridged(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2.1,
  gain = 0.55,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    let signal = 1 - Math.abs(noise.at(x * frequency + o * 7.1, y * frequency + o * 13.9));
    signal *= signal;
    signal *= weight;
    weight = Math.min(1, Math.max(0, signal * 1.8));
    sum += signal * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / total;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
