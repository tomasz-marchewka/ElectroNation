import fc from "fast-check";
import { expect, test } from "vitest";
import {
  BATTERY,
  FARM_TECHS,
  MAX_PLANT_BLOCKS_PER_HEX,
  PUMPED_BLOCK,
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
} from "../../src/engine";
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

// Fuzzed action logs: the engine must survive any sequence of JSON actions —
// including ones aimed at objects that do not exist, or at sites already full —
// staying deterministic, JSON-clean and inside every hard limit of 01 §7.

const hexArb = fc.record({
  q: fc.integer({ min: -1, max: 11 }),
  r: fc.integer({ min: -1, max: 9 }),
});
/** Ids that exist in the default scenario, ids the engine mints, and junk. */
const idArb = fc.constantFrom(
  "plant-start-ccgt",
  "line-start",
  "city-brzegowo",
  "obj-1",
  "obj-2",
  "obj-3",
  "obj-4",
  "nope",
);
const mwArb = fc.integer({ min: -50, max: 900 });

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ type: fc.constant("noop" as const) }),
  fc.record({
    type: fc.constant("setPlantSetpoint" as const),
    plantId: idArb,
    mw: mwArb,
  }),
  fc.record({
    type: fc.constant("buildPlant" as const),
    tech: fc.constantFrom("ocgt" as const, "ccgt" as const),
    capacityMw: fc.integer({ min: -10, max: 200 }),
    hex: hexArb,
  }),
  fc.record({
    type: fc.constant("buildFarm" as const),
    tech: fc.constantFrom("wind" as const, "pv" as const),
    capacityMw: fc.integer({ min: -10, max: 400 }),
    hex: hexArb,
  }),
  fc.record({
    type: fc.constant("buildBattery" as const),
    powerMw: fc.integer({ min: 0, max: 600 }),
    capacityMwh: fc.integer({ min: 0, max: 2_500 }),
    hex: hexArb,
  }),
  fc.record({ type: fc.constant("buildJunction" as const), hex: hexArb }),
  fc.record({ type: fc.constant("buildBorder" as const), hex: hexArb }),
  fc.record({
    type: fc.constant("expandPlant" as const),
    plantId: idArb,
    capacityMw: fc.integer({ min: -10, max: 600 }),
  }),
  fc.record({
    type: fc.constant("expandFarm" as const),
    farmId: idArb,
    capacityMw: fc.integer({ min: -10, max: 400 }),
  }),
  fc.record({
    type: fc.constant("expandBattery" as const),
    storageId: idArb,
    powerMw: fc.integer({ min: 0, max: 600 }),
    capacityMwh: fc.integer({ min: 0, max: 2_500 }),
  }),
  fc.record({ type: fc.constant("expandPumpedStorage" as const), storageId: idArb }),
  fc.record({ type: fc.constant("expandBorder" as const), borderId: idArb }),
  fc.record({ type: fc.constant("cancelConstruction" as const), constructionId: idArb }),
  fc.record({ type: fc.constant("cancelLine" as const), lineId: idArb }),
  fc.record({
    type: fc.constant("buyForecastSystem" as const),
    level: fc.constantFrom("advanced" as const, "ensemble" as const),
  }),
  fc.record({ type: fc.constant("connectCity" as const), cityId: idArb }),
);

/**
 * Replays a log, resolving a turn after every 4th action. Actions go through
 * JSON first — that is what they are on the wire, and it also strips the
 * null-prototype objects fast-check hands out.
 */
function replay(seed: number, log: Action[]): GameState {
  let state = newGame(seed);
  (JSON.parse(JSON.stringify(log)) as Action[]).forEach((action, i) => {
    state = applyAction(state, action);
    if (i % 4 === 3) state = resolveTurn(state);
  });
  return state;
}

function expectWithinSiteLimits(state: GameState): void {
  for (const plant of state.plants) {
    expect(plant.blocks).toBeLessThanOrEqual(MAX_PLANT_BLOCKS_PER_HEX);
  }
  for (const farm of state.farms) {
    expect(farm.capacityMw).toBeLessThanOrEqual(FARM_TECHS[farm.tech].maxMwPerHex);
  }
  for (const storage of state.storages) {
    if (storage.tech === "battery") {
      expect(storage.powerMw).toBeLessThanOrEqual(BATTERY.maxPowerMwPerHex);
      expect(storage.capacityMwh).toBeLessThanOrEqual(BATTERY.maxCapacityMwhPerHex);
    } else {
      expect(storage.powerMw).toBeLessThanOrEqual(PUMPED_BLOCK.maxBlocks * PUMPED_BLOCK.powerMw);
    }
  }
  // 0.21: a junction station is nothing but a site — no throughput, no modules.
  for (const junction of state.junctions) {
    expect(Object.keys(junction).sort()).toStrictEqual(["hex", "id", "name"]);
  }
}

test("fuzzed action logs replay identically and stay inside site limits", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 0xffff }),
      fc.array(actionArb, { minLength: 1, maxLength: 60 }),
      (seed, log) => {
        const state = replay(seed, log);
        expect(stateHash(replay(seed, log))).toBe(stateHash(state));
        expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
        expectWithinSiteLimits(state);
      },
    ),
    { numRuns: 60 },
  );
});
