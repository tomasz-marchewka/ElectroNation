// The settlement strip of the last resolved turn (01 §2.3 phase 3–4). Pure
// model over `GameState.lastTurnReport`: nothing is remembered by the UI, so a
// loaded save shows the same strip the live session did.
//
// Tile order is cause and effect: weather → delivery → shortfall → money →
// result (ReportStrip.prompt.md).

import { CONFIG, type GameState, type TurnReport } from "../../engine";
import type { ReportTile } from "../components/ReportStrip";
import {
  formatBand,
  formatMoneyPln,
  formatMw,
  formatNumber,
  formatSignedMoneyPln,
} from "../format";
import { dayTurnAt } from "../labels";

/** Report power is quantized to 0,001 MW — below this a value reads as zero. */
const ZERO_MW = 0.01;

/** How many city names a shortfall note prints before it counts the rest. */
const NAMED_CITIES = 2;

/** "TURA 7 · SZCZYT WIECZ." — which turn the numbers below belong to. */
export function reportTitle(report: TurnReport): string {
  return `TURA ${report.turnIndex + 1} · ${dayTurnAt(report.turnIndex).name}`;
}

/** Cities left short this turn, named — the note has to say WHERE it hurt. */
function shortfallNote(state: GameState, report: TurnReport): string {
  const names = report.cities
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

export function reportTiles(state: GameState, report: TurnReport): ReportTile[] {
  const { totals, finance, forecastMiss } = report;
  const revenuePln = finance.revenueEnergyPln + finance.revenueExportPln;
  const costPln = finance.fuelCostPln + finance.importCostPln;
  const penaltyPln = finance.ensPenaltyPln + finance.dumpPenaltyPln;
  const short = totals.ensMw > ZERO_MW;

  const revenueNote = [
    `${formatNumber(CONFIG.tariffPlnPerMwh)} zł/MWh × ${formatNumber(report.dayWeight, 1)}`,
    finance.revenueExportPln > 0 ? `EKSPORT ${formatMoneyPln(finance.revenueExportPln)}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  const costNote = [
    `PALIWO ${formatMoneyPln(finance.fuelCostPln)}`,
    finance.importCostPln > 0 ? `IMPORT ${formatMoneyPln(finance.importCostPln)}` : null,
    // Fixed O&M lands once a day, in the last turn's report (01 §6).
    finance.fixedCostPln > 0 ? `+ KOSZTY STAŁE ${formatMoneyPln(finance.fixedCostPln)}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return [
    {
      label: "WIATR REALNY",
      value: formatMw(forecastMiss.wind.actualMw),
      note: `PROGNOZA ${formatBand(forecastMiss.wind.forecastMw, forecastMiss.wind.bandMw)}`,
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
      note: shortfallNote(state, report),
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
      // Dumping dispatchable surplus is penalized too (02 §5) — the handoff
      // predates that rule and only knew the ENS penalty.
      value: formatSignedMoneyPln(-penaltyPln),
      note: `ENS ${formatMoneyPln(finance.ensPenaltyPln)} · ZRZUT ${formatMoneyPln(finance.dumpPenaltyPln)}`,
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
