// The hand-designed v1 map (02 §8.6): one small 24×16 grid, ten cities, three
// border points and the minimal endowment of 01 §3.4. It is DATA — the terrain
// is a picture of the country, one string per offset row, so it can be edited
// by hand; everything else is a table of hexes. City names are player-facing,
// hence Polish. No randomness here: the same map every game.
//
// Geography, north to south: the sea along the top edge with a bay, a coastal
// plain, lowlands with a lake district and swamps, forested central plains,
// a highland belt with a mountain lake (pumped storage — 01 §3.2) and the
// mountain range on the southern edge.

import type { TerrainId, WindClass } from "./config";
import { hexNeighbors, offsetToAxial, type MapSize } from "./map";
import { hexKey, type HexCoord } from "./network";
import { finishedLine, type Scenario } from "./scenario";
import type { CityState } from "./state";

const MAP: MapSize = { cols: 24, rows: 16 };

/** Terrain letters of the picture below. */
const TERRAIN_LEGEND: Record<string, TerrainId> = {
  ".": "plains",
  f: "forest",
  s: "swamp",
  h: "highlands",
  m: "mountains",
  u: "urban",
  l: "lake",
  "~": "sea",
};

/** One string per offset row, 24 columns each — the country itself. */
const TERRAIN_ROWS = [
  "~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~..~~~~~~~~~~~~...~~~~",
  "...u.....~~~~..u........",
  "..f...s..f....f.........",
  "..ff..ss.ff...f...u.....",
  "...ll..s..f....f........",
  "..u.l.....f....f...u....",
  "......f....u....f.......",
  "..f...ff......f....f....",
  "....u.....f.......u.....",
  "...f......h...f....h....",
  "..hhh....hh..u....hh....",
  ".hhllhh..hhh...u..hhh...",
  "hhmmmhhh.hhhh...hhhhh...",
  "mmmmmmmm.mmmm...mmmm....",
  "mmmmmmm..mmmmm..mmm.....",
] as const;

/**
 * Insolation multiplier per offset row (01 §3.2): a subtle north–south
 * gradient. Rows at 1.0 leave no entry — a missing hex means 1.0.
 */
const SOLAR_BY_ROW = [
  0.96, 0.96, 0.96, 0.97, 0.97, 0.98, 0.98, 1, 1, 1.01, 1.01, 1.02, 1.02, 1.04, 1.04, 1.04,
] as const;

/** Offset (col, row) → axial (q, r) — the map is authored as a rectangle. */
function at(col: number, row: number): HexCoord {
  return offsetToAxial({ col, row });
}

interface CityData {
  id: string;
  name: string;
  col: number;
  row: number;
  /** 05 §5: households and firms set the size class (small / medium / large). */
  households: number;
  firms: number;
  /** 01 §3.4: exactly one small city comes connected. */
  connected?: boolean;
}

const CITIES: CityData[] = [
  // Coast.
  { id: "city-nadmorze", name: "Nadmorze", col: 3, row: 2, households: 200_000, firms: 17_200 },
  { id: "city-solnica", name: "Solnica", col: 15, row: 2, households: 95_000, firms: 8_200 },
  // Lowlands.
  { id: "city-turow", name: "Turów", col: 2, row: 6, households: 70_000, firms: 6_000 },
  { id: "city-brzegowo", name: "Brzegowo", col: 18, row: 4, households: 120_000, firms: 10_300 },
  { id: "city-kamionka", name: "Kamionka", col: 19, row: 6, households: 240_000, firms: 20_600 },
  // Centre.
  { id: "city-jasienica", name: "Jasienica", col: 11, row: 7, households: 620_000, firms: 53_300 },
  {
    id: "city-modrzyca",
    name: "Modrzyca",
    col: 4,
    row: 9,
    households: 62_000,
    firms: 5_300,
    connected: true,
  },
  { id: "city-wierzbnik", name: "Wierzbnik", col: 18, row: 9, households: 180_000, firms: 15_500 },
  // Highlands.
  { id: "city-zalesie", name: "Zalesie", col: 13, row: 11, households: 88_000, firms: 7_600 },
  { id: "city-bystrzyca", name: "Bystrzyca", col: 15, row: 12, households: 110_000, firms: 9_500 },
];

/** 01 §5.7: border points sit on the map edge, on buildable ground. */
const BORDER_SITES: HexCoord[] = [at(0, 7), at(23, 9), at(20, 15)];

function buildTerrain(): Record<string, TerrainId> {
  const terrain: Record<string, TerrainId> = {};
  TERRAIN_ROWS.forEach((line, row) => {
    if (line.length !== MAP.cols) {
      throw new Error(`map v1: row ${row} has ${line.length} columns, expected ${MAP.cols}`);
    }
    for (let col = 0; col < line.length; col++) {
      const terrainId = TERRAIN_LEGEND[line[col] ?? ""];
      if (terrainId === undefined) {
        throw new Error(`map v1: unknown terrain letter "${line[col]}" at ${col},${row}`);
      }
      terrain[hexKey(at(col, row))] = terrainId;
    }
  });
  return terrain;
}

/**
 * 06 §6.1 location classes follow the relief: the sea is Baltic, land touching
 * it is coastal (exposure beats everything, so a shore hex stays coastal even
 * if it is elevated), the mountain valleys are sheltered, and the rest of the
 * country is open (no entry). Wind siting is therefore a real choice — the
 * mountains are for pumped storage and PV, not for turbines.
 */
function buildWindClasses(terrain: Record<string, TerrainId>): Record<string, WindClass> {
  const windClasses: Record<string, WindClass> = {};
  for (let col = 0; col < MAP.cols; col++) {
    for (let row = 0; row < MAP.rows; row++) {
      const hex = at(col, row);
      const key = hexKey(hex);
      if (terrain[key] === "sea") {
        windClasses[key] = "baltic";
      } else if (hexNeighbors(hex).some((n) => terrain[hexKey(n)] === "sea")) {
        windClasses[key] = "coastal";
      } else if (terrain[key] === "mountains") {
        windClasses[key] = "sheltered";
      }
    }
  }
  return windClasses;
}

function buildSolarMultipliers(terrain: Record<string, TerrainId>): Record<string, number> {
  const solarMultipliers: Record<string, number> = {};
  for (let col = 0; col < MAP.cols; col++) {
    for (let row = 0; row < MAP.rows; row++) {
      const multiplier = SOLAR_BY_ROW[row] ?? 1;
      const key = hexKey(at(col, row));
      // Water carries no PV, so it carries no multiplier either.
      if (multiplier === 1 || terrain[key] === "lake" || terrain[key] === "sea") continue;
      solarMultipliers[key] = multiplier;
    }
  }
  return solarMultipliers;
}

function toCityState(city: CityData): CityState {
  return {
    id: city.id,
    name: city.name,
    hex: at(city.col, city.row),
    connected: city.connected === true,
    households: city.households,
    firms: city.firms,
    householdsStart: city.households,
    firmsStart: city.firms,
    connectedSinceDay: 0,
    monthDemandMwh: 0,
    monthDeliveredMwh: 0,
  };
}

const TERRAIN_BY_HEX = buildTerrain();

/**
 * The default scenario of the game (02 §8.6). The endowment of 01 §3.4 — a
 * 400 MW CCGT, a finished MV line and the connected small city of Modrzyca —
 * is free, on top of the 10 bn PLN of starting capital.
 */
export const MAP_V1: Scenario = {
  startingMoneyPln: 10_000_000_000,
  map: MAP,
  borderSites: BORDER_SITES,
  terrain: TERRAIN_BY_HEX,
  windClasses: buildWindClasses(TERRAIN_BY_HEX),
  solarMultipliers: buildSolarMultipliers(TERRAIN_BY_HEX),
  cities: CITIES.map(toCityState),
  plants: [
    {
      id: "plant-start-ccgt",
      name: "EC Modrzyca",
      hex: at(1, 9),
      tech: "ccgt",
      capacityMw: 400,
      // Four SMALL blocks (01 §3.4 in 0.27) — one block's minimum (30 MW) fits
      // the starting city's night valley.
      blocks: 4,
      setpointMw: 0,
    },
  ],
  farms: [],
  storages: [],
  junctions: [],
  borders: [],
  lines: [finishedLine("line-start", "mv", [at(1, 9), at(2, 9), at(3, 9), at(4, 9)])],
};
