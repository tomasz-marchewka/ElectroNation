// Curated states for captures, showcases and judging (ARCHITECTURE.md §15).
// Built with the engine's pure API alone — a scenario plus a per-turn action
// script played forward with `resolveTurn` — so a state is reproducible from
// its name, seed, day and turn and never touches the engine.
//
// `midgame` is the judging state of the brief: several plants with mixed block
// states, an HV trunk under load, an offshore farm, a pumped-storage reservoir,
// dark unconnected cities, a construction site and a line mid-upgrade.

import {
  MAP_V1,
  TURNS_PER_DAY,
  applyAction,
  finishedLine,
  newGame,
  offsetToAxial,
  resolveTurn,
  type Action,
  type GameState,
  type HexCoord,
  type LineState,
  type LineType,
  type Scenario,
} from "../../engine";
import { findRoute } from "../../app/routing/astar";

export const SHOWCASE_SCENARIOS = ["start", "midgame"] as const;
export type ShowcaseScenario = (typeof SHOWCASE_SCENARIOS)[number];

export function isShowcaseScenario(name: string): name is ShowcaseScenario {
  return (SHOWCASE_SCENARIOS as readonly string[]).includes(name);
}

/** Offset (col, row) → axial — the map is authored as a rectangle. */
function at(col: number, row: number): HexCoord {
  return offsetToAxial({ col, row });
}

interface ScriptedAction {
  /** Applied before this absolute turn (0 = before the first resolution). */
  beforeTurn: number;
  action: Action;
}

const CONNECTED = new Set([
  "city-modrzyca",
  "city-turow",
  "city-nadmorze",
  "city-jasienica",
  "city-kamionka",
  "city-wierzbnik",
  "city-brzegowo",
]);

/** Routes a finished line over map v1 with the app's own router. */
function routed(
  base: Scenario,
  id: string,
  type: LineType,
  from: HexCoord,
  to: HexCoord,
): LineState {
  const state = newGame(1, base);
  const path = findRoute(state, from, to, type);
  if (!path) throw new Error(`showcase: no route for ${id}`);
  return finishedLine(id, type, path);
}

/** Map v1 with a mid-game portfolio standing on it. */
function midgameScenario(): Scenario {
  const objects: Omit<Scenario, "lines"> = {
    ...MAP_V1,
    cities: MAP_V1.cities.map((city) => ({ ...city, connected: CONNECTED.has(city.id) })),
    plants: [
      ...MAP_V1.plants,
      {
        id: "plant-coal-legi",
        name: "EW Łęgi",
        hex: at(6, 9),
        tech: "coal",
        capacityMw: 1_500,
        blocks: 2,
        setpointMw: 0,
      },
      {
        id: "plant-nuclear-baltyk",
        name: "EJ Bałtyk",
        hex: at(8, 4),
        tech: "nuclear",
        capacityMw: 2_400,
        blocks: 2,
        automation: true,
        setpointMw: 0,
      },
      {
        id: "plant-ccgt-wierzbnik",
        name: "EC Wierzbnik",
        hex: at(17, 8),
        tech: "ccgt",
        capacityMw: 400,
        setpointMw: 0,
      },
      {
        id: "plant-ocgt-kamionka",
        name: "TG Kamionka",
        hex: at(20, 7),
        tech: "ocgt",
        capacityMw: 150,
        setpointMw: 0,
      },
    ],
    farms: [
      {
        id: "farm-wind-baltyk",
        name: "MFW Ławica",
        hex: at(10, 2),
        tech: "wind",
        capacityMw: 600,
        enabled: true,
        windClass: "baltic",
        solarMultiplier: 1,
      },
      {
        id: "farm-wind-wydmy",
        name: "FW Wydmy",
        hex: at(7, 3),
        tech: "wind",
        capacityMw: 300,
        enabled: true,
        windClass: "open",
        solarMultiplier: 1,
      },
      {
        id: "farm-pv-rownina",
        name: "FPV Równina",
        hex: at(12, 9),
        tech: "pv",
        capacityMw: 200,
        enabled: true,
        windClass: "open",
        solarMultiplier: 1.01,
      },
      {
        id: "farm-pv-wzgorze",
        name: "FPV Wzgórze",
        hex: at(16, 10),
        tech: "pv",
        capacityMw: 100,
        enabled: true,
        windClass: "open",
        solarMultiplier: 1.01,
      },
    ],
    storages: [
      {
        // 8 h at rated power (the hex cap): the day-1 evening discharge covers
        // the afternoon and the peak, and the pack still reads a quarter full
        // at the judging turn instead of empty (the brief's SOC-bar read).
        id: "storage-bess-jasienica",
        name: "BESS Jasienica",
        hex: at(12, 6),
        tech: "battery",
        powerMw: 250,
        capacityMwh: 2_000,
        socMwh: 1_140,
        setpoint: { mode: "idle", mw: 0 },
      },
      {
        id: "storage-esp-kotlina",
        name: "ESP Kotlina",
        hex: at(2, 12),
        tech: "pumped",
        powerMw: 500,
        capacityMwh: 5_000,
        socMwh: 3_100,
        setpoint: { mode: "idle", mw: 0 },
      },
    ],
    junctions: [
      { id: "junction-centrum", name: "SR Centrum", hex: at(9, 6) },
      { id: "junction-wschod", name: "SR Wschód", hex: at(15, 7) },
    ],
    borders: [
      {
        id: "border-zachod",
        name: "PG Zachód",
        hex: at(0, 7),
        throughputMw: 500,
        importSetpointMw: 0,
        exportSetpointMw: 0,
      },
    ],
  };
  const base: Scenario = { ...objects, lines: [] };
  const lines: LineState[] = [
    ...MAP_V1.lines,
    routed(base, "line-hv-trunk", "hv", at(8, 4), at(9, 6)),
    routed(base, "line-hv-jasienica", "hv", at(9, 6), at(11, 7)),
    routed(base, "line-hv-lawica", "hv", at(10, 2), at(9, 6)),
    routed(base, "line-mv-legi-modrzyca", "mv", at(6, 9), at(4, 9)),
    routed(base, "line-mv-legi-centrum", "mv", at(6, 9), at(9, 6)),
    routed(base, "line-mv-centrum-bess", "mv", at(9, 6), at(12, 6)),
    routed(base, "line-mv-bess-wschod", "mv", at(12, 6), at(15, 7)),
    routed(base, "line-mv-wschod-wierzbnik", "mv", at(15, 7), at(18, 9)),
    routed(base, "line-mv-wschod-brzegowo", "mv", at(15, 7), at(18, 4)),
    routed(base, "line-mv-ccgt-wierzbnik", "mv", at(17, 8), at(18, 9)),
    routed(base, "line-lv-tg-kamionka", "lv", at(20, 7), at(19, 6)),
    routed(base, "line-mv-modrzyca-turow", "mv", at(4, 9), at(2, 6)),
    routed(base, "line-mv-wydmy-nadmorze", "mv", at(7, 3), at(3, 2)),
    routed(base, "line-mv-turow-nadmorze", "mv", at(2, 6), at(3, 2)),
    // A three-lane corridor (the brief demands the bundle read; the judging
    // state had none). Two extra MV circuits along the same NW route.
    routed(base, "line-mv-turow-nadmorze-b", "mv", at(2, 6), at(3, 2)),
    routed(base, "line-mv-turow-nadmorze-c", "mv", at(2, 6), at(3, 2)),
    routed(base, "line-mv-kotlina-modrzyca", "mv", at(2, 12), at(4, 9)),
    routed(base, "line-lv-rownina-jasienica", "lv", at(12, 9), at(11, 7)),
    routed(base, "line-lv-wzgorze-wierzbnik", "lv", at(16, 10), at(18, 9)),
    routed(base, "line-mv-granica-turow", "mv", at(0, 7), at(2, 6)),
  ];
  // A corridor still being strung: Jasienica → Zalesie in HV, 12 h per hex
  // (01 §2.6), so it is still a building site at the judging frame.
  const zalesie = routed(base, "line-hv-jasienica-zalesie", "hv", at(11, 7), at(13, 11));
  lines.push({ ...zalesie, builtHours: 3 });
  return { ...objects, lines };
}

/** The dispatcher's orders over the first two days of the mid-game state. */
const MIDGAME_SCRIPT: ScriptedAction[] = [
  // Day 0, before NOC: the base load is ordered; nuclear needs 8 turns of cold start.
  {
    beforeTurn: 0,
    action: { type: "setPlantSetpoint", plantId: "plant-nuclear-baltyk", mw: 2_000 },
  },
  {
    beforeTurn: 0,
    action: { type: "setBlockSetpoint", plantId: "plant-coal-legi", blockIndex: 0, mw: 750 },
  },
  {
    beforeTurn: 0,
    action: { type: "setBlockSetpoint", plantId: "plant-start-ccgt", blockIndex: 0, mw: 100 },
  },
  {
    beforeTurn: 0,
    action: { type: "setBlockSetpoint", plantId: "plant-ccgt-wierzbnik", blockIndex: 0, mw: 400 },
  },
  {
    beforeTurn: 0,
    action: { type: "setBlockSetpoint", plantId: "plant-ocgt-kamionka", blockIndex: 0, mw: 150 },
  },
  {
    beforeTurn: 0,
    action: { type: "setStorage", storageId: "storage-bess-jasienica", mode: "charge", mw: 250 },
  },
  { beforeTurn: 0, action: { type: "setImport", borderId: "border-zachod", mw: 200 } },
  // Day 0, afternoon: the border flips to export for four turns, so the amber
  // export read has a reproducible frame; day 1 restores the import order.
  { beforeTurn: 3, action: { type: "setImport", borderId: "border-zachod", mw: 0 } },
  { beforeTurn: 3, action: { type: "setExport", borderId: "border-zachod", mw: 500 } },
  { beforeTurn: 7, action: { type: "setExport", borderId: "border-zachod", mw: 0 } },
  { beforeTurn: 7, action: { type: "setImport", borderId: "border-zachod", mw: 200 } },
  // Day 0, midday: the pumped plant charges for three turns, so the charge
  // state (intake swirl, rising reservoir) has a reproducible frame, then idles
  // until the evening discharge of day 1.
  {
    beforeTurn: 2,
    action: { type: "setStorage", storageId: "storage-esp-kotlina", mode: "charge", mw: 100 },
  },
  {
    beforeTurn: 5,
    action: { type: "setStorage", storageId: "storage-esp-kotlina", mode: "idle", mw: 0 },
  },
  // Work in the queue: a coal block being built in the highlands.
  { beforeTurn: 0, action: { type: "buildPlant", tech: "coal", size: "small", hex: at(14, 12) } },
  // Day 1, morning: the Łęgi corridor is raised to HV — 70 % of 12 h per hex
  // keeps it mid-upgrade through the evening peak (01 §4.2).
  {
    beforeTurn: TURNS_PER_DAY + 3,
    action: { type: "upgradeLine", lineId: "line-mv-legi-centrum", lineType: "hv" },
  },
  // Day 1, midday: FPV Wzgórze is switched off by the operator, so the world
  // carries a disabled farm (no lamps, no output marker) from the afternoon
  // on — including the judging evening, where PV produces nothing anyway.
  {
    beforeTurn: TURNS_PER_DAY + 4,
    action: { type: "setFarmEnabled", farmId: "farm-pv-wzgorze", enabled: false },
  },
  // Day 1: the evening ramp is prepared — the second coal block is ordered late
  // enough to still be starting at SZCZYT WIECZORNY, the reservoir is drawn on.
  {
    beforeTurn: TURNS_PER_DAY + 5,
    action: { type: "setBlockSetpoint", plantId: "plant-coal-legi", blockIndex: 1, mw: 500 },
  },
  {
    beforeTurn: TURNS_PER_DAY + 5,
    action: { type: "setStorage", storageId: "storage-bess-jasienica", mode: "discharge", mw: 250 },
  },
  {
    beforeTurn: TURNS_PER_DAY + 5,
    action: { type: "setStorage", storageId: "storage-esp-kotlina", mode: "discharge", mw: 150 },
  },
  {
    beforeTurn: TURNS_PER_DAY + 5,
    action: { type: "setImport", borderId: "border-zachod", mw: 100 },
  },
];

export interface ShowcaseTarget {
  scenario: ShowcaseScenario;
  seed: number;
  /** Absolute day and turn the state is played to; the turn itself stays pending. */
  dayIndex: number;
  turnIndex: number;
}

export const DEFAULT_SHOWCASE: ShowcaseTarget = {
  scenario: "midgame",
  seed: 20260902,
  dayIndex: 1,
  turnIndex: 7,
};

/**
 * The state at the requested day and turn: everything before it resolved,
 * the requested turn pending. With `dayIndex: 1, turnIndex: 7` the world shows
 * day 1's SZCZYT WIECZORNY, resolved — the judging frame.
 */
export function showcaseState(target: ShowcaseTarget): GameState {
  const scenario = target.scenario === "midgame" ? midgameScenario() : MAP_V1;
  const script = target.scenario === "midgame" ? MIDGAME_SCRIPT : [];
  let state = newGame(target.seed, scenario);
  const turns = target.dayIndex * TURNS_PER_DAY + target.turnIndex;
  for (let turn = 0; turn < turns; turn++) {
    for (const { action } of script.filter((entry) => entry.beforeTurn === turn)) {
      state = applyAction(state, action);
    }
    state = resolveTurn(state);
  }
  for (const { action } of script.filter((entry) => entry.beforeTurn === turns)) {
    state = applyAction(state, action);
  }
  return state;
}
