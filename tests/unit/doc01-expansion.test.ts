import { describe, expect, test } from "vitest";
import {
  JUNCTION_SPEC,
  STORAGE_TECHS,
  TURNS_PER_DAY,
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type FarmState,
  type GameState,
  type LineType,
  type BuildSize,
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
        powerMw: STORAGE_TECHS.pumped.powerMw.medium,
        capacityMwh: STORAGE_TECHS.pumped.capacityMwh.medium,
        socMwh: 0,
        setpoint: { mode: "idle", mw: 0 },
      },
    ],
    junctions: [{ id: "junction-1", name: "J1", hex: { q: 8, r: 0 } }],
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
    const ordered = apply(base, { type: "expandPlant", plantId: "plant-1", size: "small" });
    expect(base.moneyPln - ordered.moneyPln).toBe(Math.round(100 * 2_750_000 * 0.85));
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
    { tech: "nuclear" as const, buildDays: 9, expected: 7 },
    { tech: "coal" as const, buildDays: 5, expected: 4 },
    { tech: "ccgt" as const, buildDays: 3, expected: 3 },
    { tech: "ocgt" as const, buildDays: 1, expected: 1 },
  ])("$tech: 70% of $buildDays days rounds up to $expected (min 1 day)", ({ tech, expected }) => {
    // The smallest rung of each technology (01 §5.1 in 0.24) — for nuclear
    // that is 1 000 MW, i.e. 17,85 mld zł, so this fixture needs a wallet the
    // starting capital does not have.
    const scenario = makeScenario({ startingMoneyPln: 100_000_000_000 });
    const plant = scenario.plants[0];
    if (!plant) throw new Error("fixture");
    const state = newGame(7, { ...scenario, plants: [{ ...plant, tech }] });
    const ordered = apply(state, { type: "expandPlant", plantId: "plant-1", size: "small" });
    expect(ordered.constructions[0]?.remainingDays).toBe(expected);
  });

  test("a wind farm grows to the 300 MW hex limit; over it is a no-op", () => {
    // The fixture farm is 100 MW, so LARGE (200 MW) is the rung that fills the
    // hex exactly — 01 §5.2 in 0.26.
    const base = newGame(7, makeScenario());
    const ordered = apply(base, { type: "expandFarm", farmId: "farm-1", size: "large" });
    expect(base.moneyPln - ordered.moneyPln).toBe(Math.round(200 * 1_800_000 * 0.85));
    expect(ordered.constructions[0]?.remainingDays).toBe(1); // 0.7 × 1 day → 1
    const done = run(ordered, TURNS_PER_DAY);
    expect(done.farms[0]?.capacityMw).toBe(300);
    expect(apply(done, { type: "expandFarm", farmId: "farm-1", size: "small" })).toBe(done);
  });

  test("terrain multiplies the expansion price too", () => {
    const base = newGame(7, makeScenario({ terrain: { "0,0": "mountains" } }));
    const ordered = apply(base, { type: "expandPlant", plantId: "plant-1", size: "small" });
    expect(base.moneyPln - ordered.moneyPln).toBe(Math.round(100 * 2_750_000 * 0.85 * 2.5));
  });
});

describe("doc 01 §7: hard site limits, counting work already queued", () => {
  test("6 blocks per plant hex — the 7th order is refused", () => {
    let state = newGame(7, makeScenario());
    for (let i = 0; i < 5; i++) {
      state = apply(state, { type: "expandPlant", plantId: "plant-1", size: "small" });
    }
    expect(state.constructions).toHaveLength(5);
    // All five are still under construction: the limit counts them anyway.
    const refused = apply(state, { type: "expandPlant", plantId: "plant-1", size: "small" });
    expect(refused).toBe(state);

    const done = run(state, 3 * TURNS_PER_DAY);
    expect(done.plants[0]?.blocks).toBe(6);
    expect(done.plants[0]?.capacityMw).toBe(900); // 400 at start + 5 × 100
    expect(apply(done, { type: "expandPlant", plantId: "plant-1", size: "small" })).toBe(done);
  });

  test("doc 01 §5.3 (0.26): a battery's two axes grow independently, each capped", () => {
    const base = newGame(7, makeScenario());
    const spec = STORAGE_TECHS.battery;
    // Buying MW never buys MWh: two actions, two prices, two countdowns.
    const power = apply(base, {
      type: "expandStoragePower",
      storageId: "battery-1",
      size: "small",
    });
    expect(base.moneyPln - power.moneyPln).toBe(spec.powerMw.small * spec.powerCapexPlnPerMw);
    const both = apply(power, {
      type: "expandStorageCapacity",
      storageId: "battery-1",
      size: "small",
    });
    expect(power.moneyPln - both.moneyPln).toBe(spec.capacityMwh.small * spec.energyCapexPlnPerMwh);
    expect(both.constructions).toHaveLength(2);

    const done = run(both, TURNS_PER_DAY);
    const battery = done.storages.find((s) => s.id === "battery-1");
    expect(battery?.powerMw).toBe(100 + spec.powerMw.small); // 150
    expect(battery?.capacityMwh).toBe(200 + spec.capacityMwh.small); // 300

    // 150 + 500 > 500 MW, and 300 + 1 000 · 2 > 2 000 MWh once queued.
    expect(
      apply(done, { type: "expandStoragePower", storageId: "battery-1", size: "xlarge" }),
    ).toBe(done);
    const queued = apply(done, {
      type: "expandStorageCapacity",
      storageId: "battery-1",
      size: "xlarge",
    });
    expect(
      apply(queued, { type: "expandStorageCapacity", storageId: "battery-1", size: "xlarge" }),
    ).toBe(queued); // the queue counts toward the cap
  });

  test("doc 01 §5.3 (0.26): pumped storage grows the same way — no more blocks", () => {
    const base = newGame(7, makeScenario());
    const spec = STORAGE_TECHS.pumped;
    // The fixture is the old 250 MW / 2 500 MWh block, i.e. MEDIUM/MEDIUM.
    const ordered = apply(base, {
      type: "expandStoragePower",
      storageId: "pumped-1",
      size: "medium",
    });
    expect(base.moneyPln - ordered.moneyPln).toBe(spec.powerMw.medium * spec.powerCapexPlnPerMw);
    expect(ordered.constructions[0]?.remainingDays).toBe(5); // STORAGE_TECHS.pumped
    const done = run(ordered, 5 * TURNS_PER_DAY);
    const pumped = done.storages.find((s) => s.id === "pumped-1");
    // Power moved on its own — the reservoir did NOT follow it.
    expect(pumped?.powerMw).toBe(500);
    expect(pumped?.capacityMwh).toBe(2_500);

    // The old fixed block is still expressible: MEDIUM + MEDIUM costs what it did.
    expect(
      spec.powerMw.medium * spec.powerCapexPlnPerMw +
        spec.capacityMwh.medium * spec.energyCapexPlnPerMwh,
    ).toBe(550_000_000);
  });

  test("doc 01 §5.4 (0.21): a junction station has nothing to expand", () => {
    const state = newGame(7, makeScenario());
    // No throughput, no modules — the object is a site and 12 line slots.
    expect(state.junctions[0]).toStrictEqual({ id: "junction-1", name: "J1", hex: { q: 8, r: 0 } });
    expect(JUNCTION_SPEC.capexPln).toBe(30_000_000);
    expect(JUNCTION_SPEC.lineSlots).toBe(12);
  });

  test("doc 01 §5.7: a border module adds 500 MW for 350 mln in 2 days", () => {
    const base = newGame(7, makeScenario());
    const ordered = apply(base, { type: "expandBorder", borderId: "border-1" });
    expect(base.moneyPln - ordered.moneyPln).toBe(350_000_000);
    expect(ordered.constructions[0]?.remainingDays).toBe(2);
    const done = run(ordered, 2 * TURNS_PER_DAY);
    expect(done.borders[0]?.throughputMw).toBe(1_000);
  });

  test("unknown ids, zero sizes and an empty wallet are no-ops", () => {
    const base = newGame(7, makeScenario());
    expect(apply(base, { type: "expandPlant", plantId: "nope", size: "small" })).toBe(base);
    expect(apply(base, { type: "expandFarm", farmId: "nope", size: "small" })).toBe(base);
    expect(apply(base, { type: "expandStoragePower", storageId: "nope", size: "small" })).toBe(
      base,
    );
    // 01 §5.3 (0.26): one pair of actions serves both technologies, so there is
    // no "wrong technology" refusal left — only an unknown rung.
    expect(
      apply(base, {
        type: "expandStorageCapacity",
        storageId: "pumped-1",
        size: "huge" as BuildSize,
      }),
    ).toBe(base);
    // 01 §5.1 (0.24): a block has one of four sizes — anything else off the
    // wire is refused, not rounded to the nearest one.
    expect(
      apply(base, { type: "expandPlant", plantId: "plant-1", size: "huge" as BuildSize }),
    ).toBe(base);
    const poor = { ...base, moneyPln: 1_000 };
    expect(apply(poor, { type: "expandBorder", borderId: "border-1" })).toBe(poor);
  });
});

describe("doc 01 §3.3 / §5.4: line slots are a per-object limit", () => {
  // A junction station ringed by thirteen farms, each two hexes away, so only
  // the station's own slot count can be the binding constraint. Routes are
  // written around the junction and then shifted inland, because every hex of a
  // route has to be a hex of the map (01 §3.1). Types are spread over the ring
  // so the ≤9-lines-of-one-type-per-hex rule (01 §3.3) never fires first.
  const JUNCTION_HEX = { q: 5, r: 3 };
  const shift = (hex: { q: number; r: number }) => ({
    q: hex.q + JUNCTION_HEX.q,
    r: hex.r + JUNCTION_HEX.r,
  });
  const ROUTES: { q: number; r: number }[][] = (
    [
      // Six corners of the ring, one per axial direction.
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
      // Six edges between them, each entering through a neighbouring hex.
      [
        { q: 2, r: -1 },
        { q: 1, r: 0 },
        { q: 0, r: 0 },
      ],
      [
        { q: 1, r: -2 },
        { q: 1, r: -1 },
        { q: 0, r: 0 },
      ],
      [
        { q: -1, r: -1 },
        { q: 0, r: -1 },
        { q: 0, r: 0 },
      ],
      [
        { q: -2, r: 1 },
        { q: -1, r: 0 },
        { q: 0, r: 0 },
      ],
      [
        { q: -1, r: 2 },
        { q: -1, r: 1 },
        { q: 0, r: 0 },
      ],
      [
        { q: 1, r: 1 },
        { q: 0, r: 1 },
        { q: 0, r: 0 },
      ],
      // The thirteenth, from outside the ring — one slot too many.
      [
        { q: 3, r: 0 },
        { q: 2, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 0 },
      ],
    ] as { q: number; r: number }[][]
  ).map((route) => route.map(shift));

  const TYPES: LineType[] = ROUTES.map((_, i) => (i < 6 ? "lv" : i < 12 ? "mv" : "hv"));

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
    junctions: [{ id: "junction-1", name: "J1", hex: JUNCTION_HEX }],
    borders: [],
    lines: [],
  };

  const buildRoutes = (state: GameState, indices: number[]): GameState => {
    let current = state;
    for (const i of indices) {
      const path = ROUTES[i];
      const lineType = TYPES[i];
      if (!path || !lineType) throw new Error("fixture");
      current = apply(current, { type: "buildLine", lineType, path });
    }
    return current;
  };

  test("a junction station takes 12 lines and refuses the thirteenth", () => {
    const all = [...ROUTES.keys()];
    const state = buildRoutes(newGame(7, ringScenario), all);
    expect(state.lines).toHaveLength(JUNCTION_SPEC.lineSlots);
    expect(JUNCTION_SPEC.lineSlots).toBe(12);

    // The refusal is the slot count, not the route: with a slot free it fits.
    const roomLeft = buildRoutes(newGame(7, ringScenario), all.slice(0, 11));
    expect(buildRoutes(roomLeft, [12]).lines).toHaveLength(12);
  });
});

describe("doc 01 §2.6: cancelling forfeits everything paid", () => {
  test("a queued object disappears and the money stays spent", () => {
    const base = newGame(7, makeScenario());
    const ordered = apply(base, {
      type: "buildPlant",
      tech: "ocgt",
      size: "large",
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
      state = apply(state, { type: "expandPlant", plantId: "plant-1", size: "small" });
    }
    expect(apply(state, { type: "expandPlant", plantId: "plant-1", size: "small" })).toBe(state);
    const constructionId = state.constructions[0]?.id ?? "";
    const cancelled = apply(state, { type: "cancelConstruction", constructionId });
    expect(cancelled.constructions).toHaveLength(4);
    expect(cancelled.moneyPln).toBe(state.moneyPln);
    // The freed slot can be ordered again.
    const reordered = apply(cancelled, {
      type: "expandPlant",
      plantId: "plant-1",
      size: "small",
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
