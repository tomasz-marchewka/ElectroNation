import { describe, expect, test } from "vitest";
import {
  CONFIG,
  COVERAGE_LAYERS,
  DAY_WEIGHTS,
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  applyAction,
  digestAt,
  digestTurn,
  farmPowerMwAtHour,
  farmProductionForecast,
  forecastHorizonTurns,
  lastDayDigests,
  newGame,
  projectBalance,
  projectTurnCoverage,
  resolveTurn,
  turnForecast,
  type CoverageLayer,
  type GameState,
  type TurnReport,
} from "../../src/engine";
import { makeScenario } from "../helpers/scenario";

// Spec tests for the last-turn report — the RAPORT panel and the map's data
// source (01 §2.3, §8) — and the balance projection (01 §8 pt 3, 06 §8.6.4).

function reportOf(state: GameState): TurnReport {
  const report = state.lastTurnReport;
  if (report === null) throw new Error("resolveTurn must record lastTurnReport");
  return report;
}

describe("01 §2.3: the report describes the RESOLVED turn", () => {
  test("null at newGame; after one resolution it points at day 0, turn NOC", () => {
    const base = newGame(7, makeScenario());
    expect(base.lastTurnReport).toBeNull();
    const next = resolveTurn(base);
    const report = reportOf(next);
    expect(report.dayIndex).toBe(0);
    expect(report.turnIndex).toBe(0);
    expect(report.phase).toBe("night");
    expect(report.dayWeight).toBe(DAY_WEIGHTS.working);
    // …while the calendar already moved on.
    expect(next.calendar.turnIndex).toBe(1);
  });

  test("survives the JSON round-trip like the rest of the state", () => {
    const next = resolveTurn(newGame(7, makeScenario()));
    const revived = JSON.parse(JSON.stringify(next)) as GameState;
    expect(revived.lastTurnReport).toStrictEqual(next.lastTurnReport);
  });
});

describe("02 §9.12 + 01 §8 pt 2: the turn archive", () => {
  test("every resolved turn leaves one digest, in calendar order and without gaps", () => {
    let state = newGame(7, makeScenario());
    expect(state.history).toStrictEqual([]);

    for (let turn = 0; turn < TURNS_PER_DAY; turn++) {
      state = resolveTurn(state);
      expect(state.history).toHaveLength(turn + 1);
    }
    expect(state.history.map((digest) => digest.turnIndex)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(state.history.every((digest) => digest.dayIndex === 0)).toBe(true);
    expect(state.calendar).toStrictEqual({ dayIndex: 1, turnIndex: 0 });

    // Unlike the per-day history it replaces, the archive does not restart:
    // the ribbon scrolls back through every day ever played (01 §2.5).
    const next = resolveTurn(state);
    expect(next.history).toHaveLength(TURNS_PER_DAY + 1);
    expect(next.history.at(-1)?.dayIndex).toBe(1);
    expect(next.history.at(-1)?.turnIndex).toBe(0);
    // Positions on the ribbon's own axis are dense: `dayIndex × 8 + turnIndex`.
    expect(next.history.map(digestTurn)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(digestAt(next.history, 8)).toStrictEqual(next.history.at(-1));
    expect(digestAt(next.history, 9)).toBeUndefined();
  });

  test("the digest says what the last report said — that is what a review shows", () => {
    const state = resolveTurn(resolveTurn(newGame(7, makeScenario())));
    const report = state.lastTurnReport;
    const digest = state.history.at(-1);
    if (!report || !digest) throw new Error("missing report");

    expect(digest.turnIndex).toBe(report.turnIndex);
    expect(digest.totals).toStrictEqual(report.totals);
    expect(digest.finance).toStrictEqual(report.finance);
    expect(digest.forecastMiss).toStrictEqual(report.forecastMiss);
    expect(digest.dayWeight).toBe(report.dayWeight);
    // Coverage is the power the flow actually drew, split by technology.
    const used = report.sources.reduce((sum, source) => sum + source.usedMw, 0);
    const coverage = digest.coverageMw.reduce((sum, mw) => sum + mw, 0);
    expect(coverage).toBeCloseTo(used, 3);
    expect(coverage).toBeCloseTo(report.totals.deliveredMw + report.totals.lossesMw, 3);
    // Only the cities that went short are named, and with their own numbers.
    expect(digest.shortfalls.map((city) => city.cityId)).toStrictEqual(
      report.cities.filter((city) => city.ensMw >= 0.001).map((city) => city.cityId),
    );
  });

  test("WYNIK DOBY: the day's digests sum to exactly the day's money delta", () => {
    let state = applyAction(newGame(7, makeScenario()), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 200,
    });
    const before = state.moneyPln;
    for (let turn = 0; turn < TURNS_PER_DAY; turn++) state = resolveTurn(state);
    const digests = lastDayDigests(state);
    expect(digests).toHaveLength(TURNS_PER_DAY);
    expect(digests.reduce((sum, digest) => sum + digest.finance.netPln, 0)).toBe(
      state.moneyPln - before,
    );
    // The finished day stays readable after the calendar rolls over (01 §8 pt 5).
    expect(state.calendar.dayIndex).toBe(1);
    expect(digests.every((digest) => digest.dayIndex === 0)).toBe(true);
  });

  test("survives the JSON round-trip like the rest of the state", () => {
    const next = resolveTurn(resolveTurn(newGame(7, makeScenario())));
    const revived = JSON.parse(JSON.stringify(next)) as GameState;
    expect(revived.history).toStrictEqual(next.history);
  });
});

describe("01 §2.3 + 02 §4: finance breakdown", () => {
  test("netPln is exactly the money delta; components add up to it", () => {
    const base = applyAction(newGame(7, makeScenario()), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 350,
    });
    const next = resolveTurn(base);
    const { finance } = reportOf(next);
    expect(finance.netPln).toBe(next.moneyPln - base.moneyPln);
    expect(finance.revenueEnergyPln).toBeGreaterThan(0);
    expect(finance.fuelCostPln).toBeGreaterThan(0);
    expect(finance.dumpPenaltyPln).toBeGreaterThan(0); // 350 MW ≫ night demand
    expect(finance.ensPenaltyPln).toBe(0);
    expect(finance.fixedCostPln).toBe(0); // mid-day
    const componentSum =
      finance.revenueEnergyPln +
      finance.revenueExportPln -
      finance.fuelCostPln -
      finance.importCostPln -
      finance.ensPenaltyPln -
      finance.dumpPenaltyPln -
      finance.fixedCostPln;
    // Components are rounded per entry, netPln from the unrounded sum.
    expect(Math.abs(componentSum - finance.netPln)).toBeLessThanOrEqual(5);
  });

  test("day end: fixed O&M lands in the 8th turn's report, netPln still exact", () => {
    let state = applyAction(newGame(7, makeScenario()), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    for (let turn = 0; turn < TURNS_PER_DAY - 1; turn++) state = resolveTurn(state);
    const before = state.moneyPln;
    const next = resolveTurn(state);
    const { finance, turnIndex } = reportOf(next);
    expect(turnIndex).toBe(TURNS_PER_DAY - 1);
    expect(finance.fixedCostPln).toBeGreaterThan(0);
    expect(finance.netPln).toBe(next.moneyPln - before);
  });
});

describe("01 §4.5: energy not served per city", () => {
  test("a dead plant leaves the whole demand as ENS, penalized", () => {
    const next = resolveTurn(newGame(7, makeScenario())); // setpoint stays 0
    const report = reportOf(next);
    const cityRow = report.cities[0];
    expect(cityRow?.cityId).toBe("city-a");
    expect(cityRow?.deliveredMw).toBe(0);
    expect(cityRow?.ensMw).toBeCloseTo(cityRow?.demandMw ?? 0, 3);
    expect(report.totals.ensMw).toBeCloseTo(report.totals.demandMw, 3);
    // ENS penalty is the only money flow of this turn.
    expect(report.finance.ensPenaltyPln).toBeGreaterThan(0);
    expect(Math.abs(report.finance.ensPenaltyPln + report.finance.netPln)).toBeLessThanOrEqual(1);
  });
});

describe("01 §8: line loading for the map", () => {
  test("the delivering segment reports sending-end flow and its path span", () => {
    const next = resolveTurn(
      applyAction(newGame(7, makeScenario()), {
        type: "setPlantSetpoint",
        plantId: "plant-1",
        mw: 300,
      }),
    );
    const report = reportOf(next);
    expect(report.segments).toHaveLength(1);
    const segment = report.segments[0];
    expect(segment?.lineId).toBe("line-1");
    expect(segment?.fromNodeId).toBe("plant-1");
    expect(segment?.toNodeId).toBe("city-a");
    expect(segment?.fromIndex).toBe(0);
    expect(segment?.toIndex).toBe(4);
    expect(segment?.capacityMw).toBe(500);
    // 4 hexes × 25 km of MV = 2% loss: delivered = sent × 0.98 (01 §4.2).
    const delivered = report.cities[0]?.deliveredMw ?? 0;
    expect((segment?.usedMw ?? 0) * 0.98).toBeCloseTo(delivered, 1);
    expect(report.totals.lossesMw).toBeCloseTo((segment?.usedMw ?? 0) - delivered, 1);
  });
});

describe("01 §4.1 + 02 §5: border rows are take-or-pay", () => {
  test("import is billed from the setpoint, usage reported separately", () => {
    const scenario = makeScenario({
      plants: [],
      borders: [
        {
          id: "border-1",
          name: "B1",
          hex: { q: 0, r: 0 },
          throughputMw: 500,
          importSetpointMw: 0,
          exportSetpointMw: 0,
        },
      ],
    });
    const next = resolveTurn(
      applyAction(newGame(7, scenario), { type: "setImport", borderId: "border-1", mw: 200 }),
    );
    const report = reportOf(next);
    const row = report.borders[0];
    expect(row?.importSetpointMw).toBe(200);
    expect(row?.importUsedMw).toBeGreaterThan(0);
    expect(row?.importUsedMw).toBeLessThan(200); // city absorbs less at night
    expect(report.finance.importCostPln).toBe(
      Math.round(200 * 3 * CONFIG.importPricePlnPerMwh * DAY_WEIGHTS.working),
    );
    // The border is also a capped node — its throughput usage is reported.
    expect(report.nodes[0]?.nodeId).toBe("border-1");
    expect(report.nodes[0]?.usedMw).toBeGreaterThan(0);
    expect(report.nodes[0]?.throughputMw).toBe(500);
  });
});

describe("01 §2.3: the bet against the forecast", () => {
  test("wind row: forecast is the pre-reveal band center, actual is the truth", () => {
    const scenario = makeScenario({
      cities: [],
      plants: [],
      lines: [],
      farms: [
        {
          id: "farm-1",
          name: "F1",
          hex: { q: 0, r: 0 },
          tech: "wind",
          capacityMw: 200,
          enabled: true,
          windClass: "open",
          solarMultiplier: 1,
        },
      ],
    });
    const base = newGame(7, scenario);
    const farm = base.farms[0];
    if (!farm) throw new Error("farm missing");
    let expectedForecast = 0;
    let expectedBand = 0;
    let expectedActual = 0;
    for (let hour = 0; hour < 3; hour++) {
      expectedForecast += farmProductionForecast(base, "farm-1", hour)?.mw ?? 0;
      expectedBand += farmProductionForecast(base, "farm-1", hour)?.bandMw ?? 0;
      expectedActual += farmPowerMwAtHour(farm, base.dayTruth.weather, hour);
    }
    const report = reportOf(resolveTurn(base));
    expect(report.forecastMiss.wind.forecastMw).toBeCloseTo(expectedForecast / 3, 2);
    expect(report.forecastMiss.wind.bandMw).toBeCloseTo(expectedBand / 3, 2);
    expect(report.forecastMiss.wind.actualMw).toBeCloseTo(expectedActual / 3, 2);
    // An island farm dumps everything — and since 0.23 pays for it at the same
    // rate as a dispatchable block dumped at its source (01 §4.1). The engine
    // knows no RES setpoint, only the on/off switch, so this is what an
    // unconnected farm costs until a line reaches it or the player turns it off.
    expect(report.totals.resCurtailedMw).toBeCloseTo(expectedActual / 3, 2);
    expect(report.totals.dumpMw).toBe(0);
    expect(report.finance.dumpPenaltyPln).toBe(
      Math.round(
        report.totals.resCurtailedMw *
          HOURS_PER_TURN *
          CONFIG.dumpPenaltyPlnPerMwh *
          DAY_WEIGHTS.working,
      ),
    );
  });

  test("06 §8.6.4: the band is recorded because the reveal destroys it", () => {
    const scenario = makeScenario({
      farms: [
        {
          id: "farm-1",
          name: "F1",
          hex: { q: 0, r: 0 },
          tech: "wind",
          capacityMw: 200,
          enabled: true,
          windClass: "open",
          solarMultiplier: 1,
        },
      ],
    });
    const next = resolveTurn(newGame(7, scenario));
    const report = reportOf(next);
    expect(report.forecastMiss.wind.bandMw).toBeGreaterThan(0);
    expect(report.forecastMiss.demand.bandMw).toBeGreaterThan(0);
    // Asking the forecast again after the resolution gives a band of 0: those
    // hours are truth now, so the panel could not rebuild the note itself.
    expect(farmProductionForecast(next, "farm-1", 0)?.bandMw).toBe(0);
  });

  test("a farm switched off leaves no band of its own (01 §4.1)", () => {
    const scenario = makeScenario({
      farms: [
        {
          id: "farm-1",
          name: "F1",
          hex: { q: 0, r: 0 },
          tech: "pv",
          capacityMw: 200,
          enabled: false,
          windClass: "open",
          solarMultiplier: 1,
        },
      ],
    });
    const report = reportOf(resolveTurn(newGame(7, scenario)));
    expect(report.forecastMiss.pv).toStrictEqual({ forecastMw: 0, bandMw: 0, actualMw: 0 });
  });
});

describe("01 §5.3: storage rows", () => {
  test("discharge shows up with the SOC after the turn", () => {
    const scenario = makeScenario({
      plants: [],
      storages: [
        {
          id: "storage-1",
          name: "S1",
          hex: { q: 0, r: 0 },
          tech: "battery",
          powerMw: 100,
          capacityMwh: 400,
          socMwh: 300,
          setpoint: { mode: "discharge", mw: 100 },
        },
      ],
    });
    const report = reportOf(resolveTurn(newGame(7, scenario)));
    const row = report.storages[0];
    expect(row?.mode).toBe("discharge");
    expect(row?.dischargedMw).toBeGreaterThan(0);
    expect(row?.chargedMw).toBe(0);
    expect(row?.socMwhAfter).toBeLessThan(300);
  });
});

describe("01 §8 pt 3: balance projection at current setpoints", () => {
  test("covers the rest of the day and shrinks as turns resolve", () => {
    const base = applyAction(newGame(7, makeScenario()), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    const points = projectBalance(base);
    expect(points).toHaveLength(24);
    expect(points[0]?.hour).toBe(0);
    expect(points[0]?.horizonHours).toBe(1);
    for (const point of points) {
      expect(point.dispatchableMw).toBe(300);
      expect(point.worstCaseBalanceMw).toBeLessThanOrEqual(point.expectedBalanceMw);
    }
    // The band widens with the horizon (06 §8.6.2).
    expect(points[6]?.demandBandMw ?? 0).toBeGreaterThan(points[0]?.demandBandMw ?? 0);
    const later = projectBalance(resolveTurn(base));
    expect(later).toHaveLength(21);
    expect(later[0]?.hour).toBe(3);
  });

  test("storage discharge is capped by the current state of charge", () => {
    const scenario = makeScenario({
      plants: [],
      storages: [
        {
          id: "storage-1",
          name: "S1",
          hex: { q: 0, r: 0 },
          tech: "battery",
          powerMw: 100,
          capacityMwh: 400,
          socMwh: 30,
          setpoint: { mode: "discharge", mw: 100 },
        },
      ],
    });
    const points = projectBalance(newGame(7, scenario));
    const dispatchable = points[0]?.dispatchableMw ?? 0;
    expect(dispatchable).toBeGreaterThan(0);
    expect(dispatchable).toBeLessThan(100); // 30 MWh cannot sustain 100 MW for 3 h
  });
});

describe("01 §8 pt 2: the plan of a turn ahead of TERAZ", () => {
  const layerMw = (coverage: readonly number[], layer: CoverageLayer): number =>
    coverage[COVERAGE_LAYERS.indexOf(layer)] ?? 0;

  test("stacks the setpoints, and takes wind and PV from the forecast", () => {
    const scenario = makeScenario({
      farms: [
        {
          id: "farm-1",
          name: "F1",
          hex: { q: 1, r: 0 },
          tech: "wind",
          capacityMw: 200,
          enabled: true,
          windClass: "open",
          solarMultiplier: 1,
        },
      ],
      borders: [
        {
          id: "border-1",
          name: "B1",
          hex: { q: 5, r: 0 },
          throughputMw: 400,
          importSetpointMw: 50,
          exportSetpointMw: 0,
        },
      ],
    });
    const state = applyAction(newGame(7, scenario), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    const plan = projectTurnCoverage(state, 0, 0);
    const forecast = turnForecast(state, 0, 0);
    if (!plan || !forecast) throw new Error("the pending turn is always inside the horizon");

    expect(layerMw(plan.coverageMw, "gas")).toBe(300); // CCGT sits in the gas layer
    expect(layerMw(plan.coverageMw, "import")).toBe(50);
    expect(layerMw(plan.coverageMw, "wind")).toBe(forecast.wind.mw);
    expect(layerMw(plan.coverageMw, "wind")).toBeGreaterThan(0);
    expect(layerMw(plan.coverageMw, "pv")).toBe(0); // no PV farm stands on the map
    expect(plan.demand.mw).toBe(forecast.demand.mw);
    expect(plan.resBandMw).toBe(forecast.wind.bandMw + forecast.pv.bandMw);
  });

  test("a switched-off farm promises nothing, and the setpoint is capped by the block", () => {
    const scenario = makeScenario({
      farms: [
        {
          id: "farm-1",
          name: "F1",
          hex: { q: 1, r: 0 },
          tech: "wind",
          capacityMw: 200,
          enabled: false,
          windClass: "open",
          solarMultiplier: 1,
        },
      ],
    });
    const state = applyAction(newGame(7, scenario), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 400,
    });
    const plan = projectTurnCoverage(state, 0, 0);
    expect(layerMw(plan?.coverageMw ?? [], "wind")).toBe(0);
    // 400 MW is the plant's whole capacity — the plan may not promise more.
    expect(layerMw(plan?.coverageMw ?? [], "gas")).toBe(400);
  });

  test("storage discharge is capped by the state of charge, charging is extra load", () => {
    const scenario = makeScenario({
      plants: [],
      storages: [
        {
          id: "storage-1",
          name: "S1",
          hex: { q: 0, r: 0 },
          tech: "battery",
          powerMw: 100,
          capacityMwh: 400,
          socMwh: 30,
          setpoint: { mode: "discharge", mw: 100 },
        },
      ],
    });
    const discharging = newGame(7, scenario);
    const planned = layerMw(projectTurnCoverage(discharging, 0, 0)?.coverageMw ?? [], "storage");
    expect(planned).toBeGreaterThan(0);
    expect(planned).toBeLessThan(100); // 30 MWh cannot sustain 100 MW for 3 h

    const charging = applyAction(discharging, {
      type: "setStorage",
      storageId: "storage-1",
      mode: "charge",
      mw: 80,
    });
    const plan = projectTurnCoverage(charging, 0, 0);
    expect(layerMw(plan?.coverageMw ?? [], "storage")).toBe(0);
    expect(plan?.extraLoadMw).toBe(80);
  });

  test("reaches exactly as far as the forecast does, and never behind TERAZ", () => {
    const state = resolveTurn(resolveTurn(newGame(7, makeScenario())));
    const turns = forecastHorizonTurns(state);
    const pending = state.calendar.turnIndex;

    // Resolved turns have an archive entry instead of a plan (02 §4.1).
    expect(projectTurnCoverage(state, 0, pending - 1)).toBeUndefined();
    expect(projectTurnCoverage(state, 0, pending)).toBeDefined();
    // The horizon rolls with the turn: `pending + 8·D − 1` is the last one.
    const last = pending + turns - 1;
    expect(
      projectTurnCoverage(state, Math.floor(last / TURNS_PER_DAY), last % TURNS_PER_DAY),
    ).toBeDefined();
    const past = last + 1;
    expect(
      projectTurnCoverage(state, Math.floor(past / TURNS_PER_DAY), past % TURNS_PER_DAY),
    ).toBeUndefined();
  });
});
