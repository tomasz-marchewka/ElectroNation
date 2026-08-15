import { describe, expect, test } from "vitest";
import {
  MAP_V1,
  TERRAIN,
  applyAction,
  areNeighbors,
  axialToOffset,
  hexKey,
  isInsideMap,
  newGame,
  offsetToAxial,
  type GameState,
  type HexCoord,
} from "../../src/engine";

// The map is data, and this is its contract: 02 §8.6 (one hand-designed 24×16
// map, 8–12 cities, 2–4 border points, wind classes, a pumped-storage site),
// 01 §3.4 (the minimal endowment) and 05 §5 (city size classes). Editing the
// map by hand is expected; breaking these rules while doing it is not.

const state: GameState = newGame(1, MAP_V1);

const allHexes: HexCoord[] = [];
for (let col = 0; col < state.map.cols; col++) {
  for (let row = 0; row < state.map.rows; row++) allHexes.push(offsetToAxial({ col, row }));
}

const terrainAt = (hex: HexCoord) => state.terrain[hexKey(hex)];
const isWater = (hex: HexCoord) => terrainAt(hex) === "lake" || terrainAt(hex) === "sea";

/** 05 §5: the size class is derived from the two state variables. */
function sizeClass(households: number, firms: number): "small" | "medium" | "large" | "off" {
  if (households >= 57_000 && households <= 170_000 && firms >= 5_000 && firms <= 15_000) {
    return "small";
  }
  if (households > 170_000 && households <= 570_000 && firms > 15_000 && firms <= 49_000) {
    return "medium";
  }
  if (households > 570_000 && households <= 1_700_000 && firms > 49_000 && firms <= 147_000) {
    return "large";
  }
  return "off";
}

describe("doc 02 §8.6: the v1 map is a complete 24×16 country", () => {
  test("the grid is the small map and every hex of it has terrain", () => {
    expect(state.map).toEqual({ cols: 24, rows: 16 });
    for (const hex of allHexes) expect(terrainAt(hex)).toBeDefined();
    // Full coverage, and nothing outside the rectangle.
    expect(Object.keys(state.terrain)).toHaveLength(24 * 16);
    for (const key of Object.keys(state.terrain)) {
      const [q, r] = key.split(",").map(Number);
      expect(isInsideMap(state.map, { q: q ?? 0, r: r ?? 0 })).toBe(true);
    }
  });

  test("the geography has land, water and elevation", () => {
    const kinds = new Set(Object.values(state.terrain));
    for (const terrainId of [
      "plains",
      "forest",
      "swamp",
      "highlands",
      "mountains",
      "lake",
      "sea",
    ]) {
      expect(kinds).toContain(terrainId);
    }
  });

  test("8–12 cities, all classes represented, exactly one small city connected", () => {
    expect(state.cities.length).toBeGreaterThanOrEqual(8);
    expect(state.cities.length).toBeLessThanOrEqual(12);

    const classes = state.cities.map((c) => sizeClass(c.households, c.firms));
    expect(classes).not.toContain("off");
    expect(new Set(classes).size).toBe(3);

    const connected = state.cities.filter((c) => c.connected);
    expect(connected).toHaveLength(1);
    expect(sizeClass(connected[0]?.households ?? 0, connected[0]?.firms ?? 0)).toBe("small");
  });

  test("cities sit on urban ground, one city per hex", () => {
    const urbanHexes = allHexes.filter((hex) => terrainAt(hex) === "urban");
    expect(urbanHexes).toHaveLength(state.cities.length);
    for (const city of state.cities) expect(terrainAt(city.hex)).toBe("urban");
  });

  test("01 §5.7: 2–4 border points, on the map edge and on buildable ground", () => {
    expect(state.borderSites.length).toBeGreaterThanOrEqual(2);
    expect(state.borderSites.length).toBeLessThanOrEqual(4);
    for (const site of state.borderSites) {
      const { col, row } = axialToOffset(site);
      const onEdge =
        col === 0 || col === state.map.cols - 1 || row === 0 || row === state.map.rows - 1;
      expect(onEdge).toBe(true);
      expect(TERRAIN[terrainAt(site) ?? "plains"].object).not.toBeNull();
    }
  });

  test("06 §6.1: buildable ground offers a good, a bad and an average wind site", () => {
    const buildable = allHexes.filter((hex) => !isWater(hex));
    const classOf = (hex: HexCoord) => state.windClasses[hexKey(hex)] ?? "open";
    expect(buildable.some((hex) => classOf(hex) === "coastal" || classOf(hex) === "baltic")).toBe(
      true,
    );
    expect(buildable.some((hex) => classOf(hex) === "sheltered")).toBe(true);
    expect(buildable.some((hex) => classOf(hex) === "open")).toBe(true);
  });

  test("01 §3.2: insolation varies between 0.95 and 1.05", () => {
    const values = Object.values(state.solarMultipliers);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0.95);
      expect(value).toBeLessThanOrEqual(1.05);
    }
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  test("01 §3.2: the map offers a legal pumped-storage site", () => {
    const legal = allHexes.filter(
      (hex) => applyAction(state, { type: "buildPumpedStorage", hex }) !== state,
    );
    expect(legal.length).toBeGreaterThan(0);
  });
});

describe("doc 01 §3.4: the map ships the minimal endowment", () => {
  test("10 bn PLN, one 400 MW CCGT, one finished line into the connected city", () => {
    expect(state.moneyPln).toBe(10_000_000_000);
    expect(state.plants).toHaveLength(1);
    expect(state.plants[0]?.tech).toBe("ccgt");
    expect(state.plants[0]?.capacityMw).toBe(400);
    expect(state.farms).toHaveLength(0);
    expect(state.storages).toHaveLength(0);
    expect(state.borders).toHaveLength(0);
    expect(state.junctions).toHaveLength(0);

    expect(state.lines).toHaveLength(1);
    const line = state.lines[0];
    if (!line) throw new Error("map v1 must ship the starting line");
    expect(line.builtHours).toBe(line.totalHours);
    // The line is a valid chain from the plant to the connected city.
    for (let i = 0; i + 1 < line.path.length; i++) {
      expect(areNeighbors(line.path[i] as HexCoord, line.path[i + 1] as HexCoord)).toBe(true);
    }
    const ends = [line.path[0], line.path[line.path.length - 1]].map((hex) =>
      hexKey(hex as HexCoord),
    );
    expect(ends).toContain(hexKey(state.plants[0]?.hex as HexCoord));
    const connectedCity = state.cities.find((c) => c.connected);
    expect(ends).toContain(hexKey(connectedCity?.hex as HexCoord));
  });

  test("every object stands on the map, on ground that allows building", () => {
    const objects = [...state.cities, ...state.plants].map((o) => o.hex);
    for (const hex of [...objects, ...state.lines.flatMap((line) => line.path)]) {
      expect(isInsideMap(state.map, hex)).toBe(true);
    }
    for (const hex of objects) {
      expect(TERRAIN[terrainAt(hex) ?? "plains"].object).not.toBeNull();
    }
    const keys = objects.map(hexKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
