import { describe, expect, test } from "vitest";
import {
  EXPANSION,
  FARM_TECHS,
  KM_PER_HEX,
  LINE_TYPES,
  OFFSHORE_WIND,
  TERRAIN,
  TURNS_PER_DAY,
  applyAction,
  hexKey,
  newGame,
  offsetToAxial,
  resolveTurn,
  type Action,
  type BuildSize,
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

/** Resolves whole game days, so a build countdown can actually run out. */
function runDays(state: GameState, days: number): GameState {
  let next = state;
  for (let turn = 0; turn < days * TURNS_PER_DAY; turn++) next = resolveTurn(next);
  return next;
}

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
        apply(state, { type: "buildPlant", tech: "ocgt", size: "medium", hex: at(1, 0) }),
      ).toBe(state);
      expect(apply(state, { type: "buildFarm", tech: "pv", size: "medium", hex: at(1, 0) })).toBe(
        state,
      );
    }
  });
});

// 02 §9.14 (01 §3.2, §5.2 in 0.22): the sea is the one piece of water that
// carries something — a wind farm, and nothing else. It is not a separate
// technology: the same `buildFarm` action, priced, capped and timed by the site.
describe("doc 02 §8.1, §8.4: offshore wind", () => {
  const SITE = at(1, 0);
  const seaScenario = () => makeScenario({ terrain: { [key(1, 0)]: "sea" } });
  const lakeScenario = () => makeScenario({ terrain: { [key(1, 0)]: "lake" } });
  const windAt = (size: BuildSize): Action => ({
    type: "buildFarm",
    tech: "wind",
    size,
    hex: SITE,
  });

  test("a wind farm stands on the sea and costs 2.5× the base CAPEX", () => {
    const state = newGame(5, seaScenario());
    const built = apply(state, windAt("xlarge"));
    expect(built.constructions).toHaveLength(1);
    expect(state.moneyPln - built.moneyPln).toBe(
      Math.round(300 * FARM_TECHS.wind.capexPlnPerMw * TERRAIN.sea.windFarm),
    );

    // The land reference: same farm, same action, plain multiplier.
    const onLand = newGame(5, makeScenario());
    const ashore = apply(onLand, windAt("xlarge"));
    expect(onLand.moneyPln - ashore.moneyPln).toBe(300 * FARM_TECHS.wind.capexPlnPerMw);
  });

  test("a lake carries no turbines either", () => {
    const state = newGame(5, lakeScenario());
    expect(apply(state, windAt("medium"))).toBe(state);
  });

  test("everything except a wind farm is still refused at sea", () => {
    const state = newGame(5, seaScenario());
    const refused: Action[] = [
      { type: "buildFarm", tech: "pv", size: "medium", hex: SITE },
      { type: "buildPlant", tech: "ocgt", size: "medium", hex: SITE },
      {
        type: "buildStorage",
        tech: "battery",
        powerSize: "small",
        capacitySize: "small",
        hex: SITE,
      },
      {
        type: "buildStorage",
        tech: "pumped",
        powerSize: "medium",
        capacitySize: "medium",
        hex: SITE,
      },
      { type: "buildJunction", hex: SITE },
      { type: "buildBorder", hex: SITE },
    ];
    for (const action of refused) expect(apply(state, action)).toBe(state);
  });

  // 01 §5.2 (0.26): the ladder tops out at the LAND hex (300 MW), so the sea's
  // extra room is reached by expanding, not by ordering a bigger farm.
  test("the sea hex holds two extra-large farms, the land hex one", () => {
    const run = (state: GameState, turns: number) => {
      let current = state;
      for (let i = 0; i < turns; i++) current = resolveTurn(current);
      return current;
    };
    const sea = run(apply(newGame(5, seaScenario()), windAt("xlarge")), 2 * TURNS_PER_DAY);
    const seaFarm = sea.farms[0];
    expect(seaFarm?.capacityMw).toBe(300);
    const grown = apply(sea, { type: "expandFarm", farmId: seaFarm?.id ?? "", size: "xlarge" });
    expect(grown.constructions).toHaveLength(1);
    expect(apply(grown, { type: "expandFarm", farmId: seaFarm?.id ?? "", size: "small" })).toBe(
      grown,
    ); // 300 standing + 300 queued fills the 600 MW sea hex

    const land = run(apply(newGame(5, makeScenario()), windAt("xlarge")), TURNS_PER_DAY);
    const landFarm = land.farms[0];
    expect(landFarm?.capacityMw).toBe(300);
    expect(apply(land, { type: "expandFarm", farmId: landFarm?.id ?? "", size: "small" })).toBe(
      land,
    ); // the land hex is already full
  });

  test("building at sea takes 2 game days, on land 1", () => {
    const sea = apply(newGame(5, seaScenario()), windAt("medium"));
    expect(sea.constructions[0]?.remainingDays).toBe(OFFSHORE_WIND.buildDays);

    const land = apply(newGame(5, makeScenario()), windAt("medium"));
    expect(land.constructions[0]?.remainingDays).toBe(FARM_TECHS.wind.buildDays);
  });

  test("the farm freezes the hex's baltic wind class at build time", () => {
    const scenario = seaScenario();
    const state = newGame(5, { ...scenario, windClasses: { [key(1, 0)]: "baltic" } });
    const pending = apply(state, windAt("xlarge")).constructions[0]?.pending;
    expect(pending?.kind).toBe("farm");
    expect(pending?.kind === "farm" ? pending.farm.windClass : null).toBe("baltic");
  });

  test("expansion reads the cap, the price and the clock off the farm's own hex", () => {
    let state = newGame(5, seaScenario());
    state = apply(state, windAt("xlarge"));
    state = runDays(state, OFFSHORE_WIND.buildDays);
    const farm = state.farms[0];
    expect(farm?.capacityMw).toBe(300);

    // 02 §8.4: 85% of an OFFSHORE site, and ceil(70% × 2 days) = 2 days.
    const expanded = apply(state, {
      type: "expandFarm",
      farmId: farm?.id ?? "",
      size: "xlarge",
    });
    expect(state.moneyPln - expanded.moneyPln).toBe(
      Math.round(300 * FARM_TECHS.wind.capexPlnPerMw * EXPANSION.capexShare * TERRAIN.sea.windFarm),
    );
    expect(expanded.constructions[0]?.remainingDays).toBe(2);

    // 600 MW is still the ceiling of the hex, queued capacity included.
    expect(apply(expanded, { type: "expandFarm", farmId: farm?.id ?? "", size: "small" })).toBe(
      expanded,
    );
  });
});

describe("doc 01 §3.2: pumped storage needs elevation AND water next to it", () => {
  const site = at(3, 2);
  const SITE_KEY = key(3, 2);
  /** One of the six neighbors of the site. */
  const NEIGHBOR_KEY = key(4, 2);
  const build: Action = {
    type: "buildStorage",
    tech: "pumped",
    powerSize: "medium",
    capacitySize: "medium",
    hex: site,
  };

  test("mountains with no water in reach are refused", () => {
    const state = newGame(5, makeScenario({ terrain: { [SITE_KEY]: "mountains" } }));
    expect(apply(state, build)).toBe(state);
  });

  test("plains next to a lake are refused as well", () => {
    const state = newGame(5, makeScenario({ terrain: { [NEIGHBOR_KEY]: "lake" } }));
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
    expect(
      apply(state, {
        type: "buildStorage",
        tech: "pumped",
        powerSize: "medium",
        capacitySize: "medium",
        hex: corner,
      }),
    ).toBe(state);
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
