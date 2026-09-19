// Weather derivations of the bridge (docs/08 §6): the eight regimes of 06 §8.2
// must come out as eight recognisable faces, and the storm must stop rotors.

import { describe, expect, test } from "vitest";
import { REGIME_IDS, generateDayTruth, newGame, MAP_V1, type RegimeId } from "../../../src/engine";
import { buildWeather, precipitationOf, snowCoverOf } from "../../../src/world/bridge";

const state = newGame(3, MAP_V1);
const truth = generateDayTruth(state.seed, 0, state.cities);

function weatherUnder(regime: RegimeId, startHour = 12) {
  return buildWeather(
    truth,
    { seed: state.seed, dayIndex: 0, dayOfYear: 21, month: 0, startHour, night: false },
    regime,
  );
}

describe("precipitation", () => {
  test("a clear high drops nothing; a storm rains; frost turns it to snow", () => {
    expect(precipitationOf("summerHigh", 0.1, 25).kind).toBe("none");
    expect(precipitationOf("storm", 0.95, 4)).toMatchObject({ kind: "rain" });
    expect(precipitationOf("storm", 0.95, 4).intensity).toBeGreaterThan(0.5);
    expect(precipitationOf("atlanticLow", 0.9, -3).kind).toBe("snow");
    expect(precipitationOf("fogHigh", 1, -2).kind).toBe("none");
  });
});

describe("snow cover", () => {
  test("follows the daily mean temperature and is forced by the cold regimes", () => {
    expect(snowCoverOf("transitional", 10)).toBe(0);
    expect(snowCoverOf("transitional", -5)).toBe(1);
    expect(snowCoverOf("frostHigh", 5)).toBeGreaterThanOrEqual(0.8);
  });
});

describe("06 §8.2: every regime has a face", () => {
  test.each(REGIME_IDS)("%s builds a weather slice with a heading and a fog level", (regime) => {
    const weather = weatherUnder(regime);
    expect(weather.regime).toBe(regime);
    expect(weather.windFromDeg).toBeGreaterThanOrEqual(0);
    expect(weather.windFromDeg).toBeLessThan(360);
    expect(weather.fog).toBeGreaterThanOrEqual(0);
    expect(weather.fog).toBeLessThanOrEqual(1);
  });

  test("the fog high is the foggiest, the storm the gustiest", () => {
    expect(weatherUnder("fogHigh").fog).toBeGreaterThan(weatherUnder("summerHigh").fog);
    expect(weatherUnder("storm").gustiness).toBe(1);
  });

  test("an override regenerates the SAME day deterministically", () => {
    const a = weatherUnder("storm");
    const b = weatherUnder("storm");
    expect(a).toEqual(b);
    expect(a.windMs.open).not.toBe(weatherUnder("frostHigh").windMs.open);
  });
});
