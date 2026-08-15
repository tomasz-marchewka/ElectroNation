import { describe, expect, test } from "vitest";
import {
  DEFAULT_MAP_SIZE,
  applyAction,
  axialToOffset,
  hexKey,
  isInsideMap,
  newGame,
  offsetToAxial,
  type Action,
  type GameState,
  type Scenario,
} from "../../src/engine";

// Spec tests for the map model: docs/01 §3.1 (flat-top axial grid of a bounded
// size) and 02 §8.6 (v1 plays on one 24×16 map). Hexes outside the rectangle
// do not exist, so building there is a no-op like any other invalid action.

/** A 4×3 map with a plant in the top-left corner and a city two rows below. */
function makeScenario(): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    map: { cols: 4, rows: 3 },
    cities: [
      {
        id: "city-a",
        name: "A",
        hex: { q: 0, r: 2 },
        connected: true,
        households: 40_000,
        firms: 3_400,
        householdsStart: 40_000,
        firmsStart: 3_400,
        connectedSinceDay: 0,
        monthDemandMwh: 0,
        monthDeliveredMwh: 0,
      },
    ],
    plants: [
      {
        id: "plant-1",
        name: "P1",
        hex: { q: 0, r: 0 },
        tech: "ccgt",
        capacityMw: 400,
        setpointMw: 0,
      },
    ],
    farms: [],
    storages: [],
    junctions: [],
    borders: [],
    lines: [],
  };
}

const apply = (state: GameState, action: Action) => applyAction(state, action);

const buildAt = (state: GameState, q: number, r: number): GameState =>
  apply(state, { type: "buildPlant", tech: "ocgt", capacityMw: 50, hex: { q, r } });

describe("doc 01 §3.1: the grid is a bounded rectangle in offset coordinates", () => {
  test("axial ↔ offset (odd-q) is a bijection over the whole rectangle", () => {
    const keys = new Set<string>();
    for (let col = 0; col < DEFAULT_MAP_SIZE.cols; col++) {
      for (let row = 0; row < DEFAULT_MAP_SIZE.rows; row++) {
        const hex = offsetToAxial({ col, row });
        expect(axialToOffset(hex)).toEqual({ col, row });
        expect(isInsideMap(DEFAULT_MAP_SIZE, hex)).toBe(true);
        keys.add(hexKey(hex));
      }
    }
    expect(keys.size).toBe(DEFAULT_MAP_SIZE.cols * DEFAULT_MAP_SIZE.rows);
  });

  test("odd columns sit half a hex lower: row = r + floor(q / 2)", () => {
    expect(axialToOffset({ q: 0, r: 0 })).toEqual({ col: 0, row: 0 });
    expect(axialToOffset({ q: 1, r: 0 })).toEqual({ col: 1, row: 0 });
    expect(axialToOffset({ q: 2, r: 0 })).toEqual({ col: 2, row: 1 });
    expect(axialToOffset({ q: 3, r: -1 })).toEqual({ col: 3, row: 0 });
  });

  test("bounds are offset bounds, not axial ones", () => {
    const size = { cols: 4, rows: 3 };
    // Every corner of the rectangle is on the map…
    for (const corner of [
      { col: 0, row: 0 },
      { col: 3, row: 0 },
      { col: 0, row: 2 },
      { col: 3, row: 2 },
    ]) {
      expect(isInsideMap(size, offsetToAxial(corner))).toBe(true);
    }
    // …while (3,2) reads as in-range in axial but lands one row below it.
    expect(isInsideMap(size, { q: 3, r: 2 })).toBe(false);
    expect(isInsideMap(size, { q: -1, r: 0 })).toBe(false);
    expect(isInsideMap(size, { q: 4, r: -2 })).toBe(false);
    expect(isInsideMap(size, { q: 0, r: -1 })).toBe(false);
    expect(isInsideMap(size, { q: 0, r: 3 })).toBe(false);
    // Actions are plain JSON: fractional coordinates are nowhere.
    expect(isInsideMap(size, { q: 0.5, r: 1 })).toBe(false);
    expect(isInsideMap(size, { q: Number.NaN, r: 1 })).toBe(false);
  });

  test("02 §8.6: a fresh game plays on the 24×16 map, endowment included", () => {
    const state = newGame(3);
    expect(state.map).toEqual({ cols: 24, rows: 16 });
    const hexes = [
      ...state.cities.map((c) => c.hex),
      ...state.plants.map((p) => p.hex),
      ...state.lines.flatMap((line) => line.path),
    ];
    for (const hex of hexes) expect(isInsideMap(state.map, hex)).toBe(true);
  });
});

describe("doc 01 §3.1: building is confined to the map", () => {
  test("objects build on every edge of the map", () => {
    const base = newGame(3, makeScenario());
    // Top row, bottom row, left column, right column (offset coordinates).
    for (const hex of [
      { q: 2, r: -1 },
      { q: 2, r: 1 },
      { q: 0, r: 1 },
      { q: 3, r: 0 },
    ]) {
      const built = buildAt(base, hex.q, hex.r);
      expect(built.constructions).toHaveLength(1);
      expect(built.moneyPln).toBeLessThan(base.moneyPln);
    }
  });

  test("an object outside the map is a no-op", () => {
    const base = newGame(3, makeScenario());
    for (const hex of [
      { q: -1, r: 0 },
      { q: 4, r: -2 },
      { q: 0, r: -1 },
      { q: 0, r: 3 },
      { q: 3, r: 2 },
    ]) {
      expect(buildAt(base, hex.q, hex.r)).toBe(base);
    }
  });

  test("a line route may not leave the map, not even in passing", () => {
    const base = newGame(3, makeScenario());
    const onMap = apply(base, {
      type: "buildLine",
      lineType: "lv",
      path: [
        { q: 0, r: 0 },
        { q: 0, r: 1 },
        { q: 0, r: 2 },
      ],
    });
    expect(onMap.lines).toHaveLength(1);

    // Same endpoints, one step around the left edge of the map.
    const detour = apply(base, {
      type: "buildLine",
      lineType: "lv",
      path: [
        { q: 0, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
        { q: 0, r: 2 },
      ],
    });
    expect(detour).toBe(base);
  });
});
