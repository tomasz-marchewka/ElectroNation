// Spec tests for block dynamics — 01 §5.1 (0.27), acceptance list 02 §9.17.
// A plant's setpoint is an ORDER: blocks reach it through startups, ramps and
// the technical minimum, and every start order is billed.

import { describe, expect, test } from "vitest";
import {
  COLD_OFFLINE_TURNS,
  DAY_WEIGHTS,
  PLANT_DYNAMICS,
  advancePlantDispatch,
  applyAction,
  evenBlocks,
  newBlock,
  newGame,
  plantOutputMw,
  projectPlantOutputMw,
  resolveTurn,
  settledBlocks,
  type PlantBlockState,
  type PlantState,
  type PlantTech,
} from "../../src/engine";
import { makeScenario, settlePlants } from "../helpers/scenario";

/** A plant on the AUTO controller — the dynamics tests below exercise it. */
function plant(
  tech: PlantTech,
  blocks: PlantBlockState[],
  setpointMw: number,
  id = "plant-1",
): PlantState {
  const capacityMw = blocks.reduce((sum, block) => sum + block.mw, 0);
  return {
    id,
    name: id,
    hex: { q: 0, r: 0 },
    tech,
    capacityMw,
    blocks,
    automation: true,
    controlMode: "auto",
    setpointMw,
  };
}

function online(mw: number, outputMw: number, setpointMw = 0): PlantBlockState {
  return { mw, status: "online", setpointMw, outputMw, startupTurnsLeft: 0, offlineTurns: 0 };
}

/** `advancePlantDispatch` n times; returns every intermediate plant state. */
function advanceTimes(start: PlantState, n: number): PlantState[] {
  const states: PlantState[] = [];
  let current = start;
  for (let i = 0; i < n; i++) {
    current = advancePlantDispatch(current).plant;
    states.push(current);
  }
  return states;
}

describe("01 §5.1: the dynamics table mirrors the doc", () => {
  test("game-scaled parameters, ordered nuclear ⩾ coal ⩾ CCGT ⩾ OCGT", () => {
    // One assertion per doc row — retuning the doc retunes this test with it.
    expect(PLANT_DYNAMICS.nuclear).toStrictEqual({
      minLoadShare: 0.5,
      rampUpSharePerTurn: 0.2,
      rampDownSharePerTurn: 0.4,
      startupColdTurns: 8,
      startupWarmTurns: 4,
      warmWindowTurns: 2,
      startupCostPlnPerMw: 4_000,
    });
    expect(PLANT_DYNAMICS.coal).toStrictEqual({
      minLoadShare: 0.4,
      rampUpSharePerTurn: 0.3,
      rampDownSharePerTurn: 0.6,
      startupColdTurns: 3,
      startupWarmTurns: 1,
      warmWindowTurns: 4,
      startupCostPlnPerMw: 2_000,
    });
    expect(PLANT_DYNAMICS.ccgt).toStrictEqual({
      minLoadShare: 0.3,
      rampUpSharePerTurn: 0.6,
      rampDownSharePerTurn: 1.0,
      startupColdTurns: 1,
      startupWarmTurns: 0,
      warmWindowTurns: 8,
      startupCostPlnPerMw: 600,
    });
    // OCGT is the fully flexible end on purpose — its whole role.
    expect(PLANT_DYNAMICS.ocgt).toStrictEqual({
      minLoadShare: 0,
      rampUpSharePerTurn: 1.0,
      rampDownSharePerTurn: 1.0,
      startupColdTurns: 0,
      startupWarmTurns: 0,
      warmWindowTurns: 0,
      startupCostPlnPerMw: 0,
    });
  });
});

describe("01 §5.1 pt 2: startup — N−1 turns of nothing, minimum on the Nth", () => {
  test("a cold coal block: 0, 0, then minimum load; the cost bills at the order", () => {
    const cold = plant("coal", [newBlock(500)], 400);
    const first = advancePlantDispatch(cold);
    expect(first.startupCostPln).toBe(2_000 * 500);
    expect(first.plant.blocks[0]?.status).toBe("starting");
    expect(plantOutputMw(first.plant)).toBe(0);

    const second = advancePlantDispatch(first.plant);
    expect(second.startupCostPln).toBe(0); // billed once, at the order
    expect(plantOutputMw(second.plant)).toBe(0);

    const third = advancePlantDispatch(second.plant);
    expect(third.plant.blocks[0]?.status).toBe("online");
    expect(plantOutputMw(third.plant)).toBe(200); // 40% of 500

    // The arrival turn is pinned at the minimum; the ramp starts next turn.
    const fourth = advancePlantDispatch(third.plant);
    expect(plantOutputMw(fourth.plant)).toBe(350); // 200 + 30% × 500
    expect(plantOutputMw(advancePlantDispatch(fourth.plant).plant)).toBe(400);
  });

  test("warm within the window, cold one turn past it (coal: 4 turns)", () => {
    const running = plant("coal", [online(500, 300)], 300);
    const shut = advancePlantDispatch({ ...running, setpointMw: 0 }).plant;
    expect(shut.blocks[0]?.status).toBe("offline");
    expect(shut.blocks[0]?.offlineTurns).toBe(0);

    // Four idle resolutions — still warm: the restart produces on its 1st turn.
    const idleWarm = advanceTimes({ ...shut, setpointMw: 0 }, 4).at(-1)!;
    expect(idleWarm.blocks[0]?.offlineTurns).toBe(4);
    const warmStart = advancePlantDispatch({ ...idleWarm, setpointMw: 300 });
    expect(warmStart.plant.blocks[0]?.status).toBe("online");
    expect(plantOutputMw(warmStart.plant)).toBe(200);
    expect(warmStart.startupCostPln).toBe(2_000 * 500); // same bill either way

    // One more idle turn — cold again: the restart spends 2 turns at zero.
    const idleCold = advanceTimes({ ...shut, setpointMw: 0 }, 5).at(-1)!;
    const coldStart = advancePlantDispatch({ ...idleCold, setpointMw: 300 });
    expect(coldStart.plant.blocks[0]?.status).toBe("starting");
    expect(plantOutputMw(coldStart.plant)).toBe(0);
  });

  test("OCGT answers within the turn: full setpoint, no bill", () => {
    const cold = plant("ocgt", [newBlock(150)], 120);
    const first = advancePlantDispatch(cold);
    expect(first.startupCostPln).toBe(0);
    expect(plantOutputMw(first.plant)).toBe(120);
    // And back to zero the moment the order drops.
    const off = advancePlantDispatch({ ...first.plant, setpointMw: 0 });
    expect(plantOutputMw(off.plant)).toBe(0);
    expect(off.plant.blocks[0]?.status).toBe("offline");
  });
});

describe("01 §5.1 pt 3–4: ramps and the technical minimum", () => {
  test("output moves at most one ramp per turn, faster down than up", () => {
    const low = plant("nuclear", [online(800, 400)], 800);
    const up = advanceTimes(low, 3).map(plantOutputMw);
    expect(up).toStrictEqual([560, 720, 800]); // +20% of 800 per turn

    const high = plant("nuclear", [online(800, 800)], 400);
    const down = advanceTimes(high, 2).map(plantOutputMw);
    expect(down).toStrictEqual([480, 400]); // −40% of 800 per turn
  });

  test("a setpoint under the minimum holds the minimum, not the setpoint", () => {
    const running = plant("coal", [online(500, 300)], 100);
    const next = advancePlantDispatch(running).plant;
    expect(plantOutputMw(next)).toBe(200); // 40% of 500, not 100
    expect(next.blocks[0]?.status).toBe("online");
  });

  test("setpoint 0 is a shutdown: down the ramp, then a trip below the minimum", () => {
    const full = plant("coal", [online(500, 500)], 0);
    const steps = advanceTimes(full, 2);
    expect(plantOutputMw(steps[0]!)).toBe(200); // 500 − 60% × 500 lands on the floor
    expect(steps[0]!.blocks[0]?.status).toBe("online");
    expect(plantOutputMw(steps[1]!)).toBe(0); // the next step would cross it → trip
    expect(steps[1]!.blocks[0]?.status).toBe("offline");
  });
});

describe("01 §5.1 pt 1 + 5: commitment and the greedy split", () => {
  test("a running block is kept; a cold one wakes only when the order outgrows it", () => {
    const two = plant("coal", [online(500, 500), newBlock(500)], 400);
    const kept = advancePlantDispatch(two);
    expect(kept.startupCostPln).toBe(0);
    expect(kept.plant.blocks[1]?.status).toBe("offline");
    expect(plantOutputMw(kept.plant)).toBe(400);

    const grown = advancePlantDispatch({ ...kept.plant, setpointMw: 700 });
    expect(grown.startupCostPln).toBe(2_000 * 500); // the second block wakes
    expect(grown.plant.blocks[1]?.status).toBe("starting");
  });

  test("blocks beyond the order shut down; the split gives minima first", () => {
    const two = plant("coal", [online(500, 500), online(500, 500)], 550);
    const next = advancePlantDispatch(two).plant;
    // Greedy split: both online, minima 200 + 200, the rest tops up block 1.
    expect(next.blocks.map((block) => block.outputMw)).toStrictEqual([350, 200]);
    const shrunk = advancePlantDispatch({ ...next, setpointMw: 300 }).plant;
    // 500 rated of block 1 covers 300 alone — block 2 is decommitted.
    expect(shrunk.blocks[1]?.status).toBe("offline");
  });
});

describe("02 §9.17: the resolution bills, dumps and reports the PRODUCTION", () => {
  test("a start order lands in the turn's finance, day-weighted", () => {
    const state = applyAction(newGame(7, makeScenario()), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    const report = resolveTurn(state).lastTurnReport!;
    expect(report.finance.startupCostPln).toBe(
      Math.round(600 * 400 * DAY_WEIGHTS.working), // CCGT bill × the whole plant
    );
  });

  test("a block held at its minimum dumps its production, not its setpoint", () => {
    const scenario = makeScenario({
      plants: [
        {
          id: "plant-1",
          name: "P1",
          hex: { q: 0, r: 0 },
          tech: "coal",
          capacityMw: 500,
          setpointMw: 100,
        },
      ],
    });
    const state = settlePlants(newGame(7, scenario));
    const report = resolveTurn(state).lastTurnReport!;
    const source = report.sources.find((row) => row.sourceId === "plant-1");
    expect(source?.offeredMw).toBe(200); // the minimum, above the 100 MW order
    // Whatever the city didn't take of those 200 MW is dumped production.
    expect(report.totals.dumpMw).toBeCloseTo(200 - (source?.usedMw ?? 0), 3);
  });

  test("a block still starting offers nothing and dumps nothing", () => {
    const scenario = makeScenario({
      plants: [
        {
          id: "plant-1",
          name: "P1",
          hex: { q: 0, r: 0 },
          tech: "nuclear",
          capacityMw: 800,
          setpointMw: 0,
        },
      ],
    });
    const state = applyAction(newGame(7, scenario), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 800,
    });
    const report = resolveTurn(state).lastTurnReport!;
    const source = report.sources.find((row) => row.sourceId === "plant-1");
    expect(source?.offeredMw).toBe(0);
    expect(report.totals.dumpMw).toBe(0);
    expect(report.finance.dumpPenaltyPln).toBe(0);
    // The whole city goes dark meanwhile — nuclear is not a peaker.
    expect(report.totals.ensMw).toBeCloseTo(report.totals.demandMw, 3);
  });

  test("the projection helper agrees with the resolutions it predicts", () => {
    const start = plant("coal", [newBlock(500)], 450);
    const outputs = advanceTimes(start, 5).map(plantOutputMw);
    outputs.forEach((outputMw, i) => {
      expect(projectPlantOutputMw(start, i + 1)).toBe(outputMw);
    });
  });
});

describe("01 §5.1 (0.28): manual control — one order per block", () => {
  function manualPlant(tech: PlantTech, blocks: PlantBlockState[], id = "plant-1"): PlantState {
    const capacityMw = blocks.reduce((sum, block) => sum + block.mw, 0);
    return {
      id,
      name: id,
      hex: { q: 0, r: 0 },
      tech,
      capacityMw,
      blocks,
      automation: false,
      controlMode: "manual",
      setpointMw: 0,
    };
  }

  test("each block follows its own order; the neighbours stay untouched", () => {
    const two = manualPlant("coal", [online(500, 500, 300), newBlock(500)]);
    const next = advancePlantDispatch(two);
    expect(next.startupCostPln).toBe(0);
    expect(next.plant.blocks[0]?.outputMw).toBe(300); // down the ramp to its order
    expect(next.plant.blocks[1]?.status).toBe("offline");
  });

  test("an order wakes exactly its own block, and bills it", () => {
    const cold = manualPlant("coal", [{ ...newBlock(500), setpointMw: 400 }, newBlock(500)]);
    const next = advancePlantDispatch(cold);
    expect(next.startupCostPln).toBe(2_000 * 500); // one block, one bill
    expect(next.plant.blocks[0]?.status).toBe("starting");
    expect(next.plant.blocks[1]?.status).toBe("offline");
  });

  test("an order under the minimum holds the minimum; order 0 shuts down", () => {
    const running = manualPlant("coal", [online(500, 300, 100)]);
    expect(advancePlantDispatch(running).plant.blocks[0]?.outputMw).toBe(200);
    const shut = manualPlant("coal", [online(500, 200, 0)]);
    expect(advancePlantDispatch(shut).plant.blocks[0]?.status).toBe("offline");
  });

  test("the plant-level setpoint is dormant in manual mode", () => {
    const idle = { ...manualPlant("coal", [newBlock(500)]), setpointMw: 400 };
    const next = advancePlantDispatch(idle);
    expect(next.startupCostPln).toBe(0);
    expect(next.plant.blocks[0]?.status).toBe("offline");
  });
});

describe("01 §5.1 (0.28): the automation retrofit and the mode switch", () => {
  test("buying charges the flat price once; a second buy is refused", () => {
    const base = newGame(7, makeScenario());
    // The test helper endows automation — strip it to exercise the purchase.
    const manual = {
      ...base,
      plants: base.plants.map((p) => ({ ...p, automation: false, controlMode: "manual" as const })),
    };
    const bought = applyAction(manual, { type: "buyPlantAutomation", plantId: "plant-1" });
    expect(manual.moneyPln - bought.moneyPln).toBe(150_000_000);
    expect(bought.plants[0]?.automation).toBe(true);
    // Instant, but not free twice — and not switching the mode by itself.
    expect(bought.plants[0]?.controlMode).toBe("manual");
    expect(applyAction(bought, { type: "buyPlantAutomation", plantId: "plant-1" })).toBe(bought);
  });

  test("AUTO without the retrofit is refused; with it the switch works", () => {
    const base = newGame(7, makeScenario());
    const manual = {
      ...base,
      plants: base.plants.map((p) => ({ ...p, automation: false, controlMode: "manual" as const })),
    };
    expect(
      applyAction(manual, { type: "setPlantControlMode", plantId: "plant-1", mode: "auto" })
        .plants[0]?.controlMode,
    ).toBe("manual");
    const bought = applyAction(manual, { type: "buyPlantAutomation", plantId: "plant-1" });
    expect(
      applyAction(bought, { type: "setPlantControlMode", plantId: "plant-1", mode: "auto" })
        .plants[0]?.controlMode,
    ).toBe("auto");
  });

  test("02 §9.18: switching modes does not move the next turn's dispatch", () => {
    // A running, settled plant on the controller...
    const running = settlePlants(
      applyAction(newGame(7, makeScenario()), {
        type: "setPlantSetpoint",
        plantId: "plant-1",
        mw: 300,
      }),
    );
    const stayedAuto = resolveTurn(running);
    // ...switched to manual right before the resolution: same production.
    const toManual = resolveTurn(
      applyAction(running, { type: "setPlantControlMode", plantId: "plant-1", mode: "manual" }),
    );
    expect(plantOutputMw(toManual.plants[0]!)).toBe(plantOutputMw(stayedAuto.plants[0]!));
    // And back: the block orders sum into the plant order.
    const backToAuto = applyAction(
      applyAction(running, { type: "setPlantControlMode", plantId: "plant-1", mode: "manual" }),
      { type: "setPlantControlMode", plantId: "plant-1", mode: "auto" },
    );
    expect(backToAuto.plants[0]?.setpointMw).toBe(300);
    expect(plantOutputMw(resolveTurn(backToAuto).plants[0]!)).toBe(
      plantOutputMw(stayedAuto.plants[0]!),
    );
  });
});

describe("block factories", () => {
  test("a new block is cold, offline and silent", () => {
    expect(newBlock(750)).toStrictEqual({
      mw: 750,
      status: "offline",
      setpointMw: 0,
      outputMw: 0,
      startupTurnsLeft: 0,
      offlineTurns: COLD_OFFLINE_TURNS,
    });
  });

  test("evenBlocks splits exactly, remainder on the last block", () => {
    expect(evenBlocks(400, 4).map((block) => block.mw)).toStrictEqual([100, 100, 100, 100]);
    const uneven = evenBlocks(1_000, 3).map((block) => block.mw);
    expect(uneven.reduce((sum, mw) => sum + mw, 0)).toBe(1_000);
  });

  test("settledBlocks runs the committed set at the order, leaves the rest cold", () => {
    const settled = settledBlocks("coal", 1_000, 2, 300);
    expect(settled[0]).toMatchObject({ status: "online", outputMw: 300 });
    expect(settled[1]).toMatchObject({ status: "offline", outputMw: 0 });
    // Idle plants settle fully cold.
    expect(settledBlocks("coal", 1_000, 2, 0).every((b) => b.status === "offline")).toBe(true);
  });
});
