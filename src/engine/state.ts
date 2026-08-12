import type { PrngState } from "./prng";

// The whole game state is plain JSON data — no classes, Maps, Dates or
// functions. Serializability is load-bearing: saves, replay, golden tests and
// (later) a server all rely on JSON.parse(JSON.stringify(s)) being lossless.

export const STATE_SCHEMA_VERSION = 1;

export const TURNS_PER_DAY = 8;
export const HOURS_PER_TURN = 3;
export const DAYS_PER_YEAR = 36; // 3 representative days × 12 months (doc 01)

/** doc 01 v0.12: 8 turns × 3 h, named after phases of the day. */
export const TURN_PHASES = [
  "night",
  "preDawn",
  "morningRamp",
  "lateMorning",
  "noon",
  "afternoon",
  "eveningPeak",
  "lateEvening",
] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];

export interface Calendar {
  /** 0-based game day; 36 game days per game year. */
  dayIndex: number;
  /** 0..7 within the day. */
  turnIndex: number;
}

/** Hourly weather truth for one day, generated fully at day init (doc 06 §8.6.1). */
export interface DayTruth {
  /** Astronomical day of year (1..365) this game day represents. */
  dayOfYear: number;
  /** 24 hourly cloud-cover values [0,1] — placeholder until doc 06 §8 regimes land. */
  cloudCover: number[];
  /** 24 hourly GHI values [W/m²], cloud-attenuated, quantized. */
  ghiW: number[];
}

export interface GameState {
  schema: typeof STATE_SCHEMA_VERSION;
  seed: number;
  calendar: Calendar;
  /** Integer PLN, never fractional — 10^10 start sits far below 2^53. */
  moneyPln: number;
  rng: {
    weather: PrngState;
  };
  dayTruth: DayTruth;
}
