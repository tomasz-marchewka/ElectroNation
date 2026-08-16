// Derived views of GameState — pure functions, no React, no store. Everything
// the shell prints comes from here, so the components stay markup only.

import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  DAY_WEIGHTS,
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  dayTypeForGameDay,
  forecastHorizonDays,
  monthForGameDay,
  type DayType,
  type GameState,
} from "../../engine";
import { formatMoneyPln, formatMultiplier, formatNumber, formatSignedMoneyPln } from "../format";
import {
  DAY_TURN_FULL_NAMES,
  FORECAST_LEVEL_LABELS,
  MONTH_NAMES,
  REGIME_LABELS,
  dayTurnAt,
  type DayTurn,
} from "../labels";

export interface CalendarContext {
  /** 1-based game year; a game year is 36 days (01 §2.1). */
  year: number;
  /** 0..11 month of the calendar year. */
  month: number;
  monthName: string;
  /** 0..DAYS_PER_MONTH-1 — which representative day of the month this is. */
  dayOfMonth: number;
  dayType: DayType;
  /** "DOBA ROBOCZA A" | "DOBA ROBOCZA B" | "DOBA WOLNA". */
  dayLabel: string;
  /** How many real days this game day stands for (01 §2.1). */
  dayWeight: number;
  /** 0..7 within the day. */
  turnIndex: number;
}

export function calendarContext(state: GameState): CalendarContext {
  const { dayIndex, turnIndex } = state.calendar;
  const month = monthForGameDay(dayIndex);
  const dayOfMonth = dayIndex % DAYS_PER_MONTH;
  const dayType = dayTypeForGameDay(dayIndex);
  return {
    year: Math.floor(dayIndex / DAYS_PER_YEAR) + 1,
    month,
    monthName: MONTH_NAMES[month] ?? "",
    dayOfMonth,
    dayType,
    // Working days of a month are lettered A, B…; the last one is the free day.
    dayLabel:
      dayType === "free"
        ? "DOBA WOLNA"
        : `DOBA ROBOCZA ${String.fromCharCode("A".charCodeAt(0) + dayOfMonth)}`,
    dayWeight: DAY_WEIGHTS[dayType],
    turnIndex,
  };
}

/** Top bar context line: `ROK 1 · STYCZEŃ · DOBA ROBOCZA A`. */
export function topBarContext(state: GameState): string {
  const context = calendarContext(state);
  return `ROK ${context.year} · ${context.monthName} · ${context.dayLabel}`;
}

/**
 * Regime shown in the top bar. Deliberately the FORECAST (06 §8.4 pt 5), not
 * `monthRegimes.dominant`: the player never sees the truth of the current
 * state, only its noisy view (01 §2.4).
 */
export function regimeForecastLabel(state: GameState): string {
  return REGIME_LABELS[state.monthRegimeForecast];
}

/** Budget KPI — `10,00 mld zł`. */
export function budgetKpi(state: GameState): string {
  return formatMoneyPln(state.moneyPln);
}

/** Sum of the turn results of the day being played (01 §8 pt 5). */
export function dayResultPln(state: GameState): number {
  return state.dayReports.reduce((sum, report) => sum + report.finance.netPln, 0);
}

export interface DayResultKpi {
  /** `+46,9 mln zł`. */
  value: string;
  tone?: "ok" | "danger";
}

/**
 * `WYNIK DOBY` KPI. Before the day's first turn is resolved the history still
 * describes the finished day (state.ts), which is exactly what the player wants
 * to read right after committing its last turn; a session that has resolved
 * nothing at all shows a toneless zero rather than a green success.
 */
export function dayResultKpi(state: GameState): DayResultKpi {
  const pln = dayResultPln(state);
  if (state.dayReports.length === 0) return { value: formatSignedMoneyPln(pln) };
  return { value: formatSignedMoneyPln(pln), tone: pln >= 0 ? "ok" : "danger" };
}

/**
 * Forecast-system KPI — `PODSTAWOWY · 24 H` (01 §2.4). The horizon comes from
 * the engine, not from the level table: the bar must name exactly the horizon
 * the forecast actually reaches.
 */
export function forecastSystemKpi(state: GameState): string {
  const horizonHours = forecastHorizonDays(state) * TURNS_PER_DAY * HOURS_PER_TURN;
  return `${FORECAST_LEVEL_LABELS[state.forecastLevel]} · ${formatNumber(horizonHours)} H`;
}

/** Panel meta line — `TURA 1/8 · STYCZEŃ · ×10,9 DNIA`. */
export function turnMeta(state: GameState): string {
  const context = calendarContext(state);
  return `TURA ${context.turnIndex + 1}/${TURNS_PER_DAY} · ${context.monthName} · ${formatMultiplier(
    context.dayWeight,
  )} DNIA`;
}

/** Turn cell of the current turn — name and hour block for the day axis. */
export function currentDayTurn(state: GameState): DayTurn {
  return dayTurnAt(state.calendar.turnIndex);
}

/** Full phase name for the panel title — `SZCZYT WIECZORNY`, not `SZCZYT WIECZ.`. */
export function currentTurnTitle(state: GameState): string {
  return DAY_TURN_FULL_NAMES[currentDayTurn(state).phase];
}
