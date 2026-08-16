// Calendar helpers and the day-truth generator (06 §8.6.1): the full hourly
// weather and demand of one game day, plus that day's forecast-error factors.
//
// Every draw comes from a stream keyed by the DAY (or month) it belongs to —
// `weather-day-7`, `forecast-day-7`, `regime-month-2` — never from a stream
// carried forward in the game state. That is what makes the truth of day N
// reproducible at any moment, in any order: the forecast horizon of doc 06
// §8.6.3 (up to 7 days) needs the truth of days the player has not reached yet,
// and a sequential stream could only produce it by playing them first.

import { FORECAST_LEVELS, type ForecastLevel } from "./config";
import { cityDemandDayMw, type DayType } from "./demand";
import { nextFloat01, seedStream, type PrngState } from "./prng";
import { quantize001 } from "./quantize";
import { pickMonthRegimes, pickRegimeForecast, type MonthRegimes, type RegimeId } from "./regimes";
import { DAYS_PER_MONTH, DAYS_PER_YEAR, type CityState, type DayTruth } from "./state";
import { generateWeatherDay } from "./weather";

// Reference days of doc 06 §3.7 — the 21st of each month.
const MONTH_DAY_OF_YEAR = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355] as const;

/** Month of the year (0..11) the game day falls in. */
export function monthForGameDay(dayIndex: number): number {
  return Math.floor((dayIndex % DAYS_PER_YEAR) / DAYS_PER_MONTH);
}

/** Month counted from the start of the game — the key of the regime stream. */
export function monthIndexForGameDay(dayIndex: number): number {
  return Math.floor(dayIndex / DAYS_PER_MONTH);
}

/** 01 §2.1: working A, working B, free — in this order within each month. */
export function dayTypeForGameDay(dayIndex: number): DayType {
  return dayIndex % DAYS_PER_MONTH === DAYS_PER_MONTH - 1 ? "free" : "working";
}

export function dayOfYearForGameDay(dayIndex: number): number {
  return MONTH_DAY_OF_YEAR[monthForGameDay(dayIndex)] ?? 21;
}

function drawUniforms(rng: PrngState, count: number): number[] {
  let state = rng;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = nextFloat01(state);
    state = r.state;
    values.push(r.value);
  }
  return values;
}

/**
 * Month init (06 §8.4): dominant regime for all three days plus a possible
 * free-day switch. Pure in (seed, day) — the same month always rolls the same
 * regimes, whichever day of it is asked about.
 */
export function monthRegimesForDay(seed: number, dayIndex: number): MonthRegimes {
  const u = drawUniforms(seedStream(seed, `regime-month-${monthIndexForGameDay(dayIndex)}`), 3);
  return pickMonthRegimes(monthForGameDay(dayIndex), [u[0] ?? 0, u[1] ?? 0, u[2] ?? 0]);
}

/**
 * 06 §8.4 pt 5: the regime forecast shown for the month `dayIndex` belongs to.
 * Rolled once, when the month opens, against the forecast level owned then.
 */
export function monthRegimeForecastForDay(
  seed: number,
  dayIndex: number,
  dominant: RegimeId,
  level: ForecastLevel,
): RegimeId {
  const u = drawUniforms(
    seedStream(seed, `regime-forecast-month-${monthIndexForGameDay(dayIndex)}`),
    2,
  );
  return pickRegimeForecast(
    monthForGameDay(dayIndex),
    dominant,
    FORECAST_LEVELS[level].regimeAccuracy,
    [u[0] ?? 0, u[1] ?? 0],
  );
}

/**
 * Generates the complete truth of one game day: hourly weather under the
 * month's regime, hourly demand of every city, and the day's forecast-error
 * factors (06 §8.6.2 pt 3 — one process per quantity, correlated across the
 * whole day).
 *
 * `cities` is the city roster the demand truth is computed from. For the day
 * being played that is the live roster; for a look-ahead day it is deliberately
 * the CURRENT one, because future monthly growth has not been rolled yet
 * (05 §6). The resulting error is a fraction of a percent over a ≤7-day horizon
 * and is not measurable by the player — see 06 §8.6.3.
 */
export function generateDayTruth(seed: number, dayIndex: number, cities: CityState[]): DayTruth {
  const month = monthForGameDay(dayIndex);
  const dayType = dayTypeForGameDay(dayIndex);
  const dayOfYear = dayOfYearForGameDay(dayIndex);
  const regimes = monthRegimesForDay(seed, dayIndex);
  const regime =
    dayIndex % DAYS_PER_MONTH === DAYS_PER_MONTH - 1 ? regimes.lastDay : regimes.dominant;

  const generated = generateWeatherDay(
    seedStream(seed, `weather-day-${dayIndex}`),
    dayOfYear,
    month,
    regime,
  );

  // Box–Muller on the day's forecast stream; quantized before entering state.
  let fRng = seedStream(seed, `forecast-day-${dayIndex}`);
  const drawZ = (): number => {
    const u1 = nextFloat01(fRng);
    const u2 = nextFloat01(u1.state);
    fRng = u2.state;
    const z =
      Math.sqrt(-2 * Math.log(Math.max(u1.value, 1e-12))) * Math.cos(2 * Math.PI * u2.value);
    return quantize001(Math.max(-3, Math.min(3, z)));
  };
  const forecastZ = { wind: drawZ(), pv: drawZ(), demand: drawZ() };

  // Truth is generated for every city (unconnected included), so a city
  // connected mid-day starts consuming from the very next turn.
  const cityDemandMw: Record<string, number[]> = {};
  for (const city of cities) {
    cityDemandMw[city.id] = cityDemandDayMw(
      city.households,
      city.firms,
      dayType,
      month,
      generated.weather.tempC,
    );
  }

  return {
    dayOfYear,
    dayType,
    month,
    regime,
    weather: generated.weather,
    cityDemandMw,
    forecastZ,
  };
}
