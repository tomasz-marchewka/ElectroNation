// A mid-game portfolio on map v1, shared by the performance tripwire of plan
// M10 §4 and by anything else that needs a grid bigger than the starting
// endowment. Built as a scenario rather than played: the subject is the
// resolved turn, not the build actions.

import {
  MAP_V1,
  applyAction,
  finishedLine,
  newGame,
  type Action,
  type GameState,
  type Scenario,
} from "../../src/engine";

/** Hexes of the corridors, as the app's router lays them out on map v1. */
const CORRIDOR_JASIENICA = [
  { q: 4, r: 7 },
  { q: 5, r: 6 },
  { q: 6, r: 6 },
  { q: 7, r: 6 },
  { q: 8, r: 5 },
  { q: 9, r: 4 },
  { q: 10, r: 3 },
  { q: 11, r: 2 },
];
const CORRIDOR_TUROW = [
  { q: 4, r: 7 },
  { q: 3, r: 7 },
  { q: 3, r: 6 },
  { q: 2, r: 6 },
  { q: 2, r: 5 },
];
const CORRIDOR_NADMORZE = [
  { q: 2, r: 5 },
  { q: 2, r: 4 },
  { q: 2, r: 3 },
  { q: 3, r: 2 },
  { q: 3, r: 1 },
];
const CORRIDOR_BORDER = [
  { q: 1, r: 9 },
  { q: 0, r: 9 },
  { q: 0, r: 8 },
  { q: 0, r: 7 },
];

const CONNECTED = new Set(["city-modrzyca", "city-turow", "city-nadmorze", "city-jasienica"]);

/**
 * Map v1 with a mid-game portfolio already standing: 3 plants, 2 farms, a
 * battery, a junction, a border point and five finished corridors feeding four
 * connected cities — 18 network nodes in all. Built as a scenario rather than
 * played, because the subject here is the resolved turn, not the build actions.
 */
function midGameScenario(): Scenario {
  return {
    ...MAP_V1,
    cities: MAP_V1.cities.map((city) => ({ ...city, connected: CONNECTED.has(city.id) })),
    plants: [
      ...MAP_V1.plants,
      {
        id: "plant-coal",
        name: "EL WĘGLOWA",
        hex: { q: 2, r: 8 },
        tech: "coal",
        capacityMw: 800,
        setpointMw: 0,
      },
      {
        id: "plant-peaker",
        name: "TG SZCZYTOWA",
        hex: { q: 3, r: 7 },
        tech: "ocgt",
        capacityMw: 150,
        setpointMw: 0,
      },
    ],
    farms: [
      {
        id: "farm-wind",
        name: "FW",
        hex: { q: 9, r: 4 },
        tech: "wind",
        capacityMw: 300,
        enabled: true,
        windClass: "open",
        solarMultiplier: 1,
      },
      {
        id: "farm-pv",
        name: "FPV",
        hex: { q: 10, r: 3 },
        tech: "pv",
        capacityMw: 200,
        enabled: true,
        windClass: "open",
        solarMultiplier: 1.01,
      },
    ],
    storages: [
      {
        id: "storage-bess",
        name: "BESS",
        hex: { q: 8, r: 5 },
        tech: "battery",
        powerMw: 200,
        capacityMwh: 1_200,
        socMwh: 600,
        setpoint: { mode: "idle", mw: 0 },
      },
    ],
    junctions: [
      {
        id: "junction-1",
        name: "SR",
        hex: { q: 7, r: 6 },
        throughputMw: 750,
        lineSlots: 10,
      },
    ],
    borders: [
      {
        id: "border-west",
        name: "PG ZACHÓD",
        hex: { q: 0, r: 7 },
        throughputMw: 500,
        importSetpointMw: 0,
        exportSetpointMw: 0,
      },
    ],
    lines: [
      ...MAP_V1.lines,
      finishedLine("line-jasienica", "mv", CORRIDOR_JASIENICA),
      finishedLine("line-turow", "mv", CORRIDOR_TUROW),
      finishedLine("line-nadmorze", "mv", CORRIDOR_NADMORZE),
      finishedLine("line-border", "mv", CORRIDOR_BORDER),
    ],
  };
}

/** Every dispatch lever pulled, so all three flow passes of 02 §4 do work. */
const SETPOINTS: Action[] = [
  { type: "setPlantSetpoint", plantId: "plant-start-ccgt", mw: 400 },
  { type: "setPlantSetpoint", plantId: "plant-coal", mw: 800 },
  { type: "setPlantSetpoint", plantId: "plant-peaker", mw: 150 },
  { type: "setStorage", storageId: "storage-bess", mode: "charge", mw: 200 },
  { type: "setImport", borderId: "border-west", mw: 200 },
  { type: "setExport", borderId: "border-west", mw: 200 },
];

/** The portfolio with its setpoints already set — ready to resolve turns. */
export function armedState(): GameState {
  let state = newGame(20260816, midGameScenario());
  for (const action of SETPOINTS) state = applyAction(state, action);
  return state;
}
