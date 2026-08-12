import { expect, test } from "vitest";
import type { GameState } from "../../src/engine";
import { stateHash } from "../helpers/hash";
import { playTurns, runTurns } from "../helpers/run";

// Catches the classic regression "added a field, forgot it in serialization":
// state must be plain JSON (no Maps/classes/Dates/undefined), and a loaded
// save must evolve exactly like the original from that point on.

test("state survives a JSON round-trip losslessly", () => {
  const state = playTurns(777, 5);
  expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
});

test("save → load → identical future evolution", () => {
  const original = playTurns(2026, 5);
  const restored = JSON.parse(JSON.stringify(original)) as GameState;
  const originalFuture = runTurns(original, 19);
  const restoredFuture = runTurns(restored, 19);
  expect(stateHash(restoredFuture)).toBe(stateHash(originalFuture));
});
