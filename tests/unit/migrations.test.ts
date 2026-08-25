// The load path of a save (M9): validation, the migration chain and the
// domain errors that replace exceptions on it. Schema 9 is the oldest version
// any save was written in, so the chain proper starts there; the mechanism is
// also exercised on a synthetic registry.

/** The last schema nothing was ever written in — the chain has to break here. */
const UNSUPPORTED_SCHEMA = 8;

import { describe, expect, test } from "vitest";
import {
  MIGRATIONS,
  STATE_SCHEMA_VERSION,
  migrateState,
  newGame,
  parseSaveJson,
  type GameState,
  type MigrationRegistry,
} from "../../src/engine";
import { playTurns } from "../helpers/run";

/**
 * A save of the previous schema: today's state with yesterday's number. Used
 * only with synthetic registries, so it keeps today's shape on purpose — the
 * real chain is exercised by the per-step tests below.
 */
function previousSchemaSave(): Record<string, unknown> {
  return { ...playTurns(11, 3), schema: STATE_SCHEMA_VERSION - 1 };
}

/**
 * What a schema-10 save looked like: the reports of the day being played, no
 * archive. Only the last of them can be rebuilt from a current state, which is
 * enough — the migration's job is to carry them over, not to invent history.
 */
function schema10Save(state: GameState): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  delete copy.history;
  return { ...copy, schema: 10, dayReports: state.lastTurnReport ? [state.lastTurnReport] : [] };
}

describe("registry", () => {
  test("every entry is a step of the chain that ends at the current schema", () => {
    const versions = Object.keys(MIGRATIONS)
      .map(Number)
      .sort((a, b) => a - b);
    for (const version of versions) expect(version).toBeLessThan(STATE_SCHEMA_VERSION);
    // No gaps: a save of the oldest supported schema must reach the current one.
    versions.forEach((version, index) => {
      expect(version).toBe(STATE_SCHEMA_VERSION - versions.length + index);
    });
  });
});

describe("migrateState", () => {
  test("a save of the current schema loads unchanged", () => {
    const state = playTurns(2026, 5);
    const result = migrateState(JSON.parse(JSON.stringify(state)));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toStrictEqual(state);
  });

  test("a registered migration carries a save one schema up", () => {
    const registry: MigrationRegistry = {
      [STATE_SCHEMA_VERSION - 1]: (state) => ({
        ...(state as Record<string, unknown>),
        moneyPln: 42,
      }),
    };

    const result = migrateState(previousSchemaSave(), registry);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schema).toBe(STATE_SCHEMA_VERSION);
      expect(result.state.moneyPln).toBe(42);
    }
  });

  test("the loader stamps the schema, not the migration", () => {
    // A migration that forgets to bump the number would otherwise loop the
    // loader on the same step forever.
    const registry: MigrationRegistry = { [STATE_SCHEMA_VERSION - 1]: (state) => state };
    const result = migrateState(previousSchemaSave(), registry);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.schema).toBe(STATE_SCHEMA_VERSION);
  });

  test("an older save without its migration is rejected, not guessed", () => {
    // Nothing was ever written at 8, so the chain is broken at the first step
    // and the loader says so instead of guessing the shape.
    const result = migrateState({ ...playTurns(11, 3), schema: UNSUPPORTED_SCHEMA });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("missingMigration");
      expect(result.error.schema).toBe(UNSUPPORTED_SCHEMA);
    }
  });

  test("9 → 10: every line of an older save gains an empty upgrade slot", () => {
    // What a schema-9 save looked like: lines without the field at all.
    const state = playTurns(11, 3);
    const old = {
      ...schema10Save(state),
      schema: 9,
      lines: state.lines.map((line) => {
        const without: Record<string, unknown> = { ...line };
        delete without.upgrade;
        return without;
      }),
    };
    expect(old.lines.length).toBeGreaterThan(0);

    const result = migrateState(old);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schema).toBe(STATE_SCHEMA_VERSION);
      expect(result.state.lines.every((line) => line.upgrade === null)).toBe(true);
      // Nothing else moved: the two migrations only fill the new fields.
      expect({ ...result.state, history: [] }).toStrictEqual({ ...state, history: [] });
    }
  });

  test("10 → 11: the day's reports become the turn archive (02 §4.1)", () => {
    const state = playTurns(11, 3);
    const result = migrateState(schema10Save(state));

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The reports a schema-10 save carried are digested into the archive —
      // and they digest to exactly what the engine archives live.
      expect(result.state.history).toStrictEqual([state.history.at(-1)]);
      expect("dayReports" in result.state).toBe(false);
    }
  });

  test("10 → 11: a save with unreadable reports loads with an empty archive", () => {
    // A hand-edited save stays the player's business (M9 brief §3), but it may
    // not take the loader down with it.
    const state = playTurns(11, 3);
    const result = migrateState({ ...schema10Save(state), dayReports: [{ nonsense: true }, 7] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.history).toStrictEqual([]);
  });

  test("11 → 12: a line running through an object is cut on it (01 §3.3)", () => {
    // What a schema-11 save could carry: one route drawn straight through an
    // object, because before 0.19 the tap lived only in the flow graph.
    const state = playTurns(11, 3);
    const plant = state.plants[0];
    const city = state.cities.find((candidate) => candidate.connected);
    const whole = state.lines[0];
    expect(plant && city && whole).toBeTruthy();
    if (!plant || !city || !whole) return;
    const merged = {
      ...JSON.parse(JSON.stringify(state)),
      schema: 11,
      // plant → junction hex → city, all on one line, as an old save had it.
      junctions: [
        {
          id: "junction-old",
          name: "junction-old",
          hex: whole.path[1],
          throughputMw: 250,
          lineSlots: 6,
        },
      ],
      lines: [{ ...whole, id: "line-old" }],
    };

    const result = migrateState(merged);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.lines.map((line) => line.id)).toStrictEqual(["line-old", "line-old#2"]);
      expect(result.state.lines[0]?.path).toStrictEqual(whole.path.slice(0, 2));
      expect(result.state.lines[1]?.path).toStrictEqual(whole.path.slice(1));
    }
  });

  test("12 → 13: a junction loses its throughput, modules and queued module", () => {
    // What a schema-12 save carried: a station with its own MW cap and bought
    // line slots, plus a capacity module still on the build queue (01 §5.4).
    const state = playTurns(11, 3);
    const old = {
      ...JSON.parse(JSON.stringify(state)),
      schema: 12,
      junctions: [
        { id: "j-1", name: "J1", hex: { q: 4, r: 4 }, throughputMw: 1_000, lineSlots: 10 },
      ],
      constructions: [
        {
          id: "obj-9",
          remainingDays: 1,
          pending: { kind: "junctionExpansion", junctionId: "j-1" },
        },
      ],
    };

    const result = migrateState(old);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The station keeps standing and now passes whatever its lines bring.
      expect(result.state.junctions).toStrictEqual([
        { id: "j-1", name: "J1", hex: { q: 4, r: 4 } },
      ]);
      // The module has nothing left to expand: it leaves the queue unrefunded.
      expect(result.state.constructions).toStrictEqual([]);
    }
  });

  test("13 → 14: a storage order splits into its two axes, losing nothing", () => {
    // What a schema-13 save carried: one battery order that bought both axes
    // at once, and one pumped block — the fixed 250 MW / 2 500 MWh pair.
    const state = playTurns(11, 3);
    const old = {
      ...JSON.parse(JSON.stringify(state)),
      schema: 13,
      constructions: [
        {
          id: "obj-7",
          remainingDays: 1,
          pending: {
            kind: "batteryExpansion",
            storageId: "bess-1",
            powerMw: 50,
            capacityMwh: 100,
          },
        },
        {
          id: "obj-8",
          remainingDays: 4,
          pending: { kind: "pumpedExpansion", storageId: "psh-1" },
        },
      ],
    };

    const result = migrateState(old);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Nothing paid for is forfeited: each order becomes the two entries it
    // always was underneath, keeping its countdown (01 §5.3, §7 in 0.26).
    expect(result.state.constructions).toStrictEqual([
      {
        id: "obj-7",
        remainingDays: 1,
        pending: { kind: "storagePowerExpansion", storageId: "bess-1", powerMw: 50 },
      },
      {
        id: "obj-7-capacity",
        remainingDays: 1,
        pending: { kind: "storageCapacityExpansion", storageId: "bess-1", capacityMwh: 100 },
      },
      {
        id: "obj-8",
        remainingDays: 4,
        pending: { kind: "storagePowerExpansion", storageId: "psh-1", powerMw: 250 },
      },
      {
        id: "obj-8-capacity",
        remainingDays: 4,
        pending: { kind: "storageCapacityExpansion", storageId: "psh-1", capacityMwh: 2_500 },
      },
    ]);
  });

  test("13 → 14: a single-axis order keeps its own id", () => {
    const state = playTurns(11, 3);
    const old = {
      ...JSON.parse(JSON.stringify(state)),
      schema: 13,
      constructions: [
        {
          id: "obj-3",
          remainingDays: 1,
          pending: { kind: "batteryExpansion", storageId: "bess-1", powerMw: 0, capacityMwh: 200 },
        },
      ],
    };

    const result = migrateState(old);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions).toStrictEqual([
      {
        id: "obj-3",
        remainingDays: 1,
        pending: { kind: "storageCapacityExpansion", storageId: "bess-1", capacityMwh: 200 },
      },
    ]);
  });

  test("14 → 15: plant block counts become block state; reports gain the startup entry", () => {
    // What a schema-14 save carried: `blocks` as a count, a plain setpoint that
    // acted instantly, and finance without `startupCostPln`.
    const state = playTurns(11, 3);
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown> & {
      plants: Record<string, unknown>[];
      lastTurnReport: { finance: Record<string, unknown> } | null;
      history: { finance: Record<string, unknown> }[];
    };
    old.schema = 14;
    old.plants = [
      {
        id: "plant-old",
        name: "EC Stara",
        hex: { q: 1, r: 9 },
        tech: "coal",
        capacityMw: 1_000,
        blocks: 2,
        setpointMw: 300,
      },
    ];
    if (old.lastTurnReport) delete old.lastTurnReport.finance.startupCostPln;
    for (const digest of old.history) delete digest.finance.startupCostPln;

    const result = migrateState(old);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plant = result.state.plants[0]!;
    // The capacity splits evenly — individual sizes were never recorded.
    expect(plant.blocks.map((block) => block.mw)).toStrictEqual([500, 500]);
    expect(plant.capacityMw).toBe(1_000);
    // A running plant migrates RUNNING at its setpoint: no fake cold start.
    expect(plant.blocks[0]).toMatchObject({ status: "online", outputMw: 300 });
    expect(plant.blocks[1]?.status).toBe("offline");
    expect(plant.setpointMw).toBe(300);
    // Every archived report gains the new finance entry at zero.
    expect(result.state.lastTurnReport?.finance.startupCostPln).toBe(0);
    expect(result.state.history.every((d) => d.finance.startupCostPln === 0)).toBe(true);
  });

  test("11 → 12: a save too broken to cut is handed on untouched", () => {
    const state = playTurns(11, 3);
    const result = migrateState({
      ...JSON.parse(JSON.stringify(state)),
      schema: 11,
      lines: [{ id: "line-x", type: "mv", path: "nonsense", builtHours: 0, totalHours: 0 }],
    });

    // The migration reads nothing it has not checked first, so a line it cannot
    // make sense of passes through untouched — a hand-edited save stays the
    // player's business (M9 brief §3) and may not take the loader down.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.lines).toHaveLength(1);
  });

  test("a save from the future is rejected", () => {
    const result = migrateState({ ...newGame(1), schema: STATE_SCHEMA_VERSION + 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("futureSchema");
      expect(result.error.schema).toBe(STATE_SCHEMA_VERSION + 1);
    }
  });

  test("anything without a schema and a seed is not a save", () => {
    for (const raw of [null, 42, "save", [], {}, { schema: "8", seed: 1 }, { schema: 8 }]) {
      const result = migrateState(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("notASave");
    }
  });

  test("a save with the right header and a broken body names the field", () => {
    const truncated: Record<string, unknown> = { ...newGame(1) };
    delete truncated.cities;
    const result = migrateState(truncated);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("brokenState");
      expect(result.error.field).toBe("cities");
    }
  });

  test("a state that never resolved a turn keeps its null report", () => {
    const result = migrateState(JSON.parse(JSON.stringify(newGame(3))));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.lastTurnReport).toBeNull();
  });
});

describe("parseSaveJson", () => {
  test("round-trips the text a save file holds", () => {
    const state = playTurns(5, 2);
    const result = parseSaveJson(JSON.stringify(state));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toStrictEqual(state);
  });

  test("text that is not JSON is not a save", () => {
    const result = parseSaveJson("{ nie jest zapisem");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("notASave");
  });
});
