// Period arithmetic and aggregation for the detailed report (turn / day /
// month / year). Pure over `GameState.history`: the archive is dense and
// ordered (02 §4.1), so a period is a slice, not a search, and a year of
// digests aggregates in one pass over 288 entries.
//
// Everything here derives from turn digests and NOTHING else — which is also
// this module's hard limit: per-segment and per-node flows live only in
// `lastTurnReport` (01 §8 pt 2), so no period report can ever speak about the
// load of a single line.

import {
  COVERAGE_LAYERS,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  digestTurn,
  type GameState,
  type TurnDigest,
  type TurnFinanceReport,
} from "../../engine";

export const REPORT_SCOPES = ["turn", "day", "month", "year"] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];

/**
 * Turns one period of each scope spans. Every length divides the next one and
 * periods start at turn 0, so the period containing a turn is a floor division
 * — no calendar walking anywhere in this file.
 */
export const SCOPE_TURNS: Record<ReportScope, number> = {
  turn: 1,
  day: TURNS_PER_DAY,
  month: TURNS_PER_DAY * DAYS_PER_MONTH,
  year: TURNS_PER_DAY * DAYS_PER_YEAR,
};

export interface Period {
  scope: ReportScope;
  /** First absolute turn of the period, on the ribbon's own axis. */
  fromTurn: number;
  /** Last absolute turn the period WOULD hold — resolved or not. */
  toTurn: number;
  /** 0-based position of the period on its own axis (turn / day / month / year). */
  index: number;
  /** Day the period opens on — what the calendar labels are read from. */
  dayIndex: number;
}

/** The period of `scope` that the given absolute turn falls into. */
export function periodAt(scope: ReportScope, absTurn: number): Period {
  const length = SCOPE_TURNS[scope];
  const index = Math.floor(absTurn / length);
  const fromTurn = index * length;
  return {
    scope,
    fromTurn,
    toTurn: fromTurn + length - 1,
    index,
    dayIndex: Math.floor(fromTurn / TURNS_PER_DAY),
  };
}

/** Last resolved turn, or null when the session has resolved nothing yet. */
export function lastResolvedTurn(state: GameState): number | null {
  const last = state.history.at(-1);
  return last === undefined ? null : digestTurn(last);
}

/** Oldest turn still in the archive; the archive is never pruned today. */
export function firstArchivedTurn(state: GameState): number | null {
  const first = state.history[0];
  return first === undefined ? null : digestTurn(first);
}

/** Energy of a period in MWh, day-weighted — see `turnMwh`. */
export interface PeriodEnergy {
  demandMwh: number;
  deliveredMwh: number;
  lossesMwh: number;
  ensMwh: number;
  dumpMwh: number;
  resCurtailedMwh: number;
}

/**
 * The same six quantities as MEAN power per resolved turn, MW. Deliberately
 * unweighted: a turn is a flat 3 h block (01 §2.2), so its MW is what the map,
 * the ribbon and the strip all speak in — the day weight belongs to energy and
 * money, never to a power reading.
 */
export interface PeriodPower {
  demandMw: number;
  deliveredMw: number;
  lossesMw: number;
  ensMw: number;
  dumpMw: number;
  resCurtailedMw: number;
}

/** How one quantity's forecast held up over the period (01 §2.4). */
export interface ForecastStat {
  /** What the forecast promised, as energy. */
  forecastMwh: number;
  /** What actually came in, as energy. */
  actualMwh: number;
  /** Mean forecast per turn, MW — the turn scope's own forecast. */
  forecastMw: number;
  /** Mean truth per turn, MW. */
  actualMw: number;
  /** Mean half-width of the band, MW — how wide the bet was allowed to be. */
  bandMw: number;
  /** Mean absolute error per turn, MW — the size of the miss. */
  maeMw: number;
  /** Mean signed error per turn (truth − forecast), MW — its direction. */
  biasMw: number;
  /** Turns whose truth landed inside the forecast band. */
  inBandTurns: number;
}

export interface PeriodShortfall {
  cityId: string;
  ensMwh: number;
}

export interface PeriodAggregate {
  period: Period;
  /** Turns of the period already resolved; 0 means there is nothing to read. */
  resolvedTurns: number;
  /** Real days those turns stand for (01 §2.1) — Σ weight ÷ 8. */
  realDays: number;
  energy: PeriodEnergy;
  /** Mean power per resolved turn; for the turn scope, the turn's own MW. */
  power: PeriodPower;
  /** Worst single turn of the period, MW — a turn is a flat 3 h average. */
  peak: { demandMw: number; ensMw: number };
  /** Energy per coverage layer, aligned to COVERAGE_LAYERS by index. */
  coverageMwh: number[];
  /** The same layers as mean power per resolved turn, MW. */
  coverageMw: number[];
  /** Summed finance; every component is already day-weighted by the engine. */
  finance: TurnFinanceReport;
  forecast: Record<"demand" | "wind" | "pv", ForecastStat>;
  /** Cities that went short over the period, worst first. */
  shortfalls: PeriodShortfall[];
}

/**
 * Power of one turn as energy. A turn is a flat 3 h block (01 §2.2) and a game
 * day stands for ~10,9 real ones (01 §2.1) — the engine already scales money by
 * that weight, so energy MUST carry it too or `zł/MWh` comes out ten times off.
 */
export function turnMwh(mw: number, digest: TurnDigest): number {
  return mw * HOURS_PER_TURN * digest.dayWeight;
}

const EMPTY_FINANCE: TurnFinanceReport = {
  revenueEnergyPln: 0,
  revenueExportPln: 0,
  fuelCostPln: 0,
  importCostPln: 0,
  ensPenaltyPln: 0,
  dumpPenaltyPln: 0,
  fixedCostPln: 0,
  netPln: 0,
};

const EMPTY_STAT: ForecastStat = {
  forecastMwh: 0,
  actualMwh: 0,
  forecastMw: 0,
  actualMw: 0,
  bandMw: 0,
  maeMw: 0,
  biasMw: 0,
  inBandTurns: 0,
};

/** Fields of `ForecastStat` that are per-turn means, not sums. */
const STAT_MEANS = ["forecastMw", "actualMw", "bandMw", "maeMw", "biasMw"] as const;

/** Quantized values compare against a band with room for the last digit. */
const BAND_EPSILON = 1e-9;

const FORECAST_KEYS = ["demand", "wind", "pv"] as const;

/**
 * Digests of a period, in order. Index arithmetic on the dense archive — a
 * year report may not walk the whole history to find its 288 turns.
 */
export function periodDigests(state: GameState, period: Period): TurnDigest[] {
  const base = firstArchivedTurn(state);
  if (base === null) return [];
  const from = Math.max(period.fromTurn - base, 0);
  const to = Math.min(period.toTurn - base, state.history.length - 1);
  return to < from ? [] : state.history.slice(from, to + 1);
}

/**
 * Everything the report prints about one period. A period with no resolved
 * turns aggregates to zeros rather than to null: the view still names the
 * period and says it is empty, which is what a player scrubbing into a
 * half-played day needs to read.
 */
export function aggregatePeriod(state: GameState, period: Period): PeriodAggregate {
  const digests = periodDigests(state, period);
  const energy: PeriodEnergy = {
    demandMwh: 0,
    deliveredMwh: 0,
    lossesMwh: 0,
    ensMwh: 0,
    dumpMwh: 0,
    resCurtailedMwh: 0,
  };
  const power: PeriodPower = {
    demandMw: 0,
    deliveredMw: 0,
    lossesMw: 0,
    ensMw: 0,
    dumpMw: 0,
    resCurtailedMw: 0,
  };
  const finance: TurnFinanceReport = { ...EMPTY_FINANCE };
  const coverageMwh = COVERAGE_LAYERS.map(() => 0);
  const coverageMw = COVERAGE_LAYERS.map(() => 0);
  const forecast: Record<(typeof FORECAST_KEYS)[number], ForecastStat> = {
    demand: { ...EMPTY_STAT },
    wind: { ...EMPTY_STAT },
    pv: { ...EMPTY_STAT },
  };
  const shortfalls = new Map<string, number>();
  let realDays = 0;
  let peakDemandMw = 0;
  let peakEnsMw = 0;

  for (const digest of digests) {
    const { totals } = digest;
    energy.demandMwh += turnMwh(totals.demandMw, digest);
    energy.deliveredMwh += turnMwh(totals.deliveredMw, digest);
    energy.lossesMwh += turnMwh(totals.lossesMw, digest);
    energy.ensMwh += turnMwh(totals.ensMw, digest);
    energy.dumpMwh += turnMwh(totals.dumpMw, digest);
    energy.resCurtailedMwh += turnMwh(totals.resCurtailedMw, digest);
    power.demandMw += totals.demandMw;
    power.deliveredMw += totals.deliveredMw;
    power.lossesMw += totals.lossesMw;
    power.ensMw += totals.ensMw;
    power.dumpMw += totals.dumpMw;
    power.resCurtailedMw += totals.resCurtailedMw;
    realDays += digest.dayWeight / TURNS_PER_DAY;
    peakDemandMw = Math.max(peakDemandMw, totals.demandMw);
    peakEnsMw = Math.max(peakEnsMw, totals.ensMw);

    finance.revenueEnergyPln += digest.finance.revenueEnergyPln;
    finance.revenueExportPln += digest.finance.revenueExportPln;
    finance.fuelCostPln += digest.finance.fuelCostPln;
    finance.importCostPln += digest.finance.importCostPln;
    finance.ensPenaltyPln += digest.finance.ensPenaltyPln;
    finance.dumpPenaltyPln += digest.finance.dumpPenaltyPln;
    finance.fixedCostPln += digest.finance.fixedCostPln;
    finance.netPln += digest.finance.netPln;

    for (let layer = 0; layer < coverageMwh.length; layer++) {
      const mw = digest.coverageMw[layer] ?? 0;
      coverageMwh[layer] = (coverageMwh[layer] ?? 0) + turnMwh(mw, digest);
      coverageMw[layer] = (coverageMw[layer] ?? 0) + mw;
    }

    for (const key of FORECAST_KEYS) {
      const miss = digest.forecastMiss[key];
      const stat = forecast[key];
      const error = miss.actualMw - miss.forecastMw;
      stat.forecastMwh += turnMwh(miss.forecastMw, digest);
      stat.actualMwh += turnMwh(miss.actualMw, digest);
      // Summed here, divided by the turn count once the loop is done.
      stat.forecastMw += miss.forecastMw;
      stat.actualMw += miss.actualMw;
      stat.bandMw += miss.bandMw;
      stat.maeMw += Math.abs(error);
      stat.biasMw += error;
      if (Math.abs(error) <= miss.bandMw + BAND_EPSILON) stat.inBandTurns += 1;
    }

    for (const city of digest.shortfalls) {
      shortfalls.set(city.cityId, (shortfalls.get(city.cityId) ?? 0) + turnMwh(city.ensMw, digest));
    }
  }

  const resolvedTurns = digests.length;
  if (resolvedTurns > 0) {
    for (const key of FORECAST_KEYS) {
      for (const field of STAT_MEANS) forecast[key][field] /= resolvedTurns;
    }
    for (const key of Object.keys(power) as (keyof PeriodPower)[]) {
      power[key] /= resolvedTurns;
    }
    for (let layer = 0; layer < coverageMw.length; layer++) {
      coverageMw[layer] = (coverageMw[layer] ?? 0) / resolvedTurns;
    }
  }

  return {
    period,
    resolvedTurns,
    realDays,
    energy,
    power,
    peak: { demandMw: peakDemandMw, ensMw: peakEnsMw },
    coverageMwh,
    coverageMw,
    finance,
    forecast,
    shortfalls: [...shortfalls]
      .map(([cityId, ensMwh]) => ({ cityId, ensMwh }))
      .sort((a, b) => b.ensMwh - a.ensMwh),
  };
}

/**
 * Period one step back, or null at the archive's edge. A step is valid only
 * when the period it lands on holds at least one resolved turn — the report
 * never scrolls into a stretch of time the session never played.
 */
export function previousPeriod(state: GameState, period: Period): Period | null {
  const first = firstArchivedTurn(state);
  if (first === null || period.fromTurn - 1 < first) return null;
  return periodAt(period.scope, period.fromTurn - 1);
}

/** Period one step forward, clamped at the last resolved turn. */
export function nextPeriod(state: GameState, period: Period): Period | null {
  const last = lastResolvedTurn(state);
  if (last === null || period.toTurn + 1 > last) return null;
  return periodAt(period.scope, period.toTurn + 1);
}

/**
 * The period the report shows: the one holding `anchor`, or the newest one when
 * the anchor is null. Null only when the session has resolved nothing at all.
 */
export function resolveAnchor(
  state: GameState,
  scope: ReportScope,
  anchor: number | null,
): Period | null {
  const last = lastResolvedTurn(state);
  if (last === null) return null;
  const first = firstArchivedTurn(state) ?? last;
  const turn = anchor === null ? last : Math.min(Math.max(anchor, first), last);
  return periodAt(scope, turn);
}
