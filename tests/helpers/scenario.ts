// A small hand-made world for tests that need a state they can reason about:
// one connected city fed by one CCGT over a four-hex MV line. Overriding a
// field replaces it wholesale, so a test adding farms or storage says exactly
// what stands on its map.

import { finishedLine, settledBlocks, type GameState, type Scenario } from "../../src/engine";

/**
 * Every plant's blocks warmed to its current setpoint (01 §5.1 in 0.27) — for
 * tests whose subject is the flow, the money or the report, not the inertia:
 * the next resolution then behaves exactly like the pre-0.27 instant dispatch.
 */
export function settlePlants(state: GameState): GameState {
  return {
    ...state,
    plants: state.plants.map((plant) => ({
      ...plant,
      blocks: settledBlocks(plant.tech, plant.capacityMw, plant.blocks.length, plant.setpointMw),
    })),
  };
}

export function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    startingMoneyPln: 10_000_000_000,
    cities: [
      {
        id: "city-a",
        name: "A",
        hex: { q: 4, r: 0 },
        connected: true,
        households: 80_000,
        firms: 6_900,
        householdsStart: 80_000,
        firmsStart: 6_900,
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
        // Automation endowed (01 §5.1, 0.28): tests here dispatch through the
        // aggregate setpoint, i.e. the AUTO controller path.
        automation: true,
        setpointMw: 0,
      },
    ],
    farms: [],
    storages: [],
    junctions: [],
    borders: [],
    lines: [
      finishedLine("line-1", "mv", [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
        { q: 4, r: 0 },
      ]),
    ],
    ...overrides,
  };
}
