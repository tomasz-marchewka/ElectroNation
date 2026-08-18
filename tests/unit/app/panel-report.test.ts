// The settlement strip's tiles (01 §2.3 phase 3–4). Every value is compared
// against the digest the engine archived, so a change of tariff, penalty or day
// weight can never be "fixed" by editing a constant in the UI — and what the
// strip prints for a turn read back later is what it printed live (02 §4.1).

import { describe, expect, test } from "vitest";
import {
  CONFIG,
  TURNS_PER_DAY,
  applyAction,
  newGame,
  resolveTurn,
  type GameState,
  type TurnDigest,
} from "../../../src/engine";
import { formatBand, formatMw, formatSignedMoneyPln } from "../../../src/app/format";
import { reportTiles, reportTitle } from "../../../src/app/panel/report";
import { makeScenario } from "../../helpers/scenario";

function resolved(state: GameState): { state: GameState; report: TurnDigest } {
  const next = resolveTurn(state);
  const digest = next.history.at(-1);
  if (!digest) throw new Error("resolveTurn must archive the turn");
  return { state: next, report: digest };
}

function tile(state: GameState, report: TurnDigest, label: string) {
  const found = reportTiles(state, report).find((entry) => entry.label === label);
  if (!found) throw new Error(`no tile ${label}`);
  return found;
}

describe("tile order tells cause and effect (ReportStrip.prompt.md)", () => {
  test("weather → delivery → shortfall → money → result", () => {
    const { state, report } = resolved(newGame(7, makeScenario()));
    expect(reportTiles(state, report).map((entry) => entry.label)).toEqual([
      "WIATR REALNY",
      "DOSTARCZONO",
      "NIEDOBÓR",
      "PRZYCHÓD",
      "KOSZTY",
      "KARY",
      "WYNIK TURY",
    ]);
    expect(reportTitle(report.turnIndex)).toBe("TURA 1 · NOC");
  });
});

describe("the bet against the forecast", () => {
  test("wind names what came in and what was promised, band and all", () => {
    const { state, report } = resolved(
      newGame(7, {
        ...makeScenario(),
        farms: [
          {
            id: "farm-1",
            name: "FW",
            hex: { q: 0, r: 0 },
            tech: "wind",
            capacityMw: 200,
            enabled: true,
            windClass: "open",
            solarMultiplier: 1,
          },
        ],
      }),
    );
    const wind = tile(state, report, "WIATR REALNY");

    expect(report.forecastMiss.wind.bandMw).toBeGreaterThan(0);
    expect(wind.value).toBe(formatMw(report.forecastMiss.wind.actualMw));
    expect(wind.note).toBe(
      `PROGNOZA ${formatBand(report.forecastMiss.wind.forecastMw, report.forecastMiss.wind.bandMw)}`,
    );
  });
});

describe("shortfall — 01 §4.5", () => {
  test("names the cities that went short, and says so when none did", () => {
    // Setpoint left at 0: the whole demand is energy not served.
    const short = resolved(newGame(7, makeScenario()));
    const shortTile = tile(short.state, short.report, "NIEDOBÓR");
    expect(shortTile.value).toBe(formatMw(short.report.totals.ensMw));
    expect(shortTile.note).toBe("A");
    expect(shortTile.tone).toBe("danger");

    const covered = resolved(
      applyAction(newGame(7, makeScenario()), {
        type: "setPlantSetpoint",
        plantId: "plant-1",
        mw: 400,
      }),
    );
    const okTile = tile(covered.state, covered.report, "NIEDOBÓR");
    expect(covered.report.totals.ensMw).toBe(0);
    expect(okTile.note).toBe("WSZYSTKIE MIASTA ZASILONE");
    expect(okTile.tone).toBe("ok");
  });
});

describe("money — every tile traceable to the report", () => {
  test("revenue, costs, penalties and the result come from finance", () => {
    const { state, report } = resolved(
      applyAction(newGame(7, makeScenario()), {
        type: "setPlantSetpoint",
        plantId: "plant-1",
        mw: 350,
      }),
    );
    const { finance } = report;

    expect(tile(state, report, "PRZYCHÓD").value).toBe(
      formatSignedMoneyPln(finance.revenueEnergyPln + finance.revenueExportPln),
    );
    expect(tile(state, report, "PRZYCHÓD").note).toContain(`${CONFIG.tariffPlnPerMwh} zł/MWh`);
    expect(tile(state, report, "KOSZTY").value).toBe(
      formatSignedMoneyPln(-(finance.fuelCostPln + finance.importCostPln)),
    );
    // Dumping 350 MW into a night-time city is penalized as well (02 §5).
    expect(finance.dumpPenaltyPln).toBeGreaterThan(0);
    expect(tile(state, report, "KARY").value).toBe(
      formatSignedMoneyPln(-(finance.ensPenaltyPln + finance.dumpPenaltyPln)),
    );
    expect(tile(state, report, "KARY").note).toContain("ZRZUT");
    expect(tile(state, report, "WYNIK TURY").value).toBe(formatSignedMoneyPln(finance.netPln));
  });

  test("fixed O&M is only mentioned in the last turn of the day (01 §6)", () => {
    let state = applyAction(newGame(7, makeScenario()), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 300,
    });
    for (let turn = 0; turn < TURNS_PER_DAY - 1; turn++) state = resolveTurn(state);
    const midDay = state.history.at(-1);
    if (!midDay) throw new Error("missing digest");
    expect(tile(state, midDay, "KOSZTY").note).not.toContain("KOSZTY STAŁE");

    const dayEnd = resolved(state);
    expect(dayEnd.report.finance.fixedCostPln).toBeGreaterThan(0);
    expect(tile(dayEnd.state, dayEnd.report, "KOSZTY").note).toContain("+ KOSZTY STAŁE");
  });

  test("a profitable turn highlights its result tile", () => {
    const { state, report } = resolved(
      applyAction(newGame(7, makeScenario()), {
        type: "setPlantSetpoint",
        plantId: "plant-1",
        mw: 40,
      }),
    );
    expect(report.finance.netPln).toBeGreaterThan(0);
    expect(tile(state, report, "WYNIK TURY").highlight).toBe(true);
    expect(tile(state, report, "WYNIK TURY").tone).toBe("ok");
  });
});
