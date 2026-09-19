// The parts of a label text (bridge/labels.ts): `NAME TECH · value · value`.
// The bridge prints one string — the same words the SVG map printed — and the
// HUD only decides how much of it to show at a given zoom: the technology
// suffix folds away at strategic distance, the name and the numbers never do.
// Nothing here invents a word; it only splits what the bridge wrote.

import { FARM_TECH_LABELS, PLANT_TECH_LABELS, STORAGE_TECH_LABELS } from "../../app/labels";
import type { WorldLabel } from "../bridge/worldScene";

/** Separator of the label grammar (`objectLabel`). */
const SEPARATOR = " · ";

/** Every technology suffix the bridge can append to a name. */
const TECH_WORDS: ReadonlySet<string> = new Set([
  ...Object.values(PLANT_TECH_LABELS),
  ...Object.values(FARM_TECH_LABELS),
  ...Object.values(STORAGE_TECH_LABELS),
]);

const PLANT_WORDS: ReadonlySet<string> = new Set(Object.values(PLANT_TECH_LABELS));
const FARM_WORDS: ReadonlySet<string> = new Set(Object.values(FARM_TECH_LABELS));
const STORAGE_WORDS: ReadonlySet<string> = new Set(Object.values(STORAGE_TECH_LABELS));

/** The kind glyph drawn before a label (hud.css .en-wlabel__kind): what stands on the hex. */
export type LabelKindGlyph = "city" | "plant" | "farm" | "storage" | "junction" | "border" | "site";

/** A value that says the object gives nothing this turn: `0/400`, `~0`, `+0`, `0`. */
const IDLE_VALUE = /^(0\/|~0$|\+0$|0$|0 MW$)/;

export interface LabelParts {
  name: string;
  /** Technology suffix of the name, or null (cities, junctions, borders, callouts). */
  tech: string | null;
  /** Measured parts after the name: `611 MW`, `+250`, `SOC 62%`. */
  values: string[];
}

export function labelParts(text: string): LabelParts {
  const [head = text, ...values] = text.split(SEPARATOR);
  const space = head.lastIndexOf(" ");
  if (space > 0) {
    const tail = head.slice(space + 1);
    if (TECH_WORDS.has(tail)) return { name: head.slice(0, space), tech: tail, values };
  }
  return { name: head, tech: null, values };
}

/**
 * Which kind glyph a label carries, from the bridge's own grammar: the
 * technology suffix names plants, farms and storages; a junction is the one
 * object label without a suffix at priority 1; a border the one at 2.
 */
export function labelKindOf(
  label: Pick<WorldLabel, "kind" | "priority">,
  parts: LabelParts,
): LabelKindGlyph | null {
  if (label.kind === "city") return "city";
  // A line under construction (`BUDOWA · n DOBY`) is a site of its own kind.
  if (label.kind === "site" || (label.kind === "line" && parts.values.length > 0)) return "site";
  if (label.kind !== "object") return null;
  if (parts.tech !== null) {
    if (PLANT_WORDS.has(parts.tech)) return "plant";
    if (FARM_WORDS.has(parts.tech)) return "farm";
    if (STORAGE_WORDS.has(parts.tech)) return "storage";
  }
  return label.priority <= 1 ? "junction" : "border";
}

/** True when the first measured value says the object stands idle this turn. */
export function labelIdle(parts: LabelParts): boolean {
  const first = parts.values[0];
  return first !== undefined && IDLE_VALUE.test(first);
}
