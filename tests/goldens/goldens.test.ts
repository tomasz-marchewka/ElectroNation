import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  MAP_V1,
  MINIMAL_SCENARIO,
  TURNS_PER_DAY,
  TURN_PHASES,
  applyAction,
  newGame,
  resolveTurn,
  type Action,
} from "../../src/engine";
import { stateHash } from "../helpers/hash";

// Golden scenarios: fixture = (seed, action log), recorded output = per-turn
// KPIs + final state hash. A red diff here means engine behavior changed —
// either fix the regression, or (for an intentional balance/mechanics change)
// run `npm run goldens:update` and review the diff in the commit.

interface ScenarioAction {
  /** 0-based index of the turn before which the action is applied. */
  beforeTurn: number;
  /** Why the player did this — documentation only, the run ignores it. */
  note?: string;
  action: Action;
}

/**
 * A fixture names its map, because hexes only mean something on one: the same
 * coordinates are a lake on map v1 and empty plains on the minimal map, and a
 * fixture that silently turned into no-ops would still go green.
 *
 * `mapV1auto` is map v1 with the pre-0.28 400 MW start plant, automated: the
 * fixtures written against that endowment keep representing their subject
 * (dunkelflaute, corridor limits, forecast upgrades) instead of drowning in
 * the 100 MW seed's shortfall. The real endowment — one SMALL manual block —
 * is exercised by `mapv1-first-days` and the minimal-map fixtures.
 */
const MAP_V1_AUTO_400 = {
  ...MAP_V1,
  plants: MAP_V1.plants.map((plant) => ({
    ...plant,
    capacityMw: 400,
    blocks: 4,
    automation: true,
  })),
};
const MAPS = { mapV1: MAP_V1, mapV1auto: MAP_V1_AUTO_400, minimal: MINIMAL_SCENARIO } as const;

interface Scenario {
  name: string;
  description: string;
  /** Key of MAPS; the played map v1 when a fixture says nothing. */
  map?: keyof typeof MAPS;
  seed: number;
  days: number;
  actions: ScenarioAction[];
}

const scenariosDir = join(import.meta.dirname, "scenarios");
const scenarios = readdirSync(scenariosDir)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(scenariosDir, file), "utf8")) as Scenario);

describe("golden scenarios", () => {
  test.each(scenarios)("$name", async (scenario) => {
    let state = newGame(scenario.seed, MAPS[scenario.map ?? "mapV1"]);
    const perTurn: unknown[] = [];
    const totalTurns = scenario.days * TURNS_PER_DAY;
    for (let turn = 0; turn < totalTurns; turn++) {
      for (const { action } of scenario.actions.filter((a) => a.beforeTurn === turn)) {
        state = applyAction(state, action);
      }
      const phase = TURN_PHASES[turn % TURNS_PER_DAY];
      state = resolveTurn(state);
      const report = state.lastTurnReport;
      if (report === null) throw new Error("resolveTurn must record lastTurnReport");
      perTurn.push({
        turn,
        phase,
        day: state.calendar.dayIndex,
        moneyPln: state.moneyPln,
        demandMw: report.totals.demandMw,
        deliveredMw: report.totals.deliveredMw,
        ensMw: report.totals.ensMw,
        lossesMw: report.totals.lossesMw,
        dumpMw: report.totals.dumpMw,
        resCurtailedMw: report.totals.resCurtailedMw,
        netPln: report.finance.netPln,
      });
    }
    const report = {
      scenario: scenario.name,
      description: scenario.description,
      perTurn,
      // The archive is dense and never restarts (02 §4.1), so this is exactly
      // the number of turns played — a reset or a gap would show up here as a
      // readable diff instead of hiding inside the hash.
      archiveTurns: state.history.length,
      finalStateHash: stateHash(state),
    };
    await expect(JSON.stringify(report, null, 2) + "\n").toMatchFileSnapshot(
      `./__snapshots__/${scenario.name}.golden.json`,
    );
  });
});
