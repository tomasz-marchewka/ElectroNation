import { describe, expect, test } from "vitest";
import {
  MAX_LINES_PER_HEX_PER_TYPE,
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type Scenario,
} from "../../src/engine";

// Spec tests for raising a finished line to a higher type: docs/01 §4.2 (0.17)
// and 02 §9.11 — 85% CAPEX / 70% time of the target type, the corridor keeps
// carrying power on the old type until the work is done, and a line being
// raised holds a slot in BOTH corridor counters.

const P1 = { q: 0, r: 0 };
const A = { q: 4, r: 0 };
const P2 = { q: 2, r: -1 };
const B = { q: 2, r: 1 };
/** The hex both routes cross — where the corridor limit bites. */
const CROSS = { q: 2, r: 0 };

/** P1 ▸ A, four steps, through CROSS. */
const LONG = [P1, { q: 1, r: 0 }, CROSS, { q: 3, r: 0 }, A];
/** P2 ▸ B, two steps, through CROSS. */
const SHORT = [P2, CROSS, B];

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  const city = (id: string, name: string, hex: { q: number; r: number }) => ({
    id,
    name,
    hex,
    connected: true,
    households: 40_000,
    firms: 3_400,
    householdsStart: 40_000,
    firmsStart: 3_400,
    connectedSinceDay: 0,
    monthDemandMwh: 0,
    monthDeliveredMwh: 0,
  });
  const plant = (id: string, name: string, hex: { q: number; r: number }) => ({
    id,
    name,
    hex,
    tech: "ccgt" as const,
    capacityMw: 400,
    setpointMw: 0,
  });
  return {
    startingMoneyPln: 50_000_000_000,
    cities: [city("city-a", "A", A), city("city-b", "B", B)],
    plants: [plant("plant-1", "P1", P1), plant("plant-2", "P2", P2)],
    farms: [],
    storages: [],
    junctions: [],
    borders: [],
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

/** A finished MV line along `path`, built through the normal build loop. */
function withFinishedLine(
  state: GameState,
  path: readonly { q: number; r: number }[],
  lineType: "lv" | "mv" | "hv" = "mv",
): GameState {
  const ordered = apply(state, { type: "buildLine", lineType, path: [...path] });
  const line = ordered.lines[ordered.lines.length - 1];
  expect(line).toBeDefined();
  return run(ordered, Math.ceil((line?.totalHours ?? 0) / 3));
}

describe("doc 01 §4.2: a raise costs 85% of the target type and takes 70% of its time", () => {
  test("MV → HV on a 4-step route: 510 mln zł and 34 h of work", () => {
    const built = withFinishedLine(newGame(3, makeScenario()), LONG);
    const before = built.moneyPln;
    const raised = apply(built, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" });

    // A new HV line here would cost 4 × 25 km × 6 mln = 600 mln (02 §8.1, plains).
    expect(before - raised.moneyPln).toBe(Math.round(600_000_000 * 0.85));
    // …and take 4 × 12 h = 48 h; the raise takes 70% of that, rounded.
    expect(raised.lines[0]?.upgrade).toEqual({ type: "hv", builtHours: 0, totalHours: 34 });
    // The line itself is untouched until the work finishes.
    expect(raised.lines[0]?.type).toBe("mv");
  });

  test("terrain multiplies the raise exactly as it multiplies a new line", () => {
    const scenario = makeScenario({ terrain: { "2,0": "mountains", "3,0": "swamp" } });
    const built = withFinishedLine(newGame(3, scenario), LONG);
    const before = built.moneyPln;
    const raised = apply(built, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" });
    // Charged from the second hex on: (1,0) ×1,0, (2,0) ×2,5, (3,0) ×2,0, (4,0) ×1,0.
    const full = 25 * 6_000_000 * (1.0 + 2.5 + 2.0 + 1.0);
    expect(before - raised.moneyPln).toBe(Math.round(Math.round(full) * 0.85));
  });

  test("the raise is paid up front and refused on an empty wallet", () => {
    const poor = makeScenario({ startingMoneyPln: 300_000_000 });
    // 250 mln for the MV line leaves 50 mln — far short of the 510 mln raise.
    const built = withFinishedLine(newGame(3, poor), LONG);
    expect(apply(built, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" })).toBe(built);
  });
});

describe("doc 01 §4.2: the corridor keeps working on the old type until the raise lands", () => {
  test("capacity stays MV through the works and is HV afterwards", () => {
    let state = withFinishedLine(newGame(3, makeScenario()), LONG);
    state = apply(state, { type: "setPlantSetpoint", plantId: "plant-1", mw: 300 });
    state = apply(state, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" });

    // 34 h of work at 3 h per resolved turn = 12 turns; the 11th leaves 1 h.
    const midway = run(state, 11);
    expect(midway.lines[0]?.type).toBe("mv");
    expect(midway.lines[0]?.upgrade?.builtHours).toBe(33);
    // Power flowed the whole time, on the old type's capacity (01 §4.2).
    expect(midway.lastTurnReport?.segments[0]?.capacityMw).toBe(500);
    expect(midway.cities.find((c) => c.id === "city-a")?.monthDeliveredMwh ?? 0).toBeGreaterThan(0);

    const done = run(midway, 1);
    expect(done.lines[0]?.type).toBe("hv");
    expect(done.lines[0]?.upgrade).toBeNull();
    // The flip is booked at the end of the turn, so the new capacity carries
    // power from the NEXT one — exactly like a line finishing construction.
    expect(done.lastTurnReport?.segments[0]?.capacityMw).toBe(500);
    expect(run(done, 1).lastTurnReport?.segments[0]?.capacityMw).toBe(1500);
  });

  test("the fixed cost follows the old type until the flip (02 §8.3)", () => {
    // A day of MV upkeep on a 100 km line vs the same day once it is HV.
    const base = withFinishedLine(newGame(3, makeScenario()), LONG);
    const dayOnMv = run(base, 8).moneyPln - base.moneyPln;
    const raised = apply(base, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" });
    const dayOnRaise = run(raised, 8).moneyPln - raised.moneyPln;
    // Nothing else changed, so the two days differ by no upkeep at all.
    expect(dayOnRaise).toBe(dayOnMv);
  });
});

describe("doc 01 §4.2: raises only ever go up, one at a time, on a finished line", () => {
  test("a downgrade, a same-type raise and an HV raise are no-ops", () => {
    const mv = withFinishedLine(newGame(3, makeScenario()), LONG);
    expect(apply(mv, { type: "upgradeLine", lineId: "obj-1", lineType: "lv" })).toBe(mv);
    expect(apply(mv, { type: "upgradeLine", lineId: "obj-1", lineType: "mv" })).toBe(mv);
    const hv = withFinishedLine(newGame(3, makeScenario()), LONG, "hv");
    expect(apply(hv, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" })).toBe(hv);
  });

  test("a line still under construction cannot be raised", () => {
    const ordered = apply(newGame(3, makeScenario()), {
      type: "buildLine",
      lineType: "mv",
      path: LONG,
    });
    const halfway = run(ordered, 2); // 6 of 24 h
    expect(apply(halfway, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" })).toBe(halfway);
  });

  test("a second raise on the same line is refused while the first runs", () => {
    const built = withFinishedLine(newGame(3, makeScenario()), LONG);
    const raised = apply(built, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" });
    expect(apply(raised, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" })).toBe(raised);
    // …not even to a different type: the line is already committed.
    const lv = withFinishedLine(newGame(3, makeScenario()), SHORT, "lv");
    const toMv = apply(lv, { type: "upgradeLine", lineId: "obj-1", lineType: "mv" });
    expect(apply(toMv, { type: "upgradeLine", lineId: "obj-1", lineType: "hv" })).toBe(toMv);
  });

  test("an unknown line id is a no-op (replay-safe)", () => {
    const built = withFinishedLine(newGame(3, makeScenario()), LONG);
    expect(apply(built, { type: "upgradeLine", lineId: "nope", lineType: "hv" })).toBe(built);
  });
});

describe("doc 01 §3.3 / §4.2: the corridor limit counts a raise in both types", () => {
  /** `mv` MV lines through CROSS, then one LV line on the short route. */
  function corridor(mvOnShort: number): GameState {
    let state = newGame(3, makeScenario());
    // Six MV lines exhaust P1's and A's six slots but only six of nine corridor
    // places at CROSS; the rest come from the short route's own endpoints.
    for (let i = 0; i < 6; i++) {
      state = apply(state, { type: "buildLine", lineType: "mv", path: LONG });
    }
    for (let i = 0; i < mvOnShort; i++) {
      state = apply(state, { type: "buildLine", lineType: "mv", path: SHORT });
    }
    state = apply(state, { type: "buildLine", lineType: "lv", path: SHORT });
    expect(state.lines).toHaveLength(7 + mvOnShort);
    return run(state, 8); // finish everything
  }

  test("a full MV corridor refuses the raise but still allows HV", () => {
    const state = corridor(3);
    const lv = state.lines[state.lines.length - 1];
    expect(lv?.type).toBe("lv");
    const mvCount = state.lines.filter(
      (line) => line.type === "mv" && line.path.some((h) => h.q === CROSS.q && h.r === CROSS.r),
    ).length;
    expect(mvCount).toBe(MAX_LINES_PER_HEX_PER_TYPE);

    const id = lv?.id ?? "";
    expect(apply(state, { type: "upgradeLine", lineId: id, lineType: "mv" })).toBe(state);
    // The limit is per type: nothing is HV here, so that raise goes through.
    expect(apply(state, { type: "upgradeLine", lineId: id, lineType: "hv" })).not.toBe(state);
  });

  test("a raise in flight blocks a new line of the target type", () => {
    const state = corridor(2); // 8 MV at CROSS, plus the LV line
    const id = state.lines[state.lines.length - 1]?.id ?? "";
    // Before the raise the ninth MV line fits.
    expect(apply(state, { type: "buildLine", lineType: "mv", path: SHORT })).not.toBe(state);

    const raising = apply(state, { type: "upgradeLine", lineId: id, lineType: "mv" });
    expect(raising.lines.find((line) => line.id === id)?.upgrade?.type).toBe("mv");
    // Now the raise holds the ninth place even though no ninth MV line exists
    // yet — without that reservation the corridor would end up with ten.
    expect(apply(raising, { type: "buildLine", lineType: "mv", path: SHORT })).toBe(raising);
  });
});

describe("doc 01 §2.6: cancelling a raise forfeits the money and keeps the old type", () => {
  test("the line stays MV, the money is gone, the reserved place is freed", () => {
    const state = corridorWithRaise();
    const id = state.lines[state.lines.length - 1]?.id ?? "";
    const cancelled = apply(state, { type: "cancelLineUpgrade", lineId: id });
    const line = cancelled.lines.find((candidate) => candidate.id === id);
    expect(line?.type).toBe("lv");
    expect(line?.upgrade).toBeNull();
    expect(cancelled.moneyPln).toBe(state.moneyPln); // paid, not refunded
    // The target type's place is released with the raise.
    expect(apply(cancelled, { type: "buildLine", lineType: "mv", path: SHORT })).not.toBe(cancelled);
  });

  test("cancelling a line that is not being raised is a no-op", () => {
    const built = withFinishedLine(newGame(3, makeScenario()), LONG);
    expect(apply(built, { type: "cancelLineUpgrade", lineId: "obj-1" })).toBe(built);
    expect(apply(built, { type: "cancelLineUpgrade", lineId: "nope" })).toBe(built);
  });

  test("a finished line is still not demolishable (cancelLine only builds)", () => {
    const built = withFinishedLine(newGame(3, makeScenario()), LONG);
    expect(apply(built, { type: "cancelLine", lineId: "obj-1" })).toBe(built);
  });

  /** 8 MV at CROSS plus an LV line already being raised to MV. */
  function corridorWithRaise(): GameState {
    let state = newGame(3, makeScenario());
    for (let i = 0; i < 6; i++) {
      state = apply(state, { type: "buildLine", lineType: "mv", path: LONG });
    }
    for (let i = 0; i < 2; i++) {
      state = apply(state, { type: "buildLine", lineType: "mv", path: SHORT });
    }
    state = apply(state, { type: "buildLine", lineType: "lv", path: SHORT });
    state = run(state, 8);
    const id = state.lines[state.lines.length - 1]?.id ?? "";
    return apply(state, { type: "upgradeLine", lineId: id, lineType: "mv" });
  }
});
