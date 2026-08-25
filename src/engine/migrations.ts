// Loading a save is the only path on which the engine meets a state it did not
// produce itself: an autosave written by an older build, or a file the player
// picked off disk. Everything here therefore reports a domain result instead of
// throwing — a foreign or broken file is a game situation, not a crash.

import { splitLinesAtObjects } from "./build";
import { LINE_TYPES, PLANT_TECHS, type FarmTech, type PlantTech } from "./config";
import { settledBlocks } from "./dispatch";
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
  /**
   * 11 → 12: a finished line is cut on every object it crosses (01 §3.3, 0.19).
   * Saves written before the rule can carry a route running straight through an
   * object the player built on the corridor later — normalizing them on load is
   * what makes the invariant hold for every state the engine ever sees.
   */
  11: (state) => (isSplittable(state) ? splitLinesAtObjects(state) : state),
  /**
   * 12 → 13: a junction station carries no throughput and buys no modules
   * (01 §4.3, §5.4, 0.21). Old saves drop both node fields — the station keeps
   * standing and now passes whatever its lines bring — and any capacity module
   * still in the build queue is dropped: the object it was ordered for no
   * longer has anything to expand. The money paid for it is gone, exactly as
   * for a cancelled construction (01 §2.6).
   */
  12: (state) => {
    if (!isRecord(state)) return state;
    const junctions = Array.isArray(state.junctions)
      ? state.junctions.map((junction) =>
          isRecord(junction)
            ? { id: junction.id, name: junction.name, hex: junction.hex }
            : junction,
        )
      : state.junctions;
    const constructions = Array.isArray(state.constructions)
      ? state.constructions.filter(
          (construction) =>
            !(
              isRecord(construction) &&
              isRecord(construction.pending) &&
              construction.pending.kind === "junctionExpansion"
            ),
        )
      : state.constructions;
    return { ...state, junctions, constructions };
  },
  /**
   * 13 → 14: storage grows along two independent axes (01 §5.3, §7 in 0.26),
   * so the queue carries `storagePowerExpansion` / `storageCapacityExpansion`
   * instead of one entry per technology. Nothing is forfeited: a battery order
   * that bought both axes at once splits into the two entries it always was
   * underneath, and a pumped block becomes the 250 MW + 2 500 MWh pair it used
   * to add. The split entry gets a derived id — construction ids are only used
   * for cancelling, never as the object id of an expansion.
   */
  13: (state) => {
    if (!isRecord(state) || !Array.isArray(state.constructions)) return state;
    const constructions: unknown[] = [];
    for (const construction of state.constructions) {
      if (!isRecord(construction) || !isRecord(construction.pending)) {
        constructions.push(construction);
        continue;
      }
      const { pending } = construction;
      const kind = pending.kind;
      if (kind !== "batteryExpansion" && kind !== "pumpedExpansion") {
        constructions.push(construction);
        continue;
      }
      const { storageId } = pending;
      // The old pumped block was a fixed 250 MW / 2 500 MWh pair.
      const powerMw = kind === "pumpedExpansion" ? 250 : numberOr(pending.powerMw, 0);
      const capacityMwh = kind === "pumpedExpansion" ? 2_500 : numberOr(pending.capacityMwh, 0);
      if (powerMw > 0) {
        constructions.push({
          ...construction,
          pending: { kind: "storagePowerExpansion", storageId, powerMw },
        });
      }
      if (capacityMwh > 0) {
        constructions.push({
          id: powerMw > 0 ? `${String(construction.id)}-capacity` : construction.id,
          remainingDays: construction.remainingDays,
          pending: { kind: "storageCapacityExpansion", storageId, capacityMwh },
        });
      }
    }
    return { ...state, constructions };
  },
  /**
   * 14 → 15: block dynamics (01 §5.1, 0.27). `blocks` stops being a count and
   * becomes block state; the plant's capacity splits evenly between them —
   * individual block sizes were never recorded, so even is the only honest
   * split. A plant with a nonzero setpoint migrates RUNNING at that setpoint
   * (no fake cold start for a save written when setpoints acted instantly);
   * an idle plant migrates cold. Old reports gain `startupCostPln = 0`.
   */
  14: (state) => {
    if (!isRecord(state)) return state;
    const migratePlant = (plant: unknown): unknown => {
      if (!isRecord(plant) || typeof plant.blocks !== "number") return plant;
      const tech = typeof plant.tech === "string" && plant.tech in PLANT_TECHS ? plant.tech : null;
      const capacityMw = numberOr(plant.capacityMw, 0);
      if (tech === null || capacityMw <= 0) return plant;
      const count = Math.max(1, Math.round(plant.blocks));
      const setpointMw = numberOr(plant.setpointMw, 0);
      return { ...plant, blocks: settledBlocks(tech as PlantTech, capacityMw, count, setpointMw) };
    };
    const plants = Array.isArray(state.plants) ? state.plants.map(migratePlant) : state.plants;
    const constructions = Array.isArray(state.constructions)
      ? state.constructions.map((construction) => {
          if (!isRecord(construction) || !isRecord(construction.pending)) return construction;
          if (construction.pending.kind !== "plant") return construction;
          return {
            ...construction,
            pending: { ...construction.pending, plant: migratePlant(construction.pending.plant) },
          };
        })
      : state.constructions;
    const withStartup = (report: unknown): unknown =>
      isRecord(report) && isRecord(report.finance)
        ? { ...report, finance: { startupCostPln: 0, ...report.finance } }
        : report;
    return {
      ...state,
      plants,
      constructions,
      lastTurnReport: state.lastTurnReport === null ? null : withStartup(state.lastTurnReport),
      history: Array.isArray(state.history) ? state.history.map(withStartup) : state.history,
    };
  },
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Hex-shaped enough for the split to read it. */
function isHexLike(value: unknown): boolean {
  return isRecord(value) && typeof value.q === "number" && typeof value.r === "number";
}

function hasHex(value: unknown): boolean {
  return isRecord(value) && isHexLike(value.hex);
}

function isLineLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    value.type in LINE_TYPES &&
    typeof value.builtHours === "number" &&
    typeof value.totalHours === "number" &&
    Array.isArray(value.path) &&
    value.path.every(isHexLike)
  );
}

/**
 * Whether the migration may touch this save at all. It runs BEFORE the shape
 * check, so it reads nothing it has not looked at first — a file too broken to
 * split is handed on untouched and fails the loader's own check a step later.
 */
function isSplittable(state: unknown): state is GameState {
  if (!isRecord(state) || typeof state.nextObjectId !== "number") return false;
  for (const key of ["cities", "plants", "farms", "storages", "junctions", "borders"]) {
    const list = state[key];
    if (!Array.isArray(list) || !list.every(hasHex)) return false;
  }
  return Array.isArray(state.lines) && state.lines.every(isLineLike);
}

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
