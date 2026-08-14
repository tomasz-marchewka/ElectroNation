import { describe, expect, test } from "vitest";
import {
  MONTHLY_REGIME_WEIGHTS,
  REGIMES,
  REGIME_IDS,
  TURNS_PER_DAY,
  generateWeatherDay,
  newGame,
  pickMonthRegimes,
  resolveTurn,
  seedStream,
  type RegimeId,
} from "../../src/engine";

// Spec tests for docs/06 §8.2–§8.4.

describe("doc 06 §8.3: monthly regime distributions", () => {
  test("every month's weights sum to 100", () => {
    for (const weights of MONTHLY_REGIME_WEIGHTS) {
      const sum = REGIME_IDS.reduce((acc, id) => acc + weights[id], 0);
      expect(sum).toBe(100);
    }
  });

  test("winter regimes are impossible in summer and vice versa", () => {
    for (const month of [5, 6, 7]) {
      const weights = MONTHLY_REGIME_WEIGHTS[month];
      expect(weights?.frostHigh).toBe(0);
      expect(weights?.fogHigh).toBe(0);
      expect(weights?.coldWave).toBe(0);
    }
    for (const month of [11, 0, 1]) {
      const weights = MONTHLY_REGIME_WEIGHTS[month];
      expect(weights?.summerHigh).toBe(0);
      expect(weights?.summerLow).toBe(0);
    }
  });
});

describe("doc 06 §8.4: dominant regime and the free-day switch", () => {
  test("no switch above the 15% threshold", () => {
    const regimes = pickMonthRegimes(0, [0.5, 0.16, 0.99]);
    expect(regimes.lastDay).toBe(regimes.dominant);
  });

  test("below the threshold the free day may differ", () => {
    const regimes = pickMonthRegimes(0, [0.01, 0.14, 0.99]);
    // uniform 0.01 → first non-zero January regime; 0.99 → the last one.
    expect(regimes.dominant).not.toBe(regimes.lastDay);
  });

  test("engine: both working days run under the dominant regime", () => {
    let state = newGame(11);
    expect(state.dayTruth.regime).toBe(state.monthRegimes.dominant);
    for (let i = 0; i < TURNS_PER_DAY; i++) state = resolveTurn(state);
    expect(state.dayTruth.regime).toBe(state.monthRegimes.dominant);
    for (let i = 0; i < TURNS_PER_DAY; i++) state = resolveTurn(state);
    expect(state.dayTruth.regime).toBe(state.monthRegimes.lastDay);
  });
});

describe("doc 06 §8.2: regimes impose correlated weather", () => {
  const generate = (regime: RegimeId) =>
    generateWeatherDay(seedStream(5, "weather"), 21, 0, regime).weather;

  const meanWind = (regime: RegimeId) => {
    const day = generate(regime);
    return day.windMs.open.reduce((a, b) => a + b, 0) / 24;
  };

  test("wind ordering: storm > atlantic low > winter high", () => {
    expect(meanWind("storm")).toBeGreaterThan(meanWind("atlanticLow"));
    expect(meanWind("atlanticLow")).toBeGreaterThan(meanWind("frostHigh"));
  });

  test("cold wave pushes temperature into deep frost", () => {
    const day = generate("coldWave");
    const maxTemp = Math.max(...day.tempC);
    expect(maxTemp).toBeLessThan(-8); // January mean ~−1.5 °C, offset −12…−22
  });

  test("summer high is nearly cloudless, fog high is overcast", () => {
    expect(Math.max(...generate("summerHigh").cloudCover)).toBeLessThanOrEqual(0.35);
    expect(Math.min(...generate("fogHigh").cloudCover)).toBeGreaterThanOrEqual(0.75);
  });

  test("catalog matches the doc's wind multipliers", () => {
    expect(REGIMES.frostHigh.windMult).toBe(0.25);
    expect(REGIMES.storm.windMult).toBe(2.2);
    expect(REGIMES.atlanticLow.windMult).toBe(1.4);
  });
});
