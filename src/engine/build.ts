// Build actions per docs/01 §2.6, §3.3–§3.4, §7 and 02 §8: payment up front
// (CAPEX × terrain multiplier), objects appear after a countdown in game days,
// lines progress 3 h per resolved turn. Expanding an existing object follows
// the same path but targets an object id instead of a hex (01 §7 — expansion
// never leaves the hex). Cancelling forfeits everything paid (01 §2.6).
// Invalid actions are a no-op — the action log stays replayable regardless of
// UI bugs.

import {
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
  STORAGE_TECHS,
  TERRAIN,
  farmSiting,
  farmSizeMw,
  plantBlockMw,
  storageCapacityMwh,
  storagePowerMw,
  type BuildSize,
  type FarmTech,
  type ForecastLevel,
  type LineType,
  type PlantTech,
  type StorageTech,
  type TerrainId,
} from "./config";
import { newBlock } from "./dispatch";
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

function terrainIdAt(state: GameState, hex: HexCoord): TerrainId {
  return state.terrain[hexKey(hex)] ?? "plains";
}

function terrainAt(state: GameState, hex: HexCoord) {
  return TERRAIN[terrainIdAt(state, hex)];
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

/** Hexes of completed objects only — what cuts a line in two and taps it. */
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
 * Where a line may END (01 §3.3 in 0.23): completed objects AND sites still
 * under construction. Running the spur while the object is being raised is the
 * whole point — an object that arrives with nowhere to send its power is dead
 * weight, and since 0.23 a farm in that state would also owe the surplus
 * penalty (§4.1). Slots are booked here and not when the object lands, so a
 * site cannot collect more line ends than the object will have slots for.
 */
export function lineEndpointHexKeys(state: GameState): Set<string> {
  const keys = builtObjectHexKeys(state);
  for (const construction of state.constructions) {
    const hex = pendingHex(construction.pending);
    if (hex) keys.add(hexKey(hex));
  }
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
  /**
   * CAPEX multiplier of the site. Defaults to the terrain's object column —
   * only a wind farm passes its own, because the sea carries turbines and
   * nothing else (01 §3.2, 02 §8.1 in 0.22).
   */
  siteMultiplier: number | null = terrainAt(state, hex).object,
): GameState {
  if (!isInsideMap(state.map, hex)) return state;
  if (siteMultiplier === null) return state;
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
  const cost = Math.round(baseCostPln * siteMultiplier);
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

/**
 * 01 §5.1 (0.24): a block comes in one of four sizes and no other — the MW is
 * the technology's, not the player's, so the action names a rung.
 */
export function buildPlant(
  state: GameState,
  tech: PlantTech,
  size: BuildSize,
  hex: HexCoord,
): GameState {
  const spec = PLANT_TECHS[tech];
  const capacityMw = plantBlockMw(tech, size);
  if (capacityMw === null) return state;
  return queueObject(state, capacityMw * spec.capexPlnPerMw, spec.buildDays, hex, (id) => ({
    kind: "plant",
    // The block lands cold and offline (01 §5.1 in 0.27).
    plant: { id, name: id, hex, tech, capacityMw, blocks: [newBlock(capacityMw)], setpointMw: 0 },
  }));
}

export function buildFarm(
  state: GameState,
  tech: FarmTech,
  size: BuildSize,
  hex: HexCoord,
): GameState {
  // 01 §5.2, 02 §8.1, §8.4 (0.22): the SITE sets the price, the hex cap and the
  // countdown. A wind farm at sea is the same technology as on land — the water
  // just fits twice as much of it and takes twice as long to build on.
  //
  // The SIZE, by contrast, is the technology's (01 §5.2 in 0.26): the sea does
  // not sell bigger farms, it just holds two extra-large ones.
  const site = farmSiting(tech, terrainIdAt(state, hex));
  const capacityMw = farmSizeMw(tech, size);
  if (capacityMw === null || capacityMw > site.maxMwPerHex) return state;
  // Location properties are frozen at build time (01 §3.2), like the wind class.
  const windClass = state.windClasses[hexKey(hex)] ?? "open";
  const solarMultiplier = state.solarMultipliers[hexKey(hex)] ?? 1;
  return queueObject(
    state,
    capacityMw * FARM_TECHS[tech].capexPlnPerMw,
    site.buildDays,
    hex,
    (id) => ({
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
    }),
    LINE_SLOTS_PER_OBJECT,
    site.multiplier,
  );
}

/**
 * 01 §5.3 (0.26): one build for both storage technologies, because since 0.26
 * they have the same shape — power and capacity are two independent axes, each
 * ordered from its own four-rung ladder. Pumped storage is no longer a fixed
 * block: 250 MW / 2 500 MWh is simply its MEDIUM/MEDIUM order.
 */
export function buildStorage(
  state: GameState,
  tech: StorageTech,
  powerSize: BuildSize,
  capacitySize: BuildSize,
  hex: HexCoord,
): GameState {
  const spec = STORAGE_TECHS[tech];
  const powerMw = storagePowerMw(tech, powerSize);
  const capacityMwh = storageCapacityMwh(tech, capacitySize);
  if (powerMw === null || capacityMwh === null) return state;
  if (powerMw > spec.maxPowerMwPerHex || capacityMwh > spec.maxCapacityMwhPerHex) return state;
  // 01 §3.2, 02 §8.1: pumped storage stands only on mountains or highlands with
  // water next to them — elevation for the head, a lake or the sea to pump from.
  if (tech === "pumped") {
    const terrainId = terrainIdAt(state, hex);
    if (terrainId !== "mountains" && terrainId !== "highlands") return state;
    if (!hasWaterNeighbor(state, hex)) return state;
  }
  const cost = powerMw * spec.powerCapexPlnPerMw + capacityMwh * spec.energyCapexPlnPerMwh;
  return queueObject(state, cost, spec.buildDays, hex, (id) => ({
    kind: "storage",
    storage: {
      id,
      name: id,
      hex,
      tech,
      powerMw,
      capacityMwh,
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

/**
 * Line slots of the object on this hex — a junction station has double
 * (01 §5.4). A junction still under construction counts as one already: since
 * 0.23 lines may end on a building site, and the site has to promise the slots
 * the finished station will actually have.
 */
export function lineSlotsAt(state: GameState, key: string): number {
  const junction =
    state.junctions.some((j) => hexKey(j.hex) === key) ||
    state.constructions.some(
      (construction) =>
        construction.pending.kind === "junction" &&
        hexKey(construction.pending.junction.hex) === key,
    );
  return junction ? JUNCTION_SPEC.lineSlots : LINE_SLOTS_PER_OBJECT;
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
  // Endpoints and slot accounting run on sites too, not just finished objects
  // (01 §3.3 in 0.23) — a spur may be strung to an object still being raised.
  const objectHexes = lineEndpointHexKeys(state);
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
  siteMultiplier: number | null = terrainAt(state, hex).object,
): GameState {
  if (siteMultiplier === null) return state;
  const cost = Math.round(baseCostPln * siteMultiplier);
  if (state.moneyPln < cost) return state;
  const id = `obj-${state.nextObjectId}`;
  return {
    ...state,
    moneyPln: state.moneyPln - cost,
    nextObjectId: state.nextObjectId + 1,
    constructions: [...state.constructions, { id, remainingDays: buildDays, pending }],
  };
}

/**
 * Adds one block to a plant — 6 blocks per hex (01 §7), 85% CAPEX / 70% time.
 * The new block is sized from the same four-rung catalogue as a new site
 * (01 §5.1 in 0.24); it need not match the blocks already standing here.
 */
export function expandPlant(state: GameState, plantId: string, size: BuildSize): GameState {
  const plant = state.plants.find((p) => p.id === plantId);
  if (!plant) return state;
  const spec = PLANT_TECHS[plant.tech];
  const capacityMw = plantBlockMw(plant.tech, size);
  if (capacityMw === null) return state;
  const queued = pendingSum(state, (p) =>
    p.kind === "plantExpansion" && p.plantId === plantId ? 1 : 0,
  );
  if (plant.blocks.length + queued + 1 > MAX_PLANT_BLOCKS_PER_HEX) return state;
  return queueExpansion(
    state,
    capacityMw * spec.capexPlnPerMw * EXPANSION.capexShare,
    expansionDays(spec.buildDays),
    plant.hex,
    { kind: "plantExpansion", plantId, capacityMw },
  );
}

/**
 * Adds capacity to a farm, up to the hex limit (02 §8.4: wind 300 MW on land,
 * 600 MW at sea, PV 200 MW). Cap, price and countdown are all read from the hex
 * the farm already stands on — expanding offshore is 85%/70% of an offshore
 * site, not of a land one (01 §7 in 0.22).
 */
export function expandFarm(state: GameState, farmId: string, size: BuildSize): GameState {
  const farm = state.farms.find((f) => f.id === farmId);
  if (!farm) return state;
  const site = farmSiting(farm.tech, terrainIdAt(state, farm.hex));
  const capacityMw = farmSizeMw(farm.tech, size);
  if (capacityMw === null) return state;
  const queued = pendingSum(state, (p) =>
    p.kind === "farmExpansion" && p.farmId === farmId ? p.capacityMw : 0,
  );
  if (farm.capacityMw + queued + capacityMw > site.maxMwPerHex) return state;
  return queueExpansion(
    state,
    capacityMw * FARM_TECHS[farm.tech].capexPlnPerMw * EXPANSION.capexShare,
    expansionDays(site.buildDays),
    farm.hex,
    { kind: "farmExpansion", farmId, capacityMw },
    site.multiplier,
  );
}

/**
 * 01 §5.3, §7 (0.26): storage grows along two axes and they are two separate
 * acts — buying MW never buys MWh. Both technologies use the same pair of
 * actions; what differs is the ladder and the price per unit. The doc prints
 * these prices per MW and per MWh directly, so they are already module prices
 * and the 85% expansion discount does NOT apply — see EXPANSION in config.ts.
 */
export function expandStoragePower(
  state: GameState,
  storageId: string,
  size: BuildSize,
): GameState {
  const storage = state.storages.find((s) => s.id === storageId);
  if (!storage) return state;
  const spec = STORAGE_TECHS[storage.tech];
  const powerMw = storagePowerMw(storage.tech, size);
  if (powerMw === null) return state;
  const queued = pendingSum(state, (p) =>
    p.kind === "storagePowerExpansion" && p.storageId === storageId ? p.powerMw : 0,
  );
  if (storage.powerMw + queued + powerMw > spec.maxPowerMwPerHex) return state;
  return queueExpansion(state, powerMw * spec.powerCapexPlnPerMw, spec.buildDays, storage.hex, {
    kind: "storagePowerExpansion",
    storageId,
    powerMw,
  });
}

/** The capacity axis of {@link expandStoragePower} — same rules, other unit. */
export function expandStorageCapacity(
  state: GameState,
  storageId: string,
  size: BuildSize,
): GameState {
  const storage = state.storages.find((s) => s.id === storageId);
  if (!storage) return state;
  const spec = STORAGE_TECHS[storage.tech];
  const capacityMwh = storageCapacityMwh(storage.tech, size);
  if (capacityMwh === null) return state;
  const queued = pendingSum(state, (p) =>
    p.kind === "storageCapacityExpansion" && p.storageId === storageId ? p.capacityMwh : 0,
  );
  if (storage.capacityMwh + queued + capacityMwh > spec.maxCapacityMwhPerHex) return state;
  return queueExpansion(
    state,
    capacityMwh * spec.energyCapexPlnPerMwh,
    spec.buildDays,
    storage.hex,
    { kind: "storageCapacityExpansion", storageId, capacityMwh },
  );
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
