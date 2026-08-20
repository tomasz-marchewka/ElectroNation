// Scenario data: the map and starting endowment (01 §3.4). The game's own
// scenario is the hand-designed 24×16 map v1 in mapV1.ts (02 §8.6); the
// minimal scenario below is the bare skeleton kept for tests and for anything
// that needs a map without geography. City names are player-facing, hence Polish.

import { LINE_TYPES, type TerrainId, type WindClass } from "./config";
import { DEFAULT_MAP_SIZE, type MapSize } from "./map";
import type { HexCoord } from "./network";
import type {
  BorderState,
  CityState,
  FarmState,
  GameState,
  JunctionState,
  LineState,
  PlantState,
  StorageState,
} from "./state";

/**
 * Fields a scenario may leave out because they follow from the object itself:
 * a scenario plant is one block unless it says otherwise.
 */
export type ScenarioPlant = Omit<PlantState, "blocks"> & { blocks?: number };

export interface Scenario {
  startingMoneyPln: number;
  cities: CityState[];
  plants: ScenarioPlant[];
  farms: FarmState[];
  storages: StorageState[];
  junctions: JunctionState[];
  borders: BorderState[];
  lines: LineState[];
  /** Map bounds (01 §3.1); missing = the small 24×16 grid of 02 §8.6. */
  map?: MapSize;
  /** Border points on the map edge (01 §5.7); missing = no trade sites. */
  borderSites?: HexCoord[];
  /** Terrain per hex key ("q,r"); missing hexes are plains. */
  terrain?: Record<string, TerrainId>;
  /** Wind class per hex key; missing hexes are open terrain. */
  windClasses?: Record<string, WindClass>;
  /** Insolation multiplier per hex key; missing hexes are 1.0. */
  solarMultipliers?: Record<string, number>;
}

function city(
  id: string,
  name: string,
  q: number,
  r: number,
  households: number,
  firms: number,
  connected: boolean,
): CityState {
  return {
    id,
    name,
    hex: { q, r },
    connected,
    households,
    firms,
    householdsStart: households,
    firmsStart: firms,
    connectedSinceDay: 0,
    monthDemandMwh: 0,
    monthDeliveredMwh: 0,
  };
}

/** A finished line for scenario data (built hours = total). */
export function finishedLine(
  id: string,
  type: LineState["type"],
  path: LineState["path"],
): LineState {
  const totalHours = (path.length - 1) * LINE_TYPES[type].buildHoursPerHex;
  return { id, type, path, builtHours: totalHours, totalHours, upgrade: null };
}

/**
 * Minimal starting endowment per 01 §3.4 on a featureless map: one mid-size
 * CCGT, one finished MV line and one small connected city; the remaining
 * cities start unconnected. The played scenario is MAP_V1.
 */
export const MINIMAL_SCENARIO: Scenario = {
  startingMoneyPln: 10_000_000_000,
  cities: [
    city("city-jasienica", "Jasienica", 6, 4, 80_000, 6_900, true),
    city("city-brzegowo", "Brzegowo", 10, 7, 120_000, 10_300, false),
    city("city-turow", "Turów", 2, 9, 60_000, 5_100, false),
  ],
  plants: [
    {
      id: "plant-start-ccgt",
      name: "EC Jasienica",
      hex: { q: 3, r: 4 },
      tech: "ccgt",
      capacityMw: 400,
      setpointMw: 0,
    },
  ],
  farms: [],
  storages: [],
  junctions: [],
  borders: [],
  lines: [
    finishedLine("line-start", "mv", [
      { q: 3, r: 4 },
      { q: 4, r: 4 },
      { q: 5, r: 4 },
      { q: 6, r: 4 },
    ]),
  ],
};

export function scenarioToStateFields(
  scenario: Scenario,
): Pick<
  GameState,
  | "moneyPln"
  | "cities"
  | "plants"
  | "farms"
  | "storages"
  | "junctions"
  | "borders"
  | "lines"
  | "constructions"
  | "nextObjectId"
  | "map"
  | "borderSites"
  | "terrain"
  | "windClasses"
  | "solarMultipliers"
> {
  // Deep copy through JSON: scenarios are plain data and the copy guarantees
  // a fresh game never aliases scenario constants.
  return JSON.parse(
    JSON.stringify({
      moneyPln: scenario.startingMoneyPln,
      cities: scenario.cities,
      plants: scenario.plants.map((plant) => ({ ...plant, blocks: plant.blocks ?? 1 })),
      farms: scenario.farms,
      storages: scenario.storages,
      junctions: scenario.junctions,
      borders: scenario.borders,
      lines: scenario.lines,
      constructions: [],
      nextObjectId: 1,
      map: scenario.map ?? DEFAULT_MAP_SIZE,
      borderSites: scenario.borderSites ?? [],
      terrain: scenario.terrain ?? ({} as Record<string, TerrainId>),
      windClasses: scenario.windClasses ?? ({} as Record<string, WindClass>),
      solarMultipliers: scenario.solarMultipliers ?? ({} as Record<string, number>),
    }),
  ) as ReturnType<typeof scenarioToStateFields>;
}
