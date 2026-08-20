// The detailed report's period arithmetic and aggregation. Every number is
// compared against the digests the engine archived, never against a constant
// copied into the UI: the report is a second reading of the same archive the
// strip and the ribbon read (02 §4.1), and it may not disagree with them.

import { describe, expect, test } from "vitest";
import {
  CONFIG,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  applyAction,
  newGame,
  resolveTurn,
  type GameState,
} from "../../../src/engine";
import {
  SCOPE_TURNS,
  aggregatePeriod,
  nextPeriod,
  periodAt,
  previousPeriod,
  resolveAnchor,
} from "../../../src/app/report/period";
import { buildPeriodReport } from "../../../src/app/report/reportModel";
import { dayResultPln } from "../../../src/app/store/selectors";
import { makeScenario } from "../../helpers/scenario";

/** A world with wind AND PV standing on it, so both bets are non-trivial. */
function windyGame(): GameState {
  return newGame(7, {
    ...makeScenario(),
    farms: [
      {
        id: "farm-wind",
        name: "FW",
        hex: { q: 1, r: 0 },
        tech: "wind",
        capacityMw: 200,
        enabled: true,
        windClass: "open",
        solarMultiplier: 1,
      },
      {
        id: "farm-pv",
        name: "PV",
        hex: { q: 2, r: 0 },
        tech: "pv",
        capacityMw: 150,
        enabled: true,
        windClass: "open",
        solarMultiplier: 1,
      },
    ],
  });
}

/** Runs `turns` turns with the plant held at `mw`. */
function play(state: GameState, turns: number, mw = 300): GameState {
  let game = applyAction(state, { type: "setPlantSetpoint", plantId: "plant-1", mw });
  for (let turn = 0; turn < turns; turn++) game = resolveTurn(game);
  return game;
}

describe("period arithmetic — the scopes of 01 §2.1–2.2", () => {
  test("a period spans the turns its scope is made of", () => {
    expect(SCOPE_TURNS).toEqual({
      turn: 1,
      day: TURNS_PER_DAY,
      month: TURNS_PER_DAY * DAYS_PER_MONTH,
      year: TURNS_PER_DAY * DAYS_PER_YEAR,
    });
  });

  test("every scope brackets the turn it is asked about", () => {
    // Turn 30 = day 3 (turn 6), month 1 (days 3–5), year 0.
    expect(periodAt("turn", 30)).toMatchObject({ fromTurn: 30, toTurn: 30, index: 30 });
    expect(periodAt("day", 30)).toMatchObject({ fromTurn: 24, toTurn: 31, index: 3 });
    expect(periodAt("month", 30)).toMatchObject({ fromTurn: 24, toTurn: 47, index: 1 });
    expect(periodAt("year", 30)).toMatchObject({ fromTurn: 0, toTurn: 287, index: 0 });
  });
});

describe("aggregation agrees with the archive", () => {
  test("a day's finance is the day's turn results, to the złoty", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    const aggregate = aggregatePeriod(game, periodAt("day", 0));

    expect(aggregate.resolvedTurns).toBe(TURNS_PER_DAY);
    expect(aggregate.finance.netPln).toBe(dayResultPln(game));
    expect(aggregate.finance.netPln).toBe(
      game.history.reduce((sum, digest) => sum + digest.finance.netPln, 0),
    );
  });

  test("energy carries the day weight, so zł/MWh comes out at the tariff", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    const { energy, finance } = aggregatePeriod(game, periodAt("day", 0));

    // The engine bills `deliveredMw × 3 h × tariff × weight` (01 §2.1, §6).
    // Aggregating energy WITHOUT the weight would put this ten times off.
    // Rounded to whole PLN per turn and quantized to 0,001 MW, so the quotient
    // lands within a grosz of the tariff — a missing weight would put it at 60.
    expect(finance.revenueEnergyPln / energy.deliveredMwh).toBeCloseTo(CONFIG.tariffPlnPerMwh, 1);
    const firstDigest = game.history[0];
    if (!firstDigest) throw new Error("nothing archived");
    expect(energy.demandMwh).toBeGreaterThan(
      firstDigest.totals.demandMw * HOURS_PER_TURN * TURNS_PER_DAY,
    );
  });

  test("a day stands for ~10,9 real days (01 §2.1)", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    expect(aggregatePeriod(game, periodAt("day", 0)).realDays).toBeCloseTo(10.9, 6);
  });

  test("coverage layers sum to what the sources actually delivered", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    const aggregate = aggregatePeriod(game, periodAt("day", 0));
    const layers = aggregate.coverageMwh.reduce((sum, layer) => sum + layer, 0);
    // Everything a source put in either reached a city or was lost on the way;
    // the rest of the stack (charging, export) is out of this comparison, so
    // coverage can only be greater or equal.
    expect(layers).toBeGreaterThanOrEqual(aggregate.energy.deliveredMwh - 1e-6);
  });

  test("a period nobody has played yet aggregates to zero, not to null", () => {
    const game = play(windyGame(), 3);
    const aggregate = aggregatePeriod(game, periodAt("month", TURNS_PER_DAY * DAYS_PER_MONTH));
    expect(aggregate.resolvedTurns).toBe(0);
    expect(aggregate.finance.netPln).toBe(0);
    expect(aggregate.shortfalls).toEqual([]);
  });
});

describe("the forecast is scored for PV as well as for wind (01 §2.4)", () => {
  test("a single turn scores its own miss, per quantity", () => {
    const game = play(windyGame(), 1);
    const digest = game.history[0];
    if (!digest) throw new Error("nothing archived");
    const { forecast } = aggregatePeriod(game, periodAt("turn", 0));

    for (const key of ["demand", "wind", "pv"] as const) {
      const miss = digest.forecastMiss[key];
      expect(forecast[key].actualMw).toBeCloseTo(miss.actualMw, 9);
      expect(forecast[key].forecastMw).toBeCloseTo(miss.forecastMw, 9);
      expect(forecast[key].maeMw).toBeCloseTo(Math.abs(miss.actualMw - miss.forecastMw), 9);
      expect(forecast[key].biasMw).toBeCloseTo(miss.actualMw - miss.forecastMw, 9);
      expect(forecast[key].inBandTurns).toBe(
        Math.abs(miss.actualMw - miss.forecastMw) <= miss.bandMw ? 1 : 0,
      );
    }
  });

  test("over a day the error is a mean and the band count is a tally", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    const { forecast } = aggregatePeriod(game, periodAt("day", 0));
    const windErrors = game.history.map(
      (digest) => digest.forecastMiss.wind.actualMw - digest.forecastMiss.wind.forecastMw,
    );

    expect(forecast.wind.maeMw).toBeCloseTo(
      windErrors.reduce((sum, error) => sum + Math.abs(error), 0) / TURNS_PER_DAY,
      9,
    );
    expect(forecast.wind.inBandTurns).toBeLessThanOrEqual(TURNS_PER_DAY);
    expect(forecast.pv.actualMwh).toBeGreaterThan(0);
  });
});

describe("scrolling stays inside the archive", () => {
  test("forward stops at the last resolved turn, back at the first archived one", () => {
    const game = play(windyGame(), TURNS_PER_DAY + 2);
    const newest = resolveAnchor(game, "day", null);
    if (!newest) throw new Error("no period");

    expect(newest.index).toBe(1);
    expect(nextPeriod(game, newest)).toBeNull();
    const previous = previousPeriod(game, newest);
    expect(previous?.index).toBe(0);
    if (!previous) throw new Error("no previous day");
    expect(previousPeriod(game, previous)).toBeNull();
    expect(nextPeriod(game, previous)?.index).toBe(1);
  });

  test("switching scope keeps the moment and only changes the zoom", () => {
    const game = play(windyGame(), TURNS_PER_DAY + 2);
    // Anchored on the first turn of day 0, the month scope must land on the
    // month holding it — not on the newest month.
    expect(resolveAnchor(game, "day", 0)?.index).toBe(0);
    expect(resolveAnchor(game, "month", 0)?.index).toBe(0);
    expect(resolveAnchor(game, "turn", 0)?.fromTurn).toBe(0);
  });

  test("an anchor outside the archive is clamped, never dropped", () => {
    const game = play(windyGame(), 4);
    expect(resolveAnchor(game, "turn", 999)?.fromTurn).toBe(3);
    expect(resolveAnchor(game, "turn", -50)?.fromTurn).toBe(0);
    expect(resolveAnchor(newGame(7, makeScenario()), "turn", null)).toBeNull();
  });
});

describe("the report model", () => {
  test("names the period and prints the five sections", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    const model = buildPeriodReport(game, "day", null);
    if (!model) throw new Error("no report");

    expect(model.title).toBe("DOBA ROBOCZA A");
    expect(model.subtitle).toContain("ROK 1 · STYCZEŃ");
    expect(model.coverage).toBe("8/8 TUR · RÓWNOWAŻNIK 10,9 DNIA");
    expect(model.sections.map((section) => section.label)).toEqual([
      "BILANS ENERGII",
      "POKRYCIE ŹRÓDŁAMI",
      "PROGNOZA vs PRAWDA",
      "FINANSE",
      "NIEDOBORY W MIASTACH",
    ]);
    expect(model.atNewest).toBe(true);
    expect(model.nextAnchor).toBeNull();
  });

  test("PV has a row of its own — the strip's tile is not the whole story", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    const model = buildPeriodReport(game, "day", null);
    const forecast = model?.sections.find((section) => section.label === "PROGNOZA vs PRAWDA");
    expect(forecast?.rows.map((row) => row.label)).toEqual(["POPYT", "WIATR", "PV"]);
    expect(forecast?.rows.find((row) => row.label === "PV")?.note).toContain("W PAŚMIE");
  });

  test("the turn scope reads in MW, wider scopes in energy", () => {
    const game = play(windyGame(), TURNS_PER_DAY);
    const turn = buildPeriodReport(game, "turn", null);
    const day = buildPeriodReport(game, "day", null);
    const demandOf = (model: typeof turn): string | undefined =>
      model?.sections[0]?.rows.find((row) => row.label === "ZAPOTRZEBOWANIE")?.value;

    expect(demandOf(turn)).toMatch(/MW$/);
    expect(demandOf(day)).toMatch(/(MWh|GWh|TWh)$/);
    expect(turn?.title).toContain("TURA 8");
  });

  test("a session that resolved nothing has no report to build", () => {
    expect(buildPeriodReport(newGame(7, makeScenario()), "day", null)).toBeNull();
  });
});
