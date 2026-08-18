// Loading a save is the only path on which the engine meets a state it did not
// produce itself: an autosave written by an older build, or a file the player
// picked off disk. Everything here therefore reports a domain result instead of
// throwing — a foreign or broken file is a game situation, not a crash.

import type { FarmTech, PlantTech } from "./config";
import { buildTurnDigest, coverageIndex } from "./history";
import { STATE_SCHEMA_VERSION, type GameState, type TurnDigest, type TurnReport } from "./state";

/** Moves a state from schema `n` to `n + 1`; the loader stamps the number. */
export type Migration = (state: unknown) => unknown;

/** Keyed by the schema a migration READS: `MIGRATIONS[n]` produces `n + 1`. */
export type MigrationRegistry = Record<number, Migration>;

/**
 * Saving arrived with schema 9, so no save older than that can exist. Every
 * bump of STATE_SCHEMA_VERSION adds its entry here; see the comment at the
 * constant. Keyed by the schema a migration READS, so they compose in order.
 */
export const MIGRATIONS: MigrationRegistry = {
  /** 9 → 10: line upgrades (01 §4.2, 0.17). No save can have one in flight. */
  9: (state) => {
    if (!isRecord(state) || !Array.isArray(state.lines)) return state;
    return {
      ...state,
      lines: state.lines.map((line) => (isRecord(line) ? { ...line, upgrade: null } : line)),
    };
  },
  /**
   * 10 → 11: the turn archive replaces `dayReports` (02 §4.1). The reports of
   * the day the save was written on are all the history such a save ever had,
   * so they become its whole archive — nothing older ever existed to lose.
   */
  10: (state) => {
    if (!isRecord(state)) return state;
    const { dayReports, ...rest } = state;
    return { ...rest, history: digestsOfSavedReports(dayReports, state.plants, state.farms) };
  },
};

/** Coarse guard: enough to keep a hand-edited save from crashing the loader. */
function isTechObject(value: unknown): value is { id: string; tech: PlantTech & FarmTech } {
  return isRecord(value) && typeof value.id === "string" && typeof value.tech === "string";
}

function isReportLike(value: unknown): value is TurnReport {
  return (
    isRecord(value) &&
    Array.isArray(value.sources) &&
    Array.isArray(value.cities) &&
    isRecord(value.totals) &&
    isRecord(value.finance) &&
    isRecord(value.forecastMiss)
  );
}

function digestsOfSavedReports(reports: unknown, plants: unknown, farms: unknown): TurnDigest[] {
  if (!Array.isArray(reports)) return [];
  const layers = coverageIndex({
    plants: (Array.isArray(plants) ? plants : []).filter(isTechObject),
    farms: (Array.isArray(farms) ? farms : []).filter(isTechObject),
  });
  return reports.filter(isReportLike).map((report) => buildTurnDigest(report, layers));
}

export type LoadErrorCode =
  /** Not an object, or no `schema`/`seed` — not one of our files at all. */
  | "notASave"
  /** Written by a newer build than this one. */
  | "futureSchema"
  /** Too old: the chain of migrations up to the current schema is broken. */
  | "missingMigration"
  /** Header reads like a save, body does not. */
  | "brokenState";

export interface LoadError {
  code: LoadErrorCode;
  /** Schema the input claimed, where one was readable. */
  schema?: number;
  /** Field that failed the shape check (`brokenState` only). */
  field?: string;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; error: LoadError };

type FieldKind = "number" | "string" | "record" | "array";

/**
 * Top-level shape of `GameState`, coarse on purpose: enough to keep a truncated
 * or foreign JSON from reaching the renderer, far short of a full validator.
 * A save the player edited by hand stays their business (M9 brief §3).
 */
const REQUIRED_FIELDS: Record<string, FieldKind> = {
  seed: "number",
  moneyPln: "number",
  nextObjectId: "number",
  monthRegimeForecast: "string",
  forecastLevel: "string",
  calendar: "record",
  rng: "record",
  monthRegimes: "record",
  map: "record",
  terrain: "record",
  windClasses: "record",
  solarMultipliers: "record",
  dayTruth: "record",
  cities: "array",
  plants: "array",
  farms: "array",
  storages: "array",
  junctions: "array",
  borders: "array",
  lines: "array",
  constructions: "array",
  borderSites: "array",
  history: "array",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesKind(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "record":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
  }
}

function shapeError(state: unknown): LoadError | null {
  if (!isRecord(state)) return { code: "brokenState" };
  for (const [field, kind] of Object.entries(REQUIRED_FIELDS)) {
    if (!matchesKind(state[field], kind)) return { code: "brokenState", field };
  }
  // The one field allowed to be null — a session before its first resolution.
  const report = state.lastTurnReport;
  if (report !== null && !isRecord(report)) return { code: "brokenState", field: "lastTurnReport" };
  return null;
}

/**
 * Validates a parsed save and walks it up to the current schema. `registry` is
 * a parameter so tests can exercise the mechanism while the real registry is
 * still empty.
 */
export function migrateState(raw: unknown, registry: MigrationRegistry = MIGRATIONS): LoadResult {
  if (!isRecord(raw)) return { ok: false, error: { code: "notASave" } };
  const schema = raw.schema;
  if (typeof schema !== "number" || !Number.isInteger(schema) || schema < 1) {
    return { ok: false, error: { code: "notASave" } };
  }
  if (typeof raw.seed !== "number") return { ok: false, error: { code: "notASave", schema } };
  if (schema > STATE_SCHEMA_VERSION) return { ok: false, error: { code: "futureSchema", schema } };

  let state: unknown = raw;
  for (let version = schema; version < STATE_SCHEMA_VERSION; version++) {
    const migrate = registry[version];
    if (!migrate) return { ok: false, error: { code: "missingMigration", schema: version } };
    const migrated = migrate(state);
    if (!isRecord(migrated)) return { ok: false, error: { code: "brokenState", field: "schema" } };
    // Stamping the version here, not in the migration: a migration that forgot
    // to bump the number would otherwise loop the loader on the same step.
    state = { ...migrated, schema: version + 1 };
  }

  const error = shapeError(state);
  if (error) return { ok: false, error };
  return { ok: true, state: state as GameState };
}

/** Same, from the raw text of an imported file: unparsable text is no save. */
export function parseSaveJson(text: string, registry: MigrationRegistry = MIGRATIONS): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "notASave" } };
  }
  return migrateState(raw, registry);
}
