// PROGNOZA + BILANS PRZY OBECNYCH NASTAWACH — the top section of the dispatcher
// panel (01 §8 pt 3, 06 §8.6.4). Pure functions: GameState in, a display model
// out. Every number is the engine's (`dayForecast`, `projectBalance`); this
// module only averages hourly points into 3 h blocks and picks the tone.
//
// The projection is deliberately network-blind (forecast.ts in the engine), so
// transmission losses are NOT part of the plan shown here — unlike in the
// handoff's reference build, where a flat 2.9% stood in for them.

import {
  CONFIG,
  HOURS_PER_TURN,
  dayForecast,
  projectBalance,
  sunriseHour,
  sunsetHour,
  type ForecastPoint,
  type GameState,
} from "../../engine";
import type { BalanceRow, BalanceTone } from "../components/BalanceSummary";
import { formatMw, formatPercent, formatSignedNumber } from "../format";
import { dayTurnAt } from "../labels";

/** Blocks of the "will the plan survive" column: this turn and the next two. */
export const BALANCE_LOOKAHEAD_TURNS = 3;

/** The shared track scale is rounded up to a whole multiple of this [MW]. */
const SCALE_STEP_MW = 100;

/** Glyph carried by a balance row; the allowed set only (handoff README). */
const TONE_GLYPHS: Record<BalanceTone, string> = { ok: "✓", warn: "⚠", danger: "✕" };

export type ForecastRowKey = "demand" | "wind" | "pv";

export interface PanelForecastRow {
  key: ForecastRowKey;
  /** "POPYT" | "WIATR" | "PV". */
  label: string;
  mw: number;
  bandMw: number;
  color?: string;
  /** Replaces the number when there is nothing to bet on, e.g. "0 · NOC". */
  note?: string;
  muted?: boolean;
}

export interface PanelBalanceRow {
  /** Turn of the day this block covers, 0-based. */
  turnIndex: number;
  /** "T5 POŁUDNIE". */
  label: string;
  balanceMw: number;
  worstCaseMw: number;
  tone: BalanceTone;
  /** "+214 MW ✓". */
  value: string;
}

export interface PanelBalanceSummary {
  demandMw: number;
  /** Dispatchable at the current setpoints plus the RES forecast. */
  planMw: number;
  /** Storage charging and export — load the plan has to carry as well. */
  extraLoadMw: number;
  balanceMw: number;
  worstCaseMw: number;
  /** Both forecast bands, fully against the player (06 §8.6.4). */
  bandMw: number;
  tone: BalanceTone;
  rows: BalanceRow[];
  /** "+25 MW (1,6%)". */
  total: string;
  note: string;
}

export interface PanelForecast {
  /** Upper end of the track scale shared by all three rows. */
  scaleMw: number;
  rows: PanelForecastRow[];
  turns: PanelBalanceRow[];
  summary: PanelBalanceSummary;
}

/**
 * 06 §8.6.4: a negative expected balance is already a deficit; a positive one
 * that the forecast bands can still eat is thin. The handoff computed this as
 * "reserve < wind band" — the same rule, but the engine also carries the demand
 * band and the state of charge, so the worst case is read off the projection.
 */
export function balanceTone(expectedMw: number, worstCaseMw: number): BalanceTone {
  if (expectedMw < 0) return "danger";
  if (worstCaseMw < 0) return "warn";
  return "ok";
}

/** "+214 MW ✓" — the compact form of the look-ahead column. */
export function balanceValueText(mw: number, tone: BalanceTone): string {
  return `${formatSignedNumber(mw)} MW ${TONE_GLYPHS[tone]}`;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Block average of one hourly forecast series over the turn starting at `from`. */
function blockPoint(points: readonly ForecastPoint[], from: number): ForecastPoint {
  const block = points.slice(from, from + HOURS_PER_TURN);
  return { mw: mean(block.map((p) => p.mw)), bandMw: mean(block.map((p) => p.bandMw)) };
}

/**
 * The sun is below the horizon for the whole block — PV has nothing to promise
 * (06 §3.6). Astronomy is deterministic, so this is knowledge, not a forecast.
 */
export function isNightBlock(state: GameState, startHour: number): boolean {
  const { dayOfYear } = state.dayTruth;
  return (
    startHour + HOURS_PER_TURN <= sunriseHour(CONFIG.latitudeDeg, dayOfYear) ||
    startHour >= sunsetHour(CONFIG.latitudeDeg, dayOfYear)
  );
}

/**
 * Note replacing the number when the row carries no bet: no farm of that
 * technology, every farm switched off (01 §4.1), or PV after sunset.
 *
 * The night note is only printed when the forecast really is zero. The engine's
 * error process is a share of installed capacity and clamps at zero, so a lucky
 * draw can still promise a few MW at midnight; hiding that behind "0 · NOC"
 * would make the balance below unexplainable.
 */
function farmNote(
  state: GameState,
  tech: "wind" | "pv",
  mw: number,
  night: boolean,
): string | undefined {
  const farms = state.farms.filter((farm) => farm.tech === tech);
  if (farms.length === 0) return "0 · BRAK FARM";
  if (!farms.some((farm) => farm.enabled)) return "0 · WYŁ.";
  if (tech === "pv" && night && Math.round(mw) === 0) return "0 · NOC";
  return undefined;
}

/**
 * Upper end of the track scale, shared by all three rows — otherwise the band
 * widths lie (ForecastRow.prompt.md). Taken over the WHOLE day, so the bands do
 * not jump between turns: the day's truth is fixed, so the scale is too.
 */
export function forecastScaleMw(state: GameState): number {
  const day = dayForecast(state, 0);
  let peak = 0;
  for (const series of [day?.demand, day?.wind, day?.pv]) {
    for (const point of series ?? []) peak = Math.max(peak, point.mw + point.bandMw);
  }
  return Math.max(SCALE_STEP_MW, Math.ceil(peak / SCALE_STEP_MW) * SCALE_STEP_MW);
}

/** The three band rows of the pending turn — block averages (01 §2.2). */
export function forecastRows(state: GameState): PanelForecastRow[] {
  const day = dayForecast(state, 0);
  const startHour = state.calendar.turnIndex * HOURS_PER_TURN;
  const night = isNightBlock(state, startHour);
  const demand = blockPoint(day?.demand ?? [], startHour);
  const wind = blockPoint(day?.wind ?? [], startHour);
  const pv = blockPoint(day?.pv ?? [], startHour);
  const windNote = farmNote(state, "wind", wind.mw, night);
  const pvNote = farmNote(state, "pv", pv.mw, night);

  return [
    { key: "demand", label: "POPYT", mw: demand.mw, bandMw: demand.bandMw },
    {
      key: "wind",
      label: "WIATR",
      mw: wind.mw,
      bandMw: wind.bandMw,
      color: "var(--en-wind)",
      note: windNote,
      muted: windNote !== undefined,
    },
    {
      key: "pv",
      label: "PV",
      mw: pv.mw,
      bandMw: pv.bandMw,
      color: "var(--en-pv)",
      note: pvNote,
      muted: pvNote !== undefined,
    },
  ];
}

interface BalanceBlock {
  demandMw: number;
  planMw: number;
  extraLoadMw: number;
  balanceMw: number;
  worstCaseMw: number;
  bandMw: number;
}

/**
 * Block averages of the projection, one entry per remaining turn of the day.
 * The projection deliberately stops at midnight (engine `projectBalance`), and
 * the basic forecast system does not reach tomorrow at all (01 §2.4) — so near
 * the end of the day the column simply gets shorter instead of inventing rows.
 */
function balanceBlocks(state: GameState): BalanceBlock[] {
  const points = projectBalance(state);
  const blocks: BalanceBlock[] = [];
  for (let from = 0; from + HOURS_PER_TURN <= points.length; from += HOURS_PER_TURN) {
    const block = points.slice(from, from + HOURS_PER_TURN);
    blocks.push({
      demandMw: mean(block.map((p) => p.demandMw)),
      planMw: mean(block.map((p) => p.dispatchableMw + p.resMw)),
      extraLoadMw: mean(block.map((p) => p.extraLoadMw)),
      balanceMw: mean(block.map((p) => p.expectedBalanceMw)),
      worstCaseMw: mean(block.map((p) => p.worstCaseBalanceMw)),
      bandMw: mean(block.map((p) => p.demandBandMw + p.resBandMw)),
    });
  }
  return blocks;
}

function summaryNote(tone: BalanceTone, balanceMw: number, bandMw: number): string {
  // "Diagnosis, not alarm": every note names the number it is built from.
  if (tone === "danger") return `✕ plan nie domyka bilansu — brakuje ${formatMw(-balanceMw)}`;
  if (tone === "warn") return `⚠ dolne pasmo prognozy = −${formatMw(bandMw)} → ryzyko niedoboru`;
  return "✓ zapas pokrywa dolne pasmo prognozy";
}

function summaryOf(block: BalanceBlock): PanelBalanceSummary {
  const tone = balanceTone(block.balanceMw, block.worstCaseMw);
  const rows: BalanceRow[] = [{ label: "ZAPOTRZEBOWANIE", value: formatMw(block.demandMw) }];
  // Not in the brief's row list, but without it the reserve cannot be derived
  // from the rows above whenever storage charges or export is set.
  if (block.extraLoadMw > 0) {
    rows.push({ label: "ŁADOWANIE + EKSPORT", value: formatMw(block.extraLoadMw) });
  }
  rows.push({ label: "PLAN POKRYCIA", value: formatMw(block.planMw) });
  const share =
    block.demandMw > 0 ? ` (${formatPercent((block.balanceMw / block.demandMw) * 100, 1)})` : "";

  return {
    demandMw: block.demandMw,
    planMw: block.planMw,
    extraLoadMw: block.extraLoadMw,
    balanceMw: block.balanceMw,
    worstCaseMw: block.worstCaseMw,
    bandMw: block.bandMw,
    tone,
    rows,
    total: `${formatSignedNumber(block.balanceMw)} MW${share}`,
    note: summaryNote(tone, block.balanceMw, block.bandMw),
  };
}

const EMPTY_BLOCK: BalanceBlock = {
  demandMw: 0,
  planMw: 0,
  extraLoadMw: 0,
  balanceMw: 0,
  worstCaseMw: 0,
  bandMw: 0,
};

/** Everything the forecast and balance sections of the panel print. */
export function panelForecast(state: GameState): PanelForecast {
  const blocks = balanceBlocks(state);
  const turns: PanelBalanceRow[] = blocks.slice(0, BALANCE_LOOKAHEAD_TURNS).map((block, offset) => {
    const turnIndex = state.calendar.turnIndex + offset;
    const tone = balanceTone(block.balanceMw, block.worstCaseMw);
    return {
      turnIndex,
      label: `T${turnIndex + 1} ${dayTurnAt(turnIndex).name}`,
      balanceMw: block.balanceMw,
      worstCaseMw: block.worstCaseMw,
      tone,
      value: balanceValueText(block.balanceMw, tone),
    };
  });

  return {
    scaleMw: forecastScaleMw(state),
    rows: forecastRows(state),
    turns,
    summary: summaryOf(blocks[0] ?? EMPTY_BLOCK),
  };
}
