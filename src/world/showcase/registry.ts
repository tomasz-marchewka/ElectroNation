// Showcase routes (ARCHITECTURE.md §15): `?showcase=<module>` stages one
// module's representative scene. A showcase names the modules to load and the
// (hour, regime, camera) frames the capture harness should walk. Builders add
// their module's entry here; the integrator owns the file's shape.

import type { CameraPreset } from "../render/core/CameraRig";

export interface ShowcaseFrame {
  name: string;
  /** Turn index 0..7 of the shown day; the hour follows (block midpoint). */
  turn: number;
  regime: string;
  camera: CameraPreset;
  /** Optional hex the close cameras look at (offset col,row of map v1). */
  focus?: { col: number; row: number };
  /**
   * Optional day for this frame; the spec's day otherwise. Lets a frame show
   * a season the judging day cannot (e.g. a June noon sky, day 16).
   */
  day?: number;
}

export interface ShowcaseSpec {
  module: string;
  /** Modules loaded for the showcase — the module itself plus what it needs. */
  modules: string[];
  scenario: "start" | "midgame";
  /**
   * Day index the frames are shown on; `?day=` overrides it. 1 is the judging
   * day of the midgame scenario — nuclear online, the Łęgi corridor mid-upgrade,
   * the second coal block starting — where day 0 is still a cold start.
   */
  day: number;
  frames: ShowcaseFrame[];
}

/** The midgame scenario's judging day (bridge/showcase.ts DEFAULT_SHOWCASE). */
const JUDGING_DAY = 1;

const SKY_FRAMES: ShowcaseFrame[] = [
  // June (day 16) — a January day cannot show a summer noon sky.
  { name: "noon-summer-high", turn: 4, regime: "summerHigh", camera: "strategic", day: 16 },
  { name: "dawn-transitional", turn: 2, regime: "transitional", camera: "golden" },
  { name: "evening-frost", turn: 6, regime: "frostHigh", camera: "strategic" },
  { name: "night-fog", turn: 0, regime: "fogHigh", camera: "overview" },
  { name: "storm-afternoon", turn: 5, regime: "storm", camera: "golden" },
];

export const SHOWCASES: Record<string, ShowcaseSpec> = {
  terrain: {
    module: "terrain",
    modules: ["terrain", "sky"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      { name: "noon-clear", turn: 4, regime: "summerHigh", camera: "strategic" },
      {
        name: "golden-mountains",
        turn: 6,
        regime: "transitional",
        camera: "golden",
        focus: { col: 4, row: 13 },
      },
      { name: "winter-frost", turn: 4, regime: "frostHigh", camera: "overview" },
      {
        name: "coast-closeup",
        turn: 3,
        regime: "atlanticLow",
        camera: "closeup",
        focus: { col: 4, row: 2 },
      },
    ],
  },
  sky: {
    module: "sky",
    modules: ["terrain", "sky"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: SKY_FRAMES,
  },
  grid: {
    module: "grid",
    modules: ["terrain", "sky", "grid", "effects"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      {
        name: "trunk-noon",
        turn: 4,
        regime: "transitional",
        camera: "closeup",
        focus: { col: 9, row: 5 },
      },
      {
        name: "overload-evening",
        turn: 6,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 19, row: 6 },
      },
      {
        // Turn 4 (13:30): turn 5 is already after sunset in January.
        name: "corridor-golden",
        turn: 4,
        regime: "summerLow",
        camera: "golden",
        focus: { col: 6, row: 9 },
      },
      { name: "night-strategic", turn: 7, regime: "atlanticLow", camera: "strategic" },
      {
        // The Zalesie line's construction head sits near (11,10), not (12,9).
        name: "construction-noon",
        turn: 4,
        regime: "summerHigh",
        camera: "closeup",
        focus: { col: 11, row: 10 },
      },
      {
        name: "upgrade-evening",
        turn: 6,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 7, row: 8 },
      },
      {
        // Daylight: the dusk turn hid the lattice detail.
        name: "tower-detail",
        turn: 4,
        regime: "transitional",
        camera: "detail",
        focus: { col: 9, row: 5 },
      },
    ],
  },
  plants: {
    module: "plants",
    modules: ["terrain", "sky", "plants"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      {
        name: "nuclear-noon",
        turn: 4,
        regime: "summerHigh",
        camera: "closeup",
        focus: { col: 8, row: 4 },
      },
      {
        name: "coal-evening",
        turn: 6,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 6, row: 9 },
      },
      {
        name: "ccgt-evening",
        turn: 6,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 17, row: 8 },
      },
      {
        name: "coal-detail-evening",
        turn: 6,
        regime: "frostHigh",
        camera: "detail",
        focus: { col: 6, row: 9 },
      },
      {
        name: "ocgt-night",
        turn: 7,
        regime: "atlanticLow",
        camera: "closeup",
        focus: { col: 20, row: 7 },
      },
    ],
  },
  res: {
    module: "res",
    modules: ["terrain", "sky", "res"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      // Daytime with the atlantic wind behind it — the rotors spin in daylight.
      {
        name: "offshore-atlantic",
        turn: 4,
        regime: "atlanticLow",
        camera: "closeup",
        focus: { col: 10, row: 2 },
      },
      // The same farm at night: lamps on every nacelle, rotors still turning.
      {
        name: "offshore-night",
        turn: 7,
        regime: "atlanticLow",
        camera: "closeup",
        focus: { col: 10, row: 2 },
      },
      {
        // A Baltic storm on day 75: gusts past the 25 m/s cut-out, so the
        // blades are actually feathered (day 1 never reaches cut-out).
        name: "offshore-storm",
        turn: 3,
        regime: "storm",
        camera: "detail",
        focus: { col: 10, row: 2 },
        day: 75,
      },
      {
        // June (day 16): a January noon cannot stage a real summer sun.
        name: "pv-noon",
        turn: 4,
        regime: "summerHigh",
        camera: "closeup",
        focus: { col: 12, row: 9 },
        day: 16,
      },
      {
        name: "dunkelflaute",
        turn: 4,
        regime: "fogHigh",
        camera: "closeup",
        focus: { col: 7, row: 3 },
      },
    ],
  },
  storage: {
    module: "storage",
    modules: ["terrain", "sky", "storage"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      {
        // Closeup, not golden: at 110 km a 7 km reservoir is ~60 px.
        name: "pumped-golden",
        turn: 6,
        regime: "transitional",
        camera: "closeup",
        focus: { col: 2, row: 12 },
      },
      {
        // Detail: the SOC bar needs the close range in daylight.
        name: "bess-noon",
        turn: 4,
        regime: "summerHigh",
        camera: "detail",
        focus: { col: 12, row: 6 },
      },
      {
        name: "pumped-night",
        turn: 7,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 2, row: 12 },
      },
      {
        // Day 0 midday: the plant is charging (script orders 100 MW at turn 2).
        name: "pumped-charge",
        turn: 3,
        regime: "frostHigh",
        camera: "detail",
        focus: { col: 2, row: 12 },
        day: 0,
      },
    ],
  },
  nodes: {
    module: "nodes",
    modules: ["terrain", "sky", "nodes", "grid"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      {
        // Detail: the bay read (strung vs bare) needs the close range.
        name: "junction-noon",
        turn: 4,
        regime: "transitional",
        camera: "detail",
        focus: { col: 9, row: 6 },
      },
      {
        name: "border-golden",
        turn: 6,
        regime: "summerLow",
        camera: "golden",
        focus: { col: 0, row: 7 },
      },
      {
        // Day 0: the border actually imports 200 MW then (the judging turn's
        // setpoint is 100 MW but nothing flows), so the cyan read is staged.
        name: "border-import",
        turn: 0,
        regime: "frostHigh",
        camera: "detail",
        focus: { col: 0, row: 7 },
        day: 0,
      },
      {
        name: "site-progress",
        turn: 4,
        regime: "transitional",
        camera: "detail",
        focus: { col: 14, row: 12 },
      },
      {
        name: "junction-night",
        turn: 7,
        regime: "atlanticLow",
        camera: "detail",
        focus: { col: 9, row: 6 },
      },
    ],
  },
  cities: {
    module: "cities",
    modules: ["terrain", "sky", "cities", "effects"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      {
        name: "metro-night",
        turn: 7,
        regime: "atlanticLow",
        camera: "closeup",
        focus: { col: 11, row: 7 },
      },
      {
        name: "blackout-evening",
        turn: 6,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 19, row: 6 },
      },
      {
        name: "dark-town-night",
        turn: 0,
        regime: "fogHigh",
        camera: "closeup",
        focus: { col: 15, row: 2 },
      },
      { name: "day-strategic", turn: 4, regime: "summerHigh", camera: "strategic" },
      {
        // The module's day read at close range (facades, courtyards, roofs).
        name: "jasienica-day",
        turn: 4,
        regime: "summerHigh",
        camera: "closeup",
        focus: { col: 11, row: 7 },
      },
      {
        name: "metro-detail-night",
        turn: 7,
        regime: "atlanticLow",
        camera: "detail",
        focus: { col: 11, row: 7 },
      },
    ],
  },
  effects: {
    module: "effects",
    // Every overlay owner loaded, or four of the ten overlays cannot appear.
    modules: ["terrain", "sky", "grid", "cities", "plants", "res", "storage", "nodes", "effects"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      {
        name: "bottleneck-night",
        turn: 6,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 19, row: 6 },
      },
      {
        // Detail: the 14 km site reads as a snowfield at 42 km.
        name: "site-noon",
        turn: 4,
        regime: "transitional",
        camera: "detail",
        focus: { col: 14, row: 12 },
      },
      { name: "flow-strategic", turn: 7, regime: "atlanticLow", camera: "strategic" },
      {
        // Day 0 is the only live border import in the midgame script.
        name: "border-import",
        turn: 0,
        regime: "frostHigh",
        camera: "detail",
        focus: { col: 0, row: 7 },
        day: 0,
      },
    ],
  },
  game: {
    module: "game",
    modules: ["terrain", "sky", "grid", "plants", "res", "storage", "nodes", "cities", "effects"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      // The four judging frames of the whole game (captures/showcase/README.md):
      // together they answer every docs/08 §3 question at least once.
      // 1) Judging evening: blackout + ENS, red overloaded lines, a starting coal
      //    block, discharging storages, still rotors (Dunkelflaute).
      { name: "evening-peak-frost", turn: 6, regime: "frostHigh", camera: "strategic" },
      // 2) Daylight: PV production, ok/warn/idle lines side by side, the
      //    construction site and the mid-upgrade corridor at their day-1 progress.
      { name: "noon-summer", turn: 4, regime: "summerHigh", camera: "strategic" },
      // 3) Night: city lights scaled by delivered power, spinning rotors with
      //    nacelle lamps, storages discharging into the peak.
      { name: "night-atlantic", turn: 7, regime: "atlanticLow", camera: "strategic" },
      // 4) Weather drama at the offshore farm: the sea state and the rain read
      //    at 18 km (day 1 never reaches the 25 m/s cut-out; the feathered rotor
      //    is staged by the res showcase frame `offshore-storm`, day 75).
      {
        name: "storm-offshore",
        turn: 5,
        regime: "storm",
        camera: "detail",
        focus: { col: 10, row: 2 },
      },
    ],
  },
};

export function showcaseSpec(name: string | null): ShowcaseSpec | null {
  return name ? (SHOWCASES[name] ?? null) : null;
}
