import {
  clearSkyGhiW,
  cloudAttenuation,
  solarAltitudeDeg,
} from "./astronomy";
import { nextFloat01, seedStream, type PrngState } from "./prng";
import {
  STATE_SCHEMA_VERSION,
  TURNS_PER_DAY,
  type DayTruth,
  type GameState,
} from "./state";

/** Scenario constants per docs (01 §11, 06 §2). */
export const CONFIG = {
  latitudeDeg: 52.0,
  startingMoneyPln: 10_000_000_000,
} as const;

// Reference days of doc 06 §3.7 — the 21st of each month.
const MONTH_DAY_OF_YEAR = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355] as const;

/**
 * Maps a game day to the astronomical day of year it represents.
 * Placeholder calendar: all 3 representative days of a month (doc 01) share
 * the month's reference day until the A/B/holiday calendar lands.
 */
export function dayOfYearForGameDay(dayIndex: number): number {
  const month = Math.floor((dayIndex % 36) / 3);
  return MONTH_DAY_OF_YEAR[month] ?? 21;
}

/**
 * Round to 0.1 — applied to generated truth at the generation boundary, so
 * cross-engine float noise in transcendental functions (Math.sin/exp differ in
 * the last ULP between JS engines) can never leak into serialized state.
 */
export function quantize01(value: number): number {
  return Math.round(value * 10) / 10;
}

function quantize001(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function generateDayTruth(
  weatherRng: PrngState,
  dayIndex: number,
): { truth: DayTruth; rng: PrngState } {
  const dayOfYear = dayOfYearForGameDay(dayIndex);
  let rng = weatherRng;
  const cloudCover: number[] = [];
  const ghiW: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    // Placeholder weather: independent uniform cloud cover per hour. Replaced
    // by doc 06 §8 (regimes + OU noise) — the shape (truth at day init, one
    // draw sequence on the weather stream) is the part that stays.
    const sample = nextFloat01(rng);
    rng = sample.state;
    const cloud = quantize001(sample.value);
    // Mid-hour altitude as the hour's representative sun position.
    const altitude = solarAltitudeDeg(CONFIG.latitudeDeg, dayOfYear, hour + 0.5);
    cloudCover.push(cloud);
    ghiW.push(quantize01(clearSkyGhiW(altitude) * cloudAttenuation(cloud)));
  }
  return { truth: { dayOfYear, cloudCover, ghiW }, rng };
}

export function newGame(seed: number): GameState {
  const { truth, rng } = generateDayTruth(seedStream(seed, "weather"), 0);
  return {
    schema: STATE_SCHEMA_VERSION,
    seed,
    calendar: { dayIndex: 0, turnIndex: 0 },
    moneyPln: CONFIG.startingMoneyPln,
    rng: { weather: rng },
    dayTruth: truth,
  };
}

/** Placeholder action set — replaced by real build/dispatch actions as mechanics land. */
export type Action = { type: "noop" };

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "noop":
      return state;
  }
}

/**
 * Resolves the current turn and advances the calendar; after the last turn of
 * the day, rolls the next day and generates its weather truth.
 */
export function resolveTurn(state: GameState): GameState {
  const nextTurn = state.calendar.turnIndex + 1;
  if (nextTurn < TURNS_PER_DAY) {
    return { ...state, calendar: { ...state.calendar, turnIndex: nextTurn } };
  }
  const nextDay = state.calendar.dayIndex + 1;
  const { truth, rng } = generateDayTruth(state.rng.weather, nextDay);
  return {
    ...state,
    calendar: { dayIndex: nextDay, turnIndex: 0 },
    rng: { ...state.rng, weather: rng },
    dayTruth: truth,
  };
}
