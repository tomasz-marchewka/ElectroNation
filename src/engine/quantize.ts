// Generated truth is quantized at the generation boundary, so cross-engine
// float noise in transcendental functions (Math.sin/exp/pow differ in the last
// ULP between JS engines) never reaches serialized state.

/** Round to 0.1. The `+ 0` folds −0 into +0, which JSON cannot represent. */
export function quantize01(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

/** Round to 0.001. */
export function quantize001(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
