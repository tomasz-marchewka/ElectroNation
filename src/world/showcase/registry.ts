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
  { name: "noon-summer-high", turn: 4, regime: "summerHigh", camera: "strategic" },
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
        name: "corridor-golden",
        turn: 5,
        regime: "summerLow",
        camera: "golden",
        focus: { col: 6, row: 9 },
      },
      { name: "night-strategic", turn: 7, regime: "atlanticLow", camera: "strategic" },
      {
        name: "construction-noon",
        turn: 4,
        regime: "summerHigh",
        camera: "closeup",
        focus: { col: 12, row: 9 },
      },
      {
        name: "upgrade-evening",
        turn: 6,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 7, row: 8 },
      },
      {
        name: "tower-detail",
        turn: 5,
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
      {
        name: "offshore-atlantic",
        turn: 4,
        regime: "atlanticLow",
        camera: "closeup",
        focus: { col: 10, row: 2 },
      },
      {
        name: "onshore-storm",
        turn: 5,
        regime: "storm",
        camera: "golden",
        focus: { col: 7, row: 3 },
      },
      {
        name: "pv-noon",
        turn: 4,
        regime: "summerHigh",
        camera: "closeup",
        focus: { col: 12, row: 9 },
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
        name: "pumped-golden",
        turn: 6,
        regime: "transitional",
        camera: "golden",
        focus: { col: 2, row: 12 },
      },
      {
        name: "bess-noon",
        turn: 4,
        regime: "summerHigh",
        camera: "closeup",
        focus: { col: 12, row: 6 },
      },
      {
        name: "pumped-night",
        turn: 7,
        regime: "frostHigh",
        camera: "closeup",
        focus: { col: 2, row: 12 },
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
        name: "junction-noon",
        turn: 4,
        regime: "transitional",
        camera: "closeup",
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
        name: "site-progress",
        turn: 4,
        regime: "transitional",
        camera: "closeup",
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
    modules: ["terrain", "sky", "grid", "cities", "plants", "effects"],
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
        name: "site-noon",
        turn: 4,
        regime: "transitional",
        camera: "closeup",
        focus: { col: 14, row: 12 },
      },
      { name: "flow-strategic", turn: 7, regime: "atlanticLow", camera: "strategic" },
    ],
  },
  game: {
    module: "game",
    modules: ["terrain", "sky", "grid", "plants", "res", "storage", "nodes", "cities", "effects"],
    scenario: "midgame",
    day: JUDGING_DAY,
    frames: [
      { name: "evening-peak-frost", turn: 6, regime: "frostHigh", camera: "strategic" },
      { name: "noon-summer", turn: 4, regime: "summerHigh", camera: "strategic" },
      { name: "night-atlantic", turn: 0, regime: "atlanticLow", camera: "overview" },
      {
        name: "storm-golden",
        turn: 5,
        regime: "storm",
        camera: "golden",
        focus: { col: 10, row: 2 },
      },
    ],
  },
};

export function showcaseSpec(name: string | null): ShowcaseSpec | null {
  return name ? (SHOWCASES[name] ?? null) : null;
}
