// Player-facing Polish labels for engine enums. UI strings live in the app
// layer; the engine only ever speaks in identifiers. Pure data and pure
// functions — nothing here imports React, so selectors may lean on it.

import type { ForecastLevel, RegimeId, TurnPhase } from "../engine";

/** Months of the calendar year, index 0..11 as the engine counts them. */
export const MONTH_NAMES = [
  "STYCZEŃ",
  "LUTY",
  "MARZEC",
  "KWIECIEŃ",
  "MAJ",
  "CZERWIEC",
  "LIPIEC",
  "SIERPIEŃ",
  "WRZESIEŃ",
  "PAŹDZIERNIK",
  "LISTOPAD",
  "GRUDZIEŃ",
] as const;

/** Weather regime catalogue of doc 06 §8.2, in the document's own wording. */
export const REGIME_LABELS: Record<RegimeId, string> = {
  frostHigh: "WYŻ ZIMOWY — MROŹNY",
  fogHigh: "WYŻ ZIMOWY — MGŁA",
  atlanticLow: "NIŻ ATLANTYCKI",
  storm: "SZTORM",
  summerHigh: "WYŻ LETNI — UPAŁ",
  summerLow: "NIŻ LETNI",
  transitional: "POGODA PRZEJŚCIOWA",
  coldWave: "FALA MROZÓW",
};

/** Forecast systems of doc 01 §2.4 — base, advanced, ensemble. */
export const FORECAST_LEVEL_LABELS: Record<ForecastLevel, string> = {
  basic: "PODSTAWOWY",
  advanced: "ZAAWANSOWANY",
  ensemble: "ANSAMBLOWY",
};

export interface DayTurn {
  /** Engine phase this cell stands for — the two lists are 1:1 by index. */
  phase: TurnPhase;
  /** Phase name in caps, abbreviated as the design system abbreviates it. */
  name: string;
  /** Hour block, e.g. "18–21". */
  hours: string;
}

/**
 * Day axis canon of doc 01 §2.2, in the design system's own abbreviations.
 * Order and length match `TURN_PHASES` exactly; `tests/components/shell.test.tsx`
 * holds that mapping.
 */
export const DAY_TURNS = [
  { phase: "night", name: "NOC", hours: "00–03" },
  { phase: "preDawn", name: "PRZEDŚWIT", hours: "03–06" },
  { phase: "morningRamp", name: "RANO", hours: "06–09" },
  { phase: "lateMorning", name: "PRZEDPOŁ.", hours: "09–12" },
  { phase: "noon", name: "POŁUDNIE", hours: "12–15" },
  { phase: "afternoon", name: "POPOŁ.", hours: "15–18" },
  { phase: "eveningPeak", name: "SZCZYT WIECZ.", hours: "18–21" },
  { phase: "lateEvening", name: "PÓŹNY WIECZ.", hours: "21–24" },
] as const satisfies readonly DayTurn[];

/** Full phase names of doc 01 §2.2 — the panel title, unlike the axis cell. */
export const DAY_TURN_FULL_NAMES: Record<TurnPhase, string> = {
  night: "NOC",
  preDawn: "PRZEDŚWIT",
  morningRamp: "RANO",
  lateMorning: "PRZEDPOŁUDNIE",
  noon: "POŁUDNIE",
  afternoon: "POPOŁUDNIE",
  eveningPeak: "SZCZYT WIECZORNY",
  lateEvening: "PÓŹNY WIECZÓR",
};

/** Turn cell for the turn `index` of a day; out of range falls back to NOC. */
export function dayTurnAt(index: number): DayTurn {
  return DAY_TURNS[index] ?? DAY_TURNS[0];
}
