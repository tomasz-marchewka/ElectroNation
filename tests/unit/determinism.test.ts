import fc from "fast-check";
import { expect, test } from "vitest";
import { stateHash } from "../helpers/hash";
import { playTurns } from "../helpers/run";

// Determinism is a foundation the whole anti-regression mechanism stands on:
// golden scenarios and replay-based bug fixtures assume that the same seed and
// action log always reproduce the same state, bit for bit.

test("same seed twice → bit-identical state after 3 game days", () => {
  expect(stateHash(playTurns(12345, 24))).toBe(stateHash(playTurns(12345, 24)));
});

test("different seeds → different weather truth", () => {
  expect(stateHash(playTurns(1, 8))).not.toBe(stateHash(playTurns(2, 8)));
});

test("determinism holds for arbitrary seeds (property)", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
      return stateHash(playTurns(seed, 8)) === stateHash(playTurns(seed, 8));
    }),
    { numRuns: 25 },
  );
});
