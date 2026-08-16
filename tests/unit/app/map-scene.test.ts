// The map's scene model: what the renderer is handed. Snapshots cover the
// model, never the SVG (CLAUDE.md), and every number in it traces back to the
// engine — the design system only owns geometry and colour.

import { describe, expect, test } from "vitest";
import {
  DAY_WEIGHTS,
  MAP_V1,
  finishedLine,
  newGame,
  offsetToAxial,
  resolveTurn,
  type GameState,
  type HexCoord,
  type Scenario,
  type TerrainId,
  type TurnReport,
} from "../../../src/engine";
import { biomeLegend } from "../../../src/app/map/biomes";
import { drawnBounds } from "../../../src/app/map/geometry";
import { buildMapScene, lineLoad, type MapScene } from "../../../src/app/map/sceneModel";

/** Offset (col, row) → axial, the way a hand-authored map is written down. */
function at(col: number, row: number): HexCoord {
  return offsetToAxial({ col, row });
}

/** Terrain picture of the fixture, one string per offset row (as in mapV1). */
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

/**
 * A six-by-three board holding one of everything the map can draw: two cities
 * (one of each size class of 05 §5), a coal plant, a wind farm, a battery, a
 * junction, a border point, three finished lines and one still being built.
 */
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
      connected: true,
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
  junctions: [{ id: "junction-1", name: "Węzeł Centralny", hex: at(2, 1), throughputMw: 1000 }],
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
    finishedLine("line-4", "lv", [at(5, 0), at(4, 1)]),
    // Half-built (01 §2.6): 12 of 24 h done, so 1 game day still to go.
    {
      id: "line-5",
      type: "mv",
      path: [at(3, 2), at(4, 2), at(4, 1)],
      builtHours: 12,
      totalHours: 24,
    },
  ],
};

function emptyReport(overrides: Partial<TurnReport>): TurnReport {
  return {
    dayIndex: 0,
    turnIndex: 6,
    phase: "eveningPeak",
    dayType: "working",
    month: 0,
    regime: "transitional",
    dayWeight: DAY_WEIGHTS.working,
    totals: { demandMw: 0, deliveredMw: 0, ensMw: 0, lossesMw: 0, dumpMw: 0, resCurtailedMw: 0 },
    forecastMiss: {
      demand: { forecastMw: 0, bandMw: 0, actualMw: 0 },
      wind: { forecastMw: 0, bandMw: 0, actualMw: 0 },
      pv: { forecastMw: 0, bandMw: 0, actualMw: 0 },
    },
    cities: [],
    sources: [],
    storages: [],
    borders: [],
    segments: [],
    nodes: [],
    finance: {
      revenueEnergyPln: 0,
      revenueExportPln: 0,
      fuelCostPln: 0,
      importCostPln: 0,
      ensPenaltyPln: 0,
      dumpPenaltyPln: 0,
      fixedCostPln: 0,
      netPln: 0,
    },
    ...overrides,
  };
}

/** Report of the fixture's turn: one segment per tone, one city in deficit. */
const FIXTURE_REPORT = emptyReport({
  cities: [
    { cityId: "city-jasienica", demandMw: 95, deliveredMw: 95, ensMw: 0 },
    { cityId: "city-krasnow", demandMw: 300, deliveredMw: 240, ensMw: 60 },
  ],
  sources: [{ sourceId: "farm-1", kind: "farm", offeredMw: 320, usedMw: 320 }],
  nodes: [{ nodeId: "junction-1", usedMw: 870, throughputMw: 1000 }],
  segments: [
    // 800/1500 = 53% → ok.
    {
      segmentId: "line-1:0",
      lineId: "line-1",
      fromNodeId: "plant-1",
      toNodeId: "junction-1",
      fromIndex: 0,
      toIndex: 2,
      usedMw: 800,
      capacityMw: 1500,
    },
    // 120/150 = 80% → warn.
    {
      segmentId: "line-2:0",
      lineId: "line-2",
      fromNodeId: "junction-1",
      toNodeId: "city-jasienica",
      fromIndex: 0,
      toIndex: 2,
      usedMw: 120,
      capacityMw: 150,
    },
    // 500/500 → at the limit; this is the segment the callout names.
    {
      segmentId: "line-3:0",
      lineId: "line-3",
      fromNodeId: "farm-1",
      toNodeId: "junction-1",
      fromIndex: 0,
      toIndex: 2,
      usedMw: 500,
      capacityMw: 500,
    },
    // Connected, but nothing flowing → idle, dashed.
    {
      segmentId: "line-4:0",
      lineId: "line-4",
      fromNodeId: "border-1",
      toNodeId: "city-jasienica",
      fromIndex: 0,
      toIndex: 1,
      usedMw: 0,
      capacityMw: 150,
    },
  ],
});

/** The fixture with work in the queue: a new PV farm and a plant expansion. */
function fixtureState(): GameState {
  const base = newGame(11, FIXTURE);
  return {
    ...base,
    constructions: [
      {
        id: "obj-7",
        remainingDays: 2,
        pending: {
          kind: "farm",
          farm: {
            id: "obj-7",
            name: "PV Łęgi",
            hex: at(2, 2),
            tech: "pv",
            capacityMw: 150,
            enabled: true,
            windClass: "open",
            solarMultiplier: 1,
          },
        },
      },
      {
        id: "obj-8",
        remainingDays: 4,
        pending: { kind: "plantExpansion", plantId: "plant-1", capacityMw: 300 },
      },
    ],
  };
}

function labelOf(scene: MapScene, key: string): string | undefined {
  return scene.labels.find((label) => label.key === key)?.text;
}

describe("01 §8 pt 1: line load thresholds", () => {
  test.each([
    { usedMw: 0, capacityMw: 500, load: "idle" },
    { usedMw: 0.001, capacityMw: 500, load: "idle" },
    { usedMw: 100, capacityMw: 500, load: "ok" },
    { usedMw: 375, capacityMw: 500, load: "ok" }, // exactly 75% is still ok
    { usedMw: 375.5, capacityMw: 500, load: "warn" },
    { usedMw: 497, capacityMw: 500, load: "warn" },
    { usedMw: 497.5, capacityMw: 500, load: "over" }, // 99,5%
    { usedMw: 500, capacityMw: 500, load: "over" },
  ])("$usedMw of $capacityMw MW is $load", ({ usedMw, capacityMw, load }) => {
    expect(lineLoad(usedMw, capacityMw)).toBe(load);
  });
});

describe("02 §8.1: biome legend carries the engine's multipliers", () => {
  test("mountains ×2,5 and sea ×3,5 — not the handoff's stale ×2,2 / ×3,0", () => {
    const byBiome = new Map(biomeLegend().map((entry) => [entry.slug, entry.label]));
    expect(byBiome.get("gory")).toBe("góry ×2,5");
    expect(byBiome.get("morze")).toBe("morze ×3,5");
    expect(byBiome.get("nizina")).toBe("nizina ×1,0");
    expect(byBiome.get("jezioro")).toBe("jezioro ×2,5");
    expect(byBiome.get("miasto")).toBe("zurbaniz. ×2,0");
  });
});

describe("scene of a fresh game (no report yet)", () => {
  const scene = buildMapScene(newGame(11, FIXTURE), null, null);

  test("every hex of the board exists and carries a biome", () => {
    expect(scene.hexes).toHaveLength(6 * 3);
    expect(scene.world).toEqual({ width: 323, height: 206.5 });
    const biomes = new Set(scene.hexes.map((hex) => hex.biome));
    expect(biomes).toEqual(
      new Set(["nizina", "las", "bagno", "jezioro", "morze", "miasto", "wyzyna", "gory"]),
    );
  });

  test("nothing flows before the first resolution — every line is idle", () => {
    expect(scene.lines.flatMap((line) => line.segments).every((s) => s.load === "idle")).toBe(true);
    expect(scene.overload).toBeNull();
  });

  test("state-only numbers show; measured ones wait for the report", () => {
    expect(labelOf(scene, "plant-1:label")).toBe("EW WSCHODNIA WĘGIEL · 800/900");
    expect(labelOf(scene, "storage-1:label")).toBe("MAGAZYN POŁUDNIE BESS · −100 · SOC 62%");
    expect(labelOf(scene, "border-1:label")).toBe("GRANICA WSCHÓD · +100");
    // No flow measured yet: the name alone, never a made-up zero.
    expect(labelOf(scene, "junction-1:label")).toBe("WĘZEŁ CENTRALNY");
    expect(labelOf(scene, "farm-1:label")).toBe("FW GRZBIET WIATR");
    expect(labelOf(scene, "city-jasienica:label")).toBe("JASIENICA");
  });

  test("05 §5: the size class picks the city icon", () => {
    const byId = new Map(scene.objects.map((object) => [object.id, object]));
    expect(byId.get("city-jasienica")?.kind).toBe("city");
    expect(byId.get("city-krasnow")?.kind).toBe("town");
    expect(byId.get("city-jasienica")?.ring).toBe("city");
  });
});

describe("scene of a resolved turn", () => {
  const state = fixtureState();
  const scene = buildMapScene(state, FIXTURE_REPORT, at(2, 1));

  test("a segment's flow picks its tone; an unbuilt line stays dashed idle", () => {
    const loads = new Map(
      scene.lines.map((line) => [line.id, line.segments.map((segment) => segment.load)]),
    );
    expect(loads.get("line-1")).toEqual(["ok"]);
    expect(loads.get("line-2")).toEqual(["warn"]);
    expect(loads.get("line-3")).toEqual(["over"]);
    expect(loads.get("line-4")).toEqual(["idle"]);
    expect(loads.get("line-5")).toEqual(["idle"]);
    expect(scene.lines.find((line) => line.id === "line-5")?.planned).toBe(true);
  });

  test("the hottest segment gets the overload callout", () => {
    expect(scene.overload?.text).toBe("SN 500/500 ⚠");
  });

  test("01 §4.5: a city in deficit turns danger, the others stay city-toned", () => {
    const byId = new Map(scene.objects.map((object) => [object.id, object]));
    expect(byId.get("city-krasnow")?.ring).toBe("alert");
    expect(byId.get("city-jasienica")?.ring).toBe("city");
    const label = scene.labels.find((entry) => entry.key === "city-krasnow:label");
    expect(label?.tone).toBe("danger");
    expect(label?.text).toBe("KRASNÓW · 300 MW");
    expect(labelOf(scene, "city-jasienica:label")).toBe("JASIENICA · 95 MW");
  });

  test("measured labels follow the report", () => {
    expect(labelOf(scene, "farm-1:label")).toBe("FW GRZBIET WIATR · ~320");
    // Thousands take the copy rules' space separator, here and everywhere.
    expect(labelOf(scene, "junction-1:label")).toBe("WĘZEŁ CENTRALNY · 870/1 000");
  });

  test("01 §2.6: work in progress is drawn, never hidden", () => {
    const site = scene.objects.find((object) => object.id === "obj-7");
    expect(site).toMatchObject({ kind: "pv", ring: "planned" });
    expect(labelOf(scene, "obj-7:label")).toBe("BUDOWA · 2 DOBY");
    // An expansion has no site of its own — it annotates the object it grows.
    expect(labelOf(scene, "obj-8:build")).toBe("ROZBUDOWA · 4 DOBY");
    expect(labelOf(scene, "line-5:build")).toBe("BUDOWA · 1 DOBA");
  });

  test("the labels of edge objects reach outside the board", () => {
    // border-1 stands on the last column and the storage on the last row, so
    // what the map draws is wider and taller than the board it stands on.
    const drawn = drawnBounds(scene.world, scene.labels, scene.overload);
    expect(drawn.x + drawn.width).toBeGreaterThan(scene.world.width);
    expect(drawn.y + drawn.height).toBeGreaterThan(scene.world.height);
  });

  test("the selected hex is reported by key and by position", () => {
    const hex = at(2, 1);
    expect(scene.selection).toEqual({ key: `${hex.q},${hex.r}`, x: 136, y: 88.5 });
    // A hex outside the board is not a selection (01 §3.1).
    expect(buildMapScene(state, FIXTURE_REPORT, at(9, 9)).selection).toBeNull();
  });

  test("the whole scene model", () => {
    expect(scene).toMatchSnapshot();
  });
});

describe("02 §8.6: the played map", () => {
  test("the 24×16 board renders whole, on the design's geometry", () => {
    const scene = buildMapScene(newGame(1, MAP_V1), null, null);
    expect(scene.hexes).toHaveLength(24 * 16);
    expect(scene.world).toEqual({ width: 1241, height: 973.5 });
    expect(scene.objects).toHaveLength(MAP_V1.cities.length + MAP_V1.plants.length);
    expect(scene.scaleLabel).toBe("1 HEKS = 25 KM");
  });

  test("01 §3.4: the starting endowment, biome by biome", () => {
    const scene = buildMapScene(newGame(1, MAP_V1), null, null);
    const tally: Record<string, number> = {};
    for (const hex of scene.hexes) tally[hex.biome] = (tally[hex.biome] ?? 0) + 1;
    expect({
      tally,
      lines: scene.lines,
      objects: scene.objects,
      labels: scene.labels,
    }).toMatchSnapshot();
  });

  test("after one resolution the unfed city reads as a deficit", () => {
    const resolved = resolveTurn(newGame(1, MAP_V1));
    const scene = buildMapScene(resolved, resolved.lastTurnReport, null);
    const modrzyca = scene.objects.find((object) => object.id === "city-modrzyca");
    expect(modrzyca?.ring).toBe("alert");
    expect(labelOf(scene, "city-modrzyca:label")).toMatch(/^MODRZYCA · \d+ MW$/);
    // The start line feeds nothing, so it stays idle even after a resolution.
    expect(scene.lines[0]?.segments.map((segment) => segment.load)).toEqual(["idle"]);
  });
});
