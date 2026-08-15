import { describe, expect, test } from "vitest";
import {
  BATTERY,
  JUNCTION_SPEC,
  PUMPED_BLOCK,
  TURNS_PER_DAY,
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type FarmState,
  type GameState,
  type Scenario,
} from "../../src/engine";

// Spec tests for expanding an existing object (docs/01 §7, 02 §8.4) and for
// cancelling work in progress (01 §2.6): 85% CAPEX / 70% time on plants and
// farms, printed module prices elsewhere, hard site limits that already count
// what is queued, and cancellation that refunds nothing.

function windFarm(id: string, q: number, r: number, capacityMw = 10): FarmState {
  return {
    id,
    name: id,
    hex: { q, r },
    tech: "wind",
    capacityMw,
    enabled: true,
    windClass: "open",
    solarMultiplier: 1,
  };
}

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    cities: [],
    plants: [
      {
        id: "plant-1",
        name: "P1",
        hex: { q: 0, r: 0 },
        tech: "ccgt",
        capacityMw: 400,
        blocks: 1,
        setpointMw: 0,
      },
    ],
    farms: [windFarm("farm-1", 2, 0, 100)],
    storages: [
      {
        id: "battery-1",
        name: "B1",
        hex: { q: 4, r: 0 },
        tech: "battery",
        powerMw: 100,
        capacityMwh: 200,
        socMwh: 0,
        setpoint: { mode: "idle", mw: 0 },
      },
      {
        id: "pumped-1",
        name: "S1",
        hex: { q: 6, r: 0 },
        tech: "pumped",
        powerMw: PUMPED_BLOCK.powerMw,
        capacityMwh: PUMPED_BLOCK.capacityMwh,
        socMwh: 0,
        setpoint: { mode: "idle", mw: 0 },
      },
    ],
    junctions: [{ id: "junction-1", name: "J1", hex: { q: 8, r: 0 }, throughputMw: 250 }],
    borders: [
      {
        id: "border-1",
        name: "G1",
        hex: { q: 10, r: 0 },
        throughputMw: 500,
        importSetpointMw: 0,
        exportSetpointMw: 0,
      },
    ],
    lines: [],
    ...overrides,
  };
}

const apply = (state: GameState, action: Action) => applyAction(state, action);

function run(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i++) current = resolveTurn(current);
  return current;
}

describe("doc 02 §8.4: plants and farms expand at 85% CAPEX and 70% time", () => {
  test("a CCGT block: 85% of the new-site price, ceil(70%) days, then +capacity", () => {
    const base = newGame(7, makeScenario());
    const ordered = apply(base, { type: "expandPlant", plantId: "plant-1", capacityMw: 100 });
    expect(base.moneyPln - ordered.moneyPln).toBe(Math.round(100 * 5_500_000 * 0.85));
    // CCGT builds 3 days new → 0.7 × 3 = 2.1 → 3 whole game days.
    expect(ordered.constructions[0]?.remainingDays).toBe(3);
    expect(ordered.plants[0]?.capacityMw).toBe(400);

    const twoDays = run(ordered, 2 * TURNS_PER_DAY);
    expect(twoDays.plants[0]?.capacityMw).toBe(400);
    const done = run(twoDays, TURNS_PER_DAY);
    expect(done.constructions).toHaveLength(0);
    expect(done.plants).toHaveLength(1); // expansion, not a second object
    expect(done.plants[0]?.capacityMw).toBe(500);
    expect(done.plants[0]?.blocks).toBe(2);
  });

  test.each([
    { tech: "nuclear" as const, capacityMw: 100, buildDays: 9, expected: 7 },
    { tech: "coal" as const, capacityMw: 100, buildDays: 5, expected: 4 },
    { tech: "ccgt" as const, capacityMw: 100, buildDays: 3, expected: 3 },
    { tech: "ocgt" as const, capacityMw: 100, buildDays: 1, expected: 1 },
  ])(
    "$tech: 70% of $buildDays days rounds up to $expected (min 1 day)",
    ({ tech, capacityMw, expected }) => {
      const scenario = makeScenario();
      const plant = scenario.plants[0];
      if (!plant) throw new Error("fixture");
      const state = newGame(7, { ...scenario, plants: [{ ...plant, tech }] });
      const ordered = apply(state, { type: "expandPlant", plantId: "plant-1", capacityMw });
      expect(ordered.constructions[0]?.remainingDays).toBe(expected);
    },
  );

  test("a wind farm grows to the 300 MW hex limit; over it is a no-op", () => {
    const base = newGame(7, makeScenario());
    const ordered = apply(base, { type: "expandFarm", farmId: "farm-1", capacityMw: 200 });
    expect(base.moneyPln - ordered.moneyPln).toBe(Math.round(200 * 3_600_000 * 0.85));
    expect(ordered.constructions[0]?.remainingDays).toBe(1); // 0.7 × 1 day → 1
    const done = run(ordered, TURNS_PER_DAY);
    expect(done.farms[0]?.capacityMw).toBe(300);
    expect(apply(done, { type: "expandFarm", farmId: "farm-1", capacityMw: 1 })).toBe(done);
  });

  test("terrain multiplies the expansion price too", () => {
    const base = newGame(7, makeScenario({ terrain: { "0,0": "mountains" } }));
    const ordered = apply(base, { type: "expandPlant", plantId: "plant-1", capacityMw: 100 });
    expect(base.moneyPln - ordered.moneyPln).toBe(Math.round(100 * 5_500_000 * 0.85 * 2.5));
  });
});

describe("doc 01 §7: hard site limits, counting work already queued", () => {
  test("6 blocks per plant hex — the 7th order is refused", () => {
    let state = newGame(7, makeScenario());
    for (let i = 0; i < 5; i++) {
      state = apply(state, { type: "expandPlant", plantId: "plant-1", capacityMw: 50 });
    }
    expect(state.constructions).toHaveLength(5);
    // All five are still under construction: the limit counts them anyway.
    const refused = apply(state, { type: "expandPlant", plantId: "plant-1", capacityMw: 50 });
    expect(refused).toBe(state);

    const done = run(state, 3 * TURNS_PER_DAY);
    expect(done.plants[0]?.blocks).toBe(6);
    expect(done.plants[0]?.capacityMw).toBe(650);
    expect(apply(done, { type: "expandPlant", plantId: "plant-1", capacityMw: 50 })).toBe(done);
  });

  test("doc 02 §8.2: battery modules are printed prices, capped at 500 MW / 2 000 MWh", () => {
    const base = newGame(7, makeScenario());
    const ordered = apply(base, {
      type: "expandBattery",
      storageId: "battery-1",
      powerMw: 50,
      capacityMwh: 100,
    });
    expect(base.moneyPln - ordered.moneyPln).toBe(
      50 * BATTERY.powerCapexPlnPerMw + 100 * BATTERY.energyCapexPlnPerMwh,
    );
    const done = run(ordered, TURNS_PER_DAY);
    const battery = done.storages.find((s) => s.id === "battery-1");
    expect(battery?.powerMw).toBe(150);
    expect(battery?.capacityMwh).toBe(300);
    expect(
      apply(done, {
        type: "expandBattery",
        storageId: "battery-1",
        powerMw: 400,
        capacityMwh: 0,
      }),
    ).toBe(done); // 150 + 400 > 500 MW
    expect(
      apply(done, {
        type: "expandBattery",
        storageId: "battery-1",
        powerMw: 0,
        capacityMwh: 1_800,
      }),
    ).toBe(done); // 300 + 1 800 > 2 000 MWh
  });

  test("doc 02 §8.2: pumped storage grows by whole blocks, 4 per site", () => {
    let state = newGame(7, makeScenario());
    const before = state.moneyPln;
    state = apply(state, { type: "expandPumpedStorage", storageId: "pumped-1" });
    expect(before - state.moneyPln).toBe(PUMPED_BLOCK.capexPln);
    expect(state.constructions[0]?.remainingDays).toBe(5); // STORAGE_TECHS.pumped
    state = run(state, 5 * TURNS_PER_DAY);
    const pumped = () => state.storages.find((s) => s.id === "pumped-1");
    expect(pumped()?.powerMw).toBe(500);
    expect(pumped()?.capacityMwh).toBe(5_000);

    state = apply(state, { type: "expandPumpedStorage", storageId: "pumped-1" });
    state = apply(state, { type: "expandPumpedStorage", storageId: "pumped-1" });
    const refused = apply(state, { type: "expandPumpedStorage", storageId: "pumped-1" });
    expect(refused).toBe(state); // 2 standing + 2 queued = the 4-block cap
    state = run(state, 5 * TURNS_PER_DAY);
    expect(pumped()?.powerMw).toBe(1_000);
    expect(pumped()?.capacityMwh).toBe(10_000);
  });

  test("doc 01 §5.4: junction modules add 250 MW and 2 line slots, 6 modules max", () => {
    let state = newGame(7, makeScenario());
    const before = state.moneyPln;
    state = apply(state, { type: "expandJunction", junctionId: "junction-1" });
    expect(before - state.moneyPln).toBe(JUNCTION_SPEC.moduleCapexPln);
    state = run(state, TURNS_PER_DAY);
    expect(state.junctions[0]?.throughputMw).toBe(500);
    expect(state.junctions[0]?.lineSlots).toBe(8);

    for (let i = 0; i < 5; i++) {
      state = apply(state, { type: "expandJunction", junctionId: "junction-1" });
    }
    expect(apply(state, { type: "expandJunction", junctionId: "junction-1" })).toBe(state);
    state = run(state, TURNS_PER_DAY);
    expect(state.junctions[0]?.throughputMw).toBe(1_750);
    expect(state.junctions[0]?.lineSlots).toBe(18);
  });

  test("doc 01 §5.7: a border module adds 500 MW for 0.7 mld in 2 days", () => {
    const base = newGame(7, makeScenario());
    const ordered = apply(base, { type: "expandBorder", borderId: "border-1" });
    expect(base.moneyPln - ordered.moneyPln).toBe(700_000_000);
    expect(ordered.constructions[0]?.remainingDays).toBe(2);
    const done = run(ordered, 2 * TURNS_PER_DAY);
    expect(done.borders[0]?.throughputMw).toBe(1_000);
  });

  test("unknown ids, zero sizes and an empty wallet are no-ops", () => {
    const base = newGame(7, makeScenario());
    expect(apply(base, { type: "expandPlant", plantId: "nope", capacityMw: 10 })).toBe(base);
    expect(apply(base, { type: "expandFarm", farmId: "farm-1", capacityMw: 0 })).toBe(base);
    expect(
      apply(base, { type: "expandBattery", storageId: "pumped-1", powerMw: 10, capacityMwh: 0 }),
    ).toBe(base); // wrong technology
    expect(apply(base, { type: "expandPumpedStorage", storageId: "battery-1" })).toBe(base);
    expect(apply(base, { type: "expandPlant", plantId: "plant-1", capacityMw: 600 })).toBe(base); // > CCGT block size
    const poor = { ...base, moneyPln: 1_000 };
    expect(apply(poor, { type: "expandJunction", junctionId: "junction-1" })).toBe(poor);
  });
});

describe("doc 01 §3.3 / §5.4: line slots are a per-object limit", () => {
  // A junction ringed by eight farms, each two hexes away, so only the
  // junction's own slot count can be the binding constraint. Routes are written
  // around the junction and then shifted inland, because every hex of a route
  // has to be a hex of the map (01 §3.1).
  const JUNCTION_HEX = { q: 5, r: 3 };
  const shift = (hex: { q: number; r: number }) => ({
    q: hex.q + JUNCTION_HEX.q,
    r: hex.r + JUNCTION_HEX.r,
  });
  const ROUTES: { q: number; r: number }[][] = (
    [
      [
        { q: 2, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 0 },
      ],
      [
        { q: 2, r: -2 },
        { q: 1, r: -1 },
        { q: 0, r: 0 },
      ],
      [
        { q: 0, r: -2 },
        { q: 0, r: -1 },
        { q: 0, r: 0 },
      ],
      [
        { q: -2, r: 0 },
        { q: -1, r: 0 },
        { q: 0, r: 0 },
      ],
      [
        { q: -2, r: 2 },
        { q: -1, r: 1 },
        { q: 0, r: 0 },
      ],
      [
        { q: 0, r: 2 },
        { q: 0, r: 1 },
        { q: 0, r: 0 },
      ],
      [
        { q: 3, r: 0 },
        { q: 2, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 0 },
      ],
      [
        { q: 4, r: 0 },
        { q: 3, r: 0 },
        { q: 2, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 0 },
      ],
    ] as { q: number; r: number }[][]
  ).map((route) => route.map(shift));

  const ringScenario: Scenario = {
    startingMoneyPln: 10_000_000_000,
    cities: [],
    plants: [],
    farms: ROUTES.map((route, i) => {
      const end = route[0];
      if (!end) throw new Error("fixture");
      return windFarm(`farm-${i}`, end.q, end.r);
    }),
    storages: [],
    junctions: [{ id: "junction-1", name: "J1", hex: JUNCTION_HEX, throughputMw: 250 }],
    borders: [],
    lines: [],
  };

  test("a junction takes 6 lines, and 2 more per capacity module", () => {
    let state = newGame(7, ringScenario);
    expect(state.junctions[0]?.lineSlots).toBe(6);
    for (const path of ROUTES) {
      state = apply(state, { type: "buildLine", lineType: "lv", path });
    }
    expect(state.lines).toHaveLength(6); // routes 7 and 8 refused

    state = apply(state, { type: "expandJunction", junctionId: "junction-1" });
    state = run(state, TURNS_PER_DAY);
    for (const path of ROUTES.slice(6)) {
      state = apply(state, { type: "buildLine", lineType: "lv", path });
    }
    expect(state.lines).toHaveLength(8);
  });
});

describe("doc 01 §2.6: cancelling forfeits everything paid", () => {
  test("a queued object disappears and the money stays spent", () => {
    const base = newGame(7, makeScenario());
    const ordered = apply(base, {
      type: "buildPlant",
      tech: "ocgt",
      capacityMw: 100,
      hex: { q: 1, r: 1 },
    });
    const constructionId = ordered.constructions[0]?.id ?? "";
    const cancelled = apply(ordered, { type: "cancelConstruction", constructionId });
    expect(cancelled.constructions).toHaveLength(0);
    expect(cancelled.moneyPln).toBe(ordered.moneyPln); // no refund
    expect(cancelled.moneyPln).toBeLessThan(base.moneyPln);
    // Nothing appears later either.
    const later = run(cancelled, 3 * TURNS_PER_DAY);
    expect(later.plants).toHaveLength(1);
  });

  test("a queued expansion cancels the same way and frees the site limit", () => {
    let state = newGame(7, makeScenario());
    for (let i = 0; i < 5; i++) {
      state = apply(state, { type: "expandPlant", plantId: "plant-1", capacityMw: 50 });
    }
    expect(apply(state, { type: "expandPlant", plantId: "plant-1", capacityMw: 50 })).toBe(state);
    const constructionId = state.constructions[0]?.id ?? "";
    const cancelled = apply(state, { type: "cancelConstruction", constructionId });
    expect(cancelled.constructions).toHaveLength(4);
    expect(cancelled.moneyPln).toBe(state.moneyPln);
    // The freed slot can be ordered again.
    const reordered = apply(cancelled, {
      type: "expandPlant",
      plantId: "plant-1",
      capacityMw: 50,
    });
    expect(reordered.constructions).toHaveLength(5);
  });

  test("a line under construction can be cancelled; a finished one cannot", () => {
    const base = newGame(7, makeScenario());
    const path = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ];
    const withLine = apply(base, { type: "buildLine", lineType: "mv", path });
    const lineId = withLine.lines[0]?.id ?? "";
    const spent = withLine.moneyPln;
    const cancelled = apply(withLine, { type: "cancelLine", lineId });
    expect(cancelled.lines).toHaveLength(0);
    expect(cancelled.moneyPln).toBe(spent);

    // 2 steps × 6 h = 12 h = 4 turns; after that the line is untouchable.
    const finished = run(withLine, 4);
    expect(finished.lines[0]?.builtHours).toBe(12);
    expect(apply(finished, { type: "cancelLine", lineId })).toBe(finished);
  });

  test("cancelling an unknown id is a no-op", () => {
    const base = newGame(7, makeScenario());
    expect(apply(base, { type: "cancelConstruction", constructionId: "nope" })).toBe(base);
    expect(apply(base, { type: "cancelLine", lineId: "nope" })).toBe(base);
  });
});
