// NASTAWY — one row per unit the player dispatches (01 §8 pt 4). Pure model:
// GameState in, rows out; the component turns a row into controls and the store
// turns a control into an engine action.
//
// There is no auto-dispatch: every setpoint is set by hand (01 §8 pt 4).

import {
  CONFIG,
  PLANT_TECHS,
  farmProductionForecast,
  HOURS_PER_TURN,
  type FarmTech,
  type GameState,
  type PlantTech,
  type StorageMode,
} from "../../engine";
import { formatMw, formatMwh, formatNumber, formatPercent } from "../format";
import { PLANT_TECH_INLINE_LABELS } from "../labels";

/**
 * Technology colours of the handoff ("Color — technologies": one colour per
 * technology across map icons, sliders and the chart). Same tokens the map
 * picks in map/icons.tsx — including nuclear, which has no colour of its own in
 * the system and stays on the neutral text token.
 */
const PLANT_COLORS: Record<PlantTech, string> = {
  nuclear: "var(--en-text)",
  coal: "var(--en-coal-ico)",
  ccgt: "var(--en-gas-ico)",
  ocgt: "var(--en-gas-ico)",
};
const FARM_COLORS: Record<FarmTech, string> = {
  wind: "var(--en-wind)",
  pv: "var(--en-pv)",
};
const STORAGE_COLOR = "var(--en-ok)";
const BORDER_COLOR = "var(--en-storage)";

export interface PlantSetpointRow {
  kind: "plant";
  id: string;
  name: string;
  /** Technology under the name, lowercase. */
  tech: string;
  valueMw: number;
  maxMw: number;
  /** Variable cost, e.g. "250 zł/MWh". */
  note: string;
  color: string;
}

export interface StorageSetpointRow {
  kind: "storage";
  id: string;
  name: string;
  /** "150 MW / 300 MWh". */
  tech: string;
  valueMw: number;
  maxMw: number;
  mode: StorageMode;
  socPercent: number;
  /** "SOC 62%". */
  socLabel: string;
  color: string;
}

export interface TradeSetpointRow {
  kind: "import" | "export";
  /** Border point id — both rows of a border share it. */
  id: string;
  name: string;
  valueMw: number;
  maxMw: number;
  /** Price, e.g. "800 zł/MWh". */
  note: string;
  color: string;
}

export interface FarmSetpointRow {
  kind: "farm";
  id: string;
  name: string;
  /** Installed power, e.g. "450 MW". */
  size: string;
  enabled: boolean;
  /** "~320 MW · AUTO" while running, "0 MW" once switched off. */
  value: string;
  color: string;
}

export type SetpointRow =
  PlantSetpointRow | StorageSetpointRow | TradeSetpointRow | FarmSetpointRow;

/** React key of a row — a border contributes two rows under one id. */
export function setpointRowKey(row: SetpointRow): string {
  return `${row.kind}:${row.id}`;
}

/** Block average of a farm's production forecast for the pending turn. */
function farmBlockForecastMw(state: GameState, farmId: string): number {
  const startHour = state.calendar.turnIndex * HOURS_PER_TURN;
  let sum = 0;
  for (let hour = startHour; hour < startHour + HOURS_PER_TURN; hour++) {
    sum += farmProductionForecast(state, farmId, hour)?.mw ?? 0;
  }
  return sum / HOURS_PER_TURN;
}

function plantRows(state: GameState): PlantSetpointRow[] {
  // Merit order, cheapest first — the panel teaches it by listing it
  // (SetpointSlider.prompt.md); ties fall back to the id so the order is stable.
  return [...state.plants]
    .sort(
      (a, b) =>
        PLANT_TECHS[a.tech].varCostPlnPerMwh - PLANT_TECHS[b.tech].varCostPlnPerMwh ||
        a.id.localeCompare(b.id),
    )
    .map((plant) => ({
      kind: "plant",
      id: plant.id,
      name: plant.name.toUpperCase(),
      tech: PLANT_TECH_INLINE_LABELS[plant.tech],
      valueMw: plant.setpointMw,
      maxMw: plant.capacityMw,
      note: `${formatNumber(PLANT_TECHS[plant.tech].varCostPlnPerMwh)} zł/MWh`,
      color: PLANT_COLORS[plant.tech],
    }));
}

function storageRows(state: GameState): StorageSetpointRow[] {
  return state.storages.map((storage) => {
    const socPercent = storage.capacityMwh > 0 ? (storage.socMwh / storage.capacityMwh) * 100 : 0;
    return {
      kind: "storage",
      id: storage.id,
      name: storage.name.toUpperCase(),
      tech: `${formatMw(storage.powerMw)} / ${formatMwh(storage.capacityMwh)}`,
      valueMw: storage.setpoint.mw,
      maxMw: storage.powerMw,
      mode: storage.setpoint.mode,
      socPercent,
      socLabel: `SOC ${formatPercent(socPercent)}`,
      color: STORAGE_COLOR,
    };
  });
}

/**
 * Import and export of one border point (01 §5.7). The handoff only drew the
 * import slider; export exists in the doc and in the engine, so it gets a row
 * of its own in the same convention.
 */
function tradeRows(state: GameState): TradeSetpointRow[] {
  return state.borders.flatMap((border): TradeSetpointRow[] => [
    {
      kind: "import",
      id: border.id,
      name: `IMPORT ${border.name.toUpperCase()}`,
      valueMw: border.importSetpointMw,
      maxMw: border.throughputMw,
      note: `${formatNumber(CONFIG.importPricePlnPerMwh)} zł/MWh`,
      color: BORDER_COLOR,
    },
    {
      kind: "export",
      id: border.id,
      name: `EKSPORT ${border.name.toUpperCase()}`,
      valueMw: border.exportSetpointMw,
      maxMw: border.throughputMw,
      note: `${formatNumber(CONFIG.exportPricePlnPerMwh)} zł/MWh`,
      color: BORDER_COLOR,
    },
  ]);
}

function farmRows(state: GameState): FarmSetpointRow[] {
  return state.farms.map((farm) => ({
    kind: "farm",
    id: farm.id,
    name: farm.name.toUpperCase(),
    size: formatMw(farm.capacityMw),
    enabled: farm.enabled,
    // RES power comes from the weather, not from a decision — hence AUTO
    // (TogglePill.prompt.md); a farm switched off contributes nothing at all.
    value: farm.enabled ? `~${formatMw(farmBlockForecastMw(state, farm.id))} · AUTO` : formatMw(0),
    color: FARM_COLORS[farm.tech],
  }));
}

/**
 * Every dispatchable row of the panel, in the handoff's order: plants in merit
 * order, storage, cross-border trade, then the RES switches.
 */
export function setpointRows(state: GameState): SetpointRow[] {
  return [...plantRows(state), ...storageRows(state), ...tradeRows(state), ...farmRows(state)];
}
