import { describe, expect, test } from "vitest";
import {
  KM_PER_HEX,
  LINE_TYPES,
  applyAction,
  hexKey,
  newGame,
  offsetToAxial,
  type Action,
  type GameState,
  type Scenario,
} from "../../src/engine";

// Terrain is not decoration: it multiplies what building costs (02 §8.1),
// refuses objects on water, and gates pumped storage on elevation next to
// water (01 §3.2). Border connections only go where the map has a border
// point (01 §5.7).

/** The map is authored in offset coordinates — so are these fixtures. */
const at = (col: number, row: number) => offsetToAxial({ col, row });
const key = (col: number, row: number) => hexKey(at(col, row));

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    map: { cols: 8, rows: 4 },
    cities: [
      {
        id: "city-a",
        name: "A",
        hex: at(2, 0),
        connected: true,
        households: 60_000,
        firms: 5_200,
        householdsStart: 60_000,
        firmsStart: 5_200,
        connectedSinceDay: 0,
        monthDemandMwh: 0,
        monthDeliveredMwh: 0,
      },
    ],
    plants: [
      {
        id: "plant-1",
        name: "P1",
        hex: at(0, 0),
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
    ...overrides,
  };
}

const apply = (state: GameState, action: Action) => applyAction(state, action);

/** plant (0,0) → (1,0) → city (2,0): the middle hex is the one under test. */
const CROSSING: Action = {
  type: "buildLine",
  lineType: "lv",
  path: [at(0, 0), at(1, 0), at(2, 0)],
};

function lineCost(state: GameState, action: Action): number {
  const after = apply(state, action);
  expect(after).not.toBe(state);
  return state.moneyPln - after.moneyPln;
}

describe("doc 02 §8.1: terrain multiplies what a route costs", () => {
  const stepPln = KM_PER_HEX * LINE_TYPES.lv.capexPlnPerKm;

  test("a line may cross water — at 2.5× over a lake and 3.5× over the sea", () => {
    const overPlains = newGame(5, makeScenario());
    expect(lineCost(overPlains, CROSSING)).toBe(Math.round(2 * stepPln));

    const overLake = newGame(5, makeScenario({ terrain: { [key(1, 0)]: "lake" } }));
    expect(lineCost(overLake, CROSSING)).toBe(Math.round(stepPln * 2.5 + stepPln));

    const overSea = newGame(5, makeScenario({ terrain: { [key(1, 0)]: "sea" } }));
    expect(lineCost(overSea, CROSSING)).toBe(Math.round(stepPln * 3.5 + stepPln));
  });

  test("no object stands on water", () => {
    for (const terrainId of ["lake", "sea"] as const) {
      const state = newGame(5, makeScenario({ terrain: { [key(1, 0)]: terrainId } }));
      expect(
        apply(state, { type: "buildPlant", tech: "ocgt", capacityMw: 50, hex: at(1, 0) }),
      ).toBe(state);
      expect(
        apply(state, { type: "buildFarm", tech: "pv", capacityMw: 50, hex: at(1, 0) }),
      ).toBe(state);
    }
  });
});

describe("doc 01 §3.2: pumped storage needs elevation AND water next to it", () => {
  const site = at(3, 2);
  const SITE_KEY = key(3, 2);
  /** One of the six neighbors of the site. */
  const NEIGHBOR_KEY = key(4, 2);
  const build: Action = { type: "buildPumpedStorage", hex: site };

  test("mountains with no water in reach are refused", () => {
    const state = newGame(5, makeScenario({ terrain: { [SITE_KEY]: "mountains" } }));
    expect(apply(state, build)).toBe(state);
  });

  test("plains next to a lake are refused as well", () => {
    const state = newGame(
      5,
      makeScenario({ terrain: { [NEIGHBOR_KEY]: "lake" } }),
    );
    expect(apply(state, build)).toBe(state);
  });

  test("mountains next to a lake, and highlands next to the sea, are legal", () => {
    const byLake = newGame(
      5,
      makeScenario({
        terrain: {
          [SITE_KEY]: "mountains",
          [NEIGHBOR_KEY]: "lake",
        },
      }),
    );
    const built = apply(byLake, build);
    expect(built.constructions).toHaveLength(1);

    const bySea = newGame(
      5,
      makeScenario({
        terrain: {
          [SITE_KEY]: "highlands",
          [NEIGHBOR_KEY]: "sea",
        },
      }),
    );
    expect(apply(bySea, build).constructions).toHaveLength(1);
  });

  test("water outside the map does not count", () => {
    // (7,3) sits in the map corner; its off-map neighbors are nothing at all.
    const corner = at(7, 3);
    const state = newGame(
      5,
      makeScenario({
        terrain: {
          [hexKey(corner)]: "mountains",
          // A lake one step beyond the eastern edge.
          [hexKey({ q: corner.q + 1, r: corner.r })]: "lake",
        },
      }),
    );
    expect(apply(state, { type: "buildPumpedStorage", hex: corner })).toBe(state);
  });
});

describe("doc 01 §5.7: a border connection goes to a border point or nowhere", () => {
  test("the map's border point accepts it; any other edge hex does not", () => {
    const site = at(7, 1);
    const state = newGame(5, makeScenario({ borderSites: [site] }));
    expect(apply(state, { type: "buildBorder", hex: site }).constructions).toHaveLength(1);
    expect(apply(state, { type: "buildBorder", hex: at(7, 2) })).toBe(state);
    expect(apply(state, { type: "buildBorder", hex: at(4, 0) })).toBe(state);
  });

  test("a map without border points allows no trade at all", () => {
    const state = newGame(5, makeScenario());
    expect(apply(state, { type: "buildBorder", hex: at(7, 1) })).toBe(state);
  });
});
