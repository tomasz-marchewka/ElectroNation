import { describe, expect, test } from "vitest";
import {
  CITY_CONNECTION_COST_PLN,
  TURNS_PER_DAY,
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type Scenario,
} from "../../src/engine";

// Spec tests for the build loop: docs/01 §2.6 (build times, payment up front),
// §3.3 (topology limits), §3.4 (city connection act) and 02 §8 (costs).

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    cities: [
      {
        id: "city-a",
        name: "A",
        hex: { q: 4, r: 0 },
        connected: true,
        households: 40_000,
        firms: 3_400,
        householdsStart: 40_000,
        firmsStart: 3_400,
        connectedSinceDay: 0,
        monthDemandMwh: 0,
        monthDeliveredMwh: 0,
      },
      {
        id: "city-b",
        name: "B",
        hex: { q: 6, r: 0 },
        connected: false,
        households: 20_000,
        firms: 1_700,
        householdsStart: 20_000,
        firmsStart: 1_700,
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
    lines: [],
    ...overrides,
  };
}

function run(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i++) current = resolveTurn(current);
  return current;
}

const apply = (state: GameState, action: Action) => applyAction(state, action);

describe("doc 01 §2.6: objects pay up front and appear after the countdown", () => {
  test("a CCGT block: cost, countdown, then a working object", () => {
    const base = newGame(3, makeScenario());
    const built = apply(base, {
      type: "buildPlant",
      tech: "ccgt",
      capacityMw: 100,
      hex: { q: 1, r: 1 },
    });
    expect(base.moneyPln - built.moneyPln).toBe(100 * 5_500_000);
    expect(built.constructions).toHaveLength(1);
    expect(built.plants).toHaveLength(1);
    // CCGT builds 3 game days; the object exists at the start of day 4.
    const after = run(built, 3 * TURNS_PER_DAY);
    expect(after.constructions).toHaveLength(0);
    expect(after.plants).toHaveLength(2);
  });

  test("terrain multiplies CAPEX; water refuses objects", () => {
    const scenario = makeScenario({
      terrain: { "1,1": "mountains", "2,2": "lake" },
    });
    const base = newGame(3, scenario);
    const onMountain = apply(base, {
      type: "buildPlant",
      tech: "ocgt",
      capacityMw: 100,
      hex: { q: 1, r: 1 },
    });
    expect(base.moneyPln - onMountain.moneyPln).toBe(Math.round(100 * 3_000_000 * 2.5));
    const onLake = apply(base, {
      type: "buildPlant",
      tech: "ocgt",
      capacityMw: 100,
      hex: { q: 2, r: 2 },
    });
    expect(onLake).toBe(base); // no-op
  });

  test("invalid builds are no-ops: occupied hex, over-limit farm, empty wallet", () => {
    const base = newGame(3, makeScenario());
    expect(
      apply(base, { type: "buildPlant", tech: "ocgt", capacityMw: 50, hex: { q: 4, r: 0 } }),
    ).toBe(base); // city hex
    expect(
      apply(base, { type: "buildFarm", tech: "wind", capacityMw: 400, hex: { q: 1, r: 1 } }),
    ).toBe(base); // > 300 MW/hex (02 §8.4)
    expect(
      apply(base, {
        type: "buildPlant",
        tech: "nuclear",
        capacityMw: 1_600,
        hex: { q: 1, r: 1 },
      }),
    ).toBe(base); // 33.6 mld > starting capital
  });
});

describe("doc 01 §2.6 / §4.2: lines build 1 hex per turn (LV) and only then carry power", () => {
  test("LV line progresses 3 h per resolved turn", () => {
    const base = newGame(3, makeScenario());
    // Two-hex LV line plant→(1,0): endpoint must be an object — use the city
    // route instead: plant (0,0) → city-a (4,0) is 4 steps = 12 h = 4 turns.
    const withLine = apply(base, {
      type: "buildLine",
      lineType: "lv",
      path: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
        { q: 4, r: 0 },
      ],
    });
    expect(withLine.lines).toHaveLength(1);
    expect(withLine.lines[0]?.totalHours).toBe(12);
    expect(base.moneyPln - withLine.moneyPln).toBe(4 * 25 * 1_200_000);

    const dispatched = apply(withLine, {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    // While the line is unfinished the city gets nothing (dump is penalized).
    const afterOne = resolveTurn(dispatched);
    expect(afterOne.lines[0]?.builtHours).toBe(3);
    expect(afterOne.cities[0]?.monthDeliveredMwh).toBe(0);
    // After 4 turns the line is done; the 5th turn delivers.
    const afterFive = run(dispatched, 5);
    expect(afterFive.lines[0]?.builtHours).toBe(12);
    expect(afterFive.cities[0]?.monthDeliveredMwh ?? 0).toBeGreaterThan(0);
  });

  test("a broken (non-adjacent) path or a dangling endpoint is a no-op", () => {
    const base = newGame(3, makeScenario());
    expect(
      apply(base, {
        type: "buildLine",
        lineType: "lv",
        path: [
          { q: 0, r: 0 },
          { q: 2, r: 0 },
        ],
      }),
    ).toBe(base);
    expect(
      apply(base, {
        type: "buildLine",
        lineType: "lv",
        path: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ],
      }),
    ).toBe(base); // (1,0) holds no object
  });

  test("doc 01 §3.3: an object offers 6 line slots", () => {
    let state = newGame(3, makeScenario());
    const path = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 4, r: 0 },
    ];
    for (let i = 0; i < 7; i++) {
      state = apply(state, { type: "buildLine", lineType: "lv", path });
    }
    expect(state.lines).toHaveLength(6);
  });
});

describe("doc 01 §3.4: connecting a city is an explicit, paid act", () => {
  function connectMidMonth(): GameState {
    let state = newGame(3, makeScenario());
    state = apply(state, {
      type: "buildLine",
      lineType: "mv",
      path: [
        { q: 4, r: 0 },
        { q: 5, r: 0 },
        { q: 6, r: 0 },
      ],
    });
    // Without a finished line the act is refused.
    expect(apply(state, { type: "connectCity", cityId: "city-b" })).toBe(state);
    // 2 steps × 6 h = 12 h = 4 turns of construction, still day 0 (month start
    // was day 0, so the connection on day 0 is mid-month only for growth if
    // connectedSinceDay > month start — here we connect on day 0 after turns).
    state = run(state, 4);
    const before = state.moneyPln;
    state = apply(state, { type: "connectCity", cityId: "city-b" });
    expect(before - state.moneyPln).toBe(CITY_CONNECTION_COST_PLN);
    expect(state.cities.find((c) => c.id === "city-b")?.connected).toBe(true);
    return state;
  }

  test("the act costs 30 mln and requires a finished line", () => {
    connectMidMonth();
  });

  test("05 §6.5: no growth evaluation until the first full month", () => {
    // Connect on day 0 (month start = day 0) → the city IS evaluated at this
    // month's end; with zero generation it shrinks. A city connected on day 1
    // must skip the first evaluation.
    let late = newGame(3, makeScenario());
    late = apply(late, {
      type: "buildLine",
      lineType: "mv",
      path: [
        { q: 4, r: 0 },
        { q: 5, r: 0 },
        { q: 6, r: 0 },
      ],
    });
    late = run(late, TURNS_PER_DAY); // day 1 — line finished after 4 turns
    late = apply(late, { type: "connectCity", cityId: "city-b" });
    expect(late.cities.find((c) => c.id === "city-b")?.connectedSinceDay).toBe(1);
    const monthEnd = run(late, 2 * TURNS_PER_DAY); // finish days 1 and 2
    const cityB = monthEnd.cities.find((c) => c.id === "city-b");
    // Frozen through the partial month despite receiving nothing…
    expect(cityB?.households).toBe(20_000);
    // …but the next (full) month of darkness halves it.
    const nextMonthEnd = run(monthEnd, 3 * TURNS_PER_DAY);
    expect(nextMonthEnd.cities.find((c) => c.id === "city-b")?.households).toBe(10_000);
  });
});
