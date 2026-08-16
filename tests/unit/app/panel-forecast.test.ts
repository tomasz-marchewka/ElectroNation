// The panel's forecast and balance model (01 §8 pt 3, 06 §8.6.4). Every
// expectation is recomputed from the engine's own API — never from a constant
// copied out of the handoff's mock.

import { describe, expect, test } from "vitest";
import {
  HOURS_PER_TURN,
  applyAction,
  cityDemandForecast,
  farmProductionForecast,
  newGame,
  projectBalance,
  type FarmState,
  type GameState,
} from "../../../src/engine";
import {
  balanceTone,
  balanceValueText,
  forecastRows,
  forecastScaleMw,
  isNightBlock,
  panelForecast,
} from "../../../src/app/panel/forecast";
import { makeScenario } from "../../helpers/scenario";

function windFarm(overrides: Partial<FarmState> = {}): FarmState {
  return {
    id: "farm-w",
    name: "FW",
    hex: { q: 0, r: 0 },
    tech: "wind",
    capacityMw: 200,
    enabled: true,
    windClass: "open",
    solarMultiplier: 1,
    ...overrides,
  };
}

/** Hand-summed block average of the whole hourly series a row aggregates. */
function blockSum(state: GameState, at: (hour: number) => number): number {
  const startHour = state.calendar.turnIndex * HOURS_PER_TURN;
  let sum = 0;
  for (let hour = startHour; hour < startHour + HOURS_PER_TURN; hour++) sum += at(hour);
  return sum / HOURS_PER_TURN;
}

describe("forecast rows — 06 §8.6.4: a band, never a number", () => {
  test("POPYT sums the forecast of the CONNECTED cities, bands included", () => {
    const scenario = makeScenario();
    const unconnected = { ...scenario.cities[0]!, id: "city-b", connected: false };
    const state = newGame(7, { ...scenario, cities: [...scenario.cities, unconnected] });
    const row = forecastRows(state)[0]!;

    expect(row.key).toBe("demand");
    expect(row.mw).toBeCloseTo(
      blockSum(state, (hour) => cityDemandForecast(state, "city-a", hour)?.mw ?? 0),
      6,
    );
    expect(row.bandMw).toBeCloseTo(
      blockSum(state, (hour) => cityDemandForecast(state, "city-a", hour)?.bandMw ?? 0),
      6,
    );
    // The unconnected city is not a customer yet (01 §3.4) — no MW, no band.
    expect(row.mw).toBeGreaterThan(0);
  });

  test("WIATR sums only the farms that are switched on (01 §4.1)", () => {
    const state = newGame(7, {
      ...makeScenario(),
      farms: [windFarm(), windFarm({ id: "farm-off", name: "FW OFF", enabled: false })],
    });
    const row = forecastRows(state)[1]!;

    expect(row.key).toBe("wind");
    expect(row.mw).toBeCloseTo(
      blockSum(state, (hour) => farmProductionForecast(state, "farm-w", hour)?.mw ?? 0),
      6,
    );
    expect(row.note).toBeUndefined();
  });

  test("a row with nothing to bet on says so instead of printing a band", () => {
    const empty = forecastRows(newGame(7, makeScenario()));
    expect(empty[1]?.note).toBe("0 · BRAK FARM");
    expect(empty[2]?.note).toBe("0 · BRAK FARM");

    const allOff = forecastRows(
      newGame(7, { ...makeScenario(), farms: [windFarm({ enabled: false })] }),
    );
    expect(allOff[1]?.note).toBe("0 · WYŁ.");
    expect(allOff[1]?.muted).toBe(true);
  });

  test("PV after sunset carries the night note (06 §3.6)", () => {
    const base = newGame(7, {
      ...makeScenario(),
      farms: [windFarm({ id: "farm-pv", name: "PV", tech: "pv" })],
    });
    // Turn 1 of a January day is 00–03: the sun is down for the whole block.
    expect(isNightBlock(base, 0)).toBe(true);
    expect(isNightBlock(base, 12)).toBe(false);

    // The error process is a share of installed capacity and clamps at zero, so
    // the note is only right when the forecast really is nothing — pin the day's
    // PV error factor down instead of relying on the roll.
    const state: GameState = {
      ...base,
      dayTruth: { ...base.dayTruth, forecastZ: { ...base.dayTruth.forecastZ, pv: -1 } },
    };
    const row = forecastRows(state)[2]!;
    expect(row.mw).toBe(0);
    expect(row.note).toBe("0 · NOC");
  });
});

describe("shared track scale — ForecastRow.prompt.md", () => {
  test("covers the whole day, so bands do not jump from turn to turn", () => {
    const state = newGame(7, { ...makeScenario(), farms: [windFarm()] });
    const scale = forecastScaleMw(state);

    expect(scale % 100).toBe(0);
    for (const row of forecastRows(state)) expect(row.mw + row.bandMw).toBeLessThanOrEqual(scale);
    // Same day, later turn: the scale is the day's, not the block's.
    expect(forecastScaleMw({ ...state, calendar: { dayIndex: 0, turnIndex: 5 } })).toBe(scale);
  });
});

describe("balance tone — 06 §8.6.4", () => {
  test("negative is a deficit, a band that eats the reserve is thin", () => {
    expect(balanceTone(-1, -50)).toBe("danger");
    expect(balanceTone(0, -50)).toBe("warn");
    expect(balanceTone(40, -10)).toBe("warn");
    expect(balanceTone(40, 0)).toBe("ok");
    expect(balanceValueText(214, "ok")).toBe("+214 MW ✓");
    expect(balanceValueText(-38, "danger")).toBe("−38 MW ✕");
  });

  test("the tone of a real projection follows the engine's own numbers", () => {
    const idle = newGame(7, makeScenario());
    const point = projectBalance(idle)[0]!;
    expect(point.expectedBalanceMw).toBeLessThan(0);
    expect(panelForecast(idle).summary.tone).toBe("danger");

    const covered = applyAction(idle, { type: "setPlantSetpoint", plantId: "plant-1", mw: 400 });
    expect(panelForecast(covered).summary.tone).toBe("ok");
  });
});

describe("balance at current setpoints — 01 §8 pt 3", () => {
  test("three blocks ahead, and fewer as the day runs out", () => {
    const state = newGame(7, makeScenario());
    expect(panelForecast(state).turns).toHaveLength(3);
    expect(panelForecast(state).turns[0]?.label).toBe("T1 NOC");
    expect(panelForecast(state).turns[2]?.label).toBe("T3 RANO");

    // The projection stops at midnight and the basic system does not reach
    // tomorrow (01 §2.4), so the column shortens instead of inventing rows.
    const late = { ...state, calendar: { dayIndex: 0, turnIndex: 6 } };
    expect(panelForecast(late).turns.map((row) => row.label)).toEqual([
      "T7 SZCZYT WIECZ.",
      "T8 PÓŹNY WIECZ.",
    ]);
    expect(panelForecast({ ...state, calendar: { dayIndex: 0, turnIndex: 7 } }).turns).toHaveLength(
      1,
    );
  });

  test("the summary adds up: plan − demand − extra load = the reserve", () => {
    const scenario = makeScenario({
      storages: [
        {
          id: "storage-1",
          name: "S1",
          hex: { q: 0, r: 0 },
          tech: "battery",
          powerMw: 100,
          capacityMwh: 400,
          socMwh: 0,
          setpoint: { mode: "charge", mw: 100 },
        },
      ],
    });
    const state = applyAction(newGame(7, scenario), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    const { summary } = panelForecast(state);

    expect(summary.extraLoadMw).toBeCloseTo(100, 6);
    expect(summary.planMw - summary.demandMw - summary.extraLoadMw).toBeCloseTo(
      summary.balanceMw,
      6,
    );
    expect(summary.rows.map((row) => row.label)).toEqual([
      "ZAPOTRZEBOWANIE",
      "ŁADOWANIE + EKSPORT",
      "PLAN POKRYCIA",
    ]);
    // Nothing charging or exporting: the row is not printed at all.
    const plain = panelForecast(newGame(7, makeScenario()));
    expect(plain.summary.rows.map((row) => row.label)).toEqual([
      "ZAPOTRZEBOWANIE",
      "PLAN POKRYCIA",
    ]);
  });

  test("the diagnosis names the number it is built from", () => {
    const idle = panelForecast(newGame(7, makeScenario()));
    expect(idle.summary.note).toMatch(/^✕ plan nie domyka bilansu — brakuje /);

    const covered = panelForecast(
      applyAction(newGame(7, makeScenario()), {
        type: "setPlantSetpoint",
        plantId: "plant-1",
        mw: 400,
      }),
    );
    expect(covered.summary.note).toBe("✓ zapas pokrywa dolne pasmo prognozy");
  });

  test("losses are NOT part of the plan — the projection is network-blind", () => {
    const state = applyAction(newGame(7, makeScenario()), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    const { summary } = panelForecast(state);
    // 300 MW of setpoint reaches the plan whole; the 2% line loss of 01 §4.2
    // only shows up once the turn resolves.
    expect(summary.planMw).toBeCloseTo(300, 6);
  });
});
