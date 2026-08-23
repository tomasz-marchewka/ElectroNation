import { describe, expect, test } from "vitest";
import {
  JUNCTION_SPEC,
  LINE_SLOTS_PER_OBJECT,
  TURNS_PER_DAY,
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type HexCoord,
  type Scenario,
} from "../../src/engine";

// Spec tests for docs/01 §3.3 (0.19) and 02 §9.13: a line never CROSSES an object.
// The moment an object stands on its route the line is cut on it into two
// lines that both end in the object — the tap of 0.13 written into the state
// itself — and each of them takes one of the object's line slots.

function city(id: string, hex: HexCoord, connected: boolean) {
  return {
    id,
    name: id,
    hex,
    connected,
    households: 40_000,
    firms: 3_400,
    householdsStart: 40_000,
    firmsStart: 3_400,
    connectedSinceDay: 0,
    monthDemandMwh: 0,
    monthDeliveredMwh: 0,
  };
}

/** A plant at (0,0), a city at (4,0) and three empty hexes between them. */
function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    cities: [city("city-a", { q: 4, r: 0 }, true)],
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
    ...overrides,
  };
}

const CORRIDOR: HexCoord[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: 3, r: 0 },
  { q: 4, r: 0 },
];

const apply = (state: GameState, action: Action) => applyAction(state, action);

function run(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i++) current = resolveTurn(current);
  return current;
}

/** The corridor of `makeScenario`, finished: MV over 4 steps = 24 h = one day. */
function withCorridor(scenario: Scenario = makeScenario()): GameState {
  const state = apply(newGame(3, scenario), {
    type: "buildLine",
    lineType: "mv",
    path: CORRIDOR,
  });
  return run(state, TURNS_PER_DAY);
}

const paths = (state: GameState) => state.lines.map((line) => line.path);

describe("doc 01 §3.3: an object on a corridor cuts the line in two", () => {
  test("a junction built on the route splits it into two lines meeting in it", () => {
    let state = withCorridor();
    expect(state.lines).toHaveLength(1);

    state = apply(state, { type: "buildJunction", hex: { q: 2, r: 0 } });
    // The corridor is still one line while the site is only a building site.
    expect(state.lines).toHaveLength(1);

    state = run(state, JUNCTION_SPEC.buildDays * TURNS_PER_DAY);
    expect(state.junctions).toHaveLength(1);
    expect(paths(state)).toStrictEqual([CORRIDOR.slice(0, 3), CORRIDOR.slice(2)]);
    // The first piece keeps the corridor's identity; the second is numbered
    // after it and never draws from the counter that numbers built objects.
    const [first, second] = state.lines;
    expect(first?.id).toBe("obj-1");
    expect(second?.id).toBe("obj-1#2");
    expect(state.nextObjectId).toBe(3); // the line and the junction, nothing else
  });

  test("the cut moves no money and no length: 2 × 12 h of MV route", () => {
    const before = withCorridor();
    const state = run(apply(before, { type: "buildJunction", hex: { q: 2, r: 0 } }), TURNS_PER_DAY);

    expect(before.lines[0]?.totalHours).toBe(24);
    expect(state.lines.map((line) => line.totalHours)).toStrictEqual([12, 12]);
    expect(state.lines.every((line) => line.builtHours >= line.totalHours)).toBe(true);
    // Only the junction was paid for between the two states (01 §2.6).
    expect(before.moneyPln - state.moneyPln).toBeGreaterThan(JUNCTION_SPEC.capexPln);
  });

  test("both pieces carry power: the plant feeds the city through the object", () => {
    let state = withCorridor();
    state = run(apply(state, { type: "buildJunction", hex: { q: 2, r: 0 } }), TURNS_PER_DAY);
    state = apply(state, { type: "setPlantSetpoint", plantId: "plant-1", mw: 300 });
    state = resolveTurn(state);

    const junction = state.junctions[0]?.id;
    const segments = state.lastTurnReport?.segments ?? [];
    expect(segments.map((segment) => [segment.fromNodeId, segment.toNodeId])).toStrictEqual([
      ["plant-1", junction],
      [junction, "city-a"],
    ]);
    expect(state.cities[0]?.monthDeliveredMwh ?? 0).toBeGreaterThan(0);
  });

  test("a line finished across a standing object goes live already cut", () => {
    // The junction stands first, on an empty hex; the route is drawn through it
    // afterwards and is one construction job until the day it goes live.
    let state = newGame(3, makeScenario());
    state = run(apply(state, { type: "buildJunction", hex: { q: 2, r: 0 } }), TURNS_PER_DAY);
    state = apply(state, { type: "buildLine", lineType: "mv", path: CORRIDOR });
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.totalHours).toBe(24);

    // One job, one countdown — the route is not cut while it is being strung up.
    state = run(state, 4);
    expect(state.lines).toHaveLength(1);
    state = run(state, 4);
    expect(paths(state)).toStrictEqual([CORRIDOR.slice(0, 3), CORRIDOR.slice(2)]);
  });

  test("the pieces are independent lines: a raise touches only one of them", () => {
    let state = withCorridor();
    state = run(apply(state, { type: "buildJunction", hex: { q: 2, r: 0 } }), TURNS_PER_DAY);
    const second = state.lines[1]?.id ?? "";
    state = apply(state, { type: "upgradeLine", lineId: second, lineType: "hv" });

    expect(state.lines[0]?.upgrade).toBeNull();
    expect(state.lines[1]?.upgrade?.type).toBe("hv");
    const raised = run(state, 10 * TURNS_PER_DAY);
    expect(raised.lines.map((line) => line.type)).toStrictEqual(["mv", "hv"]);
  });
});

describe("doc 01 §3.3: a cut route spends two line slots, one per direction", () => {
  const buildFarm = { type: "buildFarm", tech: "pv", size: "medium", hex: { q: 2, r: 0 } } as const;

  test("three routes crossing an object fill its six slots", () => {
    // The city and the plant are the endpoints, so every route crosses the farm
    // hex — 2 slots each, 6 in total, and the fourth is refused.
    let state = newGame(3, makeScenario({ junctions: [] }));
    state = run(apply(state, buildFarm), TURNS_PER_DAY);
    for (let i = 0; i < 4; i++) {
      state = apply(state, { type: "buildLine", lineType: "mv", path: CORRIDOR });
    }
    expect(state.lines).toHaveLength(3);
    expect(3 * 2).toBe(LINE_SLOTS_PER_OBJECT);
  });

  test("a site whose corridor brings more ends than slots refuses the object", () => {
    let state = newGame(3, makeScenario());
    for (let i = 0; i < 4; i++) {
      state = apply(state, { type: "buildLine", lineType: "mv", path: CORRIDOR });
    }
    expect(state.lines).toHaveLength(4);

    // Four routes cross (2,0): cutting them would end eight lines in the object
    // and an ordinary one has six slots. The build is refused before the money
    // is taken.
    expect(apply(state, buildFarm)).toBe(state);
    // Three of them fit — the fourth route is what makes the site illegal.
    const thinner = { ...state, lines: state.lines.slice(0, 3) };
    expect(apply(thinner, buildFarm)).not.toBe(thinner);
    // A junction station has 12 slots, so the same corridor takes it (0.21).
    expect(apply(state, { type: "buildJunction", hex: { q: 2, r: 0 } })).not.toBe(state);
  });
});
