import type {
  FarmTech,
  ForecastLevel,
  LineType,
  PlantTech,
  StorageTech,
  TerrainId,
  WindClass,
} from "./config";
import type { DayType } from "./demand";
import type { MapSize } from "./map";
import type { HexCoord } from "./network";
import type { PrngState } from "./prng";
import type { MonthRegimes, RegimeId } from "./regimes";

// The whole game state is plain JSON data — no classes, Maps, Dates or
// functions. Serializability is load-bearing: saves, replay, golden tests and
// (later) a server all rely on JSON.parse(JSON.stringify(s)) being lossless.

/**
 * Bumping this is a contract with `./migrations.ts`: every bump adds the
 * matching `MIGRATIONS[previous]` entry in the same commit, so a save written
 * by the build before it still loads. A bump without its migration turns every
 * existing save into a load error.
 */
export const STATE_SCHEMA_VERSION = 8;

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
  /** Blocks standing on the hex — hard limit 6 (01 §7, 02 §8.4). */
  blocks: number;
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
  /** Regional insolation multiplier of the hex (01 §3.2); unused for wind. */
  solarMultiplier: number;
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
  /**
   * How many lines may be plugged in (01 §5.4): 6 at base, +2 per capacity
   * module, 18 max. Per-object because only junctions expand — every other
   * object stays at LINE_SLOTS_PER_OBJECT.
   */
  lineSlots: number;
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

/**
 * Work in the construction queue. A `kind` naming an object type puts that
 * object into the world when the countdown ends; an expansion instead upgrades
 * an object that already stands there (01 §7 — expansion never leaves the hex).
 * Every expansion runs its own countdown, so several may target one object.
 */
export type PendingObject =
  | { kind: "plant"; plant: PlantState }
  | { kind: "farm"; farm: FarmState }
  | { kind: "storage"; storage: StorageState }
  | { kind: "junction"; junction: JunctionState }
  | { kind: "border"; border: BorderState }
  | { kind: "plantExpansion"; plantId: string; capacityMw: number }
  | { kind: "farmExpansion"; farmId: string; capacityMw: number }
  | { kind: "batteryExpansion"; storageId: string; powerMw: number; capacityMwh: number }
  | { kind: "pumpedExpansion"; storageId: string }
  | { kind: "junctionExpansion"; junctionId: string }
  | { kind: "borderExpansion"; borderId: string };

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

// --- Last-turn report -------------------------------------------------------
// The RAPORT panel of the continuous view (01 §2.3, §8) and the map's load
// coloring read this, so it lives inside GameState: a loaded save must show
// the last resolution exactly like the live session did. All MW values are
// block averages of the resolved turn; all PLN values are day-weight scaled.

export interface TurnCityReport {
  cityId: string;
  demandMw: number;
  deliveredMw: number;
  /** Energy not served, as average block power (01 §4.5). */
  ensMw: number;
}

export type SourceKind = "plant" | "farm" | "storage" | "import";

export interface TurnSourceReport {
  /** Object id; for imports the border point's id. */
  sourceId: string;
  kind: SourceKind;
  /** Power offered to the flow: setpoint, weather production or discharge cap. */
  offeredMw: number;
  /** Power actually drawn by the flow (losses included at the sending end). */
  usedMw: number;
}

export interface TurnStorageReport {
  storageId: string;
  mode: StorageMode;
  dischargedMw: number;
  chargedMw: number;
  socMwhAfter: number;
}

export interface TurnBorderReport {
  borderId: string;
  /** Import is take-or-pay (01 §4.1): paid from the setpoint, not from use. */
  importSetpointMw: number;
  importUsedMw: number;
  exportSetpointMw: number;
  exportDeliveredMw: number;
}

export interface TurnSegmentReport {
  segmentId: string;
  lineId: string;
  fromNodeId: string;
  toNodeId: string;
  /** Path indices within the line's hex chain — for map load coloring. */
  fromIndex: number;
  toIndex: number;
  /** Flow at the sending end of the segment. */
  usedMw: number;
  capacityMw: number;
}

/** Throughput usage of a capped node — junction or border point (01 §4.3). */
export interface TurnNodeReport {
  nodeId: string;
  usedMw: number;
  throughputMw: number;
}

/** Block-average forecast shown before the reveal vs the revealed truth. */
export interface ForecastComparison {
  forecastMw: number;
  /**
   * ±1σ half-width the forecast carried when the bet was made (06 §8.6.4).
   * Recorded here because it cannot be recovered afterwards: once the turn is
   * resolved its hours are revealed truth and their band is 0.
   */
  bandMw: number;
  actualMw: number;
}

export interface TurnFinanceReport {
  /** Components rounded per entry; may differ from netPln by a few PLN. */
  revenueEnergyPln: number;
  revenueExportPln: number;
  fuelCostPln: number;
  importCostPln: number;
  ensPenaltyPln: number;
  dumpPenaltyPln: number;
  /** Fixed O&M hits at day end only (01 §6); 0 mid-day. */
  fixedCostPln: number;
  /** Exact money delta this resolution applied to the budget. */
  netPln: number;
}

export interface TurnReport {
  /** Calendar position of the RESOLVED turn (the state is already advanced). */
  dayIndex: number;
  turnIndex: number;
  phase: TurnPhase;
  dayType: DayType;
  month: number;
  regime: RegimeId;
  dayWeight: number;
  totals: {
    demandMw: number;
    deliveredMw: number;
    ensMw: number;
    lossesMw: number;
    /** Dispatchable surplus curtailed at the source — penalized (01 §4.1). */
    dumpMw: number;
    /** RES surplus curtailed — free (01 §4.1). */
    resCurtailedMw: number;
  };
  /** The turn's bet against the forecast (01 §2.3), per quantity. */
  forecastMiss: {
    demand: ForecastComparison;
    wind: ForecastComparison;
    pv: ForecastComparison;
  };
  cities: TurnCityReport[];
  sources: TurnSourceReport[];
  storages: TurnStorageReport[];
  borders: TurnBorderReport[];
  segments: TurnSegmentReport[];
  nodes: TurnNodeReport[];
  finance: TurnFinanceReport;
}

export interface GameState {
  schema: typeof STATE_SCHEMA_VERSION;
  seed: number;
  calendar: Calendar;
  /** Integer PLN, never fractional — 10^10 start sits far below 2^53. */
  moneyPln: number;
  /**
   * Sequential PRNG streams. Weather and forecast truth do NOT live here: they
   * come from streams keyed by day index, so any day of the forecast horizon
   * can be generated on demand (06 §8.6.1/§8.6.3). City growth stays
   * sequential — it consumes the state it just produced.
   */
  rng: {
    cityGrowth: PrngState;
  };
  /** Regimes of the current month (dominant + free-day) — 06 §8.4. */
  monthRegimes: MonthRegimes;
  /**
   * What the player is TOLD the month's dominant regime is (06 §8.4 pt 5) —
   * right with probability `regimeAccuracy` of the forecast level held when the
   * month began, otherwise another regime plausible for that month.
   */
  monthRegimeForecast: RegimeId;
  /** Forecast system owned (01 §2.4); upgrades are bought, never sold. */
  forecastLevel: ForecastLevel;
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
  /** Map bounds (01 §3.1); hexes outside the rectangle do not exist. */
  map: MapSize;
  /** 01 §5.7: hexes on the map edge where a border connection may be built. */
  borderSites: HexCoord[];
  /** Terrain per hex key (01 §3.2, cost multipliers 02 §8.1); missing = plains. */
  terrain: Record<string, TerrainId>;
  /** Wind location class per hex key; missing = open. */
  windClasses: Record<string, WindClass>;
  /** Regional insolation multiplier per hex key (01 §3.2); missing = 1.0. */
  solarMultipliers: Record<string, number>;
  dayTruth: DayTruth;
  /** Report of the last resolved turn; null until the first resolution. */
  lastTurnReport: TurnReport | null;
}
