// Build actions per docs/01 §2.6, §3.3–§3.4, §7 and 02 §8: payment up front
// (CAPEX × terrain multiplier), objects appear after a countdown in game days,
// lines progress 3 h per resolved turn. Expanding an existing object follows
// the same path but targets an object id instead of a hex (01 §7 — expansion
// never leaves the hex). Cancelling forfeits everything paid (01 §2.6).
// Invalid actions are a no-op — the action log stays replayable regardless of
// UI bugs.

import {
  BATTERY,
  BORDER_SPEC,
  CITY_CONNECTION_COST_PLN,
  EXPANSION,
  FARM_TECHS,
  FORECAST_LEVELS,
  FORECAST_LEVEL_ORDER,
  JUNCTION_SPEC,
  KM_PER_HEX,
  LINE_SLOTS_PER_OBJECT,
  LINE_TYPES,
  LINE_TYPE_ORDER,
  MAX_LINES_PER_HEX_PER_TYPE,
  MAX_PLANT_BLOCKS_PER_HEX,
  PLANT_TECHS,
  PUMPED_BLOCK,
  STORAGE_TECHS,
  TERRAIN,
  type FarmTech,
  type ForecastLevel,
  type LineType,
  type PlantTech,
} from "./config";
import { areNeighbors, hexNeighbors, isInsideMap } from "./map";
import { hexKey, type HexCoord } from "./network";
import {
  HOURS_PER_TURN,
  isLineBuilt,
  isLineUpgrading,
  lineOccupiesType,
  type GameState,
  type LineState,
  type LineUpgrade,
  type PendingObject,
} from "./state";

function terrainAt(state: GameState, hex: HexCoord) {
  return TERRAIN[state.terrain[hexKey(hex)] ?? "plains"];
}

/** Whether one of the six neighbors is a lake or sea hex of this map. */
function hasWaterNeighbor(state: GameState, hex: HexCoord): boolean {
  return hexNeighbors(hex).some((neighbor) => {
    if (!isInsideMap(state.map, neighbor)) return false;
    const terrainId = state.terrain[hexKey(neighbor)] ?? "plains";
    return terrainId === "lake" || terrainId === "sea";
  });
}

/** Hex a queued item claims; expansions claim none — the object holds it already. */
function pendingHex(pending: PendingObject): HexCoord | null {
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
    default:
      return null;
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
    const hex = pendingHex(construction.pending);
    if (hex) keys.add(hexKey(hex));
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
  lineSlots: number = LINE_SLOTS_PER_OBJECT,
): GameState {
  if (!isInsideMap(state.map, hex)) return state;
  const multiplier = terrainAt(state, hex).object;
  if (multiplier === null) return state;
  if (occupiedHexKeys(state).has(hexKey(hex))) return state;
  // 01 §3.3 (0.19): the routes crossing this hex are cut on the object the day
  // it stands, and every cut ends in it twice — once coming in, once going out.
  // A corridor that brings more ends than the object has line slots makes the
  // site illegal: the engine never re-draws a route the player has paid for, so
  // the refusal has to happen here, before the money is taken. An ordinary
  // object has six slots, a junction station twice that (01 §5.4).
  const key = hexKey(hex);
  const withSite = new Set([...builtObjectHexKeys(state), key]);
  if (linesAtHex(state, key, withSite) > lineSlots) return state;
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
  return queueObject(state, capacityMw * spec.capexPlnPerMw, spec.buildDays, hex, (id) => ({
    kind: "plant",
    plant: { id, name: id, hex, tech, capacityMw, blocks: 1, setpointMw: 0 },
  }));
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
  // Location properties are frozen at build time (01 §3.2), like the wind class.
  const windClass = state.windClasses[hexKey(hex)] ?? "open";
  const solarMultiplier = state.solarMultipliers[hexKey(hex)] ?? 1;
  return queueObject(state, capacityMw * spec.capexPlnPerMw, spec.buildDays, hex, (id) => ({
    kind: "farm",
    farm: {
      id,
      name: id,
      hex,
      tech,
      capacityMw,
      enabled: true,
      windClass,
      solarMultiplier,
    },
  }));
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
  const cost = powerMw * BATTERY.powerCapexPlnPerMw + capacityMwh * BATTERY.energyCapexPlnPerMwh;
  return queueObject(state, cost, STORAGE_TECHS.battery.buildDays, hex, (id) => ({
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
  // 01 §3.2, 02 §8.1: the only legal sites are mountains or highlands with
  // water next to them — elevation for the head, a lake or the sea to pump from.
  const terrainId = state.terrain[hexKey(hex)] ?? "plains";
  if (terrainId !== "mountains" && terrainId !== "highlands") return state;
  if (!hasWaterNeighbor(state, hex)) return state;
  return queueObject(state, PUMPED_BLOCK.capexPln, STORAGE_TECHS.pumped.buildDays, hex, (id) => ({
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
  return queueObject(
    state,
    JUNCTION_SPEC.capexPln,
    JUNCTION_SPEC.buildDays,
    hex,
    (id) => ({ kind: "junction", junction: { id, name: id, hex } }),
    JUNCTION_SPEC.lineSlots,
  );
}

export function buildBorder(state: GameState, hex: HexCoord): GameState {
  // 01 §5.7: border points lie on the map edge and are part of the map data —
  // the interconnector goes at one of them or nowhere.
  const key = hexKey(hex);
  if (!state.borderSites.some((site) => hexKey(site) === key)) return state;
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

/**
 * CAPEX of a route of this type. Charged from the SECOND hex on: the first is
 * the object the line leaves, so a one-hex "route" costs nothing (01 §4.2).
 */
function routeCapexPln(state: GameState, path: readonly HexCoord[], lineType: LineType): number {
  const spec = LINE_TYPES[lineType];
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const hex = path[i];
    if (!hex) continue;
    cost += KM_PER_HEX * spec.capexPlnPerKm * terrainAt(state, hex).line;
  }
  return Math.round(cost);
}

/**
 * Lines a route leaves on one hex once the topology rule has cut it (01 §3.3,
 * 0.19): one where the route ends or merely passes, TWO on an object it crosses
 * — the piece coming in and the piece going out both end in that object. A hex
 * the route never touches holds none. Counted per visit, so a route that comes
 * back to a hex pays for it again.
 */
export function routeLinesAtHex(
  path: readonly HexCoord[],
  key: string,
  objectHexes: ReadonlySet<string>,
): number {
  let count = 0;
  path.forEach((hex, index) => {
    if (hexKey(hex) !== key) return;
    const crossing = index > 0 && index + 1 < path.length;
    count += crossing && objectHexes.has(key) ? 2 : 1;
  });
  return count;
}

/**
 * Lines already meeting a hex, counted the same way — this is both the corridor
 * counter (`type` narrows it; a line mid-upgrade answers to both, 01 §4.2) and
 * the line-slot counter of the object standing there. Lines under construction
 * count too: their ends are booked the moment the route is paid for.
 */
export function linesAtHex(
  state: GameState,
  key: string,
  objectHexes: ReadonlySet<string>,
  type?: LineType,
): number {
  let count = 0;
  for (const line of state.lines) {
    if (type !== undefined && !lineOccupiesType(line, type)) continue;
    count += routeLinesAtHex(line.path, key, objectHexes);
  }
  return count;
}

/** Line slots of the object on this hex — a junction station has double (01 §5.4). */
export function lineSlotsAt(state: GameState, key: string): number {
  return state.junctions.some((j) => hexKey(j.hex) === key)
    ? JUNCTION_SPEC.lineSlots
    : LINE_SLOTS_PER_OBJECT;
}

export function buildLine(state: GameState, lineType: LineType, path: HexCoord[]): GameState {
  if (path.length < 2) return state;
  // The whole route lies on the map (01 §3.1) — a detour off the grid is not a
  // shortcut but a broken route.
  for (const hex of path) {
    if (!isInsideMap(state.map, hex)) return state;
  }
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

  // Topology limits (01 §3.3): ≤9 lines of one type per hex; every line end at
  // an object's hex consumes one of its line slots — 6 for every object except
  // a junction station, which has 12 (01 §5.4). A route crossing an object is
  // cut on it and therefore books TWO of them (0.19).
  for (const hex of path) {
    const key = hexKey(hex);
    const adding = routeLinesAtHex(path, key, objectHexes);
    if (linesAtHex(state, key, objectHexes, lineType) + adding > MAX_LINES_PER_HEX_PER_TYPE) {
      return state;
    }
    if (
      objectHexes.has(key) &&
      linesAtHex(state, key, objectHexes) + adding > lineSlotsAt(state, key)
    ) {
      return state;
    }
  }

  const spec = LINE_TYPES[lineType];
  const cost = routeCapexPln(state, path, lineType);
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
        upgrade: null,
      },
    ],
  };
}

/**
 * What raising this line to `lineType` costs (01 §4.2, 0.17): 85% of a new line
 * of the target type on the same route, terrain multipliers included. Exported
 * so the interface can price the button off the engine's own arithmetic instead
 * of a copy that drifts.
 */
export function lineUpgradeCostPln(state: GameState, line: LineState, lineType: LineType): number {
  return Math.round(routeCapexPln(state, line.path, lineType) * EXPANSION.capexShare);
}

/** 70% of the target type's build time (01 §2.6, §4.2); at least one played block. */
export function lineUpgradeHours(line: LineState, lineType: LineType): number {
  const full = (line.path.length - 1) * LINE_TYPES[lineType].buildHoursPerHex;
  return Math.max(HOURS_PER_TURN, Math.round(full * EXPANSION.timeShare));
}

/** Types this line may still be raised to — strictly above its own (01 §4.2). */
export function lineUpgradeTargets(line: LineState): LineType[] {
  const order = LINE_TYPE_ORDER as readonly LineType[];
  return order.slice(order.indexOf(line.type) + 1);
}

/**
 * Raises a finished line to a higher type on the same route (01 §4.2, 0.17).
 * The line keeps carrying power on its OLD type for the whole job — the flow and
 * the fixed cost read `line.type`, which flips only when the last hour is worked
 * off in `resolveTurn`.
 */
export function upgradeLine(state: GameState, lineId: string, lineType: LineType): GameState {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return state;
  // A line still being strung up cannot be redesigned mid-build, and one raise
  // at a time: two overlapping raises would both charge and both flip the type.
  if (!isLineBuilt(line) || isLineUpgrading(line)) return state;
  if (!lineUpgradeTargets(line).includes(lineType)) return state;

  // The target type needs its own room in every corridor along the route. The
  // line's slot in the OLD counter is NOT released yet — it is still strung up —
  // so nothing frees early and nine parallel raises cannot overfill a corridor.
  const objectHexes = builtObjectHexKeys(state);
  for (const hex of line.path) {
    const key = hexKey(hex);
    const adding = routeLinesAtHex(line.path, key, objectHexes);
    if (linesAtHex(state, key, objectHexes, lineType) + adding > MAX_LINES_PER_HEX_PER_TYPE) {
      return state;
    }
  }

  const cost = lineUpgradeCostPln(state, line, lineType);
  if (state.moneyPln < cost) return state;
  return {
    ...state,
    moneyPln: state.moneyPln - cost,
    lines: state.lines.map((l) =>
      l.id === lineId
        ? {
            ...l,
            upgrade: { type: lineType, builtHours: 0, totalHours: lineUpgradeHours(l, lineType) },
          }
        : l,
    ),
  };
}

// --- Topology normalization (01 §3.3, 0.19) ---------------------------------
// A finished line never CROSSES an object: it is cut on it into two lines that
// both end in it. The object is then a node on the route in the state itself,
// not only in the flow graph (02 §2) — which is what "a passing line connects
// the object" means once the player can build on a standing corridor.

/** Interior hexes of a route that hold an object — where the line is cut. */
function cutIndices(path: readonly HexCoord[], objectHexes: ReadonlySet<string>): number[] {
  const cuts: number[] = [];
  for (let i = 1; i + 1 < path.length; i++) {
    const hex = path[i];
    if (hex && objectHexes.has(hexKey(hex))) cuts.push(i);
  }
  return cuts;
}

/**
 * A piece's share of a raise in progress: same target type, its own route's
 * hours, and the same fraction of them worked off — cutting a line neither
 * finishes nor restarts the job the player is paying for (01 §4.2).
 */
function splitUpgrade(upgrade: LineUpgrade, piece: LineState): LineUpgrade {
  const totalHours = lineUpgradeHours(piece, upgrade.type);
  const done = upgrade.totalHours > 0 ? upgrade.builtHours / upgrade.totalHours : 1;
  return {
    type: upgrade.type,
    builtHours: Math.min(totalHours, Math.round(totalHours * done)),
    totalHours,
  };
}

/**
 * Id of a piece cut off a line: the parent's id with a counter, taking the
 * first number nothing else in the state uses. Cutting a line is bookkeeping,
 * not a build, so it deliberately does NOT draw from `nextObjectId` — that
 * counter numbers what the player orders, and an action log that names an
 * object by id has to keep meaning the same object.
 */
function pieceId(baseId: string, taken: Set<string>): string {
  for (let n = 2; ; n++) {
    const id = `${baseId}#${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Cuts one finished line on every object along it. The first piece keeps the
 * line's id — from the player's side that corridor did not disappear, it only
 * got shorter — and the rest are numbered after it. Total route length, and
 * with it the total capex and the fixed cost, is unchanged: the object's hex
 * ends one piece and starts the next.
 */
function splitLine(
  line: LineState,
  objectHexes: ReadonlySet<string>,
  mintId: () => string,
): LineState[] {
  const cuts = cutIndices(line.path, objectHexes);
  if (cuts.length === 0) return [line];
  const bounds = [0, ...cuts, line.path.length - 1];
  const pieces: LineState[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const path = line.path.slice(bounds[i], (bounds[i + 1] ?? 0) + 1);
    // A route that visits the same hex twice would yield an empty piece; it is
    // not a line, and dropping it keeps every remaining piece a real route.
    if (path.length < 2) continue;
    const hours = (path.length - 1) * LINE_TYPES[line.type].buildHoursPerHex;
    const piece: LineState = {
      id: pieces.length === 0 ? line.id : mintId(),
      type: line.type,
      path,
      builtHours: hours,
      totalHours: hours,
      upgrade: null,
    };
    pieces.push(line.upgrade ? { ...piece, upgrade: splitUpgrade(line.upgrade, piece) } : piece);
  }
  return pieces;
}

/**
 * Restores the invariant over the whole state: no finished line runs through a
 * built object. Called after every resolved turn — a line that has just gone
 * live across an old object and an object that has just risen on an old
 * corridor both land here — and on a state loaded from an older save.
 *
 * Lines still under construction are left whole on purpose: they are one job
 * with one countdown until the day they go live, and cutting them early would
 * hand the player parallel crews and a shorter route (01 §2.6).
 */
export function splitLinesAtObjects(state: GameState): GameState {
  const objectHexes = builtObjectHexKeys(state);
  const taken = new Set(state.lines.map((line) => line.id));
  const lines: LineState[] = [];
  let cut = false;
  for (const line of state.lines) {
    if (!isLineBuilt(line)) {
      lines.push(line);
      continue;
    }
    const pieces = splitLine(line, objectHexes, () => {
      const id = pieceId(line.id, taken);
      taken.add(id);
      return id;
    });
    if (pieces.length !== 1) cut = true;
    lines.push(...pieces);
  }
  return cut ? { ...state, lines } : state;
}

// --- Expansion (01 §7, 02 §8.4) ---------------------------------------------
// Expansions target an object id, not a hex: the site is already taken and the
// object never grows beyond it. Every expansion is a separate queue entry with
// its own countdown, and everything already queued counts toward the site
// limit — otherwise the player could buy 6 blocks in one turn and pass the cap.

/**
 * 02 §8.4: 70% of a new site's build time, rounded UP to whole game days and
 * never below one — the countdown ticks once per day, so a day is the floor.
 */
function expansionDays(buildDays: number): number {
  return Math.max(1, Math.ceil(buildDays * EXPANSION.timeShare));
}

/** Sums a per-entry measure over the queue (e.g. MW already ordered for a farm). */
function pendingSum(state: GameState, measure: (pending: PendingObject) => number): number {
  let sum = 0;
  for (const construction of state.constructions) sum += measure(construction.pending);
  return sum;
}

/**
 * Charges an expansion (module price × terrain of the object's own hex — the
 * site is as awkward to build on as it was the first time) and queues it.
 */
function queueExpansion(
  state: GameState,
  baseCostPln: number,
  buildDays: number,
  hex: HexCoord,
  pending: PendingObject,
): GameState {
  const multiplier = terrainAt(state, hex).object;
  if (multiplier === null) return state;
  const cost = Math.round(baseCostPln * multiplier);
  if (state.moneyPln < cost) return state;
  const id = `obj-${state.nextObjectId}`;
  return {
    ...state,
    moneyPln: state.moneyPln - cost,
    nextObjectId: state.nextObjectId + 1,
    constructions: [...state.constructions, { id, remainingDays: buildDays, pending }],
  };
}

/** Adds one block to a plant — 6 blocks per hex (01 §7), 85% CAPEX / 70% time. */
export function expandPlant(state: GameState, plantId: string, capacityMw: number): GameState {
  const plant = state.plants.find((p) => p.id === plantId);
  if (!plant) return state;
  const spec = PLANT_TECHS[plant.tech];
  if (!Number.isFinite(capacityMw) || capacityMw <= 0 || capacityMw > spec.maxBlockMw) {
    return state;
  }
  const queued = pendingSum(state, (p) =>
    p.kind === "plantExpansion" && p.plantId === plantId ? 1 : 0,
  );
  if (plant.blocks + queued + 1 > MAX_PLANT_BLOCKS_PER_HEX) return state;
  return queueExpansion(
    state,
    capacityMw * spec.capexPlnPerMw * EXPANSION.capexShare,
    expansionDays(spec.buildDays),
    plant.hex,
    { kind: "plantExpansion", plantId, capacityMw },
  );
}

/** Adds capacity to a farm, up to the hex limit (wind 300 / PV 200 MW — 02 §8.4). */
export function expandFarm(state: GameState, farmId: string, capacityMw: number): GameState {
  const farm = state.farms.find((f) => f.id === farmId);
  if (!farm) return state;
  const spec = FARM_TECHS[farm.tech];
  if (!Number.isFinite(capacityMw) || capacityMw <= 0) return state;
  const queued = pendingSum(state, (p) =>
    p.kind === "farmExpansion" && p.farmId === farmId ? p.capacityMw : 0,
  );
  if (farm.capacityMw + queued + capacityMw > spec.maxMwPerHex) return state;
  return queueExpansion(
    state,
    capacityMw * spec.capexPlnPerMw * EXPANSION.capexShare,
    expansionDays(spec.buildDays),
    farm.hex,
    { kind: "farmExpansion", farmId, capacityMw },
  );
}

/**
 * Buys battery power and/or energy modules (02 §8.2). The doc's per-MW/per-MWh
 * prices are already module prices, so the 85% expansion discount does NOT
 * apply here — see EXPANSION in config.ts.
 */
export function expandBattery(
  state: GameState,
  storageId: string,
  powerMw: number,
  capacityMwh: number,
): GameState {
  const storage = state.storages.find((s) => s.id === storageId);
  if (!storage || storage.tech !== "battery") return state;
  if (!Number.isFinite(powerMw) || !Number.isFinite(capacityMwh)) return state;
  if (powerMw < 0 || capacityMwh < 0 || powerMw + capacityMwh <= 0) return state;
  const queuedPower = pendingSum(state, (p) =>
    p.kind === "batteryExpansion" && p.storageId === storageId ? p.powerMw : 0,
  );
  const queuedCapacity = pendingSum(state, (p) =>
    p.kind === "batteryExpansion" && p.storageId === storageId ? p.capacityMwh : 0,
  );
  if (storage.powerMw + queuedPower + powerMw > BATTERY.maxPowerMwPerHex) return state;
  if (storage.capacityMwh + queuedCapacity + capacityMwh > BATTERY.maxCapacityMwhPerHex) {
    return state;
  }
  return queueExpansion(
    state,
    powerMw * BATTERY.powerCapexPlnPerMw + capacityMwh * BATTERY.energyCapexPlnPerMwh,
    STORAGE_TECHS.battery.buildDays,
    storage.hex,
    { kind: "batteryExpansion", storageId, powerMw, capacityMwh },
  );
}

/** Blocks standing (and queued) on a pumped-storage site — 4 max (02 §8.2). */
function pumpedBlocks(powerMw: number): number {
  return Math.round(powerMw / PUMPED_BLOCK.powerMw);
}

/** Adds one 250 MW / 2 500 MWh block to a pumped storage, up to 4 (02 §8.2). */
export function expandPumpedStorage(state: GameState, storageId: string): GameState {
  const storage = state.storages.find((s) => s.id === storageId);
  if (!storage || storage.tech !== "pumped") return state;
  const queued = pendingSum(state, (p) =>
    p.kind === "pumpedExpansion" && p.storageId === storageId ? 1 : 0,
  );
  if (pumpedBlocks(storage.powerMw) + queued + 1 > PUMPED_BLOCK.maxBlocks) return state;
  return queueExpansion(state, PUMPED_BLOCK.capexPln, STORAGE_TECHS.pumped.buildDays, storage.hex, {
    kind: "pumpedExpansion",
    storageId,
  });
}

/** +500 MW of border capacity per module (01 §5.7); the doc sets no cap. */
export function expandBorder(state: GameState, borderId: string): GameState {
  const border = state.borders.find((b) => b.id === borderId);
  if (!border) return state;
  return queueExpansion(
    state,
    BORDER_SPEC.moduleCapexPln,
    BORDER_SPEC.moduleBuildDays,
    border.hex,
    { kind: "borderExpansion", borderId },
  );
}

// --- Cancelling (01 §2.6, §7) -----------------------------------------------
// "Rozpoczętej budowy nie da się bezkosztowo porzucić": the queue entry
// disappears and every zloty paid is gone. Finished objects and finished lines
// are not demolished — out of scope for the simplified game.

/** Drops a queued object or expansion; the money paid is forfeited (01 §2.6). */
export function cancelConstruction(state: GameState, constructionId: string): GameState {
  if (!state.constructions.some((c) => c.id === constructionId)) return state;
  return {
    ...state,
    constructions: state.constructions.filter((c) => c.id !== constructionId),
  };
}

/** Drops a line still under construction; a finished line cannot be removed. */
export function cancelLine(state: GameState, lineId: string): GameState {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line || isLineBuilt(line)) return state;
  return { ...state, lines: state.lines.filter((l) => l.id !== lineId) };
}

/**
 * Abandons a raise in progress (01 §2.6, §4.2): the line stays on its old type
 * and keeps working, the money is gone. The corridor slot the target type held
 * is released with it.
 */
export function cancelLineUpgrade(state: GameState, lineId: string): GameState {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line || !isLineUpgrading(line)) return state;
  return {
    ...state,
    lines: state.lines.map((l) => (l.id === lineId ? { ...l, upgrade: null } : l)),
  };
}

// --- Forecast systems (01 §2.4, 06 §8.6.3) ----------------------------------

/**
 * Buys a forecast system. Levels go one way only — the player never sells the
 * mesoscale model back. The purchase narrows every band from the next query on;
 * the monthly regime forecast follows from the next month (06 §8.4 pt 5).
 */
export function buyForecastSystem(state: GameState, level: ForecastLevel): GameState {
  const order = FORECAST_LEVEL_ORDER as readonly ForecastLevel[];
  const current = order.indexOf(state.forecastLevel);
  const target = order.indexOf(level);
  if (target < 0 || target <= current) return state;
  const cost = FORECAST_LEVELS[level].upgradeCostPln;
  if (state.moneyPln < cost) return state;
  return { ...state, moneyPln: state.moneyPln - cost, forecastLevel: level };
}

export function connectCity(state: GameState, cityId: string): GameState {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city || city.connected) return state;
  if (state.moneyPln < CITY_CONNECTION_COST_PLN) return state;
  const cityKey = hexKey(city.hex);
  const hasFinishedLine = state.lines.some(
    (line) => line.builtHours >= line.totalHours && line.path.some((h) => hexKey(h) === cityKey),
  );
  if (!hasFinishedLine) return state;
  return {
    ...state,
    moneyPln: state.moneyPln - CITY_CONNECTION_COST_PLN,
    cities: state.cities.map((c) =>
      c.id === cityId ? { ...c, connected: true, connectedSinceDay: state.calendar.dayIndex } : c,
    ),
  };
}
