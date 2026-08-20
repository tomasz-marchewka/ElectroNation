// Line routing in the app layer (01 §3.3, 02 §10 pt 2): the auto-route, its
// refusals and the manual correction on top of it. The engine never routes —
// so the last test here is the one that matters most: what A* produced is a
// chain the engine accepts, not a drawing.

import { describe, expect, test } from "vitest";
import {
  LINE_TYPES,
  MAP_V1,
  MAX_LINES_PER_HEX_PER_TYPE,
  applyAction,
  hexKey,
  isInsideMap,
  newGame,
  offsetToAxial,
  type GameState,
  type HexCoord,
  type LineState,
  type LineType,
  type Scenario,
  type TerrainId,
} from "../../../src/engine";
import { findRoute, findRouteThrough, hexDistance } from "../../../src/app/routing/astar";
import {
  applyRoutingClick,
  hoverRouting,
  planRoute,
  startRouting,
} from "../../../src/app/routing/session";
import { routeCostPln, routeNote, terrainAt } from "../../../src/app/validate";
import { makeScenario } from "../../helpers/scenario";

/** Offset (col, row) → axial, the way a hand-authored map is written down. */
function at(col: number, row: number): HexCoord {
  return offsetToAxial({ col, row });
}

const TERRAIN_LETTERS: Record<string, TerrainId> = {
  ".": "plains",
  m: "mountains",
  l: "lake",
};

function terrainOf(rows: readonly string[]): Record<string, TerrainId> {
  const terrain: Record<string, TerrainId> = {};
  rows.forEach((line, row) => {
    [...line].forEach((letter, col) => {
      terrain[hexKey(at(col, row))] = TERRAIN_LETTERS[letter] ?? "plains";
    });
  });
  return terrain;
}

/**
 * A world of pure geography: two objects and terrain between them. The line
 * slots and corridors are exercised separately, with synthetic lines.
 */
function world(rows: readonly string[], from: HexCoord, to: HexCoord, lines: LineState[] = []) {
  const cols = rows[0]?.length ?? 0;
  const scenario: Scenario = makeScenario({
    map: { cols, rows: rows.length },
    terrain: terrainOf(rows),
    plants: [
      { id: "plant-1", name: "P1", hex: from, tech: "ccgt", capacityMw: 400, setpointMw: 0 },
    ],
    cities: [
      {
        id: "city-a",
        name: "A",
        hex: to,
        connected: false,
        households: 80_000,
        firms: 6_900,
        householdsStart: 80_000,
        firmsStart: 6_900,
        connectedSinceDay: 0,
        monthDemandMwh: 0,
        monthDeliveredMwh: 0,
      },
    ],
    lines,
  });
  return newGame(1, scenario);
}

/** A line that exists only to occupy a hex's corridor or an object's slot. */
function occupying(id: string, type: LineType, hex: HexCoord): LineState {
  return { id, type, path: [hex], builtHours: 0, totalHours: 0, upgrade: null };
}

/** A line that CROSSES a hex — two ends on the object standing there (0.19). */
function crossing(id: string, type: LineType, path: HexCoord[]): LineState {
  return { id, type, path, builtHours: 0, totalHours: 0, upgrade: null };
}

/** A one-row corridor with an ordinary object in the middle: 6 line slots. */
function corridorWithObject(lines: LineState[]): GameState {
  const state = world(["....."], at(0, 0), at(4, 0), lines);
  return {
    ...state,
    storages: [
      {
        id: "battery-1",
        name: "B",
        hex: at(2, 0),
        tech: "battery",
        powerMw: 50,
        capacityMwh: 100,
        socMwh: 0,
        setpoint: { mode: "idle", mw: 0 },
      },
    ],
  };
}

/** The same corridor with a junction station in the middle: 12 slots (0.21). */
function corridorWithJunction(lines: LineState[]): GameState {
  const state = world(["....."], at(0, 0), at(4, 0), lines);
  return {
    ...state,
    junctions: [{ id: "junction-1", name: "J", hex: at(2, 0) }],
  };
}

function terrainsOn(state: GameState, path: readonly HexCoord[]): TerrainId[] {
  return path.map((hex) => terrainAt(state, hex));
}

describe("auto route — cheapest chain of hexes (01 §3.3, 02 §10 pt 2)", () => {
  // A mountain block hanging off the top edge: crossing it costs 2,5 per hex
  // (02 §8.1), dipping under it costs a few plains hexes at 1,0.
  const MOUNTAIN_WALL = ["..mmmm..", "..mmmm..", "........", "........"] as const;

  test("goes around the mountains when the detour is cheaper", () => {
    const state = world(MOUNTAIN_WALL, at(0, 0), at(7, 0));
    const path = findRoute(state, at(0, 0), at(7, 0), "mv");

    expect(path).not.toBeNull();
    expect(terrainsOn(state, path ?? [])).not.toContain("mountains");
    // Cheaper than the shortest way, which is what the detour buys.
    const straight = findRouteThrough(state, [at(0, 0), at(3, 0), at(7, 0)], "mv");
    expect(terrainsOn(state, straight ?? [])).toContain("mountains");
    expect(routeCostPln(state, path ?? [], "mv")).toBeLessThan(
      routeCostPln(state, straight ?? [], "mv"),
    );
  });

  // A lake belt across the map with dry land only at the far left column: the
  // cable costs ×2,5 for one hex, walking around it costs a dozen at ×1,0.
  const LAKE_BELT = [
    "........",
    "........",
    "........",
    ".lllllll",
    "........",
    "........",
  ] as const;

  test("takes the water when the cable beats the way around (02 §8.1 pt 6)", () => {
    const state = world(LAKE_BELT, at(4, 1), at(4, 5));
    const path = findRoute(state, at(4, 1), at(4, 5), "mv");

    expect(path).not.toBeNull();
    expect(terrainsOn(state, path ?? [])).toContain("lake");
    const around = findRouteThrough(state, [at(4, 1), at(0, 3), at(4, 5)], "mv");
    expect(terrainsOn(state, around ?? [])).not.toContain("lake");
    expect(routeCostPln(state, path ?? [], "mv")).toBeLessThan(
      routeCostPln(state, around ?? [], "mv"),
    );
  });

  test("every step of the route is a neighbour of the last, and stays on the map", () => {
    const state = world(MOUNTAIN_WALL, at(0, 0), at(7, 0));
    const path = findRoute(state, at(0, 0), at(7, 0), "hv") ?? [];

    expect(path[0]).toEqual(at(0, 0));
    expect(path[path.length - 1]).toEqual(at(7, 0));
    for (const hex of path) expect(isInsideMap(state.map, hex)).toBe(true);
    for (let i = 0; i + 1 < path.length; i++) {
      expect(hexDistance(path[i] as HexCoord, path[i + 1] as HexCoord)).toBe(1);
    }
  });

  test("a tie resolves the same way every time (stable tie-breaks)", () => {
    // Featureless plains: dozens of routes of exactly the same price.
    const flat = ["........", "........", "........", "........"] as const;
    const first = findRoute(world(flat, at(0, 0), at(7, 3)), at(0, 0), at(7, 3), "mv");
    const second = findRoute(world(flat, at(0, 0), at(7, 3)), at(0, 0), at(7, 3), "mv");

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });
});

describe("routing refusals mirror the engine (01 §3.3)", () => {
  /** A one-row map is a corridor: every route has to use every hex of it. */
  const CORRIDOR = ["....."] as const;

  test("a full corridor stops that type of line, not the others", () => {
    const packed = Array.from({ length: MAX_LINES_PER_HEX_PER_TYPE }, (_, index) =>
      occupying(`lv-${index}`, "lv", at(2, 0)),
    );
    const state = world(CORRIDOR, at(0, 0), at(4, 0), packed);

    expect(findRoute(state, at(0, 0), at(4, 0), "lv")).toBeNull();
    expect(findRoute(state, at(0, 0), at(4, 0), "mv")).not.toBeNull();
  });

  test("an object with every line slot taken cannot be reached", () => {
    const taken = Array.from({ length: 6 }, (_, index) => occupying(`mv-${index}`, "mv", at(4, 0)));
    const state = world(CORRIDOR, at(0, 0), at(4, 0), taken);

    expect(findRoute(state, at(0, 0), at(4, 0), "mv")).toBeNull();
  });

  test("crossing an object costs two of its slots, ending on it one (0.19)", () => {
    // A route through the object is cut on it and books two slots; four are
    // already taken, so one crossing still fits and a fifth stub kills it.
    const stubs = (count: number) =>
      Array.from({ length: count }, (_, index) => occupying(`mv-${index}`, "mv", at(2, 0)));
    const through = [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)];

    expect(routeNote(corridorWithObject(stubs(4)), through, "mv")).toBeNull();

    const full = corridorWithObject(stubs(5));
    expect(routeNote(full, through, "mv")).toContain("brak wolnych przyłączy");
    // Ending on the object still fits: one end, one slot.
    expect(routeNote(full, [at(0, 0), at(1, 0), at(2, 0)], "mv")).toBeNull();
  });

  test("a route already crossing an object holds both of its slots", () => {
    // Two crossings = four slots, one stub = five; a third crossing would need
    // two more and is refused, while a route ending on the object takes the last.
    const state = corridorWithObject([
      crossing("mv-cross-1", "mv", [at(1, 0), at(2, 0), at(3, 0)]),
      crossing("mv-cross-2", "mv", [at(1, 0), at(2, 0), at(3, 0)]),
      occupying("mv-stub", "mv", at(2, 0)),
    ]);

    expect(routeNote(state, [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)], "mv")).toContain(
      "brak wolnych przyłączy",
    );
    expect(routeNote(state, [at(0, 0), at(1, 0), at(2, 0)], "mv")).toBeNull();
  });

  test("doc 01 §5.4 (0.21): a junction station gives the corridor 12 slots", () => {
    // The same arithmetic on a station: ten slots taken still leave room for a
    // crossing (two more), eleven do not. Types are mixed so the ≤9-per-hex
    // corridor limit never fires before the slot limit (01 §3.3).
    const stubs = (mv: number, lv: number) => [
      ...Array.from({ length: mv }, (_, i) => occupying(`mv-${i}`, "mv", at(2, 0))),
      ...Array.from({ length: lv }, (_, i) => occupying(`lv-${i}`, "lv", at(2, 0))),
    ];
    const through = [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)];

    expect(routeNote(corridorWithJunction(stubs(6, 4)), through, "mv")).toBeNull();

    const full = corridorWithJunction(stubs(6, 5));
    expect(routeNote(full, through, "mv")).toContain("brak wolnych przyłączy");
    expect(routeNote(full, [at(0, 0), at(1, 0), at(2, 0)], "mv")).toBeNull();
  });
});

describe("manual correction — waypoints (01 §3.3)", () => {
  const MOUNTAIN_WALL = ["..mmmm..", "..mmmm..", "........", "........"] as const;

  test("a waypoint bends the route through the hex the player picked", () => {
    const state = world(MOUNTAIN_WALL, at(0, 0), at(7, 0));
    const straight = findRoute(state, at(0, 0), at(7, 0), "mv") ?? [];
    const bent = findRouteThrough(state, [at(0, 0), at(3, 3), at(7, 0)], "mv") ?? [];

    expect(bent.map(hexKey)).toContain(hexKey(at(3, 3)));
    expect(straight.map(hexKey)).not.toContain(hexKey(at(3, 3)));
    // Bending a cheapest route can only make it dearer.
    expect(routeCostPln(state, bent, "mv")).toBeGreaterThan(routeCostPln(state, straight, "mv"));
  });

  test("the session locks onto an object, then adds and drops waypoints", () => {
    const state = world(MOUNTAIN_WALL, at(0, 0), at(7, 0));
    const opened = hoverRouting(startRouting(at(0, 0), "mv"), at(4, 2));
    expect(planRoute(state, opened)?.path.at(-1)).toEqual(at(4, 2));

    // Only an object closes the route (a line joins objects).
    const ignored = applyRoutingClick(state, opened, at(4, 2));
    expect(ignored.target).toBeNull();

    const locked = applyRoutingClick(state, opened, at(7, 0));
    expect(locked.target).toEqual(at(7, 0));

    const bent = applyRoutingClick(state, locked, at(3, 3));
    expect(bent.waypoints).toEqual([at(3, 3)]);
    expect(planRoute(state, bent)?.path.map(hexKey)).toContain(hexKey(at(3, 3)));

    const straightened = applyRoutingClick(state, bent, at(3, 3));
    expect(straightened.waypoints).toEqual([]);
  });

  test("the plan prices and times the route the way the engine will (01 §2.6)", () => {
    const state = world(MOUNTAIN_WALL, at(0, 0), at(7, 0));
    const session = applyRoutingClick(state, startRouting(at(0, 0), "hv"), at(7, 0));
    const plan = planRoute(state, session);

    if (!plan) throw new Error("a route between two objects must exist here");
    expect(plan.costPln).toBe(routeCostPln(state, plan.path, "hv"));
    expect(plan.buildHours).toBe((plan.path.length - 1) * LINE_TYPES.hv.buildHoursPerHex);
    expect(plan.note).toBeNull();
  });
});

describe("integration — the engine accepts what the app routed (map v1)", () => {
  test("buildLine on an A* route is not a no-op", () => {
    const state = newGame(1, MAP_V1);
    const from = state.plants[0]?.hex;
    const to = state.cities.find((city) => city.id === "city-turow")?.hex;
    if (!from || !to) throw new Error("map v1 ships a starting plant and Turów");

    const path = findRoute(state, from, to, "mv");
    if (!path) throw new Error("map v1 has a route between the plant and Turów");
    expect(routeNote(state, path, "mv")).toBeNull();

    const after = applyAction(state, { type: "buildLine", lineType: "mv", path });
    expect(after).not.toBe(state);
    expect(after.lines).toHaveLength(state.lines.length + 1);
    expect(state.moneyPln - after.moneyPln).toBe(routeCostPln(state, path, "mv"));
    // The engine stored the route it was handed, hex for hex.
    expect(after.lines[after.lines.length - 1]?.path).toEqual(path);
  });
});
