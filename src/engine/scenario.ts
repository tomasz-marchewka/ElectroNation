// Scenario data: the map and starting endowment (01 §3.4). The default
// scenario is the minimal test map — the full 24×16 hand-designed v1 map
// (02 §8.6) lands as a separate scenario file once doc 07-adjacent map data is
// designed. City names are player-facing data, hence Polish.

import { LINE_TYPES, type TerrainId, type WindClass } from "./config";
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

export interface Scenario {
  startingMoneyPln: number;
  cities: CityState[];
  plants: PlantState[];
  farms: FarmState[];
  storages: StorageState[];
  junctions: JunctionState[];
  borders: BorderState[];
  lines: LineState[];
  /** Terrain per hex key ("q,r"); missing hexes are plains. */
  terrain?: Record<string, TerrainId>;
  /** Wind class per hex key; missing hexes are open terrain. */
  windClasses?: Record<string, WindClass>;
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
  return { id, type, path, builtHours: totalHours, totalHours };
}

/**
 * Minimal starting endowment per 01 §3.4: one mid-size CCGT, one finished MV
 * line and one small connected city; the remaining cities start unconnected.
 */
export const DEFAULT_SCENARIO: Scenario = {
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
  | "terrain"
  | "windClasses"
> {
  // Deep copy through JSON: scenarios are plain data and the copy guarantees
  // a fresh game never aliases scenario constants.
  return JSON.parse(
    JSON.stringify({
      moneyPln: scenario.startingMoneyPln,
      cities: scenario.cities,
      plants: scenario.plants,
      farms: scenario.farms,
      storages: scenario.storages,
      junctions: scenario.junctions,
      borders: scenario.borders,
      lines: scenario.lines,
      constructions: [],
      nextObjectId: 1,
      terrain: scenario.terrain ?? ({} as Record<string, TerrainId>),
      windClasses: scenario.windClasses ?? ({} as Record<string, WindClass>),
    }),
  ) as ReturnType<typeof scenarioToStateFields>;
}
