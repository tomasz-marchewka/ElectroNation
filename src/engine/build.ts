// Build actions per docs/01 §2.6, §3.3–§3.4, §7 and 02 §8: payment up front
// (CAPEX × terrain multiplier), objects appear after a countdown in game days,
// lines progress 3 h per resolved turn. Invalid actions are a no-op — the
// action log stays replayable regardless of UI bugs.

import {
  BATTERY,
  BORDER_SPEC,
  CITY_CONNECTION_COST_PLN,
  FARM_TECHS,
  JUNCTION_SPEC,
  KM_PER_HEX,
  LINE_SLOTS_PER_OBJECT,
  LINE_TYPES,
  MAX_LINES_PER_HEX_PER_TYPE,
  PLANT_TECHS,
  PUMPED_BLOCK,
  TERRAIN,
  type FarmTech,
  type LineType,
  type PlantTech,
} from "./config";
import { hexKey, type HexCoord } from "./network";
import type { GameState, PendingObject } from "./state";

// Flat-top axial neighbors (01 §3.1).
const NEIGHBOR_OFFSETS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

function areNeighbors(a: HexCoord, b: HexCoord): boolean {
  return NEIGHBOR_OFFSETS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
}

function terrainAt(state: GameState, hex: HexCoord) {
  return TERRAIN[state.terrain[hexKey(hex)] ?? "plains"];
}

function pendingHex(pending: PendingObject): HexCoord {
  switch (pending.kind) {
    case "plant":
      return pending.plant.hex;
    case "farm":
      return pending.farm.hex;
    case "storage":
      return pending.storage.hex;
    case "junction":
      return pending.junction.hex;
    case "border":
      return pending.border.hex;
  }
}

/** Hexes taken by completed objects and by objects under construction. */
function occupiedHexKeys(state: GameState): Set<string> {
  const keys = new Set<string>();
  const all: { hex: HexCoord }[] = [
    ...state.cities,
    ...state.plants,
    ...state.farms,
    ...state.storages,
    ...state.junctions,
    ...state.borders,
  ];
  for (const object of all) keys.add(hexKey(object.hex));
  for (const construction of state.constructions) {
    keys.add(hexKey(pendingHex(construction.pending)));
  }
  return keys;
}

/** Hexes of completed objects only — valid line endpoints and tap slots. */
function builtObjectHexKeys(state: GameState): Set<string> {
  const keys = new Set<string>();
  const all: { hex: HexCoord }[] = [
    ...state.cities,
    ...state.plants,
    ...state.farms,
    ...state.storages,
    ...state.junctions,
    ...state.borders,
  ];
  for (const object of all) keys.add(hexKey(object.hex));
  return keys;
}

/**
 * Places an object under construction: validates the site, charges CAPEX ×
 * terrain and queues the countdown. Returns the input state when invalid.
 */
function queueObject(
  state: GameState,
  baseCostPln: number,
  buildDays: number,
  hex: HexCoord,
  makePending: (id: string) => PendingObject,
): GameState {
  const multiplier = terrainAt(state, hex).object;
  if (multiplier === null) return state;
  if (occupiedHexKeys(state).has(hexKey(hex))) return state;
  const cost = Math.round(baseCostPln * multiplier);
  if (state.moneyPln < cost) return state;
  const id = `obj-${state.nextObjectId}`;
  return {
    ...state,
    moneyPln: state.moneyPln - cost,
    nextObjectId: state.nextObjectId + 1,
    constructions: [
      ...state.constructions,
      { id, remainingDays: buildDays, pending: makePending(id) },
    ],
  };
}

export function buildPlant(
  state: GameState,
  tech: PlantTech,
  capacityMw: number,
  hex: HexCoord,
): GameState {
  const spec = PLANT_TECHS[tech];
  if (!Number.isFinite(capacityMw) || capacityMw <= 0 || capacityMw > spec.maxBlockMw) {
    return state;
  }
  return queueObject(
    state,
    capacityMw * spec.capexPlnPerMw,
    spec.buildDays,
    hex,
    (id) => ({
      kind: "plant",
      plant: { id, name: id, hex, tech, capacityMw, setpointMw: 0 },
    }),
  );
}

export function buildFarm(
  state: GameState,
  tech: FarmTech,
  capacityMw: number,
  hex: HexCoord,
): GameState {
  const spec = FARM_TECHS[tech];
  if (!Number.isFinite(capacityMw) || capacityMw <= 0 || capacityMw > spec.maxMwPerHex) {
    return state;
  }
  const windClass = state.windClasses[hexKey(hex)] ?? "open";
  return queueObject(
    state,
    capacityMw * spec.capexPlnPerMw,
    spec.buildDays,
    hex,
    (id) => ({
      kind: "farm",
      farm: { id, name: id, hex, tech, capacityMw, enabled: true, windClass },
    }),
  );
}

export function buildBattery(
  state: GameState,
  powerMw: number,
  capacityMwh: number,
  hex: HexCoord,
): GameState {
  if (
    !Number.isFinite(powerMw) ||
    !Number.isFinite(capacityMwh) ||
    powerMw <= 0 ||
    capacityMwh <= 0 ||
    powerMw > BATTERY.maxPowerMwPerHex ||
    capacityMwh > BATTERY.maxCapacityMwhPerHex
  ) {
    return state;
  }
  const cost =
    powerMw * BATTERY.powerCapexPlnPerMw + capacityMwh * BATTERY.energyCapexPlnPerMwh;
  return queueObject(state, cost, 1, hex, (id) => ({
    kind: "storage",
    storage: {
      id,
      name: id,
      hex,
      tech: "battery",
      powerMw,
      capacityMwh,
      socMwh: 0,
      setpoint: { mode: "idle", mw: 0 },
    },
  }));
}

export function buildPumpedStorage(state: GameState, hex: HexCoord): GameState {
  // 01 §3.2: mountains/highlands + water; the water flag arrives with the map
  // model (doc 07) — until then the elevation requirement is the gate.
  const terrainId = state.terrain[hexKey(hex)] ?? "plains";
  if (terrainId !== "mountains" && terrainId !== "highlands") return state;
  return queueObject(state, PUMPED_BLOCK.capexPln, 5, hex, (id) => ({
    kind: "storage",
    storage: {
      id,
      name: id,
      hex,
      tech: "pumped",
      powerMw: PUMPED_BLOCK.powerMw,
      capacityMwh: PUMPED_BLOCK.capacityMwh,
      socMwh: 0,
      setpoint: { mode: "idle", mw: 0 },
    },
  }));
}

export function buildJunction(state: GameState, hex: HexCoord): GameState {
  return queueObject(state, JUNCTION_SPEC.capexPln, JUNCTION_SPEC.buildDays, hex, (id) => ({
    kind: "junction",
    junction: { id, name: id, hex, throughputMw: JUNCTION_SPEC.throughputMw },
  }));
}

export function buildBorder(state: GameState, hex: HexCoord): GameState {
  return queueObject(state, BORDER_SPEC.capexPln, BORDER_SPEC.buildDays, hex, (id) => ({
    kind: "border",
    border: {
      id,
      name: id,
      hex,
      throughputMw: BORDER_SPEC.throughputMw,
      importSetpointMw: 0,
      exportSetpointMw: 0,
    },
  }));
}

export function buildLine(
  state: GameState,
  lineType: LineType,
  path: HexCoord[],
): GameState {
  if (path.length < 2) return state;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b || !areNeighbors(a, b)) return state;
  }
  const objectHexes = builtObjectHexKeys(state);
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || !last) return state;
  if (!objectHexes.has(hexKey(first)) || !objectHexes.has(hexKey(last))) return state;

  // Topology limits (01 §3.3): ≤9 lines of one type per hex; a line through an
  // object's hex consumes one of its 6 line slots.
  const linesThroughHex = (key: string, type?: LineType) =>
    state.lines.filter(
      (line) =>
        (type === undefined || line.type === type) &&
        line.path.some((h) => hexKey(h) === key),
    ).length;
  for (const hex of path) {
    const key = hexKey(hex);
    if (linesThroughHex(key, lineType) + 1 > MAX_LINES_PER_HEX_PER_TYPE) return state;
    if (objectHexes.has(key) && linesThroughHex(key) + 1 > LINE_SLOTS_PER_OBJECT) {
      return state;
    }
  }

  const spec = LINE_TYPES[lineType];
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const hex = path[i];
    if (!hex) return state;
    cost += KM_PER_HEX * spec.capexPlnPerKm * terrainAt(state, hex).line;
  }
  cost = Math.round(cost);
  if (state.moneyPln < cost) return state;

  const id = `obj-${state.nextObjectId}`;
  return {
    ...state,
    moneyPln: state.moneyPln - cost,
    nextObjectId: state.nextObjectId + 1,
    lines: [
      ...state.lines,
      {
        id,
        type: lineType,
        path,
        builtHours: 0,
        totalHours: (path.length - 1) * spec.buildHoursPerHex,
      },
    ],
  };
}

export function connectCity(state: GameState, cityId: string): GameState {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city || city.connected) return state;
  if (state.moneyPln < CITY_CONNECTION_COST_PLN) return state;
  const cityKey = hexKey(city.hex);
  const hasFinishedLine = state.lines.some(
    (line) =>
      line.builtHours >= line.totalHours &&
      line.path.some((h) => hexKey(h) === cityKey),
  );
  if (!hasFinishedLine) return state;
  return {
    ...state,
    moneyPln: state.moneyPln - CITY_CONNECTION_COST_PLN,
    cities: state.cities.map((c) =>
      c.id === cityId
        ? { ...c, connected: true, connectedSinceDay: state.calendar.dayIndex }
        : c,
    ),
  };
}
