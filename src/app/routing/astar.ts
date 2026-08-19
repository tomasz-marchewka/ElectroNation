// Auto-routing of a transmission line: A* over hex entry costs — the "najtańsza
// trasa" of 01 §3.3, spelled out as an algorithm in 02 §10 pt 2. Routing is an
// APP concern: the engine takes a finished hex chain and validates it, it never
// searches for one.
//
// Entering a hex costs exactly what the engine will charge for it (25 km ×
// zł/km × terrain multiplier — 01 §4.2, 02 §8.1), so the preview and the
// invoice are the same number. Water is passable (submarine cable, 02 §8.1
// decision 6); an object with no free line slot and a full corridor are not
// (01 §3.3) — those rules live in ../validate.ts, next to their wording.

import {
  KM_PER_HEX,
  LINE_TYPES,
  TERRAIN,
  hexKey,
  hexNeighbors,
  type GameState,
  type HexCoord,
  type LineType,
} from "../../engine";
import { hexRouteNote, lineCensus, objectHexKeys, terrainAt } from "../validate";

/** Cheapest terrain on the board — how optimistic the heuristic may be. */
const MIN_LINE_MULTIPLIER = Math.min(...Object.values(TERRAIN).map((terrain) => terrain.line));

/** What one more hex of line costs on this terrain [PLN] (01 §4.2, 02 §8.1). */
export function hexEntryCostPln(state: GameState, hex: HexCoord, lineType: LineType): number {
  return KM_PER_HEX * LINE_TYPES[lineType].capexPlnPerKm * TERRAIN[terrainAt(state, hex)].line;
}

/** Steps between two hexes on a hex grid — the axial distance (01 §3.1). */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

interface Frontier {
  key: string;
  hex: HexCoord;
  /** Cost so far plus the heuristic — the queue's ordering. */
  f: number;
}

/**
 * Frontier order: cheapest first, ties by hex key. The tie-break is what makes
 * the result reproducible — two routes of the same price must always resolve
 * to the same one, or the preview would flicker between them.
 */
function ahead(a: Frontier, b: Frontier): boolean {
  return a.f === b.f ? a.key < b.key : a.f < b.f;
}

function push(heap: Frontier[], node: Frontier): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = (index - 1) >> 1;
    const child = heap[index];
    const parent = heap[parentIndex];
    if (!child || !parent || !ahead(child, parent)) break;
    heap[index] = parent;
    heap[parentIndex] = child;
    index = parentIndex;
  }
}

function pop(heap: Frontier[]): Frontier | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (last === undefined || heap.length === 0) return top;
  heap[0] = last;
  let index = 0;
  for (;;) {
    let best = index;
    for (const child of [index * 2 + 1, index * 2 + 2]) {
      const candidate = heap[child];
      const incumbent = heap[best];
      if (candidate && incumbent && ahead(candidate, incumbent)) best = child;
    }
    if (best === index) break;
    const above = heap[index];
    const below = heap[best];
    if (!above || !below) break;
    heap[index] = below;
    heap[best] = above;
    index = best;
  }
  return top;
}

/**
 * Cheapest legal route between two hexes, endpoints included, or null when
 * none exists. Both ends have to be routable themselves: a target object with
 * every line slot taken cannot be reached at all (01 §3.3).
 */
export function findRoute(
  state: GameState,
  from: HexCoord,
  to: HexCoord,
  lineType: LineType,
): HexCoord[] | null {
  const census = lineCensus(state);
  const objects = objectHexKeys(state);
  // A leg ENDS on its two stops and crosses everything between them — and an
  // object crossed costs two line slots, not one (01 §3.3, 0.19).
  const passable = (hex: HexCoord, crossing: boolean): boolean =>
    hexRouteNote(state, hex, lineType, census, objects, crossing) === null;
  if (!passable(from, false) || !passable(to, false)) return null;

  const startKey = hexKey(from);
  const goalKey = hexKey(to);
  if (startKey === goalKey) return [from];

  // The heuristic prices the remaining steps at the cheapest terrain there is,
  // so it never overestimates — A* stays optimal.
  const stepFloor = KM_PER_HEX * LINE_TYPES[lineType].capexPlnPerKm * MIN_LINE_MULTIPLIER;
  const best = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, HexCoord>();
  const settled = new Set<string>();
  const heap: Frontier[] = [];
  push(heap, { key: startKey, hex: from, f: hexDistance(from, to) * stepFloor });

  for (;;) {
    const node = pop(heap);
    if (!node) return null;
    if (node.key === goalKey) break;
    if (settled.has(node.key)) continue;
    settled.add(node.key);
    const reached = best.get(node.key) ?? 0;
    for (const neighbor of hexNeighbors(node.hex)) {
      const key = hexKey(neighbor);
      if (settled.has(key) || !passable(neighbor, key !== goalKey)) continue;
      const cost = reached + hexEntryCostPln(state, neighbor, lineType);
      const known = best.get(key);
      // Strictly cheaper only: an equally priced detour never replaces the
      // route found first, which is what keeps ties reproducible.
      if (known !== undefined && known <= cost) continue;
      best.set(key, cost);
      cameFrom.set(key, node.hex);
      push(heap, { key, hex: neighbor, f: cost + hexDistance(neighbor, to) * stepFloor });
    }
  }

  const path: HexCoord[] = [to];
  let key = goalKey;
  while (key !== startKey) {
    const previous = cameFrom.get(key);
    if (!previous) return null;
    path.push(previous);
    key = hexKey(previous);
  }
  return path.reverse();
}

/**
 * Route through a chain of stops — the origin, the player's waypoints and the
 * target. A* runs per leg (01 §3.3: auto route, manual correction), so a
 * waypoint bends the route without throwing the rest of it away.
 */
export function findRouteThrough(
  state: GameState,
  stops: readonly HexCoord[],
  lineType: LineType,
): HexCoord[] | null {
  if (stops.length < 2) return null;
  const path: HexCoord[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    if (!from || !to) return null;
    const leg = findRoute(state, from, to, lineType);
    if (!leg) return null;
    // Legs share their joint hex — it belongs to the route exactly once.
    path.push(...(i === 0 ? leg : leg.slice(1)));
  }
  return path;
}
