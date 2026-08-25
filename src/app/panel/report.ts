// The bottom strip: the settlement of a RESOLVED turn, or the forecast of one
// still ahead (01 §2.3, §8 pt 5). Pure model over the archive and the engine's
// forecast — nothing is remembered by the UI, so a loaded save shows the same
// strip the live session did, and a turn read back weeks later shows exactly
// what it showed when it resolved (02 §4.1).
//
// Tile order is cause and effect: weather → delivery → shortfall → money →
// result (ReportStrip.prompt.md).

import {
  CONFIG,
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  absoluteTurn,
  digestAt,
  turnForecast,
  type ForecastComparison,
  type GameState,
  type TurnDigest,
  type TurnForecast,
} from "../../engine";
import type { ReportTile } from "../components/ReportStrip";
import {
  formatBand,
  formatMoneyPln,
  formatMw,
  formatNumber,
  formatSignedMoneyPln,
} from "../format";
import { dayTurnAt } from "../labels";
import { dayContext } from "../store/selectors";

/** Report power is quantized to 0,001 MW — below this a value reads as zero. */
const ZERO_MW = 0.01;

/** How many city names a shortfall note prints before it counts the rest. */
const NAMED_CITIES = 2;

/** "TURA 7 · SZCZYT WIECZ." — which turn the numbers below belong to. */
export function reportTitle(turnIndex: number): string {
  return `TURA ${turnIndex + 1} · ${dayTurnAt(turnIndex).name}`;
}

/** "STYCZEŃ · DOBA ROBOCZA A" — which day that turn belongs to. */
export function reportDayNote(dayIndex: number): string {
  const context = dayContext(dayIndex);
  return `${context.monthName} · ${context.dayLabel}`;
}

/** Cities left short this turn, named — the note has to say WHERE it hurt. */
function shortfallNote(state: GameState, digest: TurnDigest): string {
  const names = digest.shortfalls
    .filter((city) => city.ensMw > ZERO_MW)
    .map(
      (city) =>
        state.cities.find((known) => known.id === city.cityId)?.name.toUpperCase() ?? city.cityId,
    );
  if (names.length === 0) return "WSZYSTKIE MIASTA ZASILONE";
  const rest = names.length - NAMED_CITIES;
  const head = names.slice(0, NAMED_CITIES).join(", ");
  return rest > 0 ? `${head} +${formatNumber(rest)}` : head;
}

/**
 * Two forecast bands sharing one unit — `10 ±3 / 7 ±2 MW`. The pair keeps the
 * slash order of the value above it, so the reader maps band to quantity by
 * position alone.
 */
function bandPair(first: ForecastComparison, second: ForecastComparison): string {
  return `${formatBand(first.forecastMw, first.bandMw, "").trim()} / ${formatBand(
    second.forecastMw,
    second.bandMw,
  )}`;
}

export function reportTiles(state: GameState, digest: TurnDigest): ReportTile[] {
  const { totals, finance, forecastMiss } = digest;
  const revenuePln = finance.revenueEnergyPln + finance.revenueExportPln;
  const costPln = finance.fuelCostPln + finance.importCostPln + finance.startupCostPln;
  const penaltyPln = finance.ensPenaltyPln + finance.dumpPenaltyPln;
  const short = totals.ensMw > ZERO_MW;

  const revenueNote = [
    `${formatNumber(CONFIG.tariffPlnPerMwh)} zł/MWh × ${formatNumber(digest.dayWeight, 1)}`,
    finance.revenueExportPln > 0 ? `EKSPORT ${formatMoneyPln(finance.revenueExportPln)}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  const costNote = [
    `PALIWO ${formatMoneyPln(finance.fuelCostPln)}`,
    finance.importCostPln > 0 ? `IMPORT ${formatMoneyPln(finance.importCostPln)}` : null,
    finance.startupCostPln > 0 ? `ROZRUCHY ${formatMoneyPln(finance.startupCostPln)}` : null,
    // Fixed O&M lands once a day, in the last turn's report (01 §6).
    finance.fixedCostPln > 0 ? `+ KOSZTY STAŁE ${formatMoneyPln(finance.fixedCostPln)}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return [
    {
      // Both weather-driven technologies in one tile: the strip has seven
      // columns and PV is exactly as much of the bet as wind is (01 §2.4).
      // Slash order is wind first, PV second, in the label and in the note.
      label: "WIATR / PV REALNE",
      value: `${formatNumber(forecastMiss.wind.actualMw)} / ${formatMw(forecastMiss.pv.actualMw)}`,
      note: `PROGNOZA ${bandPair(forecastMiss.wind, forecastMiss.pv)}`,
      tone: "info",
    },
    {
      label: "DOSTARCZONO",
      value: `${formatNumber(totals.deliveredMw)} / ${formatMw(totals.demandMw)}`,
      note: `STRATY ${formatMw(totals.lossesMw)}`,
    },
    {
      label: "NIEDOBÓR",
      value: formatMw(totals.ensMw),
      note: shortfallNote(state, digest),
      tone: short ? "danger" : "ok",
    },
    {
      label: "PRZYCHÓD",
      value: formatSignedMoneyPln(revenuePln),
      note: revenueNote,
      tone: "ok",
    },
    {
      label: "KOSZTY",
      value: formatSignedMoneyPln(-costPln),
      note: costNote,
    },
    {
      label: "KARY",
      // Surplus is penalized too (02 §5) — the handoff predates that rule and
      // only knew the ENS penalty. Since 0.23 the surplus penalty covers RES
      // as well, so the note says NADWYŻKA, not ZRZUT.
      value: formatSignedMoneyPln(-penaltyPln),
      note: `ENS ${formatMoneyPln(finance.ensPenaltyPln)} · NADWYŻKA ${formatMoneyPln(finance.dumpPenaltyPln)}`,
      tone: penaltyPln > 0 ? "danger" : undefined,
    },
    {
      label: "WYNIK TURY",
      value: formatSignedMoneyPln(finance.netPln),
      tone: finance.netPln >= 0 ? "ok" : "danger",
      highlight: finance.netPln > 0,
    },
  ];
}

/**
 * The other half of the ribbon: a turn that has not happened yet has no result,
 * only a bet to be placed (01 §2.5). Bands, never bare numbers (06 §8.6.4) —
 * and the horizon tile says why this one is as wide as it is.
 */
export function forecastTiles(forecast: TurnForecast, aheadTurns: number): ReportTile[] {
  const band = (point: { mw: number; bandMw: number }): string =>
    `PASMO ${formatBand(point.mw, point.bandMw)}`;
  return [
    {
      label: "POPYT",
      value: formatMw(forecast.demand.mw),
      note: band(forecast.demand),
      tone: "info",
    },
    { label: "WIATR", value: formatMw(forecast.wind.mw), note: band(forecast.wind) },
    { label: "PV", value: formatMw(forecast.pv.mw), note: band(forecast.pv) },
    {
      label: "HORYZONT",
      value: `+${formatNumber((aheadTurns + 1) * HOURS_PER_TURN)} H`,
      note: "PASMO ROŚNIE Z HORYZONTEM",
    },
  ];
}

export interface ReportStripModel {
  /** Over-label: whether these numbers are a result or a bet. */
  label: string;
  title: string;
  note: string;
  tiles: ReportTile[];
  /** The turn described, on the ribbon's own axis. */
  absTurn: number;
  /**
   * Turn to scrub to, or null when there is nothing to scrub to. Only future
   * turns OF THE CURRENT DAY qualify: scrubbing stays inside the daily rhythm
   * (01 §2.5), and a resolved turn is never replayable.
   */
  scrubTurnIndex: number | null;
}

/**
 * What the bottom strip shows for the selected turn — the report of a resolved
 * one, the forecast of one ahead. Null when there is nothing to say yet: a
 * fresh session before its first resolution.
 */
export function buildReportStrip(
  state: GameState,
  selected: number | null,
): ReportStripModel | null {
  const pending = absoluteTurn(state.calendar.dayIndex, state.calendar.turnIndex);
  const absTurn = selected ?? pending - 1;
  const dayIndex = Math.floor(absTurn / TURNS_PER_DAY);
  const turnIndex = absTurn - dayIndex * TURNS_PER_DAY;
  const note = reportDayNote(dayIndex);

  if (absTurn < pending) {
    const digest = digestAt(state.history, absTurn);
    if (!digest) return null;
    return {
      label: "RAPORT TURY",
      title: reportTitle(turnIndex),
      note,
      tiles: reportTiles(state, digest),
      absTurn,
      scrubTurnIndex: null,
    };
  }

  const forecast = turnForecast(state, dayIndex - state.calendar.dayIndex, turnIndex);
  if (!forecast) return null;
  return {
    label: "PROGNOZA TURY",
    title: reportTitle(turnIndex),
    note,
    tiles: forecastTiles(forecast, absTurn - pending),
    absTurn,
    scrubTurnIndex: absTurn > pending && dayIndex === state.calendar.dayIndex ? turnIndex : null,
  };
}
