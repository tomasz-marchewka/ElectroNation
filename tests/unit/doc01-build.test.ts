import { describe, expect, test } from "vitest";
import {
  CITY_CONNECTION_COST_PLN,
  PLANT_BLOCK_SIZES,
  PLANT_TECHS,
  TURNS_PER_DAY,
  applyAction,
  nearestPlantBlockSize,
  newGame,
  plantBlockMw,
  resolveTurn,
  type Action,
  type GameState,
  type PlantBlockSize,
  type PlantTech,
  type Scenario,
} from "../../src/engine";

// Spec tests for the build loop: docs/01 §2.6 (build times, payment up front),
// §3.3 (topology limits), §3.4 (city connection act), §5.1 (block sizes)
// and 02 §8 (costs).

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
      size: "small",
      hex: { q: 1, r: 1 },
    });
    expect(base.moneyPln - built.moneyPln).toBe(100 * 2_750_000);
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
      size: "large",
      hex: { q: 1, r: 1 },
    });
    expect(base.moneyPln - onMountain.moneyPln).toBe(Math.round(100 * 1_500_000 * 2.5));
    const onLake = apply(base, {
      type: "buildPlant",
      tech: "ocgt",
      size: "large",
      hex: { q: 2, r: 2 },
    });
    expect(onLake).toBe(base); // no-op
  });

  test("invalid builds are no-ops: occupied hex, over-limit farm, empty wallet", () => {
    const base = newGame(3, makeScenario());
    expect(
      apply(base, { type: "buildPlant", tech: "ocgt", size: "medium", hex: { q: 4, r: 0 } }),
    ).toBe(base); // city hex
    expect(
      apply(base, { type: "buildFarm", tech: "wind", capacityMw: 400, hex: { q: 1, r: 1 } }),
    ).toBe(base); // > 300 MW/hex (02 §8.4)
    expect(
      apply(base, {
        type: "buildPlant",
        tech: "nuclear",
        size: "xlarge",
        hex: { q: 1, r: 1 },
      }),
    ).toBe(base); // 25,2 mld > starting capital
  });
});

describe("doc 01 §5.1: a block is one of four sizes, never a dialled-in number", () => {
  const TECHS: PlantTech[] = ["nuclear", "coal", "ccgt", "ocgt"];

  test.each(TECHS)("%s sells exactly four rungs, listed smallest first", (tech) => {
    const mw = PLANT_BLOCK_SIZES.map((size) => PLANT_TECHS[tech].blockMw[size]);
    expect(mw).toHaveLength(4);
    expect([...mw].sort((a, b) => a - b)).toEqual(mw);
    expect(new Set(mw).size).toBe(4);
  });

  test("the ordered block gets the technology's MW for that rung, and its price", () => {
    const base = newGame(3, makeScenario());
    const built = apply(base, {
      type: "buildPlant",
      tech: "ocgt",
      size: "xlarge",
      hex: { q: 1, r: 1 },
    });
    const capacityMw = PLANT_TECHS.ocgt.blockMw.xlarge;
    expect(capacityMw).toBe(150);
    expect(base.moneyPln - built.moneyPln).toBe(capacityMw * PLANT_TECHS.ocgt.capexPlnPerMw);
    const after = run(built, TURNS_PER_DAY);
    expect(after.plants.find((p) => p.hex.q === 1)?.capacityMw).toBe(capacityMw);
  });

  test("a size outside the four is refused, not rounded to the nearest one", () => {
    const base = newGame(3, makeScenario());
    const off = { type: "buildPlant" as const, tech: "ccgt" as const, hex: { q: 1, r: 1 } };
    expect(apply(base, { ...off, size: "tiny" as PlantBlockSize })).toBe(base);
    expect(apply(base, { ...off, size: "" as PlantBlockSize })).toBe(base);
    expect(plantBlockMw("ccgt", "tiny" as PlantBlockSize)).toBeNull();
  });

  test("a block off the ladder — a scenario endowment — reads as its nearest rung", () => {
    // 01 §3.4: the starting CCGT is 400 MW, which is the DUŻY rung exactly.
    expect(nearestPlantBlockSize("ccgt", 400)).toBe("large");
    expect(nearestPlantBlockSize("nuclear", 2_400)).toBe("xlarge");
    // Anything between rungs rounds to the closer one, the larger on a tie.
    expect(nearestPlantBlockSize("coal", 800)).toBe("large"); // 750, not 1 000
    expect(nearestPlantBlockSize("coal", 350)).toBe("medium"); // tie 200/500
    expect(nearestPlantBlockSize("nuclear", 1)).toBe("small");
    expect(nearestPlantBlockSize("ocgt", 10_000)).toBe("xlarge");
  });

  // 01 §5.1 (0.25): halving CAPEX moved nuclear's entry gate off the wallet.
  // The smallest block now fits inside the starting capital and the engine
  // takes the order; what still stops the player is the standing charge and
  // having nothing to sell 800 MW to on day one — a judgement, not a rule.
  test("the smallest nuclear block fits the starting capital, the largest does not", () => {
    const base = newGame(3, makeScenario());
    const spec = PLANT_TECHS.nuclear;
    const smallest = spec.blockMw.small * spec.capexPlnPerMw;
    expect(smallest).toBe(8_400_000_000);
    expect(smallest).toBeLessThan(base.moneyPln);

    const ordered = apply(base, {
      type: "buildPlant",
      tech: "nuclear",
      size: "small",
      hex: { q: 1, r: 1 },
    });
    expect(base.moneyPln - ordered.moneyPln).toBe(smallest);

    // The standing charge it brings with it: 500 tys. zł/MW/rok on 800 MW,
    // owed whether the block ever runs (02 §8.3).
    expect(spec.blockMw.small * spec.fixedPlnPerMwYear).toBe(400_000_000);

    // The top of the ladder is still out of reach on day one: 2 400 MW = 25,2 mld.
    expect(
      apply(base, { type: "buildPlant", tech: "nuclear", size: "xlarge", hex: { q: 2, r: 2 } }),
    ).toBe(base);
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
    expect(base.moneyPln - withLine.moneyPln).toBe(4 * 25 * 600_000);

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

describe("doc 01 §3.3, §5.2 (0.23): a spur may be strung to a site still being raised", () => {
  /** Queues a wind farm two hexes off the start plant and returns its site. */
  function queueFarm(state: GameState): { state: GameState; hex: { q: number; r: number } } {
    const hex = { q: 2, r: 0 };
    const next = apply(state, {
      type: "buildFarm",
      tech: "wind",
      hex,
      capacityMw: 100,
    });
    expect(next).not.toBe(state);
    expect(next.constructions).toHaveLength(1);
    return { state: next, hex };
  }

  test("a line may end on a construction site, and would not before 0.23", () => {
    const base = newGame(3, makeScenario());
    const site = { q: 2, r: 0 };
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }, site];

    // Nothing stands there yet — the route has a dangling end.
    expect(apply(base, { type: "buildLine", lineType: "lv", path })).toBe(base);

    const queued = queueFarm(base);
    const routed = apply(queued.state, { type: "buildLine", lineType: "lv", path });
    expect(routed).not.toBe(queued.state);
    expect(routed.lines).toHaveLength(1);
  });

  test("the site books slots, so it cannot collect more ends than it will have", () => {
    let state = queueFarm(newGame(3, makeScenario())).state;
    const path = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ];
    for (let i = 0; i < 7; i++) {
      state = apply(state, { type: "buildLine", lineType: "lv", path });
    }
    // Six slots on the plant and six on the farm site — the seventh is refused.
    expect(state.lines).toHaveLength(6);
  });

  test("the farm lands CONNECTED and running when its spur is finished in time", () => {
    const queued = queueFarm(newGame(3, makeScenario()));
    let state = apply(queued.state, {
      type: "buildLine",
      lineType: "lv",
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, queued.hex],
    });
    // LV takes 3 h per hex, the farm one game day: the spur wins the race.
    state = run(state, TURNS_PER_DAY);
    const farm = state.farms.find((candidate) => candidate.hex.q === queued.hex.q);
    expect(farm).toBeDefined();
    expect(farm?.enabled).toBe(true);
  });

  test("with no line at its hex the farm lands SWITCHED OFF (01 §5.2 in 0.23)", () => {
    const queued = queueFarm(newGame(3, makeScenario()));
    const state = run(queued.state, TURNS_PER_DAY);
    const farm = state.farms.find((candidate) => candidate.hex.q === queued.hex.q);
    expect(farm).toBeDefined();
    // Nothing could take its power, and since 0.23 production nobody takes is
    // charged the surplus penalty (§4.1) — so it arrives off, not bleeding.
    expect(farm?.enabled).toBe(false);
    expect(state.lastTurnReport?.totals.resCurtailedMw).toBe(0);
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
