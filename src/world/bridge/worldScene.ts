// The 3D scene contract: what the renderer is handed, and nothing else.
//
// Plain JSON-shaped data — no classes, no Three objects, no functions — built
// by ./buildWorldScene from GameState + the turn report the player is looking
// at. Every render module consumes a documented slice of this file (see
// ARCHITECTURE.md §4) and never reaches into the engine on its own: the types
// below are the whole vocabulary a module knows. Snapshot tests pin the model
// (tests/unit/world), exactly as tests/unit/app/map-scene.test.ts pins the SVG
// scene model this contract grew out of.
//
// Every number traces back to the engine or to a derivation documented next to
// its field. A derivation the bridge cannot make honestly is not invented — it
// is listed in `notes` and in docs/STATUS.json (blocked engine requests).

import type {
  BlockStatus,
  DayType,
  FarmTech,
  LineType,
  PlantControlMode,
  PlantTech,
  RegimeId,
  StorageMode,
  StorageTech,
  TerrainId,
  TurnPhase,
  WindClass,
} from "../../engine";
import type { LineLoad } from "../../app/map/sceneModel";

export type { LineLoad };

/** Current version of the contract; bumped when a slice changes shape. */
export const WORLD_SCENE_VERSION = 1;

/** A hex the way modules address it: engine axial coordinates plus the key. */
export interface HexRef {
  q: number;
  r: number;
  /** Engine hex key `q,r` — the stable identity of the tile. */
  key: string;
}

/** Unit vector in world space (1 unit = 1 km, +Y up, north = −Z, east = +X). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// --- time -------------------------------------------------------------------

export interface WorldTime {
  /** Game day and turn the world is showing — the last RESOLVED turn (01 §8 pt 1). */
  dayIndex: number;
  turnIndex: number;
  phase: TurnPhase;
  /** Hour of day of the block midpoint: NOC → 1.5, SZCZYT WIECZORNY → 19.5. */
  hour: number;
  /** 0..11 */
  month: number;
  dayType: DayType;
  /** Astronomical day of year (1..365) the shown day stands for. */
  dayOfYear: number;
  /** 1-based game year, 36 days each. */
  year: number;
  /**
   * Whether a turn report exists: false before the first resolution, when the
   * world shows the pending turn with no flows at all.
   */
  resolved: boolean;
  /** How many real days the shown day stands for (01 §2.1). */
  dayWeight: number;
  /** The regime the player is TOLD this month runs under (06 §8.4 pt 5). */
  regimeForecast: RegimeId;
}

// --- board ------------------------------------------------------------------

export interface WorldHex extends HexRef {
  /** Offset (odd-q) address, the way the map is authored. */
  col: number;
  row: number;
  /** Hex centre on the ground plane [km]; height is the terrain module's. */
  x: number;
  z: number;
  terrain: TerrainId;
  windClass: WindClass;
  /** Regional insolation multiplier (01 §3.2); 1 where the map says nothing. */
  solarMultiplier: number;
  /** Land touching the sea. */
  coastal: boolean;
  /** Touches a lake or the sea (water at an edge — shoreline geometry). */
  shore: boolean;
  /** On the outer ring of the map rectangle. */
  edge: boolean;
  /** A pumped-storage site: highlands or mountains next to water (01 §3.2). */
  pumpedSite: boolean;
  /** A border-connection site (01 §5.7). */
  borderSite: boolean;
}

export interface WorldBoard {
  cols: number;
  rows: number;
  /** Distance between neighbouring hex centres [km] — 25, per 01 §3.1. */
  pitchKm: number;
  /** Extent of the board in world units [km]. */
  widthKm: number;
  depthKm: number;
  /** Every hex of the rectangle, column-major like the SVG scene. */
  hexes: WorldHex[];
}

// --- sun --------------------------------------------------------------------

export interface WorldSun {
  /** 06 §3.4; negative below the horizon. */
  altitudeDeg: number;
  /** 06 §3.5; clockwise from north, 0..360. */
  azimuthDeg: number;
  /** Unit vector pointing AT the sun in world space. */
  direction: Vec3;
  declinationDeg: number;
  hourAngleDeg: number;
  sunriseHour: number;
  sunsetHour: number;
  dayLengthHours: number;
  /** Clear-sky irradiance at this hour [W/m²] (06 §4.3). */
  clearSkyGhiW: number;
  /** 0 at night, 1 in full day; smooth over the −6°…+6° band around the horizon. */
  daylight: number;
  /** 1 within the −6°…+6° band (civil twilight, golden hour), 0 elsewhere. */
  twilight: number;
}

// --- weather ----------------------------------------------------------------

export type PrecipitationKind = "none" | "rain" | "sleet" | "snow";

export interface WorldWeather {
  /** Regime of the shown day (06 §8.2) — truth, revealed with the turn. */
  regime: RegimeId;
  /** Block-average cloud cover 0..1 of the shown turn. */
  cloudCover: number;
  /** Block-average global horizontal irradiance [W/m²] — PV collapse included. */
  ghiW: number;
  /** Block-average air temperature [°C]. */
  tempC: number;
  /** Mean temperature of the shown day [°C] — snow cover follows it. */
  dailyMeanTempC: number;
  /** Block-average wind speed per location class [m/s] (06 §6.1). */
  windMs: Record<WindClass, number>;
  /** Where the wind blows FROM, clockwise from north (derived, see bridge/weather.ts). */
  windFromDeg: number;
  /** 0..1 — how gusty the regime is (storm 1, high 0); shapes cloth and plume motion. */
  gustiness: number;
  precipitation: { kind: PrecipitationKind; intensity: number };
  /** 0..1 fog density (fogHigh ≈ 1). */
  fog: number;
  /** 0..1 haze / turbidity of the sky. */
  haze: number;
  /** 0..1 lowland snow cover; the terrain module derives the snowline from it. */
  snowCover: number;
  /** Any wind class at or past the turbine cut-out of 06 §6.3 — a visible storm. */
  storm: boolean;
  /** Winter high with no wind and next to no sun (06 §12.12) — the Dunkelflaute flag. */
  dunkelflaute: boolean;
}

// --- lines ------------------------------------------------------------------

export interface WorldSegment {
  /** Report segment id (`lineId:i`). */
  key: string;
  /** Path indices within the line's hex chain, inclusive. */
  fromIndex: number;
  toIndex: number;
  fromNodeId: string;
  toNodeId: string;
  /** Flow at the sending end of the segment [MW] — unsigned in the report. */
  usedMw: number;
  capacityMw: number;
  /** usedMw / capacityMw, 0 when idle. */
  ratio: number;
  load: LineLoad;
  /**
   * +1 flows from `fromNodeId` toward `toNodeId` along the path, −1 the other
   * way, 0 unknown or idle. A HEURISTIC (bridge/flowDirection.ts): the report
   * carries no direction, so this is inferred from hop distance to producing
   * nodes — listed as a blocked engine request in docs/STATUS.json.
   */
  direction: 1 | -1 | 0;
}

export interface WorldLane {
  /** Position of this line in the corridor of this path step, 0-based. */
  index: number;
  /** How many lines share that corridor step. */
  count: number;
}

export interface WorldLine {
  id: string;
  type: LineType;
  path: HexRef[];
  built: boolean;
  /** builtHours / totalHours, 1 when finished. */
  progress: number;
  /** A raise in progress (01 §4.2): the target type and its progress. */
  upgrade: { type: LineType; progress: number } | null;
  /** One lane entry per path step (length = path.length − 1). */
  lanes: WorldLane[];
  /**
   * Segments the last report measured. A finished line the report does not
   * mention (built after the turn, or no turn resolved yet) has one idle
   * segment spanning the whole path; an unfinished line has none.
   */
  segments: WorldSegment[];
}

// --- plants -----------------------------------------------------------------

export interface WorldBlock {
  index: number;
  /** Rated power [MW]. */
  mw: number;
  status: BlockStatus;
  setpointMw: number;
  outputMw: number;
  /** outputMw / mw, 0..1. */
  load: number;
  startupTurnsLeft: number;
  /** 0..1 — how far along a running startup is (1 = arriving at minimum load). */
  warmup: number;
}

export interface WorldPlant {
  id: string;
  name: string;
  hex: HexRef;
  tech: PlantTech;
  capacityMw: number;
  blocks: WorldBlock[];
  /** Sum of block outputs — what the flow was offered [MW]. */
  outputMw: number;
  /** What the flow actually drew [MW]; 0 before the first resolution. */
  usedMw: number;
  /** Production nobody took [MW] — penalised surplus (01 §4.1). */
  dumpMw: number;
  controlMode: PlantControlMode;
  automation: boolean;
  /** 0..1 — capacity relative to the technology's largest rung ×6 (site footprint). */
  footprint: number;
}

// --- farms ------------------------------------------------------------------

export type RotorState = "off" | "still" | "spinning" | "feathered";

export interface WorldFarm {
  id: string;
  name: string;
  hex: HexRef;
  tech: FarmTech;
  capacityMw: number;
  enabled: boolean;
  /** The same technology on a sea hex (01 §5.2, 0.22). */
  offshore: boolean;
  windClass: WindClass;
  /** Block-average wind at the farm's class [m/s]; 0 for PV. */
  windMs: number;
  /** 06 §6.3 power curve fraction of the block-average wind; 0 for PV. */
  powerFraction: number;
  /** What the rotor does this turn (06 §6.3: cut-in 3, rated 12, cut-out 25 m/s). */
  rotor: RotorState;
  /** 0..1 rotor speed: 0 still, 1 at rated wind and above (until cut-out). */
  rotorSpeed: number;
  /** Weather production offered to the flow [MW] (0 when disabled). */
  producedMw: number;
  usedMw: number;
  curtailedMw: number;
  /** Turbines (wind) or panel rows (PV) to draw — derived from capacity. */
  units: number;
  /** 0..1 — capacity relative to the site cap. */
  footprint: number;
}

// --- storage ----------------------------------------------------------------

export interface WorldStorage {
  id: string;
  name: string;
  hex: HexRef;
  tech: StorageTech;
  powerMw: number;
  capacityMwh: number;
  socMwh: number;
  /** 0..1 state of charge — the reservoir level of a pumped plant. */
  soc: number;
  mode: StorageMode;
  setpointMw: number;
  dischargedMw: number;
  chargedMw: number;
  /** Signed actual flow [MW]: + feeds the grid, − draws from it (handoff convention). */
  flowMw: number;
  /** 0..1 — power relative to the technology's site cap. */
  footprint: number;
}

// --- nodes ------------------------------------------------------------------

export interface WorldJunction {
  id: string;
  name: string;
  hex: HexRef;
  /** Line ends landing here (a passing line counts twice — 01 §3.3). */
  slotsUsed: number;
  slots: number;
}

export interface WorldBorder {
  id: string;
  name: string;
  hex: HexRef;
  throughputMw: number;
  importSetpointMw: number;
  exportSetpointMw: number;
  importUsedMw: number;
  exportDeliveredMw: number;
  /** Node throughput actually used [MW] and its share of the cap. */
  usedMw: number;
  ratio: number;
  /** Unit vector on the ground plane pointing off the map — where the foreign grid is. */
  outward: { x: number; z: number };
}

// --- cities -----------------------------------------------------------------

export type CitySizeClass = "town" | "city" | "metro";

export interface WorldCity {
  id: string;
  name: string;
  hex: HexRef;
  households: number;
  firms: number;
  sizeClass: CitySizeClass;
  /** 0..1 — log scale of households between 50 k and 1,5 M. */
  scale: number;
  connected: boolean;
  demandMw: number;
  deliveredMw: number;
  ensMw: number;
  /** deliveredMw / demandMw of the shown turn; 1 when nothing was demanded. */
  served: number;
  /**
   * How lit the city is at night, 0..1: `served` for a connected city of a
   * resolved turn, 1 for a connected city before the first resolution
   * (nothing has starved it yet), 0 for a city off the grid.
   */
  lit: number;
  /** ENS > 0 — the city is short this turn. */
  blackout: boolean;
}

// --- construction -----------------------------------------------------------

export type SiteKind = "plant" | "farm" | "storage" | "junction" | "border" | "expansion";

export interface WorldSite {
  id: string;
  hex: HexRef;
  kind: SiteKind;
  /** Technology of the object being built, when it has one. */
  tech: PlantTech | FarmTech | StorageTech | null;
  remainingDays: number;
  totalDays: number;
  /** 0..1 — how far the countdown has come. */
  progress: number;
}

// --- overlay ----------------------------------------------------------------

export interface WorldRoute {
  path: HexRef[];
  lineType: LineType;
  valid: boolean;
  waypoints: HexRef[];
  /** `1,20 mld zł · 3 DOBY` — written at the cursor end of the route. */
  label: string;
}

export interface WorldBottleneck {
  kind: "segment" | "node";
  /** Hexes to ring: the segment's stretch or the node's hex. */
  hexes: HexRef[];
  lineId: string | null;
  segmentKey: string | null;
}

export interface WorldOverlay {
  selection: HexRef | null;
  /** Hex under the cursor; the renderer usually keeps this itself. */
  hover: HexRef | null;
  route: WorldRoute | null;
  bottleneck: WorldBottleneck | null;
  /** Name of the module staged alone (?showcase=), or null in the game. */
  showcase: string | null;
  /** Capture-only weather override (?regime=); the HUD banners it. */
  weatherOverride: RegimeId | null;
}

// --- labels -----------------------------------------------------------------

export type LabelTone = "default" | "city" | "danger" | "warn" | "action";
export type LabelKind = "city" | "object" | "site" | "overload" | "shortfall" | "route" | "line";

export interface WorldLabel {
  key: string;
  hex: HexRef;
  text: string;
  tone: LabelTone;
  kind: LabelKind;
  /** Dimmed with its object — a city off the grid. */
  muted: boolean;
  /** Higher wins when labels collide on screen (alerts over names). */
  priority: number;
  /** Below the object (names) or above it (callouts). */
  placement: "below" | "above";
}

// --- the scene --------------------------------------------------------------

export interface WorldScene {
  version: typeof WORLD_SCENE_VERSION;
  seed: number;
  time: WorldTime;
  board: WorldBoard;
  sun: WorldSun;
  weather: WorldWeather;
  lines: WorldLine[];
  plants: WorldPlant[];
  farms: WorldFarm[];
  storages: WorldStorage[];
  junctions: WorldJunction[];
  borders: WorldBorder[];
  cities: WorldCity[];
  sites: WorldSite[];
  overlay: WorldOverlay;
  labels: WorldLabel[];
  /** Bridge diagnostics: derivations it could not make, in the player's words. */
  notes: string[];
}
