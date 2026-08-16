// Line-routing mode: what the player is currently drawing (01 §3.3, 02 §10
// pt 2). Pure state plus pure transitions — the store keeps the session, the
// panel renders it, the map paints its route, and nothing is decided anywhere
// else.
//
// The flow of the M7 brief: pick a type → hover the map for a live auto-route
// → click the target object to lock it → correct it by hand with waypoints →
// confirm. A waypoint is a stop the route must pass; clicking it again drops it.

import {
  HOURS_PER_TURN,
  KM_PER_HEX,
  LINE_TYPES,
  TURNS_PER_DAY,
  hexKey,
  type GameState,
  type HexCoord,
  type LineType,
} from "../../engine";
import { objectHexKeys, routeCostPln, routeNote, type Diagnosis } from "../validate";
import { findRouteThrough } from "./astar";

/** Build progress a line makes per game day: 8 turns × 3 h (01 §2.6). */
const BUILD_HOURS_PER_DAY = TURNS_PER_DAY * HOURS_PER_TURN;

export interface RoutingSession {
  /** Hex of the object the line leaves — the route's first stop. */
  from: HexCoord;
  lineType: LineType;
  /** Manual corrections, in route order (01 §3.3). */
  waypoints: HexCoord[];
  /** Target object, once clicked; until then the route follows the cursor. */
  target: HexCoord | null;
  /** Hex under the cursor — the provisional end of the previewed route. */
  hover: HexCoord | null;
}

export interface RoutePlan {
  path: HexCoord[];
  costPln: number;
  lengthKm: number;
  buildHours: number;
  buildDays: number;
  /** null when the engine would accept the route; the refusal otherwise. */
  note: Diagnosis;
}

/** 01 §4.2: the type a line starts as — the cheapest one, changed with a click. */
export const DEFAULT_LINE_TYPE: LineType = "lv";

export function startRouting(from: HexCoord, lineType = DEFAULT_LINE_TYPE): RoutingSession {
  return { from, lineType, waypoints: [], target: null, hover: null };
}

/** Where the previewed route ends: the locked target, else the cursor. */
export function routingEnd(session: RoutingSession): HexCoord | null {
  return session.target ?? session.hover;
}

/** Stops the route has to touch, in order. */
function stops(session: RoutingSession, end: HexCoord): HexCoord[] {
  return [session.from, ...session.waypoints, end];
}

/**
 * The route as it stands, priced and timed. `lineType` may differ from the
 * session's — the type table prices the same route in all three (01 §4.2).
 * Returns null while there is nothing to route to yet.
 */
export function planRoute(
  state: GameState,
  session: RoutingSession,
  lineType: LineType = session.lineType,
): RoutePlan | null {
  const end = routingEnd(session);
  if (!end) return null;
  const path = findRouteThrough(state, stops(session, end), lineType);
  if (!path) return null;
  const hexes = path.length - 1;
  const buildHours = hexes * LINE_TYPES[lineType].buildHoursPerHex;
  return {
    path,
    costPln: routeCostPln(state, path, lineType),
    lengthKm: hexes * KM_PER_HEX,
    buildHours,
    buildDays: Math.ceil(buildHours / BUILD_HOURS_PER_DAY),
    note: routeNote(state, path, lineType),
  };
}

/** Cursor moves only matter while the target is still open. */
export function hoverRouting(session: RoutingSession, hex: HexCoord | null): RoutingSession {
  if (session.target !== null) return session;
  return { ...session, hover: hex };
}

/**
 * Cheapest position for a new waypoint in the chain: the route is re-planned
 * with the stop inserted at every position and the cheapest one wins (ties keep
 * the earliest, so the answer is reproducible). An insertion that makes the
 * route impossible lands last — the player sees the diagnosis and can click it
 * away again.
 */
function insertWaypoint(state: GameState, session: RoutingSession, hex: HexCoord): HexCoord[] {
  const target = session.target;
  if (!target) return session.waypoints;
  let bestAt: number | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let at = 0; at <= session.waypoints.length; at++) {
    const waypoints = [...session.waypoints];
    waypoints.splice(at, 0, hex);
    const path = findRouteThrough(state, [session.from, ...waypoints, target], session.lineType);
    if (!path) continue;
    const cost = routeCostPln(state, path, session.lineType);
    if (cost < bestCost) {
      bestCost = cost;
      bestAt = at;
    }
  }
  const waypoints = [...session.waypoints];
  waypoints.splice(bestAt ?? waypoints.length, 0, hex);
  return waypoints;
}

/**
 * A click on the map while routing. Before the target is locked only an object
 * can be clicked (a line joins objects — 01 §3.3); afterwards a click adds or
 * removes a waypoint.
 */
export function applyRoutingClick(
  state: GameState,
  session: RoutingSession,
  hex: HexCoord,
): RoutingSession {
  const key = hexKey(hex);
  if (key === hexKey(session.from)) return session;
  if (session.target === null) {
    if (!objectHexKeys(state).has(key)) return session;
    return { ...session, target: hex, hover: null };
  }
  if (key === hexKey(session.target)) return session;
  const at = session.waypoints.findIndex((waypoint) => hexKey(waypoint) === key);
  if (at >= 0) {
    return { ...session, waypoints: session.waypoints.filter((_, index) => index !== at) };
  }
  return { ...session, waypoints: insertWaypoint(state, session, hex) };
}

/** Switching the type keeps the route — only its price and its time change. */
export function setRoutingType(session: RoutingSession, lineType: LineType): RoutingSession {
  return { ...session, lineType };
}
