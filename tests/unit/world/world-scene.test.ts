// The 3D scene contract (src/world/bridge/worldScene.ts): what the renderer is
// handed. Snapshots cover the model, never pixels, and every number in it
// traces back to the engine — the same discipline as the SVG scene model.

import { describe, expect, test } from "vitest";
import {
  MAP_V1,
  applyAction,
  finishedLine,
  newGame,
  offsetToAxial,
  resolveTurn,
  type HexCoord,
  type Scenario,
  type TerrainId,
} from "../../../src/engine";
import { buildWorldScene, showcaseState, type WorldScene } from "../../../src/world/bridge";

function at(col: number, row: number): HexCoord {
  return offsetToAxial({ col, row });
}

const TERRAIN_ROWS = ["~.fsl.", "u..hum", "mf...u"] as const;
const TERRAIN_LETTERS: Record<string, TerrainId> = {
  ".": "plains",
  f: "forest",
  s: "swamp",
  h: "highlands",
  m: "mountains",
  u: "urban",
  l: "lake",
  "~": "sea",
};

function terrain(): Record<string, TerrainId> {
  const out: Record<string, TerrainId> = {};
  TERRAIN_ROWS.forEach((line, row) => {
    [...line].forEach((letter, col) => {
      const hex = at(col, row);
      out[`${hex.q},${hex.r}`] = TERRAIN_LETTERS[letter] ?? "plains";
    });
  });
  return out;
}

/** The six-by-three board of the SVG scene tests, one of everything on it. */
const FIXTURE: Scenario = {
  startingMoneyPln: 10_000_000_000,
  map: { cols: 6, rows: 3 },
  borderSites: [at(5, 0)],
  terrain: terrain(),
  cities: [
    {
      id: "city-jasienica",
      name: "Jasienica",
      hex: at(4, 1),
      connected: true,
      households: 620_000,
      firms: 53_300,
      householdsStart: 620_000,
      firmsStart: 53_300,
      connectedSinceDay: 0,
      monthDemandMwh: 0,
      monthDeliveredMwh: 0,
    },
    {
      id: "city-krasnow",
      name: "Krasnów",
      hex: at(5, 2),
      connected: false,
      households: 88_000,
      firms: 7_600,
      householdsStart: 88_000,
      firmsStart: 7_600,
      connectedSinceDay: 0,
      monthDemandMwh: 0,
      monthDeliveredMwh: 0,
    },
  ],
  plants: [
    {
      id: "plant-1",
      name: "EW Wschodnia",
      hex: at(0, 1),
      tech: "coal",
      capacityMw: 900,
      blocks: 2,
      automation: true,
      setpointMw: 800,
    },
  ],
  farms: [
    {
      id: "farm-1",
      name: "FW Grzbiet",
      hex: at(1, 0),
      tech: "wind",
      capacityMw: 300,
      enabled: true,
      windClass: "open",
      solarMultiplier: 1,
    },
  ],
  storages: [
    {
      id: "storage-1",
      name: "Magazyn Południe",
      hex: at(3, 2),
      tech: "battery",
      powerMw: 100,
      capacityMwh: 400,
      socMwh: 248,
      setpoint: { mode: "charge", mw: 100 },
    },
  ],
  junctions: [{ id: "junction-1", name: "Węzeł Centralny", hex: at(2, 1) }],
  borders: [
    {
      id: "border-1",
      name: "Granica Wschód",
      hex: at(5, 0),
      throughputMw: 500,
      importSetpointMw: 100,
      exportSetpointMw: 0,
    },
  ],
  lines: [
    finishedLine("line-1", "hv", [at(0, 1), at(1, 1), at(2, 1)]),
    finishedLine("line-2", "lv", [at(2, 1), at(3, 1), at(4, 1)]),
    finishedLine("line-3", "mv", [at(1, 0), at(2, 0), at(2, 1)]),
    // A second track in the corridor of line-2, so lanes have something to fan.
    finishedLine("line-4", "lv", [at(2, 1), at(3, 1), at(4, 1)]),
    {
      id: "line-5",
      type: "mv",
      path: [at(3, 2), at(4, 2), at(4, 1)],
      builtHours: 12,
      totalHours: 24,
      upgrade: null,
    },
  ],
};

function labelOf(scene: WorldScene, key: string): string | undefined {
  return scene.labels.find((label) => label.key === key)?.text;
}

describe("a fresh game shows the pending turn with no flows", () => {
  const state = newGame(11, FIXTURE);
  const scene = buildWorldScene(state, null, {});

  test("time and sun: NOC, 01:30, unresolved, January night", () => {
    expect(scene.time).toMatchObject({
      dayIndex: 0,
      turnIndex: 0,
      phase: "night",
      hour: 1.5,
      month: 0,
      resolved: false,
      year: 1,
    });
    expect(scene.sun.altitudeDeg).toBeLessThan(-20);
    expect(scene.sun.daylight).toBe(0);
  });

  test("every hex of the board exists with its terrain and flags", () => {
    expect(scene.board.hexes).toHaveLength(6 * 3);
    expect(scene.board.pitchKm).toBe(25);
    const byKey = new Map(scene.board.hexes.map((hex) => [hex.key, hex]));
    const sea = byKey.get(`${at(0, 0).q},${at(0, 0).r}`);
    expect(sea?.terrain).toBe("sea");
    expect(sea?.edge).toBe(true);
    // (1,0) is land next to the sea at (0,0): coastal and a shore.
    const coast = byKey.get(`${at(1, 0).q},${at(1, 0).r}`);
    expect(coast?.coastal).toBe(true);
    expect(coast?.shore).toBe(true);
    // (3,1) is highlands, but in odd-q the lake at (4,0) is not its neighbour:
    // no water next to it, so no pumped-storage site (01 §3.2).
    expect(byKey.get(`${at(3, 1).q},${at(3, 1).r}`)?.pumpedSite).toBe(false);
    expect(byKey.get(`${at(5, 0).q},${at(5, 0).r}`)?.borderSite).toBe(true);
  });

  test("lines: built ones idle, the unbuilt one has progress and no segments", () => {
    const byId = new Map(scene.lines.map((line) => [line.id, line]));
    expect(byId.get("line-1")?.segments.map((s) => s.load)).toEqual(["idle"]);
    expect(byId.get("line-5")).toMatchObject({ built: false, progress: 0.5, segments: [] });
    expect(labelOf(scene, "line-5:build")).toBe("BUDOWA · 1 DOBA");
  });

  test("two tracks in one corridor fan into two lanes", () => {
    const byId = new Map(scene.lines.map((line) => [line.id, line]));
    expect(byId.get("line-2")?.lanes).toEqual([
      { index: 0, count: 2 },
      { index: 0, count: 2 },
    ]);
    expect(byId.get("line-4")?.lanes).toEqual([
      { index: 1, count: 2 },
      { index: 1, count: 2 },
    ]);
    expect(byId.get("line-1")?.lanes).toEqual([
      { index: 0, count: 1 },
      { index: 0, count: 1 },
    ]);
  });

  test("cities: connected and unresolved is lit, off the grid is dark and muted", () => {
    const byId = new Map(scene.cities.map((city) => [city.id, city]));
    expect(byId.get("city-jasienica")).toMatchObject({
      lit: 1,
      sizeClass: "metro",
      blackout: false,
    });
    expect(byId.get("city-krasnow")).toMatchObject({ lit: 0, sizeClass: "town", connected: false });
    expect(scene.labels.find((label) => label.key === "city-krasnow:label")?.muted).toBe(true);
    expect(labelOf(scene, "city-jasienica:label")).toBe("JASIENICA");
  });

  test("state-only labels print exactly what the SVG map printed", () => {
    expect(labelOf(scene, "plant-1:label")).toBe("EW WSCHODNIA WĘGIEL · 800/900");
    expect(labelOf(scene, "storage-1:label")).toBe("MAGAZYN POŁUDNIE BESS · −100 · SOC 62%");
    expect(labelOf(scene, "border-1:label")).toBe("GRANICA WSCHÓD · +100");
    expect(labelOf(scene, "junction-1:label")).toBe("WĘZEŁ CENTRALNY");
    expect(labelOf(scene, "farm-1:label")).toBe("FW GRZBIET WIATR");
  });

  test("the whole scene model", () => {
    expect(scene).toMatchSnapshot();
  });
});

describe("a resolved turn", () => {
  const armed = applyAction(newGame(11, FIXTURE), {
    type: "setPlantSetpoint",
    plantId: "plant-1",
    mw: 800,
  });
  const resolved = resolveTurn(armed);
  const scene = buildWorldScene(resolved, resolved.lastTurnReport, { selected: at(2, 1) });

  test("shows the resolved turn, not the pending one", () => {
    expect(resolved.calendar.turnIndex).toBe(1);
    expect(scene.time).toMatchObject({ turnIndex: 0, resolved: true });
  });

  test("blocks carry their dynamics: a cold coal start makes nothing this turn", () => {
    const plant = scene.plants[0];
    expect(plant?.blocks.every((block) => block.status === "starting")).toBe(true);
    expect(plant?.outputMw).toBe(0);
    expect(plant?.blocks[0]?.warmup).toBeGreaterThan(0);
  });

  test("a starved city is dark, ringed and labelled with its shortfall", () => {
    const city = scene.cities.find((c) => c.id === "city-jasienica");
    expect(city?.blackout).toBe(true);
    expect(city?.lit).toBeLessThan(1);
    expect(labelOf(scene, "city-jasienica:label")).toMatch(/^JASIENICA · \d+ MW$/);
    expect(labelOf(scene, "city-jasienica:shortfall")).toMatch(/^−[\d ]+ MW ⚠$/);
  });

  test("the selected hex lands in the overlay", () => {
    expect(scene.overlay.selection).toEqual({ ...at(2, 1), key: `${at(2, 1).q},${at(2, 1).r}` });
    expect(
      buildWorldScene(resolved, resolved.lastTurnReport, { selected: at(9, 9) }).overlay.selection,
    ).toBeNull();
  });
});

describe("02 §8.6: the played map", () => {
  test("map v1 lays out 24×16 hexes on a 527 × 412 km board", () => {
    const scene = buildWorldScene(newGame(1, MAP_V1), null, {});
    expect(scene.board.hexes).toHaveLength(24 * 16);
    expect(Math.round(scene.board.widthKm)).toBe(527);
    expect(scene.board.depthKm).toBe(412.5);
    expect(scene.cities).toHaveLength(MAP_V1.cities.length);
    expect(scene.cities.filter((city) => city.connected)).toHaveLength(1);
    // The mountain lake of map v1: highlands at (2,12) touch the lake at (3,12).
    const kotlina = scene.board.hexes.find((hex) => hex.col === 2 && hex.row === 12);
    expect(kotlina?.pumpedSite).toBe(true);
    expect(scene.board.hexes.filter((hex) => hex.pumpedSite).length).toBeGreaterThan(1);
  });

  test("after the day rolls over the world still shows the old day's weather", () => {
    let state = newGame(1, MAP_V1);
    for (let turn = 0; turn < 8; turn++) state = resolveTurn(state);
    expect(state.calendar.dayIndex).toBe(1);
    const scene = buildWorldScene(state, state.lastTurnReport, {});
    expect(scene.time.dayIndex).toBe(0);
    expect(scene.time.turnIndex).toBe(7);
    expect(scene.time.hour).toBe(22.5);
  });
});

describe("the judging state", () => {
  test("midgame: mixed block states, a loaded trunk, offshore wind, pumped storage, dark cities, a site", () => {
    const state = showcaseState({ scenario: "midgame", seed: 20260902, dayIndex: 1, turnIndex: 7 });
    const scene = buildWorldScene(state, state.lastTurnReport, {});
    expect(scene.time).toMatchObject({
      dayIndex: 1,
      turnIndex: 6,
      phase: "eveningPeak",
      resolved: true,
    });
    const coal = scene.plants.find((plant) => plant.id === "plant-coal-legi");
    expect(coal?.blocks.map((block) => block.status)).toEqual(["online", "starting"]);
    expect(
      scene.plants.find((plant) => plant.id === "plant-nuclear-baltyk")?.outputMw,
    ).toBeGreaterThan(1_000);
    expect(scene.farms.find((farm) => farm.id === "farm-wind-baltyk")?.offshore).toBe(true);
    expect(scene.storages.find((storage) => storage.tech === "pumped")?.soc).toBeGreaterThan(0);
    expect(scene.cities.filter((city) => !city.connected).length).toBeGreaterThanOrEqual(3);
    expect(scene.sites.length).toBeGreaterThanOrEqual(1);
    expect(scene.lines.some((line) => line.upgrade !== null)).toBe(true);
    expect(scene.lines.some((line) => !line.built)).toBe(true);
    expect(
      scene.lines.some((line) => line.segments.some((segment) => segment.load !== "idle")),
    ).toBe(true);
    expect(
      scene.lines.some((line) => line.segments.some((segment) => segment.direction !== 0)),
    ).toBe(true);
  });
});
