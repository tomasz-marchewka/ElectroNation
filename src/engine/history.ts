// The turn archive (02 §4.1): every resolved turn leaves a digest in
// `GameState.history`, and that digest is the only thing the time ribbon and
// the report strip ever read about a past turn (01 §8 pt 2). Pure derivation
// from the turn's own report — no PRNG, constant time, so a game year stays
// linear in turns no matter how long the archive gets.

import type { FarmTech, PlantTech } from "./config";
import { quantize001 } from "./quantize";
import {
  COVERAGE_LAYERS,
  TURNS_PER_DAY,
  type CoverageLayer,
  type GameState,
  type TurnDigest,
  type TurnReport,
} from "./state";

/** Report power is quantized to 0,001 MW — below this a value reads as zero. */
const ZERO_MW = 0.001;

/**
 * Which layer a technology's output lands in. Exported because the plan ahead
 * of TERAZ is stacked into the SAME layers (01 §8 pt 2) — the projection reads
 * setpoints instead of a report, and both must agree on where a coal block goes.
 */
export const PLANT_LAYERS: Record<PlantTech, CoverageLayer> = {
  nuclear: "nuclear",
  coal: "coal",
  ccgt: "gas",
  ocgt: "gas",
};

export const FARM_LAYERS: Record<FarmTech, CoverageLayer> = { wind: "wind", pv: "pv" };

/**
 * Which coverage layer each source belongs to, read off the world as it stands
 * at the moment of resolution. Storages and border points carry a layer of
 * their own, so only plants and farms need their technology looked up.
 */
export type LayerIndex = Record<string, CoverageLayer>;

export function coverageIndex(state: {
  plants: readonly { id: string; tech: PlantTech }[];
  farms: readonly { id: string; tech: FarmTech }[];
}): LayerIndex {
  const index: LayerIndex = {};
  for (const plant of state.plants) index[plant.id] = PLANT_LAYERS[plant.tech];
  for (const farm of state.farms) index[farm.id] = FARM_LAYERS[farm.tech];
  return index;
}

/** Coverage of one resolved turn split by technology, aligned to COVERAGE_LAYERS. */
function coverageMw(report: TurnReport, layers: LayerIndex): number[] {
  const coverage = COVERAGE_LAYERS.map(() => 0);
  for (const source of report.sources) {
    if (source.usedMw <= 0) continue;
    const layer =
      source.kind === "storage"
        ? "storage"
        : source.kind === "import"
          ? "import"
          : layers[source.sourceId];
    if (layer === undefined) continue;
    const index = COVERAGE_LAYERS.indexOf(layer);
    coverage[index] = (coverage[index] ?? 0) + source.usedMw;
  }
  return coverage.map(quantize001);
}

/** The digest of a resolved turn — everything the ribbon and the strip need. */
export function buildTurnDigest(report: TurnReport, layers: LayerIndex): TurnDigest {
  return {
    dayIndex: report.dayIndex,
    turnIndex: report.turnIndex,
    phase: report.phase,
    dayType: report.dayType,
    month: report.month,
    regime: report.regime,
    dayWeight: report.dayWeight,
    totals: report.totals,
    coverageMw: coverageMw(report, layers),
    forecastMiss: report.forecastMiss,
    finance: report.finance,
    shortfalls: report.cities
      .filter((city) => city.ensMw >= ZERO_MW)
      .map((city) => ({ cityId: city.cityId, ensMw: city.ensMw })),
  };
}

/** Position of a turn on one continuous axis — the ribbon's coordinate. */
export function absoluteTurn(dayIndex: number, turnIndex: number): number {
  return dayIndex * TURNS_PER_DAY + turnIndex;
}

export function digestTurn(digest: TurnDigest): number {
  return absoluteTurn(digest.dayIndex, digest.turnIndex);
}

/**
 * The digest of one turn, or undefined when that turn was never resolved. The
 * archive is dense and ordered, so this is an index computation — the ribbon
 * may not walk the whole history to draw eight columns of it.
 */
export function digestAt(history: readonly TurnDigest[], absolute: number): TurnDigest | undefined {
  const first = history[0];
  if (first === undefined) return undefined;
  const digest = history[absolute - digestTurn(first)];
  return digest !== undefined && digestTurn(digest) === absolute ? digest : undefined;
}

/**
 * Digests of the day the last resolved turn belongs to — what `WYNIK DOBY` sums
 * up (01 §8 pt 5). Deliberately keyed on the last resolved turn and not on the
 * calendar: right after the day rolls over the player still wants to read the
 * day they just finished, exactly as before the archive existed.
 */
export function lastDayDigests(state: GameState): TurnDigest[] {
  const last = state.history.at(-1);
  if (last === undefined) return [];
  const digests: TurnDigest[] = [];
  for (let index = state.history.length - 1; index >= 0; index--) {
    const digest = state.history[index];
    if (digest === undefined || digest.dayIndex !== last.dayIndex) break;
    digests.unshift(digest);
  }
  return digests;
}
