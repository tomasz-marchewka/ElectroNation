import { describe, expect, test } from "vitest";
import {
  CONFIG,
  FORECAST_LEVELS,
  MONTHLY_REGIME_WEIGHTS,
  TURNS_PER_DAY,
  applyAction,
  cityDemandForecast,
  dayForecast,
  dayTruthAtOffset,
  farmProductionForecast,
  forecastHorizonDays,
  monthForGameDay,
  monthRegimeForecastForDay,
  monthRegimesForDay,
  newGame,
  resolveTurn,
  sigmaDemand,
  sigmaPv,
  sigmaWind,
  type ForecastLevel,
  type GameState,
} from "../../src/engine";

// Spec tests for the buyable forecast systems (docs/01 §2.4, 06 §8.6.3) and
// for the monthly regime forecast (06 §8.4 pt 5).

function run(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i++) current = resolveTurn(current);
  return current;
}

function withLevel(seed: number, level: ForecastLevel): GameState {
  const base = newGame(seed);
  return level === "basic" ? base : applyAction(base, { type: "buyForecastSystem", level });
}

describe("doc 06 §8.6.3: a forecast system narrows every band", () => {
  test.each([
    { level: "basic" as const, multiplier: 1.0 },
    { level: "advanced" as const, multiplier: 0.7 },
    { level: "ensemble" as const, multiplier: 0.5 },
  ])("$level scales σ by ×$multiplier", ({ level, multiplier }) => {
    for (const h of [1, 3, 6, 12]) {
      expect(sigmaWind(h, level)).toBeCloseTo(sigmaWind(h) * multiplier, 12);
      expect(sigmaPv(h, level)).toBeCloseTo(sigmaPv(h) * multiplier, 12);
      expect(sigmaDemand(h, level)).toBeCloseTo(sigmaDemand(h) * multiplier, 12);
    }
  });

  test("the shown band really shrinks with the system owned", () => {
    const hour = 20;
    const bands = (["basic", "advanced", "ensemble"] as const).map(
      (level) => cityDemandForecast(withLevel(4, level), "city-jasienica", hour)?.bandMw ?? 0,
    );
    expect(bands[0]).toBeGreaterThan(bands[1] ?? 0);
    expect(bands[1]).toBeGreaterThan(bands[2] ?? 0);
    expect(bands[1]).toBeCloseTo((bands[0] ?? 0) * 0.7, 10);
  });

  test("σ keeps growing between days (+25% per day, 06 §8.6.3)", () => {
    const growth = 1 + CONFIG.forecastSigmaGrowthPerDay;
    expect(growth).toBeCloseTo(1.25, 12);
    // Past the first day every horizon is over the 12 h intraday cap, so the
    // day offset alone drives the width.
    expect(sigmaWind(30, "basic", 1)).toBeCloseTo(sigmaWind(12) * growth, 12);
    expect(sigmaPv(54, "basic", 2)).toBeCloseTo(sigmaPv(12) * growth ** 2, 12);
    expect(sigmaDemand(30, "advanced", 1)).toBeCloseTo(
      sigmaDemand(12) * 0.7 * growth,
      12,
    );
  });

  test("a later forecast day is banded wider than an earlier one", () => {
    const state = withLevel(4, "ensemble");
    const near = dayForecast(state, 1);
    const far = dayForecast(state, 5);
    expect((far?.demand[12]?.bandMw ?? 0) > (near?.demand[12]?.bandMw ?? 0)).toBe(true);
  });
});

describe("doc 01 §2.4: the horizon is 1 / 3 / 7 game days", () => {
  test.each([
    { level: "basic" as const, days: 1 },
    { level: "advanced" as const, days: 3 },
    { level: "ensemble" as const, days: 7 },
  ])("$level sees $days day(s) ahead and nothing past that", ({ level, days }) => {
    const state = withLevel(4, level);
    expect(forecastHorizonDays(state)).toBe(days);
    expect(dayTruthAtOffset(state, days - 1)).toBeDefined();
    expect(dayTruthAtOffset(state, days)).toBeUndefined();
    expect(cityDemandForecast(state, "city-jasienica", 10, days - 1)).toBeDefined();
    expect(cityDemandForecast(state, "city-jasienica", 10, days)).toBeUndefined();
    expect(dayForecast(state, days)).toBeUndefined();
  });

  test("the current day is still the default argument", () => {
    const state = withLevel(4, "ensemble");
    expect(cityDemandForecast(state, "city-jasienica", 10)).toStrictEqual(
      cityDemandForecast(state, "city-jasienica", 10, 0),
    );
    expect(dayTruthAtOffset(state, 0)).toBe(state.dayTruth);
  });

  test("negative or fractional day offsets are undefined", () => {
    const state = withLevel(4, "ensemble");
    expect(dayTruthAtOffset(state, -1)).toBeUndefined();
    expect(dayTruthAtOffset(state, 1.5)).toBeUndefined();
  });
});

describe("doc 06 §8.6.1: look-ahead truth is the truth the day resolves to", () => {
  test("tomorrow seen today equals tomorrow when it arrives", () => {
    const state = withLevel(4, "advanced");
    const seenToday = dayTruthAtOffset(state, 1);
    const tomorrow = run(state, TURNS_PER_DAY).dayTruth;
    // Day 0 is a working day, so no monthly growth stands between the two —
    // demand truth matches as exactly as the weather does.
    expect(tomorrow).toStrictEqual(seenToday);
  });

  test("weather truth holds across a month boundary too", () => {
    const state = withLevel(4, "ensemble");
    // Day 3 opens a new month: its regime comes from that month's own stream.
    const seenToday = dayTruthAtOffset(state, 3);
    const arrived = run(state, 3 * TURNS_PER_DAY).dayTruth;
    expect(arrived.regime).toBe(seenToday?.regime);
    expect(arrived.weather).toStrictEqual(seenToday?.weather);
    // Demand truth may differ: the free day at the end of day 2 re-rolls city
    // growth, which a look-ahead deliberately cannot know (06 §8.6.3).
  });

  test("the forecast points at that truth, with a band, and is seed-stable", () => {
    const state = withLevel(4, "ensemble");
    const truth = dayTruthAtOffset(state, 2);
    const point = farmProductionForecast(state, "farm-x", 12, 2);
    expect(point).toBeUndefined(); // no farms in the default scenario
    const demand = cityDemandForecast(state, "city-jasienica", 12, 2);
    const truthMw = truth?.cityDemandMw["city-jasienica"]?.[12] ?? 0;
    expect(demand?.bandMw).toBeGreaterThan(0);
    expect(Math.abs((demand?.mw ?? 0) - truthMw)).toBeLessThanOrEqual(
      3 * (demand?.bandMw ?? 0),
    );
    expect(dayTruthAtOffset(withLevel(4, "ensemble"), 2)).toStrictEqual(truth);
  });
});

describe("doc 01 §2.4: buying a forecast system", () => {
  test("prices are charged and the level sticks", () => {
    const base = newGame(4);
    expect(base.forecastLevel).toBe("basic");
    const advanced = applyAction(base, {
      type: "buyForecastSystem",
      level: "advanced",
    });
    expect(base.moneyPln - advanced.moneyPln).toBe(
      FORECAST_LEVELS.advanced.upgradeCostPln,
    );
    expect(advanced.forecastLevel).toBe("advanced");
    const ensemble = applyAction(advanced, {
      type: "buyForecastSystem",
      level: "ensemble",
    });
    expect(advanced.moneyPln - ensemble.moneyPln).toBe(
      FORECAST_LEVELS.ensemble.upgradeCostPln,
    );
  });

  test("levels only go up, and never without the money", () => {
    const ensemble = applyAction(newGame(4), {
      type: "buyForecastSystem",
      level: "ensemble",
    });
    expect(
      applyAction(ensemble, { type: "buyForecastSystem", level: "advanced" }),
    ).toBe(ensemble);
    expect(
      applyAction(ensemble, { type: "buyForecastSystem", level: "ensemble" }),
    ).toBe(ensemble);
    const poor = { ...newGame(4), moneyPln: 1_000 };
    expect(applyAction(poor, { type: "buyForecastSystem", level: "advanced" })).toBe(poor);
  });
});

describe("doc 06 §8.4 pt 5: the month's regime is known in advance, with error", () => {
  test("deterministic for a seed and always possible in that month", () => {
    for (const seed of [1, 2, 3, 99]) {
      const state = newGame(seed);
      expect(state.monthRegimeForecast).toBe(newGame(seed).monthRegimeForecast);
      const weights = MONTHLY_REGIME_WEIGHTS[monthForGameDay(0)];
      expect(weights?.[state.monthRegimeForecast]).toBeGreaterThan(0);
    }
  });

  test("it holds for the whole month and is re-rolled at the boundary", () => {
    let state = newGame(21);
    const shown = state.monthRegimeForecast;
    state = run(state, 2 * TURNS_PER_DAY); // still month 0 (days 0–2)
    expect(state.monthRegimeForecast).toBe(shown);
    state = run(state, TURNS_PER_DAY); // day 3 — new month
    expect(state.monthRegimeForecast).toBe(
      monthRegimeForecastForDay(
        state.seed,
        3,
        monthRegimesForDay(state.seed, 3).dominant,
        "basic",
      ),
    );
  });

  test.each([
    { level: "basic" as const, accuracy: 0.6 },
    { level: "advanced" as const, accuracy: 0.8 },
    { level: "ensemble" as const, accuracy: 0.95 },
  ])("$level hits the true regime about $accuracy of the time", ({ level, accuracy }) => {
    const samples = 3_000;
    let hits = 0;
    for (let seed = 0; seed < samples; seed++) {
      const dominant = monthRegimesForDay(seed, 0).dominant;
      if (monthRegimeForecastForDay(seed, 0, dominant, level) === dominant) hits += 1;
    }
    expect(hits / samples).toBeGreaterThan(accuracy - 0.04);
    expect(hits / samples).toBeLessThan(accuracy + 0.04);
  });

  test("a miss names a different regime, never the true one", () => {
    let misses = 0;
    for (let seed = 0; seed < 500; seed += 1) {
      const dominant = monthRegimesForDay(seed, 0).dominant;
      const shown = monthRegimeForecastForDay(seed, 0, dominant, "basic");
      if (shown !== dominant) {
        misses += 1;
        expect(MONTHLY_REGIME_WEIGHTS[0]?.[shown]).toBeGreaterThan(0);
      }
    }
    expect(misses).toBeGreaterThan(0);
  });
});
