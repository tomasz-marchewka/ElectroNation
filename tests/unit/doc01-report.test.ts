import { describe, expect, test } from "vitest";
import {
  CONFIG,
  DAY_WEIGHTS,
  TURNS_PER_DAY,
  applyAction,
  farmPowerMwAtHour,
  farmProductionForecast,
  finishedLine,
  newGame,
  projectBalance,
  resolveTurn,
  type GameState,
  type Scenario,
  type TurnReport,
} from "../../src/engine";

// Spec tests for the last-turn report — the RAPORT panel and the map's data
// source (01 §2.3, §8) — and the balance projection (01 §8 pt 3, 06 §8.6.4).

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
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
    let expectedActual = 0;
    for (let hour = 0; hour < 3; hour++) {
      expectedForecast += farmProductionForecast(base, "farm-1", hour)?.mw ?? 0;
      expectedActual += farmPowerMwAtHour(farm, base.dayTruth.weather, hour);
    }
    const report = reportOf(resolveTurn(base));
    expect(report.forecastMiss.wind.forecastMw).toBeCloseTo(expectedForecast / 3, 2);
    expect(report.forecastMiss.wind.actualMw).toBeCloseTo(expectedActual / 3, 2);
    // An island farm dumps everything — free RES curtailment (01 §4.1).
    expect(report.totals.resCurtailedMw).toBeCloseTo(expectedActual / 3, 2);
    expect(report.finance.dumpPenaltyPln).toBe(0);
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
