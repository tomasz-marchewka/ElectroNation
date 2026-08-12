// Deterministic PRNG (sfc32) with named streams derived from the master seed.
// All engine randomness must flow through this module — never Math.random.
// State is plain JSON, so it serializes with the game state and replays exactly.

export interface PrngState {
  a: number;
  b: number;
  c: number;
  d: number;
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

/** Derives an independent, reproducible stream (e.g. "weather", "forecast") from the master seed. */
export function seedStream(masterSeed: number, streamName: string): PrngState {
  const mix = splitmix32((masterSeed ^ fnv1a(streamName)) >>> 0);
  let state: PrngState = { a: mix(), b: mix(), c: mix(), d: mix() };
  // sfc32 needs a few warm-up rounds to decorrelate from structured seeds.
  for (let i = 0; i < 12; i++) state = nextUint32(state).state;
  return state;
}

export function nextUint32(state: PrngState): { value: number; state: PrngState } {
  let { a, b, c } = state;
  const t = (((a + b) >>> 0) + state.d) >>> 0;
  const d = (state.d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  return { value: t, state: { a: a >>> 0, b, c, d } };
}

/** Uniform float in [0, 1). */
export function nextFloat01(state: PrngState): { value: number; state: PrngState } {
  const { value, state: next } = nextUint32(state);
  return { value: value / 4294967296, state: next };
}
