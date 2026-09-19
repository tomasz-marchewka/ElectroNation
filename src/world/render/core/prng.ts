// Renderer-side randomness: sfc32 streams keyed by the scene seed and a stream
// name, so foliage scatter, cloud detail and city block layout come out the
// same for the same seed on any machine (ARCHITECTURE.md §12). This is a
// separate copy of the engine's algorithm on purpose — the engine wall forbids
// importing it, and nothing drawn here ever flows back into game state.
//
// `Math.random` and `Date` are forbidden across src/world (lint).

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Standard normal (Box–Muller). */
  normal(): number;
  /** One of the entries, uniformly. */
  pick<T>(items: readonly T[]): T;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** A reproducible stream, e.g. `worldRng(seed, "terrain:relief")`. */
export function worldRng(seed: number, stream: string): Rng {
  const mix = splitmix32((seed ^ fnv1a(stream)) >>> 0);
  let a = mix();
  let b = mix();
  let c = mix();
  let d = mix();
  const nextUint32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 12; i++) nextUint32();

  const rng: Rng = {
    next: () => nextUint32() / 4294967296,
    range: (min, max) => min + rng.next() * (max - min),
    int: (n) => Math.floor(rng.next() * n),
    normal: () => {
      const u1 = Math.max(rng.next(), 1e-12);
      const u2 = rng.next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    pick: (items) => items[rng.int(items.length)] as (typeof items)[number],
  };
  return rng;
}

/** Deterministic 32-bit hash of a string — for per-object variation without a stream. */
export function hashString(text: string): number {
  return fnv1a(text);
}

/** Hash → float in [0, 1). */
export function hash01(text: string): number {
  return fnv1a(text) / 4294967296;
}
