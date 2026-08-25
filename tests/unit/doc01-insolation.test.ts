import { describe, expect, test } from "vitest";
import {
  TURNS_PER_DAY,
  applyAction,
  farmPowerMwAtHour,
  farmProductionForecast,
  hexKey,
  newGame,
  offsetToAxial,
  resolveTurn,
  type FarmState,
  type GameState,
  type Scenario,
} from "../../src/engine";

// The regional insolation multiplier (01 §3.2) is a property of the hex that a
// PV farm keeps for life — like its wind class. It scales production, and the
// forecast follows because the forecast is computed from that production.

const at = (col: number, row: number) => offsetToAxial({ col, row });
const DIM = at(1, 1);
const BRIGHT = at(2, 1);

function farm(id: string, hex: { q: number; r: number }, solarMultiplier: number): FarmState {
  return {
    id,
    name: id,
    hex,
    tech: "pv",
    capacityMw: 100,
    enabled: true,
    windClass: "open",
    solarMultiplier,
  };
}

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    map: { cols: 8, rows: 6 },
    solarMultipliers: { [hexKey(DIM)]: 0.8 },
    cities: [
      {
        id: "city-a",
        name: "A",
        hex: at(4, 0),
        connected: true,
        households: 60_000,
        firms: 5_200,
        householdsStart: 60_000,
        firmsStart: 5_200,
        connectedSinceDay: 0,
        monthDemandMwh: 0,
        monthDeliveredMwh: 0,
      },
    ],
    plants: [],
    farms: [],
    storages: [],
    junctions: [],
    borders: [],
    lines: [],
    ...overrides,
  };
}

/** The sunniest hour of the day up to `until` — PV is zero at night. */
function brightestHour(state: GameState, until = 24): number {
  const ghi = state.dayTruth.weather.ghiW;
  let best = 0;
  for (let hour = 0; hour < until; hour++) {
    if ((ghi[hour] ?? 0) > (ghi[best] ?? 0)) best = hour;
  }
  expect(ghi[best] ?? 0).toBeGreaterThan(0);
  return best;
}

describe("doc 01 §3.2: insolation scales PV production", () => {
  test("a dimmer hex produces exactly its multiplier's share, hour by hour", () => {
    const state = newGame(
      11,
      makeScenario({ farms: [farm("pv-dim", DIM, 0.8), farm("pv-full", BRIGHT, 1)] }),
    );
    const dim = state.farms[0] as FarmState;
    const full = state.farms[1] as FarmState;
    let sunnyHours = 0;
    for (let hour = 0; hour < 24; hour++) {
      const dimMw = farmPowerMwAtHour(dim, state.dayTruth.weather, hour);
      const fullMw = farmPowerMwAtHour(full, state.dayTruth.weather, hour);
      expect(dimMw).toBeCloseTo(0.8 * fullMw, 10);
      if (fullMw > 0) sunnyHours += 1;
    }
    expect(sunnyHours).toBeGreaterThan(0);
  });

  test("wind ignores the multiplier", () => {
    const windy: FarmState = { ...farm("wind-dim", DIM, 0.8), tech: "wind" };
    const calm: FarmState = { ...farm("wind-full", BRIGHT, 1), tech: "wind" };
    const state = newGame(11, makeScenario({ farms: [windy, calm] }));
    for (let hour = 0; hour < 24; hour++) {
      expect(farmPowerMwAtHour(state.farms[0] as FarmState, state.dayTruth.weather, hour)).toBe(
        farmPowerMwAtHour(state.farms[1] as FarmState, state.dayTruth.weather, hour),
      );
    }
  });

  test("the forecast reflects it — it is computed from the scaled truth", () => {
    // Play into the afternoon so the morning hours are revealed truth
    // (06 §8.6: horizon ≤ 0 means no error term and no band).
    let state = newGame(
      11,
      makeScenario({ farms: [farm("pv-dim", DIM, 0.8), farm("pv-full", BRIGHT, 1)] }),
    );
    for (let i = 0; i < 5; i++) state = resolveTurn(state);
    const hour = brightestHour(state, 15);
    const dim = farmProductionForecast(state, "pv-dim", hour);
    const full = farmProductionForecast(state, "pv-full", hour);
    if (!dim || !full) throw new Error("both farms must have a forecast");
    expect(full.mw).toBeGreaterThan(0);
    expect(dim.mw).toBeCloseTo(0.8 * full.mw, 10);

    // Ahead of the reveal the band is still σ × installed capacity, the same
    // for both farms — only the expected value carries the multiplier.
    const ahead = 23;
    const dimAhead = farmProductionForecast(state, "pv-dim", ahead);
    const fullAhead = farmProductionForecast(state, "pv-full", ahead);
    expect(dimAhead?.bandMw).toBe(fullAhead?.bandMw);
    expect(dimAhead?.mw ?? 0).toBeLessThanOrEqual(fullAhead?.mw ?? 0);
  });
});

describe("doc 01 §3.2: the multiplier is taken from the hex at build time", () => {
  test("a farm built on the dim hex keeps 0.8 forever; elsewhere it is 1.0", () => {
    let state: GameState = newGame(11, makeScenario());
    state = applyAction(state, { type: "buildFarm", tech: "pv", size: "medium", hex: DIM });
    state = applyAction(state, { type: "buildFarm", tech: "pv", size: "medium", hex: BRIGHT });
    for (let i = 0; i < TURNS_PER_DAY; i++) state = resolveTurn(state); // PV builds 1 day
    expect(state.farms).toHaveLength(2);
    expect(state.farms[0]?.solarMultiplier).toBe(0.8);
    expect(state.farms[1]?.solarMultiplier).toBe(1);
  });
});
