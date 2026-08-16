// The load path of a save (M9): validation, the migration chain and the
// domain errors that replace exceptions on it. Schema 9 is the oldest version
// any save was written in, so the chain proper starts there; the mechanism is
// also exercised on a synthetic registry.

import { describe, expect, test } from "vitest";
import {
  MIGRATIONS,
  STATE_SCHEMA_VERSION,
  migrateState,
  newGame,
  parseSaveJson,
  type MigrationRegistry,
} from "../../src/engine";
import { playTurns } from "../helpers/run";

/** A save of the previous schema: today's state with yesterday's number. */
function previousSchemaSave(): Record<string, unknown> {
  return { ...playTurns(11, 3), schema: STATE_SCHEMA_VERSION - 1 };
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
    // Two schemas back: nothing was ever written at 8, so the chain is broken
    // at the first step and the loader says so instead of guessing the shape.
    const result = migrateState({ ...playTurns(11, 3), schema: STATE_SCHEMA_VERSION - 2 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("missingMigration");
      expect(result.error.schema).toBe(STATE_SCHEMA_VERSION - 2);
    }
  });

  test("9 → 10: every line of an older save gains an empty upgrade slot", () => {
    // What a schema-9 save looked like: lines without the field at all.
    const state = playTurns(11, 3);
    const old = {
      ...JSON.parse(JSON.stringify(state)),
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
      // Nothing else moved: the migration only fills the new field.
      expect(result.state).toStrictEqual(state);
    }
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
