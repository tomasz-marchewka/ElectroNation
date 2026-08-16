import { describe, expect, test } from "vitest";
import {
  cityDemandForecast,
  farmProductionForecast,
  newGame,
  resolveTurn,
  sigmaDemand,
  sigmaPv,
  sigmaWind,
  type Scenario,
} from "../../src/engine";

// Spec tests for docs/06 §8.6 — forecast as a noisy view of pre-generated truth.

describe("doc 06 §8.6.2: σ(h) matches the doc's table", () => {
  test.each([
    { h: 1, wind: 0.062, pv: 0.05, demand: 0.014 },
    { h: 3, wind: 0.106, pv: 0.09, demand: 0.022 },
    { h: 6, wind: 0.172, pv: 0.15, demand: 0.034 },
    { h: 12, wind: 0.304, pv: 0.27, demand: 0.058 },
  ])("+$h h → wiatr ±$wind, PV ±$pv, popyt ±$demand", ({ h, wind, pv, demand }) => {
    expect(sigmaWind(h)).toBeCloseTo(wind, 10);
    expect(sigmaPv(h)).toBeCloseTo(pv, 10);
    expect(sigmaDemand(h)).toBeCloseTo(demand, 10);
  });

  test("intraday cap: σ stops growing past 12 h (06 §8.6.3)", () => {
    expect(sigmaWind(20)).toBe(sigmaWind(12));
  });
});

const TWO_CITY_SCENARIO: Scenario = {
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
    {
      id: "city-b",
      name: "B",
      hex: { q: 8, r: 0 },
      connected: true,
      households: 30_000,
      firms: 2_600,
      householdsStart: 30_000,
      firmsStart: 2_600,
      connectedSinceDay: 0,
      monthDemandMwh: 0,
      monthDeliveredMwh: 0,
    },
  ],
  plants: [],
  farms: [
    {
      id: "farm-wind",
      name: "W",
      hex: { q: 0, r: 0 },
      tech: "wind",
      capacityMw: 200,
      enabled: true,
      windClass: "open",
      solarMultiplier: 1,
    },
    {
      id: "farm-pv",
      name: "S",
      hex: { q: 1, r: 0 },
      tech: "pv",
      capacityMw: 100,
      enabled: true,
      windClass: "open",
      solarMultiplier: 1,
    },
  ],
  storages: [],
  junctions: [],
  borders: [],
  lines: [],
};

describe("doc 06 §8.6.1: forecast is a noisy view of existing truth", () => {
  const state = newGame(31, TWO_CITY_SCENARIO);

  test("hours before the pending block are revealed truth (band 0)", () => {
    const advanced = resolveTurn(state); // pending block is now 03–06
    const past = cityDemandForecast(advanced, "city-a", 1);
    expect(past?.bandMw).toBe(0);
    expect(past?.mw).toBe(advanced.dayTruth.cityDemandMw["city-a"]?.[1]);
  });

  test("band widens with horizon within the day", () => {
    const near = cityDemandForecast(state, "city-a", 2);
    const far = cityDemandForecast(state, "city-a", 20);
    expect((far?.bandMw ?? 0) > (near?.bandMw ?? 0)).toBe(true);
  });

  test("band narrows as turns advance toward the same target hour", () => {
    // Hour 8: horizon 9 from turn 0, horizon 3 from turn 2 (below the 12 h cap).
    const early = cityDemandForecast(state, "city-a", 8);
    const later = cityDemandForecast(resolveTurn(resolveTurn(state)), "city-a", 8);
    expect((later?.bandMw ?? 0) < (early?.bandMw ?? 0)).toBe(true);
  });

  test("demand error is systemic: one factor shared by all cities (doc 02 §7)", () => {
    const hour = 19;
    for (const cityId of ["city-a", "city-b"]) {
      const point = cityDemandForecast(state, cityId, hour);
      const truth = state.dayTruth.cityDemandMw[cityId]?.[hour] ?? 0;
      const peak = Math.max(...(state.dayTruth.cityDemandMw[cityId] ?? [1]));
      const relative = ((point?.mw ?? 0) - truth) / peak;
      expect(relative).toBeCloseTo(state.dayTruth.forecastZ.demand * sigmaDemand(hour + 1), 10);
    }
  });

  test("farm forecast scales with installed capacity and clamps to [0, cap]", () => {
    for (const farmId of ["farm-wind", "farm-pv"]) {
      for (let hour = 0; hour < 24; hour++) {
        const point = farmProductionForecast(state, farmId, hour);
        expect(point).toBeDefined();
        expect(point?.mw).toBeGreaterThanOrEqual(0);
        expect(point?.mw).toBeLessThanOrEqual(200);
      }
    }
    const windBand = farmProductionForecast(state, "farm-wind", 10);
    expect(windBand?.bandMw).toBeCloseTo(sigmaWind(11) * 200, 10);
  });

  test("forecast is deterministic for a given seed", () => {
    const a = cityDemandForecast(newGame(31, TWO_CITY_SCENARIO), "city-a", 12);
    const b = cityDemandForecast(newGame(31, TWO_CITY_SCENARIO), "city-a", 12);
    expect(a).toStrictEqual(b);
  });
});
