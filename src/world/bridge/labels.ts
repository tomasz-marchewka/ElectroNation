// Label texts of the world — the same words the SVG map prints
// (src/app/map/sceneModel.ts), so a number is never invented by the renderer
// and the two renderers can be compared word for word. Pure text builders;
// placement is the HUD's job.

import type { FarmTech, PlantTech, StorageTech } from "../../engine";
import { formatMw, formatNumber, formatPercent, formatSignedNumber } from "../../app/format";
import {
  FARM_TECH_LABELS,
  LINE_TYPE_LABELS,
  PLANT_TECH_LABELS,
  STORAGE_TECH_LABELS,
  daysLabel,
} from "../../app/labels";
import type { LineType } from "../../engine";

/**
 * `EC MODRZYCA CCGT · 320/400`. Object names are player data (Polish); the
 * technology is a suffix of the name, the measured parts follow after `·`.
 */
export function objectLabel(
  name: string,
  tech: string | null,
  ...parts: (string | null)[]
): string {
  const head = tech === null ? name.toUpperCase() : `${name.toUpperCase()} ${tech}`;
  return [head, ...parts.filter((part): part is string => part !== null)].join(" · ");
}

export function ratioLabel(value: number, max: number): string {
  return `${formatNumber(value)}/${formatNumber(max)}`;
}

export function cityLabel(name: string, demandMw: number | null): string {
  return objectLabel(name, null, demandMw === null ? null : formatMw(demandMw));
}

/**
 * `EW ŁĘGI WĘGIEL · 1 250/1 500` — the standing order (app/dispatch.ts) over
 * capacity. With `dumpMw > 0` the surplus the grid refused is spelled out
 * (`· 750 MW nadwyżki`), because the order alone hides it.
 */
export function plantLabel(
  name: string,
  tech: PlantTech,
  orderMw: number,
  capacityMw: number,
  dumpMw = 0,
): string {
  return objectLabel(
    name,
    PLANT_TECH_LABELS[tech],
    ratioLabel(orderMw, capacityMw),
    dumpMw >= 1 ? `${formatMw(dumpMw)} nadwyżki` : null,
  );
}

/** `~` marks a weather-driven number (handoff `FW GRZBIET · ~320`). */
export function farmLabel(name: string, tech: FarmTech, producedMw: number | null): string {
  return objectLabel(
    name,
    FARM_TECH_LABELS[tech],
    producedMw === null ? null : `~${formatNumber(producedMw)}`,
  );
}

export function storageLabel(
  name: string,
  tech: StorageTech,
  flowMw: number,
  socShare: number,
): string {
  return objectLabel(
    name,
    STORAGE_TECH_LABELS[tech],
    formatSignedNumber(flowMw),
    `SOC ${formatPercent(socShare * 100)}`,
  );
}

export function borderLabel(name: string, netImportMw: number): string {
  return objectLabel(name, null, formatSignedNumber(netImportMw));
}

export function buildLabel(remainingDays: number): string {
  return `BUDOWA · ${daysLabel(remainingDays)}`;
}

export function expansionLabel(remainingDays: number): string {
  return `ROZBUDOWA · ${daysLabel(remainingDays)}`;
}

export function upgradeLabel(target: LineType, remainingDays: number): string {
  return `ROZBUDOWA DO ${LINE_TYPE_LABELS[target]} · ${daysLabel(remainingDays)}`;
}

export function overloadLabel(type: LineType, usedMw: number, capacityMw: number): string {
  return `${LINE_TYPE_LABELS[type]} ${ratioLabel(usedMw, capacityMw)} ⚠`;
}

/** `−60 MW` under a starved city: what did not arrive (01 §4.5). */
export function shortfallLabel(ensMw: number): string {
  return `${formatSignedNumber(-ensMw)} MW`;
}
