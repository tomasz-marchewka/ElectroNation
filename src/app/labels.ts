// Player-facing Polish labels for engine enums. UI strings live in the app
// layer; the engine only ever speaks in identifiers.

import type { ForecastLevel, RegimeId } from "../engine";

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
