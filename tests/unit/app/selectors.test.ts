// Derived views of GameState feeding the shell (01 §2.1, §2.4, §8).

import { describe, expect, test } from "vitest";
import { CONFIG, applyAction, newGame, resolveTurn, type GameState } from "../../../src/engine";
import { formatSignedMoneyPln } from "../../../src/app/format";
import { REGIME_LABELS } from "../../../src/app/labels";
import {
  budgetKpi,
  calendarContext,
  currentDayTurn,
  currentTurnTitle,
  dayResultKpi,
  dayResultPln,
  forecastSystemKpi,
  regimeForecastLabel,
  topBarContext,
  turnMeta,
} from "../../../src/app/store/selectors";

const BASE = newGame(1);

function at(dayIndex: number, turnIndex = 0, overrides: Partial<GameState> = {}): GameState {
  return { ...BASE, calendar: { dayIndex, turnIndex }, ...overrides };
}

describe("calendarContext — 01 §2.1", () => {
  test("a month is three representative days: working A, working B, free", () => {
    expect(calendarContext(at(0)).dayLabel).toBe("DOBA ROBOCZA A");
    expect(calendarContext(at(1)).dayLabel).toBe("DOBA ROBOCZA B");
    expect(calendarContext(at(2)).dayLabel).toBe("DOBA WOLNA");
    expect(calendarContext(at(2)).dayType).toBe("free");
  });

  test("a game year is 36 days, then the calendar rolls over to January", () => {
    expect(calendarContext(at(0)).year).toBe(1);
    expect(calendarContext(at(35)).year).toBe(1);
    expect(calendarContext(at(35)).monthName).toBe("GRUDZIEŃ");
    expect(calendarContext(at(36)).year).toBe(2);
    expect(calendarContext(at(36)).monthName).toBe("STYCZEŃ");
  });

  test("day weights are the representative-day weights of the doc", () => {
    expect(calendarContext(at(0)).dayWeight).toBe(10.9);
    expect(calendarContext(at(2)).dayWeight).toBe(8.7);
  });
});

describe("top bar", () => {
  test("context line carries year, month and day type", () => {
    expect(topBarContext(at(0))).toBe("ROK 1 · STYCZEŃ · DOBA ROBOCZA A");
    expect(topBarContext(at(37, 3))).toBe("ROK 2 · STYCZEŃ · DOBA ROBOCZA B");
  });

  test("regime shown is the FORECAST, not the truth (06 §8.4 pt 5)", () => {
    const state = at(0, 0, { monthRegimeForecast: "atlanticLow" });
    expect(regimeForecastLabel(state)).toBe("NIŻ ATLANTYCKI");
    // Every regime the engine can roll has a Polish label of doc 06 §8.2.
    expect(regimeForecastLabel(BASE)).toBe(REGIME_LABELS[BASE.monthRegimeForecast]);
  });

  test("budget KPI formats the starting endowment as billions", () => {
    expect(budgetKpi(BASE)).toBe("10,00 mld zł");
    expect(CONFIG.startingMoneyPln).toBe(10_000_000_000);
  });

  test("WYNIK DOBY sums the day's turn results (01 §8 pt 5)", () => {
    // Nothing resolved yet: a zero without a tone, because it is not a success.
    expect(dayResultKpi(BASE)).toStrictEqual({ value: "0 zł" });

    let state = applyAction(newGame(1), { type: "setPlantSetpoint", plantId: "plant-1", mw: 400 });
    for (let turn = 0; turn < 3; turn++) state = resolveTurn(state);
    expect(dayResultPln(state)).toBe(
      state.dayReports.reduce((sum, report) => sum + report.finance.netPln, 0),
    );
    expect(dayResultKpi(state).value).toBe(formatSignedMoneyPln(dayResultPln(state)));
    expect(dayResultKpi(state).tone).toBe(dayResultPln(state) >= 0 ? "ok" : "danger");
  });

  test("forecast KPI names the system and its horizon (01 §2.4)", () => {
    expect(forecastSystemKpi(BASE)).toBe("PODSTAWOWY · 24 H");
    expect(forecastSystemKpi(at(0, 0, { forecastLevel: "advanced" }))).toBe("ZAAWANSOWANY · 72 H");
    expect(forecastSystemKpi(at(0, 0, { forecastLevel: "ensemble" }))).toBe("ANSAMBLOWY · 168 H");
  });
});

describe("panel head", () => {
  test("meta line counts turns of the day and the day's weight", () => {
    expect(turnMeta(at(0, 0))).toBe("TURA 1/8 · STYCZEŃ · ×10,9 DNIA");
    expect(turnMeta(at(2, 7))).toBe("TURA 8/8 · STYCZEŃ · ×8,7 DNIA");
    expect(turnMeta(at(30, 4))).toBe("TURA 5/8 · LISTOPAD · ×10,9 DNIA");
  });

  test("title is the full phase name, the axis cell keeps the abbreviation", () => {
    expect(currentTurnTitle(at(0, 6))).toBe("SZCZYT WIECZORNY");
    expect(currentDayTurn(at(0, 6)).name).toBe("SZCZYT WIECZ.");
    expect(currentDayTurn(at(0, 6)).hours).toBe("18–21");
    expect(currentTurnTitle(at(0, 0))).toBe("NOC");
  });
});
