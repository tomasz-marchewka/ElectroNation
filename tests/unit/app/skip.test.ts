// Turn scrubbing (01 §2.5): running to a chosen turn, and running until
// something happens. The stop rules are asserted against real resolutions —
// every number in a diagnosis comes out of the turn report it names.

import { describe, expect, test } from "vitest";
import {
  TURNS_PER_DAY,
  applyAction,
  finishedLine,
  newGame,
  resolveTurn,
  type GameState,
  type HexCoord,
  type Scenario,
  type TurnReport,
} from "../../../src/engine";
import {
  SKIP_BALANCE_DROP_PLN,
  scrubToTurn,
  skipStop,
  skipTurns,
} from "../../../src/app/store/skip";
import { makeScenario } from "../../helpers/scenario";

function at(q: number): HexCoord {
  return { q, r: 0 };
}

/**
 * A day nothing happens on: demand comfortably covered over an HV line with
 * capacity to spare, no farms to miss their forecast with. Seed 1 is a day
 * whose demand lands inside its own forecast band.
 */
const QUIET_SCENARIO: Scenario = makeScenario({
  plants: [
    { id: "plant-1", name: "EC Cicha", hex: at(0), tech: "ccgt", capacityMw: 400, setpointMw: 0 },
  ],
  lines: [finishedLine("line-1", "hv", [0, 1, 2, 3, 4].map(at))],
});

function quietDay(seed = 1): GameState {
  return applyAction(newGame(seed, QUIET_SCENARIO), {
    type: "setPlantSetpoint",
    plantId: "plant-1",
    mw: 110,
  });
}

/**
 * The same grid on a thin NN line, with a battery charging behind the city.
 * Charging is a sink the flow may curtail, so the line runs to its limit
 * without leaving anyone in the dark — an overload, not a shortfall.
 */
const TIGHT_SCENARIO: Scenario = makeScenario({
  plants: [
    { id: "plant-1", name: "EC Kres", hex: at(0), tech: "ccgt", capacityMw: 400, setpointMw: 0 },
  ],
  storages: [
    {
      id: "storage-1",
      name: "BESS Polana",
      hex: at(3),
      tech: "battery",
      powerMw: 150,
      capacityMwh: 400,
      socMwh: 0,
      setpoint: { mode: "charge", mw: 120 },
    },
  ],
  lines: [finishedLine("line-1", "lv", [0, 1, 2, 3, 4].map(at))],
});

function reportOf(state: GameState): TurnReport {
  const report = state.lastTurnReport;
  if (report === null) throw new Error("resolveTurn must record lastTurnReport");
  return report;
}

describe("01 §2.5: przewiń — until something happens", () => {
  test("stops on a shortfall, on the turn that caused it", () => {
    // Nothing is dispatched, so the very first turn leaves the city dark.
    const { game, stop } = skipTurns(newGame(7, makeScenario()));

    expect(stop?.kind).toBe("shortfall");
    expect(stop?.turnIndex).toBe(0);
    expect(stop?.text).toBe(
      `⏭ zatrzymano: TURA 1 — niedobór ${Math.round(reportOf(game).totals.ensMw)} MW w A`,
    );
    // The turn that tripped the rule IS resolved: the report strip shows it.
    expect(game.calendar.turnIndex).toBe(1);
    expect(game.lastTurnReport?.turnIndex).toBe(0);
  });

  test("stops on a line at its limit, naming the line and the stretch", () => {
    const state = applyAction(newGame(7, TIGHT_SCENARIO), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 160,
    });
    const { game, stop } = skipTurns(state);

    expect(stop?.kind).toBe("overload");
    expect(stop?.text).toBe(
      "⏭ zatrzymano: TURA 1 — linia NN 100% przepustowości (EC KRES – BESS POLANA)",
    );
    // The city is fully served — a curtailed charge is not a shortfall.
    expect(reportOf(game).totals.ensMw).toBe(0);
  });

  test("stops when the truth lands outside the band the forecast promised", () => {
    const { stop } = skipTurns(quietDay(2));
    expect(stop?.kind).toBe("forecast");
    expect(stop?.text).toMatch(/^⏭ zatrzymano: TURA 1 — popyt .* poza pasmem prognozy .* ±.* MW$/);
  });

  test("an uneventful day runs to its end and stops at the day boundary", () => {
    const before = quietDay();
    const { game, stop } = skipTurns(before);

    expect(stop).toBeNull();
    expect(game.calendar).toStrictEqual({ dayIndex: 1, turnIndex: 0 });
    expect(game.dayReports).toHaveLength(TURNS_PER_DAY);
    // Whole days are never scrubbed at once (01 §2.5): the day is the unit, so
    // one run of the scrub can never carry the calendar past the next one.
    expect(skipTurns(game).game.calendar.dayIndex).toBeLessThanOrEqual(game.calendar.dayIndex + 1);
  });

  test("setpoints survive a scrub untouched — the risk is taken, not dodged", () => {
    const before = applyAction(newGame(7, TIGHT_SCENARIO), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 160,
    });
    const { game } = skipTurns(before);

    expect(game.plants.map((plant) => plant.setpointMw)).toStrictEqual(
      before.plants.map((plant) => plant.setpointMw),
    );
    expect(game.storages.map((storage) => storage.setpoint)).toStrictEqual(
      before.storages.map((storage) => storage.setpoint),
    );
    expect(game.farms.map((farm) => farm.enabled)).toStrictEqual(
      before.farms.map((farm) => farm.enabled),
    );
  });
});

describe("01 §2.5: the money rule compares turns of one day", () => {
  test("a result that falls off a cliff against the previous turn stops the scrub", () => {
    const state = resolveTurn(quietDay());
    const report = reportOf(state);
    const previous: TurnReport = {
      ...report,
      finance: { ...report.finance, netPln: report.finance.netPln + SKIP_BALANCE_DROP_PLN + 1 },
    };
    const stop = skipStop(state, { ...report, turnIndex: 1 }, previous);

    expect(stop?.kind).toBe("balance");
    expect(stop?.text).toContain("gorszy niż w turze 1");
    // A drop of exactly the threshold is still within tuning tolerance.
    const atThreshold = {
      ...previous,
      finance: { ...previous.finance, netPln: report.finance.netPln + SKIP_BALANCE_DROP_PLN },
    };
    expect(skipStop(state, { ...report, turnIndex: 1 }, atThreshold)).toBeNull();
  });

  test("turns of different days are not compared — their money carries different weights", () => {
    const state = resolveTurn(quietDay());
    const report = reportOf(state);
    const yesterday: TurnReport = {
      ...report,
      dayIndex: report.dayIndex - 1,
      finance: { ...report.finance, netPln: report.finance.netPln + 10 * SKIP_BALANCE_DROP_PLN },
    };
    expect(skipStop(state, report, yesterday)).toBeNull();
  });
});

describe("01 §2.5: przewiń do tury", () => {
  test("resolves exactly the turns between here and the chosen one", () => {
    const state = scrubToTurn(quietDay(), 5);

    expect(state.calendar).toStrictEqual({ dayIndex: 0, turnIndex: 5 });
    expect(state.dayReports.map((report) => report.turnIndex)).toStrictEqual([0, 1, 2, 3, 4]);
  });

  test("never leaves the day, and never runs backwards", () => {
    const state = scrubToTurn(quietDay(), 3);

    // A target beyond the day is clamped to its last turn (01 §2.5 rhythm).
    expect(scrubToTurn(state, 99).calendar).toStrictEqual({ dayIndex: 0, turnIndex: 7 });
    // The past and the present are not targets: nothing is resolved.
    expect(scrubToTurn(state, 3)).toBe(state);
    expect(scrubToTurn(state, 0)).toBe(state);
  });
});
