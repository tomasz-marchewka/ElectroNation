import type {
  FarmTech,
  LineType,
  PlantTech,
  StorageTech,
  TerrainId,
  WindClass,
} from "./config";
import type { DayType } from "./demand";
import type { HexCoord } from "./network";
import type { PrngState } from "./prng";
import type { MonthRegimes, RegimeId } from "./regimes";

// The whole game state is plain JSON data — no classes, Maps, Dates or
// functions. Serializability is load-bearing: saves, replay, golden tests and
// (later) a server all rely on JSON.parse(JSON.stringify(s)) being lossless.

export const STATE_SCHEMA_VERSION = 4;

export const TURNS_PER_DAY = 8;
export const HOURS_PER_TURN = 3;
export const DAYS_PER_MONTH = 3; // working A, working B, free (doc 01 §2.1)
export const DAYS_PER_YEAR = 36;

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

export interface CityState {
  id: string;
  name: string;
  hex: HexCoord;
  /** 01 §3.4: unconnected cities exist on the map but are not customers yet. */
  connected: boolean;
  /** 05 §2: the two state variables — everything else about size is derived. */
  households: number;
  firms: number;
  /** Growth capacity anchors: segment cap = 16 × start (05 §6.2). */
  householdsStart: number;
  firmsStart: number;
  /**
   * Game day the city was connected on; growth evaluation starts with the
   * first FULL month after connection (05 §6.5). 0 for start-connected.
   */
  connectedSinceDay: number;
  /** Day-weighted monthly accumulators feeding U (05 §6.1). */
  monthDemandMwh: number;
  monthDeliveredMwh: number;
}

export interface PlantState {
  id: string;
  name: string;
  hex: HexCoord;
  tech: PlantTech;
  capacityMw: number;
  /** Player dispatch [MW], full 0–100% range each turn (01 §5.1). */
  setpointMw: number;
}

export interface FarmState {
  id: string;
  name: string;
  hex: HexCoord;
  tech: FarmTech;
  capacityMw: number;
  /** 01 §4.1: whole-farm on/off is the only manual RES control. */
  enabled: boolean;
  /** Wind location class of the farm's hex; unused for PV. */
  windClass: WindClass;
}

export type StorageMode = "idle" | "charge" | "discharge";

export interface StorageState {
  id: string;
  name: string;
  hex: HexCoord;
  tech: StorageTech;
  powerMw: number;
  capacityMwh: number;
  socMwh: number;
  setpoint: { mode: StorageMode; mw: number };
}

export interface JunctionState {
  id: string;
  name: string;
  hex: HexCoord;
  throughputMw: number;
}

export interface BorderState {
  id: string;
  name: string;
  hex: HexCoord;
  throughputMw: number;
  importSetpointMw: number;
  exportSetpointMw: number;
}

export interface LineState {
  id: string;
  type: LineType;
  /** Hex chain between endpoint objects, inclusive (02 §2). */
  path: HexCoord[];
  /** Construction progress (01 §2.6): +3 h per resolved turn; done at total. */
  builtHours: number;
  totalHours: number;
}

export function isLineBuilt(line: LineState): boolean {
  return line.builtHours >= line.totalHours;
}

/** An object under construction — appears in the world when the countdown ends. */
export type PendingObject =
  | { kind: "plant"; plant: PlantState }
  | { kind: "farm"; farm: FarmState }
  | { kind: "storage"; storage: StorageState }
  | { kind: "junction"; junction: JunctionState }
  | { kind: "border"; border: BorderState };

export interface ConstructionState {
  id: string;
  remainingDays: number;
  pending: PendingObject;
}

/** Hourly weather truth for one day, generated fully at day init (06 §8.6.1). */
export interface WeatherTruth {
  cloudCover: number[];
  ghiW: number[];
  tempC: number[];
  windMs: Record<WindClass, number[]>;
}

export interface DayTruth {
  /** Astronomical day of year (1..365) this game day represents. */
  dayOfYear: number;
  dayType: DayType;
  /** 0..11 — month this representative day belongs to. */
  month: number;
  /** Weather regime this day runs under (06 §8.4). */
  regime: RegimeId;
  weather: WeatherTruth;
  /** True hourly demand [MW] per connected city (05 §4). */
  cityDemandMw: Record<string, number[]>;
  /**
   * The day's forecast-error factors (06 §8.6.2 pt 3): one process per
   * quantity, scaled by σ(horizon). Demand is systemic across cities (02 §7).
   */
  forecastZ: { wind: number; pv: number; demand: number };
}

export interface GameState {
  schema: typeof STATE_SCHEMA_VERSION;
  seed: number;
  calendar: Calendar;
  /** Integer PLN, never fractional — 10^10 start sits far below 2^53. */
  moneyPln: number;
  rng: {
    weather: PrngState;
    forecast: PrngState;
    cityGrowth: PrngState;
  };
  /** Regimes of the current month (dominant + free-day) — 06 §8.4. */
  monthRegimes: MonthRegimes;
  cities: CityState[];
  plants: PlantState[];
  farms: FarmState[];
  storages: StorageState[];
  junctions: JunctionState[];
  borders: BorderState[];
  lines: LineState[];
  constructions: ConstructionState[];
  /** Monotonic counter for engine-assigned object ids (replay-stable). */
  nextObjectId: number;
  /** Map data (doc 07 territory): terrain per hex key; missing = plains. */
  terrain: Record<string, TerrainId>;
  /** Wind location class per hex key; missing = open. */
  windClasses: Record<string, WindClass>;
  dayTruth: DayTruth;
}
