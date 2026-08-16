// BUDOWY — the build schedule the permanently visible panel owes the player
// (01 §8 pt 5). The handoff has no such section; this is an extension in the
// system's own convention (a labelled section of `.en-kv` rows), open to the
// designer's review.
//
// Objects count down in whole game days, lines in played hours (01 §2.6), so
// the rows carry the unit they are measured in and sort by what finishes first.

import {
  HOURS_PER_TURN,
  KM_PER_HEX,
  TURNS_PER_DAY,
  isLineBuilt,
  type ConstructionState,
  type GameState,
  type PendingObject,
} from "../../engine";
import { formatNumber } from "../format";
import { LINE_TYPE_LABELS, daysLabel } from "../labels";

const HOURS_PER_DAY = TURNS_PER_DAY * HOURS_PER_TURN;

export interface BuildQueueRow {
  key: string;
  /** What is being built, in caps. */
  name: string;
  /** Time left, e.g. "3 DOBY" or "9 H". */
  remaining: string;
  /** Sort key only — game hours until the work is done. */
  remainingHours: number;
}

/** Name of the object an expansion upgrades in place (01 §7). */
function expandedName(state: GameState, pending: PendingObject): string {
  const named = <T extends { id: string; name: string }>(list: readonly T[], id: string) =>
    list.find((item) => item.id === id)?.name.toUpperCase() ?? "";
  switch (pending.kind) {
    case "plantExpansion":
      return named(state.plants, pending.plantId);
    case "farmExpansion":
      return named(state.farms, pending.farmId);
    case "batteryExpansion":
    case "pumpedExpansion":
      return named(state.storages, pending.storageId);
    case "junctionExpansion":
      return named(state.junctions, pending.junctionId);
    case "borderExpansion":
      return named(state.borders, pending.borderId);
    default:
      return "";
  }
}

function constructionName(state: GameState, construction: ConstructionState): string {
  const pending = construction.pending;
  switch (pending.kind) {
    case "plant":
      return pending.plant.name.toUpperCase();
    case "farm":
      return pending.farm.name.toUpperCase();
    case "storage":
      return pending.storage.name.toUpperCase();
    case "junction":
      return pending.junction.name.toUpperCase();
    case "border":
      return pending.border.name.toUpperCase();
    default: {
      const name = expandedName(state, pending);
      return name === "" ? "ROZBUDOWA" : `ROZBUDOWA · ${name}`;
    }
  }
}

/** Everything under construction, soonest first; empty hides the section. */
export function buildQueue(state: GameState): BuildQueueRow[] {
  const rows: BuildQueueRow[] = state.constructions.map((construction) => ({
    key: construction.id,
    name: constructionName(state, construction),
    remaining: daysLabel(construction.remainingDays),
    remainingHours: construction.remainingDays * HOURS_PER_DAY,
  }));

  for (const line of state.lines) {
    if (isLineBuilt(line)) continue;
    const remainingHours = line.totalHours - line.builtHours;
    rows.push({
      key: line.id,
      name: `LINIA ${LINE_TYPE_LABELS[line.type]} · ${formatNumber((line.path.length - 1) * KM_PER_HEX)} KM`,
      remaining: `${formatNumber(remainingHours)} H`,
      remainingHours,
    });
  }

  return rows.sort((a, b) => a.remainingHours - b.remainingHours || a.key.localeCompare(b.key));
}
