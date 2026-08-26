// NASTAWY — one row per unit the player dispatches (01 §8 pt 4). Pure model:
// GameState in, rows out; the component turns a row into controls and the store
// turns a control into an engine action.
//
// There is no auto-dispatch: every setpoint is set by hand (01 §8 pt 4).

import {
  CONFIG,
  PLANT_DYNAMICS,
  PLANT_TECHS,
  farmProductionForecast,
  isBlockWarm,
  plantOutputMw,
  quantize001,
  HOURS_PER_TURN,
  type FarmTech,
  type GameState,
  type PlantBlockState,
  type PlantControlMode,
  type PlantState,
  type PlantTech,
  type StorageMode,
} from "../../engine";
import { formatMw, formatMwh, formatNumber, formatPercent, formatSetpoint } from "../format";
import { PLANT_TECH_INLINE_LABELS, STORAGE_MODE_LABELS } from "../labels";

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
  /** Technical minimum of the smallest block [MW] — the lowest non-zero output
   * the AUTO controller can hold, so the slider's dead zone ends here. */
  minMw: number;
  /** Where the blocks actually stand [MW] — diverges from the setpoint while
   * they start up or ramp (01 §5.1 in 0.27); the slider draws it as a tick. */
  actualMw: number;
  /** Variable cost plus the dynamics status, e.g. "250 zł/MWh · MOC 210 MW · ROZRUCH ×1". */
  note: string;
  color: string;
  /** Current mode, present only when the plant owns automation (01 §5.1, 0.28)
   * — the row then renders the AUTO / RĘCZNY switch. */
  modeToggle?: PlantControlMode;
}

/** One block of a plant in MANUAL control — its own slider (01 §5.1, 0.28). */
export interface PlantBlockSetpointRow {
  kind: "plantBlock";
  /** The PLANT's id — the action targets the block by index. */
  id: string;
  blockIndex: number;
  /** "EC MODRZYCA · BLOK 2". */
  name: string;
  /** Technology under the name, lowercase. */
  tech: string;
  /** The block's own order [MW]. */
  valueMw: number;
  /** The block's rated power [MW]. */
  maxMw: number;
  /** The block's technical minimum [MW] — the slider's dead zone ends here. */
  minMw: number;
  /** The block's actual output [MW] — the amber tick. */
  actualMw: number;
  /** Variable cost plus the block's state, e.g. "250 zł/MWh · ROZRUCH · 2 TURY". */
  note: string;
  color: string;
  /** On the plant's first block row when automation is owned — see above. */
  modeToggle?: PlantControlMode;
}

export interface StorageSetpointRow {
  kind: "storage";
  id: string;
  name: string;
  /** "150 MW / 300 MWh". */
  tech: string;
  /** Signed setpoint: below zero the storage charges, above it gives back. */
  valueMw: number;
  /** Rated power — the slider runs from `-maxMw` to `+maxMw`. */
  maxMw: number;
  /** Direction the signed setpoint actually means; zero always rests. */
  mode: StorageMode;
  /** "ODDAWAJ 100 / 150 MW" — the sign spelled out, the power without it. */
  valueLabel: string;
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
  | PlantSetpointRow
  | PlantBlockSetpointRow
  | StorageSetpointRow
  | TradeSetpointRow
  | FarmSetpointRow;

/** React key of a row — a border contributes two rows under one id, a manual
 * plant one row per block. */
export function setpointRowKey(row: SetpointRow): string {
  if (row.kind === "plantBlock") return `${row.kind}:${row.id}:${row.blockIndex}`;
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

/**
 * The dynamics half of a plant's note (01 §5.1 in 0.27): silent while the
 * blocks sit on the setpoint, otherwise the actual output plus what still
 * moves — starting blocks first, a plain ramp otherwise.
 */
function plantDynamicsNote(plant: PlantState): string {
  const actualMw = plantOutputMw(plant);
  if (Math.abs(actualMw - plant.setpointMw) <= 0.5) return "";
  const starting = plant.blocks.filter((block) => block.status === "starting").length;
  const state =
    starting > 0
      ? ` · ROZRUCH ×${formatNumber(starting)}`
      : actualMw < plant.setpointMw
        ? " · RAMPA W GÓRĘ"
        : " · RAMPA W DÓŁ";
  return ` · MOC ${formatMw(actualMw)}${state}`;
}

/** "1 TURA", "2 TURY", "5 TUR" — the startup countdown, spelled out. */
function turnsLabel(turns: number): string {
  if (turns === 1) return "1 TURA";
  return `${formatNumber(turns)} ${turns >= 2 && turns <= 4 ? "TURY" : "TUR"}`;
}

/** The state half of a block row's note (01 §5.1, 0.28). */
function blockStateNote(plant: PlantState, block: PlantBlockState): string {
  if (block.status === "offline") {
    return `POSTÓJ · ${isBlockWarm(block, PLANT_DYNAMICS[plant.tech]) ? "CIEPŁY" : "ZIMNY"}`;
  }
  if (block.status === "starting") return `ROZRUCH · ${turnsLabel(block.startupTurnsLeft)}`;
  return `MOC ${formatMw(block.outputMw)}`;
}

function plantRows(state: GameState): (PlantSetpointRow | PlantBlockSetpointRow)[] {
  // Merit order, cheapest first — the panel teaches it by listing it
  // (SetpointSlider.prompt.md); ties fall back to the id so the order is stable.
  return [...state.plants]
    .sort(
      (a, b) =>
        PLANT_TECHS[a.tech].varCostPlnPerMwh - PLANT_TECHS[b.tech].varCostPlnPerMwh ||
        a.id.localeCompare(b.id),
    )
    .flatMap((plant): (PlantSetpointRow | PlantBlockSetpointRow)[] => {
      const varCost = `${formatNumber(PLANT_TECHS[plant.tech].varCostPlnPerMwh)} zł/MWh`;
      const minLoadShare = PLANT_DYNAMICS[plant.tech].minLoadShare;
      // The switch shows up only where it can do anything (01 §5.1, 0.28).
      const modeToggle = plant.automation ? plant.controlMode : undefined;
      if (plant.controlMode === "auto") {
        return [
          {
            kind: "plant",
            id: plant.id,
            name: plant.name.toUpperCase(),
            tech: PLANT_TECH_INLINE_LABELS[plant.tech],
            valueMw: plant.setpointMw,
            maxMw: plant.capacityMw,
            // The controller's smallest stable order: one block at its minimum
            // (01 §5.1 pt 1 commits a block for any order above zero).
            minMw: quantize001(minLoadShare * Math.min(...plant.blocks.map((block) => block.mw))),
            actualMw: plantOutputMw(plant),
            note: `${varCost}${plantDynamicsNote(plant)}`,
            color: PLANT_COLORS[plant.tech],
            ...(modeToggle ? { modeToggle } : {}),
          },
        ];
      }
      // Manual control: one slider per block, the plant name on each so the
      // list stays readable when several plants interleave (01 §8 pt 4).
      return plant.blocks.map((block, blockIndex) => ({
        kind: "plantBlock",
        id: plant.id,
        blockIndex,
        name: `${plant.name.toUpperCase()} · BLOK ${formatNumber(blockIndex + 1)}`,
        tech: PLANT_TECH_INLINE_LABELS[plant.tech],
        valueMw: block.setpointMw,
        maxMw: block.mw,
        minMw: quantize001(minLoadShare * block.mw),
        actualMw: block.outputMw,
        note: `${varCost} · ${blockStateNote(plant, block)}`,
        color: PLANT_COLORS[plant.tech],
        ...(modeToggle && blockIndex === 0 ? { modeToggle } : {}),
      }));
    });
}

/**
 * The engine keeps direction and power apart (`{ mode, mw }`); the panel shows
 * them as one signed number, charging to the left of zero. A storage at rest
 * has no direction at all, so a power of 0 reads as `idle` whatever mode the
 * state carries — that pair is reachable in old saves and in replays.
 */
function signedSetpointMw(setpoint: { mode: StorageMode; mw: number }): number {
  if (setpoint.mode === "charge") return -setpoint.mw;
  if (setpoint.mode === "discharge") return setpoint.mw;
  return 0;
}

function storageRows(state: GameState): StorageSetpointRow[] {
  return state.storages.map((storage) => {
    const socPercent = storage.capacityMwh > 0 ? (storage.socMwh / storage.capacityMwh) * 100 : 0;
    const valueMw = signedSetpointMw(storage.setpoint);
    const mode: StorageMode = valueMw === 0 ? "idle" : valueMw < 0 ? "charge" : "discharge";
    return {
      kind: "storage",
      id: storage.id,
      name: storage.name.toUpperCase(),
      tech: `${formatMw(storage.powerMw)} / ${formatMwh(storage.capacityMwh)}`,
      valueMw,
      maxMw: storage.powerMw,
      mode,
      valueLabel: `${STORAGE_MODE_LABELS[mode]} ${formatSetpoint(Math.abs(valueMw), storage.powerMw)}`,
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
