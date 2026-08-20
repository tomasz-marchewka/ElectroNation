// Display model of the detailed report: a period aggregate turned into named,
// formatted rows. Pure — no React, no store — so the whole report is testable
// as data, exactly like the strip's tiles (../panel/report.ts).
//
// The turn scope prints POWER (MW), every wider scope prints ENERGY (MWh): a
// turn is a flat 3 h block and MW is what the map, the ribbon and the strip all
// speak in, while a month only makes sense as energy — and energy is what the
// money divides by.

import {
  CONFIG,
  COVERAGE_LAYERS,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  TURNS_PER_DAY,
  type GameState,
} from "../../engine";
import type { ReportTone } from "../components/ReportStrip";
import {
  formatBand,
  formatEnergy,
  formatMoneyPln,
  formatMw,
  formatNumber,
  formatPercent,
  formatSignedMoneyPln,
  formatSignedNumber,
} from "../format";
import { daysLabel, dayTurnAt } from "../labels";
import { dayContext } from "../store/selectors";
import { TIMELINE_LAYERS } from "../timeline/timeline";
import {
  SCOPE_TURNS,
  aggregatePeriod,
  nextPeriod,
  previousPeriod,
  resolveAnchor,
  type Period,
  type PeriodAggregate,
  type ReportScope,
} from "./period";

export interface ReportRow {
  label: string;
  value: string;
  /** Where the number comes from, or what it is a share of. */
  note?: string;
  tone?: ReportTone;
  /** Set on the row that closes a section — the period's own bottom line. */
  strong?: boolean;
}

export interface ReportSection {
  label: string;
  rows: ReportRow[];
}

export interface PeriodReportModel {
  scope: ReportScope;
  /** "TURA 5 · POŁUDNIE" | "DOBA ROBOCZA A" | "STYCZEŃ" | "ROK 1". */
  title: string;
  /** Where the period sits in the calendar. */
  subtitle: string;
  /** How much of the period is actually played, e.g. "5/8 TUR · ×6,8 DNIA". */
  coverage: string;
  sections: ReportSection[];
  /** Anchor turn of the neighbouring period, or null at the archive's edge. */
  prevAnchor: number | null;
  nextAnchor: number | null;
  /** True while the report shows the newest period there is. */
  atNewest: boolean;
}

/** Scope names of the switcher, in the order it runs. */
export const SCOPE_LABELS: Record<ReportScope, string> = {
  turn: "TURA",
  day: "DOBA",
  month: "MIESIĄC",
  year: "ROK",
};

function titleOf(period: Period): { title: string; subtitle: string } {
  const context = dayContext(period.dayIndex);
  switch (period.scope) {
    case "turn": {
      const turnIndex = period.fromTurn % TURNS_PER_DAY;
      const turn = dayTurnAt(turnIndex);
      return {
        title: `TURA ${turnIndex + 1} · ${turn.name}`,
        subtitle: `ROK ${context.year} · ${context.monthName} · ${context.dayLabel} · ${turn.hours}`,
      };
    }
    case "day":
      return {
        title: context.dayLabel,
        subtitle: `ROK ${context.year} · ${context.monthName} · ×${formatNumber(context.dayWeight, 1)} DNIA`,
      };
    case "month":
      return {
        title: context.monthName,
        subtitle: `ROK ${context.year} · ${daysLabel(DAYS_PER_MONTH)} × ${TURNS_PER_DAY} TUR`,
      };
    case "year":
      return {
        title: `ROK ${context.year}`,
        subtitle: `12 MIESIĘCY · ${daysLabel(DAYS_PER_YEAR)}`,
      };
  }
}

/** `x / y` as a percentage, or an em dash when the denominator is zero. */
function share(part: number, whole: number): string {
  return whole > 0 ? formatPercent((part / whole) * 100, 1) : "—";
}

function energySection(aggregate: PeriodAggregate, asPower: boolean): ReportSection {
  const { energy, power, peak, finance } = aggregate;
  const amount = (mw: number, mwh: number): string => (asPower ? formatMw(mw) : formatEnergy(mwh));
  const spread = (mw: number, peakMw: number): string | undefined =>
    asPower ? undefined : `ŚREDNIO ${formatMw(mw)} · SZCZYT ${formatMw(peakMw)}`;
  const short = energy.ensMwh > 0;

  return {
    label: "BILANS ENERGII",
    rows: [
      {
        label: "ZAPOTRZEBOWANIE",
        value: amount(power.demandMw, energy.demandMwh),
        note: spread(power.demandMw, peak.demandMw),
      },
      {
        label: "DOSTARCZONO",
        value: amount(power.deliveredMw, energy.deliveredMwh),
        note: `POKRYCIE ${share(energy.deliveredMwh, energy.demandMwh)}`,
      },
      {
        label: "STRATY PRZESYŁU",
        value: amount(power.lossesMw, energy.lossesMwh),
        note: `${share(energy.lossesMwh, energy.deliveredMwh + energy.lossesMwh)} PRODUKCJI`,
      },
      {
        label: "NIEDOBÓR (ENS)",
        value: amount(power.ensMw, energy.ensMwh),
        note: asPower ? undefined : `SZCZYT ${formatMw(peak.ensMw)}`,
        tone: short ? "danger" : "ok",
      },
      // Both kinds of surplus carry ONE penalty since 0.23 (01 §4.1), so the
      // rate goes on the row that opens the pair and the total closes it.
      {
        label: "ZRZUT STEROWALNYCH",
        value: amount(power.dumpMw, energy.dumpMwh),
        note: `${formatNumber(CONFIG.dumpPenaltyPlnPerMwh)} zł/MWh NADWYŻKI`,
        tone: energy.dumpMwh > 0 ? "warn" : undefined,
      },
      {
        // "Zrzut OZE" in the doc (01 §4.1) — but the row above already spends
        // "zrzut" on the dispatchable kind, so this one says plainly what
        // happened: the energy was there and nobody took it.
        label: "NIEODEBRANE OZE",
        value: amount(power.resCurtailedMw, energy.resCurtailedMwh),
        note: `${formatNumber(CONFIG.dumpPenaltyPlnPerMwh)} zł/MWh NADWYŻKI`,
        tone: energy.resCurtailedMwh > 0 ? "warn" : undefined,
      },
      {
        // The section stays about energy; the money is the note, and the
        // ledger line of its own lives in FINANSE.
        label: "NADWYŻKA RAZEM",
        value: amount(power.dumpMw + power.resCurtailedMw, energy.dumpMwh + energy.resCurtailedMwh),
        note: `KARA ${formatMoneyPln(finance.dumpPenaltyPln)}`,
        tone: finance.dumpPenaltyPln > 0 ? "danger" : undefined,
        strong: true,
      },
    ],
  };
}

function coverageSection(aggregate: PeriodAggregate, asPower: boolean): ReportSection {
  const total = aggregate.coverageMwh.reduce((sum, layer) => sum + layer, 0);
  const rows: ReportRow[] = [];
  for (const [index, layer] of COVERAGE_LAYERS.entries()) {
    const mwh = aggregate.coverageMwh[index] ?? 0;
    if (mwh <= 0) continue;
    const style = TIMELINE_LAYERS.find((entry) => entry.key === layer);
    rows.push({
      label: style?.label ?? layer.toUpperCase(),
      value: asPower ? formatMw(aggregate.coverageMw[index] ?? 0) : formatEnergy(mwh),
      note: `UDZIAŁ ${share(mwh, total)}`,
    });
  }
  if (rows.length === 0) rows.push({ label: "BRAK PRODUKCJI", value: "—" });
  else
    rows.push({
      label: "RAZEM",
      value: asPower
        ? formatMw(aggregate.coverageMw.reduce((sum, layer) => sum + layer, 0))
        : formatEnergy(total),
      strong: true,
    });
  return { label: "POKRYCIE ŹRÓDŁAMI", rows };
}

const FORECAST_ROWS = [
  { key: "demand", label: "POPYT" },
  { key: "wind", label: "WIATR" },
  { key: "pv", label: "PV" },
] as const;

function forecastSection(aggregate: PeriodAggregate, asPower: boolean): ReportSection {
  const { resolvedTurns } = aggregate;
  return {
    label: "PROGNOZA vs PRAWDA",
    rows: FORECAST_ROWS.map(({ key, label }) => {
      const stat = aggregate.forecast[key];
      const band = `PROGNOZA ${formatBand(stat.forecastMw, stat.bandMw)}`;
      const note = asPower
        ? `${band} · BŁĄD ${formatSignedNumber(stat.biasMw)} MW`
        : `${band} · BŁĄD ŚR. ${formatMw(stat.maeMw)} · W PAŚMIE ${formatNumber(stat.inBandTurns)}/${formatNumber(resolvedTurns)}`;
      return {
        label,
        value: asPower ? formatMw(stat.actualMw) : formatEnergy(stat.actualMwh),
        note,
        tone: "info" as const,
      };
    }),
  };
}

function financeSection(aggregate: PeriodAggregate): ReportSection {
  const { finance, energy } = aggregate;
  const marginPlnPerMwh = energy.deliveredMwh > 0 ? finance.netPln / energy.deliveredMwh : 0;
  return {
    label: "FINANSE",
    rows: [
      {
        label: "SPRZEDAŻ ENERGII",
        value: formatSignedMoneyPln(finance.revenueEnergyPln),
        note: `${formatNumber(CONFIG.tariffPlnPerMwh)} zł/MWh`,
        tone: "ok",
      },
      { label: "EKSPORT", value: formatSignedMoneyPln(finance.revenueExportPln), tone: "ok" },
      { label: "PALIWO", value: formatSignedMoneyPln(-finance.fuelCostPln) },
      { label: "IMPORT", value: formatSignedMoneyPln(-finance.importCostPln) },
      {
        label: "KOSZTY STAŁE",
        value: formatSignedMoneyPln(-finance.fixedCostPln),
        note: "NALICZANE NA KONIEC DOBY",
      },
      {
        label: "KARA ZA NIEDOBÓR",
        value: formatSignedMoneyPln(-finance.ensPenaltyPln),
        tone: finance.ensPenaltyPln > 0 ? "danger" : undefined,
      },
      {
        label: "KARA ZA NADWYŻKĘ",
        value: formatSignedMoneyPln(-finance.dumpPenaltyPln),
        tone: finance.dumpPenaltyPln > 0 ? "danger" : undefined,
      },
      {
        label: "WYNIK OKRESU",
        value: formatSignedMoneyPln(finance.netPln),
        note: `${formatSignedNumber(marginPlnPerMwh, 1)} zł/MWh DOSTARCZONEJ`,
        tone: finance.netPln >= 0 ? "ok" : "danger",
        strong: true,
      },
    ],
  };
}

function shortfallSection(state: GameState, aggregate: PeriodAggregate): ReportSection {
  const total = aggregate.energy.ensMwh;
  if (aggregate.shortfalls.length === 0) {
    return {
      label: "NIEDOBORY W MIASTACH",
      rows: [{ label: "WSZYSTKIE MIASTA ZASILONE", value: "0 MWh", tone: "ok" }],
    };
  }
  return {
    label: "NIEDOBORY W MIASTACH",
    rows: aggregate.shortfalls.map((entry) => ({
      label: (
        state.cities.find((city) => city.id === entry.cityId)?.name ?? entry.cityId
      ).toUpperCase(),
      value: formatEnergy(entry.ensMwh),
      note: `UDZIAŁ ${share(entry.ensMwh, total)}`,
      tone: "danger" as const,
    })),
  };
}

/**
 * The whole report for one period. Null only when the session has resolved
 * nothing at all — there is no period to name yet, and the view says so.
 */
export function buildPeriodReport(
  state: GameState,
  scope: ReportScope,
  anchor: number | null,
): PeriodReportModel | null {
  const period = resolveAnchor(state, scope, anchor);
  if (period === null) return null;
  const aggregate = aggregatePeriod(state, period);
  const asPower = scope === "turn";
  const { title, subtitle } = titleOf(period);
  const previous = previousPeriod(state, period);
  const next = nextPeriod(state, period);

  return {
    scope,
    title,
    subtitle,
    // "RÓWNOWAŻNIK", not the panel's "×10,9 DNIA": that one is the weight of a
    // single game day, this one is how many real days the resolved turns add up
    // to — the two would be read as the same number on the turn scope.
    coverage: `${formatNumber(aggregate.resolvedTurns)}/${formatNumber(SCOPE_TURNS[scope])} TUR · RÓWNOWAŻNIK ${formatNumber(aggregate.realDays, 1)} DNIA`,
    sections:
      aggregate.resolvedTurns === 0
        ? [{ label: "BILANS ENERGII", rows: [{ label: "OKRES NIEROZSTRZYGNIĘTY", value: "—" }] }]
        : [
            energySection(aggregate, asPower),
            coverageSection(aggregate, asPower),
            forecastSection(aggregate, asPower),
            financeSection(aggregate),
            shortfallSection(state, aggregate),
          ],
    prevAnchor: previous?.fromTurn ?? null,
    nextAnchor: next?.fromTurn ?? null,
    atNewest: next === null,
  };
}
