import { describe, expect, test } from "vitest";
import {
  DAY_WEIGHTS,
  TURNS_PER_DAY,
  applyAction,
  finishedLine,
  newGame,
  resolveTurn,
  type GameState,
  type Scenario,
} from "../../src/engine";

// Spec tests for the turn resolution step, docs/02 §4–§6 (acceptance list 02 §9).

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    cities: [
      {
        id: "city-a",
        name: "A",
        hex: { q: 4, r: 0 },
        connected: true,
        households: 80_000,
        firms: 6_900,
        householdsStart: 80_000,
        firmsStart: 6_900,
        connectedSinceDay: 0,
        monthDemandMwh: 0,
        monthDeliveredMwh: 0,
      },
    ],
    plants: [
      {
        id: "plant-1",
        name: "P1",
        hex: { q: 0, r: 0 },
        tech: "ccgt",
        capacityMw: 400,
        setpointMw: 0,
      },
    ],
    farms: [],
    storages: [],
    junctions: [],
    borders: [],
    lines: [
      finishedLine("line-1", "mv", [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
        { q: 4, r: 0 },
      ]),
    ],
    ...overrides,
  };
}

function runDays(state: GameState, days: number): GameState {
  let current = state;
  for (let i = 0; i < days * TURNS_PER_DAY; i++) current = resolveTurn(current);
  return current;
}

describe("doc 02 §5: dump penalty on dispatchable surplus", () => {
  test("50 MW of extra setpoint costs exactly 50 × 3 h × 400 zł × day weight", () => {
    const base = newGame(7, makeScenario());
    // Both setpoints fully cover the city (~100 MW peak incl. losses), so the
    // delivered energy and fuel burned are identical — only the dump differs.
    const lower = resolveTurn(
      applyAction(base, { type: "setPlantSetpoint", plantId: "plant-1", mw: 300 }),
    );
    const higher = resolveTurn(
      applyAction(base, { type: "setPlantSetpoint", plantId: "plant-1", mw: 350 }),
    );
    const expected = Math.round(50 * 3 * 400 * DAY_WEIGHTS.working);
    expect(lower.moneyPln - higher.moneyPln).toBe(expected);
  });

  test("RES dump is free: an island wind farm burns no money within a day", () => {
    const scenario = makeScenario({
      cities: [],
      plants: [],
      lines: [],
      farms: [
        {
          id: "farm-1",
          name: "F1",
          hex: { q: 0, r: 0 },
          tech: "wind",
          capacityMw: 200,
          enabled: true,
          windClass: "open",
          solarMultiplier: 1,
        },
      ],
    });
    const state = newGame(7, scenario);
    // 7 turns stay within the day — no fixed costs yet, and all production is
    // dumped RES, so money must not move at all.
    let current = state;
    for (let i = 0; i < TURNS_PER_DAY - 1; i++) current = resolveTurn(current);
    expect(current.moneyPln).toBe(state.moneyPln);
  });
});

describe("doc 02 §5: import is take-or-pay", () => {
  test("unused import is charged from the setpoint", () => {
    const scenario = makeScenario({
      cities: [],
      plants: [],
      lines: [],
      borders: [
        {
          id: "border-1",
          name: "B1",
          hex: { q: 0, r: 0 },
          throughputMw: 500,
          importSetpointMw: 0,
          exportSetpointMw: 0,
        },
      ],
    });
    const base = newGame(7, scenario);
    const withImport = resolveTurn(
      applyAction(base, { type: "setImport", borderId: "border-1", mw: 100 }),
    );
    const expected = Math.round(100 * 3 * 800 * DAY_WEIGHTS.working);
    expect(base.moneyPln - withImport.moneyPln).toBe(expected);
  });
});

describe("doc 02 §4 / §9.7: cities take priority over storage charging", () => {
  test("charging never steals a megawatt from the city", () => {
    const storage = {
      id: "storage-1",
      name: "S1",
      hex: { q: 2, r: 0 },
      tech: "battery" as const,
      powerMw: 400,
      capacityMwh: 2_000,
      socMwh: 0,
      setpoint: { mode: "charge" as const, mw: 400 },
    };
    // Storage sits mid-route on the only line; the plant covers everything.
    const withStorage = newGame(7, makeScenario({ storages: [storage] }));
    const without = newGame(7, makeScenario());
    const dispatch = (s: GameState) =>
      resolveTurn(applyAction(s, { type: "setPlantSetpoint", plantId: "plant-1", mw: 400 }));
    const a = dispatch(withStorage);
    const b = dispatch(without);
    // Identical city delivery — monthly accumulators match to the quantum.
    expect(a.cities[0]?.monthDeliveredMwh).toBe(b.cities[0]?.monthDeliveredMwh);
    // And the storage actually charged from what was left.
    expect(a.storages[0]?.socMwh ?? 0).toBeGreaterThan(0);
  });
});

describe("doc 02 §9.10: ENS counters feed the monthly U of doc 05 §6.1", () => {
  test("a month of darkness halves the city (U = 0)", () => {
    // Default setpoint 0: nothing is ever delivered.
    const end = runDays(newGame(7, makeScenario()), 3);
    expect(end.cities[0]?.households).toBe(40_000);
    expect(end.cities[0]?.firms).toBe(3_450);
    expect(end.cities[0]?.monthDemandMwh).toBe(0);
    expect(end.cities[0]?.monthDeliveredMwh).toBe(0);
  });

  test("a fully served month grows the city within [0, 4%]", () => {
    let state = newGame(7, makeScenario());
    state = applyAction(state, { type: "setPlantSetpoint", plantId: "plant-1", mw: 400 });
    const end = runDays(state, 3);
    const households = end.cities[0]?.households ?? 0;
    expect(households).toBeGreaterThanOrEqual(80_000);
    expect(households).toBeLessThanOrEqual(Math.ceil(80_000 * 1.04));
  });

  test("an unconnected city passes a month unchanged (01 §3.4)", () => {
    const scenario = makeScenario();
    scenario.cities.push({
      id: "city-b",
      name: "B",
      hex: { q: 9, r: 9 },
      connected: false,
      households: 50_000,
      firms: 4_000,
      householdsStart: 50_000,
      firmsStart: 4_000,
      connectedSinceDay: 0,
      monthDemandMwh: 0,
      monthDeliveredMwh: 0,
    });
    const end = runDays(newGame(7, scenario), 3);
    const cityB = end.cities.find((c) => c.id === "city-b");
    expect(cityB?.households).toBe(50_000);
    expect(cityB?.firms).toBe(4_000);
  });
});
