// App-side validation of build actions. The engine answers an illegal action
// with the state it was handed — silently and on purpose, so a replayed action
// log survives any UI bug (src/engine/build.ts). The interface therefore has to
// warn BEFORE the click: every rule below mirrors one in build.ts and exists
// only to word it. The engine stays the source of truth; nothing here decides
// anything, it only explains.
//
// Copy rule of the handoff: diagnosis, not alarm — a refusal names the number
// it refuses on and where that number comes from.

import {
  KM_PER_HEX,
  LINE_SLOTS_PER_OBJECT,
  LINE_TYPES,
  MAX_LINES_PER_HEX_PER_TYPE,
  TERRAIN,
  areNeighbors,
  hexKey,
  hexNeighbors,
  isInsideMap,
  isLineBuilt,
  lineUpgradeCostPln,
  type CityState,
  type GameState,
  type HexCoord,
  type LineState,
  type LineType,
  type PendingObject,
  type TerrainId,
} from "../engine";
import { formatMoneyPln, formatNumber } from "./format";
import { LINE_TYPE_LABELS, TERRAIN_NAMES } from "./labels";

/** A refusal the player can act on, or `null` when the action is allowed. */
export type Diagnosis = string | null;

/** Every refusal opens with the design system's own "no" glyph. */
const NO = "✕";

export function terrainAt(state: GameState, hex: HexCoord): TerrainId {
  return state.terrain[hexKey(hex)] ?? "plains";
}

/** Hex a queued item claims; expansions claim none — the object holds it. */
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

/** Hexes of finished objects — the only legal line endpoints and taps. */
export function objectHexKeys(state: GameState): Set<string> {
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

/** Finished objects plus the sites already claimed by the build queue. */
export function occupiedHexKeys(state: GameState): Set<string> {
  const keys = objectHexKeys(state);
  for (const construction of state.constructions) {
    const hex = pendingHex(construction.pending);
    if (hex) keys.add(hexKey(hex));
  }
  return keys;
}

/** Lines running through one hex, in total and per type (01 §3.3). */
export interface HexLineCount {
  total: number;
  byType: Record<LineType, number>;
}

/**
 * How many lines cross every hex of the map. Counted over ALL lines, finished
 * or not: a line under construction already holds its corridor and its slots
 * in the engine, so an unfinished route may not be double-booked. A line being
 * raised counts in BOTH type buckets — the old one is still strung up and the
 * target one is reserved (01 §4.2) — but only once in `total`, because the
 * number of lines tapping the object does not change.
 */
export function lineCensus(state: GameState): Map<string, HexLineCount> {
  const census = new Map<string, HexLineCount>();
  for (const line of state.lines) {
    // One line taps a hex once, however often its path revisits it.
    for (const key of new Set(line.path.map(hexKey))) {
      const entry = census.get(key) ?? { total: 0, byType: { lv: 0, mv: 0, hv: 0 } };
      entry.total += 1;
      entry.byType[line.type] += 1;
      if (line.upgrade) entry.byType[line.upgrade.type] += 1;
      census.set(key, entry);
    }
  }
  return census;
}

const NO_LINES: HexLineCount = { total: 0, byType: { lv: 0, mv: 0, hv: 0 } };

export function linesAt(census: Map<string, HexLineCount>, key: string): HexLineCount {
  return census.get(key) ?? NO_LINES;
}

/** Line slots of the object on a hex: 6, or a junction's own count (01 §5.4). */
export function lineSlotsAt(state: GameState, key: string): number {
  return (
    state.junctions.find((junction) => hexKey(junction.hex) === key)?.lineSlots ??
    LINE_SLOTS_PER_OBJECT
  );
}

// --- money ------------------------------------------------------------------

export function moneyNote(state: GameState, costPln: number): Diagnosis {
  if (state.moneyPln >= costPln) return null;
  return `${NO} brak środków — brakuje ${formatMoneyPln(costPln - state.moneyPln)}`;
}

// --- sites ------------------------------------------------------------------

/** Site rules every point object shares (01 §3.2, 02 §8.1, engine queueObject). */
export function siteNote(state: GameState, hex: HexCoord): Diagnosis {
  if (!isInsideMap(state.map, hex)) return `${NO} heks poza mapą`;
  const terrain = terrainAt(state, hex);
  if (TERRAIN[terrain].object === null) {
    return `${NO} budowa na wodzie niemożliwa (${TERRAIN_NAMES[terrain]})`;
  }
  if (occupiedHexKeys(state).has(hexKey(hex))) return `${NO} heks zajęty`;
  return null;
}

/** 01 §3.2: pumped storage takes elevation AND water next to it. */
export function pumpedSiteNote(state: GameState, hex: HexCoord): Diagnosis {
  const terrain = terrainAt(state, hex);
  if (terrain !== "mountains" && terrain !== "highlands") {
    return `${NO} wymaga gór lub wyżyny (jest ${TERRAIN_NAMES[terrain]})`;
  }
  const water = hexNeighbors(hex).some((neighbor) => {
    if (!isInsideMap(state.map, neighbor)) return false;
    const id = terrainAt(state, neighbor);
    return id === "lake" || id === "sea";
  });
  return water ? null : `${NO} wymaga wody w sąsiedztwie`;
}

/** 01 §5.7: an interconnector goes on a border site of the map or nowhere. */
export function borderSiteNote(state: GameState, hex: HexCoord): Diagnosis {
  const key = hexKey(hex);
  const site = state.borderSites.some((candidate) => hexKey(candidate) === key);
  return site ? null : `${NO} tylko w punkcie granicznym na krawędzi mapy`;
}

// --- limits -----------------------------------------------------------------

/**
 * Generic site-limit refusal: `✕ limit heksa: 6 bloków (jest 5, w budowie 1)`.
 * `standing` and `queued` are counted separately because the engine counts
 * both against the cap — ordering six blocks in one turn is not a loophole.
 */
export function limitNote(
  standing: number,
  queued: number,
  adding: number,
  limit: number,
  unit: string,
): Diagnosis {
  if (standing + queued + adding <= limit) return null;
  const queuedNote = queued > 0 ? `, w budowie ${formatNumber(queued)}` : "";
  return `${NO} limit heksa: ${formatNumber(limit)} ${unit} (jest ${formatNumber(standing)}${queuedNote})`;
}

// --- lines ------------------------------------------------------------------

/** Why a line of this type may not run through a hex (01 §3.3), or null. */
export function hexRouteNote(
  state: GameState,
  hex: HexCoord,
  lineType: LineType,
  census: Map<string, HexLineCount>,
  objects: Set<string>,
): Diagnosis {
  if (!isInsideMap(state.map, hex)) return `${NO} heks poza mapą`;
  const key = hexKey(hex);
  const counts = linesAt(census, key);
  if (counts.byType[lineType] + 1 > MAX_LINES_PER_HEX_PER_TYPE) {
    return `${NO} korytarz pełny — ${formatNumber(MAX_LINES_PER_HEX_PER_TYPE)} linii ${LINE_TYPE_LABELS[lineType]} przez heks`;
  }
  if (objects.has(key)) {
    const slots = lineSlotsAt(state, key);
    if (counts.total + 1 > slots) {
      return `${NO} brak wolnego przyłącza — ${formatNumber(counts.total)}/${formatNumber(slots)}`;
    }
  }
  return null;
}

/**
 * Why this line may not be raised to `lineType` (01 §4.2), or null. Mirrors
 * `upgradeLine`: the target type needs room in every corridor on the route, and
 * the raise is paid up front. The line's own slot stays in its OLD counter, so
 * the check is the same "+1" a fresh line would face.
 */
export function lineUpgradeNote(
  state: GameState,
  line: LineState,
  lineType: LineType,
): Diagnosis {
  const census = lineCensus(state);
  for (const key of new Set(line.path.map(hexKey))) {
    if (linesAt(census, key).byType[lineType] + 1 > MAX_LINES_PER_HEX_PER_TYPE) {
      return `${NO} korytarz pełny — ${formatNumber(MAX_LINES_PER_HEX_PER_TYPE)} linii ${LINE_TYPE_LABELS[lineType]} przez heks`;
    }
  }
  return moneyNote(state, lineUpgradeCostPln(state, line, lineType));
}

/** Cost of a whole route, exactly as the engine charges it (01 §4.2, 02 §8.1). */
export function routeCostPln(
  state: GameState,
  path: readonly HexCoord[],
  lineType: LineType,
): number {
  const spec = LINE_TYPES[lineType];
  let cost = 0;
  // The first hex is the object the line leaves — the engine charges from the
  // second one on, so a one-hex "route" costs nothing and is not a line.
  for (let i = 1; i < path.length; i++) {
    const hex = path[i];
    if (!hex) continue;
    cost += KM_PER_HEX * spec.capexPlnPerKm * TERRAIN[terrainAt(state, hex)].line;
  }
  return Math.round(cost);
}

/** Whole-route verdict: geometry, endpoints, per-hex rules, then money. */
export function routeNote(
  state: GameState,
  path: readonly HexCoord[],
  lineType: LineType,
): Diagnosis {
  if (path.length < 2) return `${NO} trasa musi łączyć dwa obiekty`;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b || !areNeighbors(a, b)) return `${NO} trasa musi biec po sąsiednich heksach`;
  }
  const objects = objectHexKeys(state);
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || !last) return `${NO} trasa musi łączyć dwa obiekty`;
  if (!objects.has(hexKey(first)) || !objects.has(hexKey(last))) {
    return `${NO} linia łączy obiekty — wskaż obiekt docelowy`;
  }
  const census = lineCensus(state);
  for (const hex of path) {
    const note = hexRouteNote(state, hex, lineType, census, objects);
    if (note !== null) return note;
  }
  return moneyNote(state, routeCostPln(state, path, lineType));
}

// --- acts -------------------------------------------------------------------

/** 01 §3.4: connecting a city takes a finished line at its hex and the fee. */
export function connectCityNote(state: GameState, city: CityState, feePln: number): Diagnosis {
  if (city.connected) return `${NO} miasto jest już przyłączone`;
  const key = hexKey(city.hex);
  const line = state.lines.some(
    (candidate) => isLineBuilt(candidate) && candidate.path.some((hex) => hexKey(hex) === key),
  );
  if (!line) return `${NO} brak ukończonej linii w heksie miasta`;
  return moneyNote(state, feePln);
}
