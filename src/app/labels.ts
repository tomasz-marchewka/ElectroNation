// Player-facing Polish labels for engine enums. UI strings live in the app
// layer; the engine only ever speaks in identifiers. Pure data and pure
// functions — nothing here imports React, so selectors may lean on it.

import { STATE_SCHEMA_VERSION } from "../engine";
import type {
  FarmTech,
  ForecastLevel,
  LineType,
  LoadError,
  PlantTech,
  RegimeId,
  StorageMode,
  StorageTech,
  TerrainId,
  TurnPhase,
  WindClass,
} from "../engine";

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

/**
 * Line types of 01 §4.2 under the names the design system prints on the map
 * (brand-lines: NN 150 MW, SN 500 MW, WN 1500 MW).
 */
export const LINE_TYPE_LABELS: Record<LineType, string> = {
  lv: "NN",
  mv: "SN",
  hv: "WN",
};

/**
 * Technology suffixes of an object's map label (handoff README, Content & Copy
 * Rules: "Technology is a suffix: EC DOLINA CCGT"). Object names are player
 * data and need not say what the object burns, so the label does — that is
 * also why OCGT and CCGT can share one icon.
 */
export const PLANT_TECH_LABELS: Record<PlantTech, string> = {
  nuclear: "JĄDROWA",
  coal: "WĘGIEL",
  ccgt: "CCGT",
  ocgt: "OCGT",
};

export const FARM_TECH_LABELS: Record<FarmTech, string> = {
  wind: "WIATR",
  pv: "PV",
};

export const STORAGE_TECH_LABELS: Record<StorageTech, string> = {
  battery: "BESS",
  pumped: "ESP",
};

/**
 * Technology as a setpoint row prints it: lowercase, acronyms kept
 * (SetpointSlider.d.ts — "technologia małymi literami", yet the handoff's own
 * example writes `CCGT`). The map keeps the uppercase set above.
 */
export const PLANT_TECH_INLINE_LABELS: Record<PlantTech, string> = {
  nuclear: "jądrowa",
  coal: "węgiel",
  ccgt: "CCGT",
  ocgt: "OCGT",
};

/** Storage modes of the ŁADUJ / STOP / ODDAWAJ control (01 §5.3). */
export const STORAGE_MODE_LABELS: Record<StorageMode, string> = {
  charge: "ŁADUJ",
  idle: "STOP",
  discharge: "ODDAWAJ",
};

/**
 * Terrain types of 01 §3.2 as the hex panel names them. The map legend keeps
 * its own shorter set (map/biomes.ts) — a legend chip has 14 characters, a
 * panel row has the whole column.
 */
export const TERRAIN_NAMES: Record<TerrainId, string> = {
  plains: "nizina",
  forest: "las",
  highlands: "wyżyna",
  swamp: "bagno",
  urban: "teren zurbanizowany",
  mountains: "góry",
  lake: "jezioro",
  sea: "morze",
};

/** Wind location classes of 06 §6.1 — the class the hex's Weibull λ comes from. */
export const WIND_CLASS_LABELS: Record<WindClass, string> = {
  sheltered: "osłonięty",
  open: "otwarty",
  coastal: "nadmorski",
  baltic: "morski",
};

/**
 * Build catalogue wording of the reference build (DispatcherScreen.jsx
 * `CATALOG`). Only the names are the design's: every number next to them is
 * computed from the engine's own CONFIG (plan/README.md).
 */
export const PLANT_CATALOG_NAMES: Record<PlantTech, string> = {
  nuclear: "Blok jądrowy",
  coal: "Blok węglowy",
  ccgt: "CCGT — blok gazowy",
  ocgt: "OCGT — turbina szczytowa",
};

export const FARM_CATALOG_NAMES: Record<FarmTech, string> = {
  wind: "Farma wiatrowa",
  pv: "Farma PV",
};

export const STORAGE_CATALOG_NAMES: Record<StorageTech, string> = {
  battery: "Bateria BESS",
  pumped: "Szczytowo-pompowa",
};

/** Node objects of 01 §5.4 and §5.7, and the city — named the same way. */
export const JUNCTION_CATALOG_NAME = "Stacja rozdzielcza";
export const BORDER_CATALOG_NAME = "Przyłącze graniczne";
export const CITY_CATALOG_NAME = "Miasto";

/**
 * Polish plural of "doba" — 1 DOBA, 2–4 DOBY, otherwise DÓB (teens take DÓB).
 * Build countdowns are player-facing text, so they decline properly.
 */
export function daysLabel(days: number): string {
  const whole = Math.max(0, Math.round(days));
  const lastDigit = whole % 10;
  const lastTwo = whole % 100;
  if (whole === 1) return `${whole} DOBA`;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${whole} DOBY`;
  return `${whole} DÓB`;
}

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

/**
 * Why a save would not load, in the player's own wording. Each line names the
 * number or field it failed on — a diagnosis, not an alarm (handoff README,
 * Content & Copy Rules).
 */
export function loadErrorText(error: LoadError): string {
  switch (error.code) {
    case "notASave":
      return "PLIK NIE JEST ZAPISEM ELECTRONATION";
    case "futureSchema":
      return `ZAPIS Z NOWSZEJ WERSJI GRY — SCHEMAT ${error.schema} > ${STATE_SCHEMA_VERSION}`;
    case "missingMigration":
      return `BRAK ŚCIEŻKI MIGRACJI ZE SCHEMATU ${error.schema} DO ${STATE_SCHEMA_VERSION}`;
    case "brokenState":
      return error.field
        ? `ZAPIS USZKODZONY — POLE „${error.field}”`
        : "ZAPIS USZKODZONY — NIEZNANY UKŁAD DANYCH";
  }
}
