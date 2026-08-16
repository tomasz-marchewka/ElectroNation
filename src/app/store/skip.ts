// Turn scrubbing (01 §2.5): the player either runs to a chosen turn or runs
// "until something happens". The engine is pure and fast, so both are plain
// loops over `resolveTurn` — and because they are pure too, the store only has
// to hand the result over to React.
//
// Setpoints are NOT touched on the way: scrubbing is an informed acceptance of
// risk, not a free skip (01 §2.5). There is no auto-dispatch in this game
// (01 §8 pt 4).
//
// This module is also the one place where the stop thresholds live — they are
// meant to be tuned by playing, so they are named, commented and gathered here
// rather than spread over the rules that read them.

import {
  TURNS_PER_DAY,
  resolveTurn,
  type GameState,
  type LineType,
  type TurnReport,
} from "../../engine";
import {
  formatBand,
  formatMoneyPln,
  formatMw,
  formatPercent,
  formatSignedMoneyPln,
} from "../format";
import { LINE_TYPE_LABELS } from "../labels";

/** Below this a shortfall is rounding, not an event — report power is ±0,001 MW. */
export const SKIP_ENS_MW = 0.01;

/** A segment at or above this share of its capacity is worth stopping for. */
export const SKIP_OVERLOAD_RATIO = 0.9;

/**
 * A turn result this much worse than the previous turn's stops the scrub [PLN].
 * Day-weighted money, so the scale is a day's worth of one turn (01 §2.1) —
 * about a fifth of a good turn's result on the starting grid.
 */
export const SKIP_BALANCE_DROP_PLN = 20_000_000;

/** How many city names a shortfall line prints before it counts the rest. */
const NAMED_CITIES = 2;

export type SkipStopKind = "shortfall" | "overload" | "forecast" | "balance";

export interface SkipStop {
  kind: SkipStopKind;
  /** 0-based turn whose report tripped the rule. */
  turnIndex: number;
  /** The diagnosis line shown above the buttons — impersonal, with its source. */
  text: string;
}

/** Names of everything that can sit at the end of a line segment. */
function nodeNames(state: GameState): Map<string, string> {
  const names = new Map<string, string>();
  const objects = [
    ...state.cities,
    ...state.plants,
    ...state.farms,
    ...state.storages,
    ...state.junctions,
    ...state.borders,
  ];
  for (const object of objects) names.set(object.id, object.name.toUpperCase());
  return names;
}

/** Rule 1 — energy not served anywhere on the grid (01 §4.5). */
function shortfallStop(state: GameState, report: TurnReport): string | null {
  if (report.totals.ensMw <= SKIP_ENS_MW) return null;
  const names = report.cities
    .filter((city) => city.ensMw > SKIP_ENS_MW)
    .sort((a, b) => b.ensMw - a.ensMw)
    .map(
      (city) =>
        state.cities.find((known) => known.id === city.cityId)?.name.toUpperCase() ?? city.cityId,
    );
  const head = names.slice(0, NAMED_CITIES).join(", ");
  const rest = names.length - NAMED_CITIES;
  const where = rest > 0 ? `${head} +${rest}` : head;
  return `niedobór ${formatMw(report.totals.ensMw)}${where ? ` w ${where}` : ""}`;
}

/** Rule 2 — a line segment running out of capacity (01 §4.2). */
function overloadStop(state: GameState, report: TurnReport): string | null {
  let worst: { ratio: number; lineId: string; from: string; to: string } | null = null;
  for (const segment of report.segments) {
    if (segment.capacityMw <= 0) continue;
    const ratio = segment.usedMw / segment.capacityMw;
    if (ratio < SKIP_OVERLOAD_RATIO || (worst !== null && ratio <= worst.ratio)) continue;
    worst = { ratio, lineId: segment.lineId, from: segment.fromNodeId, to: segment.toNodeId };
  }
  if (worst === null) return null;
  const { ratio, lineId, from, to } = worst;
  const type: LineType | undefined = state.lines.find((line) => line.id === lineId)?.type;
  const names = nodeNames(state);
  // En dash, not an arrow: the allowed glyph set has no "→" (handoff README,
  // Content & Copy Rules), and a stretch of line is a span, not a direction.
  const route = `${names.get(from) ?? from} – ${names.get(to) ?? to}`;
  const label = type === undefined ? "linia" : `linia ${LINE_TYPE_LABELS[type]}`;
  return `${label} ${formatPercent(ratio * 100)} przepustowości (${route})`;
}

const FORECAST_LABELS = { demand: "popyt", wind: "wiatr", pv: "PV" } as const;

/**
 * Rule 3 — the truth landed outside the band the forecast promised (06 §8.6.4).
 * The band is the bet the player made, so the miss is measured against it and
 * the widest one is the one worth reporting.
 */
function forecastStop(report: TurnReport): string | null {
  let worst: { key: keyof typeof FORECAST_LABELS; excess: number } | null = null;
  for (const key of ["demand", "wind", "pv"] as const) {
    const miss = report.forecastMiss[key];
    const excess = Math.abs(miss.actualMw - miss.forecastMw) - miss.bandMw;
    if (excess <= 0 || (worst !== null && excess <= worst.excess)) continue;
    worst = { key, excess };
  }
  if (worst === null) return null;
  const miss = report.forecastMiss[worst.key];
  const band = formatBand(miss.forecastMw, miss.bandMw, "MW", 1);
  return `${FORECAST_LABELS[worst.key]} ${formatMw(miss.actualMw, 1)} poza pasmem prognozy ${band}`;
}

/**
 * Rule 4 — the turn result fell off a cliff against the previous turn. Turns of
 * different days are not compared: their money carries different day weights
 * (01 §2.1), so the drop would be an artefact of the calendar.
 */
function balanceStop(report: TurnReport, previous: TurnReport | null): string | null {
  if (previous === null || previous.dayIndex !== report.dayIndex) return null;
  const drop = previous.finance.netPln - report.finance.netPln;
  if (drop <= SKIP_BALANCE_DROP_PLN) return null;
  return `wynik tury ${formatSignedMoneyPln(report.finance.netPln)}, o ${formatMoneyPln(
    drop,
  )} gorszy niż w turze ${previous.turnIndex + 1}`;
}

/**
 * The stop rules of 01 §2.5, in the order the player reads them: is anyone in
 * the dark, is the grid at its limit, did the forecast lie, did the money turn.
 */
export function skipStop(
  state: GameState,
  report: TurnReport,
  previous: TurnReport | null,
): SkipStop | null {
  const rules: readonly [SkipStopKind, string | null][] = [
    ["shortfall", shortfallStop(state, report)],
    ["overload", overloadStop(state, report)],
    ["forecast", forecastStop(report)],
    ["balance", balanceStop(report, previous)],
  ];
  for (const [kind, reason] of rules) {
    if (reason === null) continue;
    return {
      kind,
      turnIndex: report.turnIndex,
      text: `⏭ zatrzymano: TURA ${report.turnIndex + 1} — ${reason}`,
    };
  }
  return null;
}

export interface SkipResult {
  game: GameState;
  /** Why it stopped; null when the day simply ran out. */
  stop: SkipStop | null;
}

/**
 * `PRZEWIŃ ⏭` — resolves turn after turn until a stop rule fires or the day
 * ends. Whole days are deliberately not scrubbed (01 §2.5 speaks of the daily
 * rhythm): the day is the unit the player plans in.
 */
export function skipTurns(state: GameState): SkipResult {
  let game = state;
  for (let turn = game.calendar.turnIndex; turn < TURNS_PER_DAY; turn++) {
    const previous = game.lastTurnReport;
    game = resolveTurn(game);
    const report = game.lastTurnReport;
    if (report === null) continue;
    const stop = skipStop(game, report, previous);
    if (stop !== null) return { game, stop };
  }
  return { game, stop: null };
}

/**
 * Click on a future cell of the day axis: resolve everything up to it, so that
 * the chosen turn becomes the pending one. Past and current turns are not
 * targets — a resolved turn is never replayable.
 */
export function scrubToTurn(state: GameState, turnIndex: number): GameState {
  let game = state;
  const target = Math.min(TURNS_PER_DAY - 1, Math.trunc(turnIndex));
  for (let turn = game.calendar.turnIndex; turn < target; turn++) game = resolveTurn(game);
  return game;
}
