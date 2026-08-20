// The hex panel — the only way to build anything (01 §8 pt 6). Pure model:
// GameState (plus the last resolved turn) in, rows / catalogue entries /
// actions out; the component renders them and the store turns an intent into
// an engine action.
//
// Every price here is CAPEX × terrain multiplier computed from the engine's
// own CONFIG, never a number typed into the design: the reference build's
// catalogue is stale (its "150 MW / 300 MWh — 900 mln" battery costs 570 mln
// out of BATTERY, and its biome multipliers predate 02 §8.1).

import {
  BATTERY,
  BORDER_SPEC,
  CITY_CONNECTION_COST_PLN,
  EXPANSION,
  FARM_TECHS,
  JUNCTION_SPEC,
  KM_PER_HEX,
  LINE_TYPES,
  MAX_PLANT_BLOCKS_PER_HEX,
  PLANT_TECHS,
  PUMPED_BLOCK,
  STORAGE_TECHS,
  TERRAIN,
  WIND_CLASSES,
  farmSiting,
  hexKey,
  isLineBuilt,
  lineUpgradeCostPln,
  lineUpgradeTargets,
  linesAtHex,
  type Action,
  type BorderState,
  type CityState,
  type FarmState,
  type FarmTech,
  type GameState,
  type HexCoord,
  type JunctionState,
  type LineState,
  type PendingObject,
  type PlantState,
  type PlantTech,
  type StorageState,
  type TerrainId,
  type TurnReport,
} from "../../engine";
import type { StatusTone } from "../components/StatusDot";
import {
  formatMoneyPln,
  formatMultiplier,
  formatMw,
  formatMwh,
  formatNumber,
  formatPercent,
  formatSetpoint,
} from "../format";
import {
  BORDER_CATALOG_NAME,
  CITY_CATALOG_NAME,
  FARM_CATALOG_NAMES,
  JUNCTION_CATALOG_NAME,
  LINE_TYPE_LABELS,
  PLANT_CATALOG_NAMES,
  STORAGE_CATALOG_NAMES,
  STORAGE_MODE_LABELS,
  TERRAIN_NAMES,
  WIND_CLASS_LABELS,
  daysLabel,
} from "../labels";
import { lineLoad, worstBottleneck, type BottleneckRef } from "../map/sceneModel";
import {
  borderSiteNote,
  connectCityNote,
  limitNote,
  lineSlotsAt,
  lineUpgradeNote,
  moneyNote,
  objectHexKeys,
  pumpedSiteNote,
  siteNote,
  terrainAt,
  type Diagnosis,
} from "../validate";

/** A labelled read-out of the panel — `PRZYŁĄCZA  2 / 6`. */
export interface InfoRow {
  key: string;
  label: string;
  value: string;
  tone?: StatusTone;
}

/** What a click on a panel action asks for. */
export type HexIntent =
  | { kind: "action"; action: Action }
  | { kind: "route" }
  | { kind: "bottleneck"; ref: BottleneckRef };

export interface HexAction {
  key: string;
  label: string;
  /** null → the action is available; otherwise the diagnosis that greys it. */
  note: Diagnosis;
  intent: HexIntent;
  /** Set where the click destroys work already paid for (01 §2.6). */
  confirm?: string;
}

// --- catalogue sizes --------------------------------------------------------

/**
 * The size the catalogue opens with and the step it moves in. The sizes are
 * the reference build's own catalogue (DispatcherScreen.jsx `CATALOG`), the
 * step is UI granularity — the ceiling is always the engine's (`maxBlockMw`,
 * `maxMwPerHex`, BATTERY limits: 01 §5, 02 §8.2), never a number from here.
 */
const PLANT_BLOCKS: Record<PlantTech, { defaultMw: number; stepMw: number }> = {
  ocgt: { defaultMw: 120, stepMw: 10 },
  ccgt: { defaultMw: 400, stepMw: 50 },
  coal: { defaultMw: 500, stepMw: 50 },
  nuclear: { defaultMw: 1200, stepMw: 100 },
};

const FARM_BLOCKS: Record<FarmTech, { defaultMw: number; stepMw: number }> = {
  wind: { defaultMw: 200, stepMw: 50 },
  pv: { defaultMw: 100, stepMw: 50 },
};

/** 01 §5.3: power and capacity are bought separately and shown separately. */
const BATTERY_BLOCK = {
  defaultPowerMw: 150,
  stepPowerMw: 50,
  defaultCapacityMwh: 300,
  stepCapacityMwh: 100,
} as const;

/** Sizes the player has dialled in on this hex's catalogue. */
export interface CatalogSizes {
  plantMw: Record<PlantTech, number>;
  farmMw: Record<FarmTech, number>;
  batteryPowerMw: number;
  batteryCapacityMwh: number;
}

export const DEFAULT_CATALOG_SIZES: CatalogSizes = {
  plantMw: {
    nuclear: PLANT_BLOCKS.nuclear.defaultMw,
    coal: PLANT_BLOCKS.coal.defaultMw,
    ccgt: PLANT_BLOCKS.ccgt.defaultMw,
    ocgt: PLANT_BLOCKS.ocgt.defaultMw,
  },
  farmMw: { wind: FARM_BLOCKS.wind.defaultMw, pv: FARM_BLOCKS.pv.defaultMw },
  batteryPowerMw: BATTERY_BLOCK.defaultPowerMw,
  batteryCapacityMwh: BATTERY_BLOCK.defaultCapacityMwh,
};

/** Which number of {@link CatalogSizes} a stepper moves. */
export type CatalogSizeTarget =
  | { kind: "plant"; tech: PlantTech }
  | { kind: "farm"; tech: FarmTech }
  | { kind: "batteryPower" }
  | { kind: "batteryCapacity" };

export function applyCatalogSize(
  sizes: CatalogSizes,
  target: CatalogSizeTarget,
  value: number,
): CatalogSizes {
  switch (target.kind) {
    case "plant":
      return { ...sizes, plantMw: { ...sizes.plantMw, [target.tech]: value } };
    case "farm":
      return { ...sizes, farmMw: { ...sizes.farmMw, [target.tech]: value } };
    case "batteryPower":
      return { ...sizes, batteryPowerMw: value };
    case "batteryCapacity":
      return { ...sizes, batteryCapacityMwh: value };
  }
}

export interface CatalogStepper {
  target: CatalogSizeTarget;
  /** Short caption of the number, e.g. "MOC". */
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface CatalogEntry {
  key: string;
  name: string;
  /** Size and build time under the name — `400 MW · 3 DOBY BUDOWY`. */
  size: string;
  /** CAPEX × terrain; an em dash where nothing can be built at all. */
  price: string;
  note: Diagnosis;
  action: Action;
  steppers: CatalogStepper[];
}

// --- helpers ----------------------------------------------------------------

/**
 * What a base CAPEX costs on this hex, or null where building is impossible.
 * `multiplier` defaults to the terrain's object column; a wind farm passes its
 * own, because the sea carries turbines and nothing else (02 §8.1 in 0.22).
 */
function siteCostPln(
  state: GameState,
  hex: HexCoord,
  basePln: number,
  multiplier: number | null = TERRAIN[terrainAt(state, hex)].object,
): number | null {
  return multiplier === null ? null : Math.round(basePln * multiplier);
}

/** Sums a per-entry measure over the build queue (mirrors engine pendingSum). */
function queued(state: GameState, measure: (pending: PendingObject) => number): number {
  let sum = 0;
  for (const construction of state.constructions) sum += measure(construction.pending);
  return sum;
}

/** Every object standing on a hex, whatever kind it is. */
function objectAt(state: GameState, hex: HexCoord) {
  const key = hexKey(hex);
  const on = <T extends { hex: HexCoord }>(list: readonly T[]): T | undefined =>
    list.find((item) => hexKey(item.hex) === key);
  return {
    city: on(state.cities),
    plant: on(state.plants),
    farm: on(state.farms),
    storage: on(state.storages),
    junction: on(state.junctions),
    border: on(state.borders),
  };
}

function objectNameAt(state: GameState, hex: HexCoord): string | null {
  const found = objectAt(state, hex);
  const object =
    found.city ?? found.plant ?? found.farm ?? found.storage ?? found.junction ?? found.border;
  return object ? object.name.toUpperCase() : null;
}

/** Hex a queued NEW object claims; an expansion claims none (01 §7). */
function pendingHex(pending: PendingObject): HexCoord | null {
  switch (pending.kind) {
    case "plant":
      return pending.plant.hex;
    case "farm":
      return pending.farm.hex;
    case "storage":
      return pending.storage.hex;
    case "junction":
      return pending.junction.hex;
    case "border":
      return pending.border.hex;
    default:
      return null;
  }
}

/** The object being built on this hex, if the hex is a site (01 §2.6). */
function constructionAt(state: GameState, hex: HexCoord) {
  const key = hexKey(hex);
  return state.constructions.find((construction) => {
    const at = pendingHex(construction.pending);
    return at !== null && hexKey(at) === key;
  });
}

/**
 * Line ends meeting this hex — what an object standing here spends its line
 * slots on (01 §3.3). A finished route crossing an object is already two lines
 * in the state (0.19); one still under construction books both ends up front.
 */
function connectionsAt(state: GameState, hex: HexCoord): number {
  const key = hexKey(hex);
  return linesAtHex(state, key, new Set([...objectHexKeys(state), key]));
}

/** Lines whose route runs through this hex — they all tap the object on it. */
function linesThrough(state: GameState, hex: HexCoord): LineState[] {
  const key = hexKey(hex);
  return state.lines.filter((line) => line.path.some((step) => hexKey(step) === key));
}

const LOAD_TONES: Record<ReturnType<typeof lineLoad>, StatusTone> = {
  ok: "ok",
  warn: "warn",
  over: "danger",
  idle: "idle",
};

/**
 * Whether the object on this hex sits in a bottleneck: a line touching it is
 * at its limit, or it is a node running at its own throughput (01 §4.3). This
 * is what turns the object's STAN red and offers POKAŻ WĄSKIE GARDŁO.
 */
function inBottleneck(state: GameState, report: TurnReport | null, hex: HexCoord): boolean {
  if (!report) return false;
  const found = objectAt(state, hex);
  const node = found.junction ?? found.border;
  if (node) {
    const row = report.nodes.find((candidate) => candidate.nodeId === node.id);
    if (row && row.throughputMw > 0 && lineLoad(row.usedMw, row.throughputMw) === "over") {
      return true;
    }
  }
  const ids = new Set(linesThrough(state, hex).map((line) => line.id));
  return report.segments.some(
    (segment) => ids.has(segment.lineId) && lineLoad(segment.usedMw, segment.capacityMw) === "over",
  );
}

// --- header and terrain -----------------------------------------------------

/** `HEKS q4 r7 · 25 × 25 KM` — the engine's own axial address (01 §3.1). */
export function hexPanelMeta(hex: HexCoord): string {
  return `HEKS q${formatNumber(hex.q)} r${formatNumber(hex.r)} · ${KM_PER_HEX} × ${KM_PER_HEX} KM`;
}

/**
 * Title of the panel: the object standing here, the site being built on it,
 * or — on a free hex — the biome and its multiplier (design: `HexPanel`).
 */
export function hexPanelTitle(
  state: GameState,
  hex: HexCoord,
): { title: string; note: string | null } {
  const name = objectNameAt(state, hex);
  if (name) return { title: name, note: null };
  if (constructionAt(state, hex)) return { title: "BUDOWA W TOKU", note: null };
  const terrain = terrainAt(state, hex);
  const multiplier = TERRAIN[terrain].object;
  return {
    title: TERRAIN_NAMES[terrain].toUpperCase(),
    note: multiplier === null ? null : formatMultiplier(multiplier),
  };
}

/**
 * The wind-farm column of 02 §8.1 as its own row — but only where it disagrees
 * with the object column, which happens on water alone (0.22). Everywhere else
 * repeating it would be noise.
 */
function windFarmRows(cost: (typeof TERRAIN)[TerrainId]): InfoRow[] {
  if (cost.windFarm === cost.object) return [];
  return [
    {
      key: "wind-farm",
      label: "MNOŻNIK — FARMA WIATROWA",
      value: cost.windFarm === null ? "budowa niemożliwa" : formatMultiplier(cost.windFarm),
      tone: cost.windFarm === null ? "idle" : "ok",
    },
  ];
}

/** TEREN: what the hex is worth building on (01 §3.2, 02 §8.1, 06 §6.1). */
export function terrainRows(state: GameState, hex: HexCoord): InfoRow[] {
  const terrain = terrainAt(state, hex);
  const cost = TERRAIN[terrain];
  const windClass = state.windClasses[hexKey(hex)] ?? "open";
  const wind = WIND_CLASSES[windClass];
  const solar = state.solarMultipliers[hexKey(hex)] ?? 1;
  const pumped = pumpedSiteNote(state, hex);
  return [
    { key: "type", label: "TYP", value: TERRAIN_NAMES[terrain] },
    {
      key: "objects",
      label: "MNOŻNIK — OBIEKTY",
      value: cost.object === null ? "budowa niemożliwa" : formatMultiplier(cost.object),
      tone: cost.object === null ? "idle" : undefined,
    },
    // 02 §8.1 (0.22): the sea prices turbines and refuses everything else, so
    // the wind column only earns a row where it differs from the object one.
    ...windFarmRows(cost),
    { key: "lines", label: "MNOŻNIK — LINIE", value: formatMultiplier(cost.line) },
    {
      key: "wind",
      // Mean of the hex's Weibull class: λ · Γ(1 + 1/k) (06 §6.1).
      label: "WIATR @100 M",
      value: `${formatNumber(wind.lambda * wind.meanFactor, 1)} m/s · ${WIND_CLASS_LABELS[windClass]}`,
      tone: "info",
    },
    { key: "solar", label: "NASŁONECZNIENIE", value: formatMultiplier(solar, 2) },
    {
      key: "pumped",
      label: "SZCZYTOWO-POMPOWA",
      value: pumped === null ? "możliwa" : "wymaga gór/wyżyny i wody obok",
      tone: pumped === null ? "ok" : "idle",
    },
  ];
}

export interface HexLineRow {
  key: string;
  /** `SN · EC MODRZYCA ▸ MODRZYCA`, or `NN → SN · …` while it is being raised. */
  label: string;
  /** Load of the stretch crossing this hex, or the build countdown. */
  value: string;
  tone: StatusTone;
  actions: HexAction[];
}

/**
 * What raising this line to each higher type would cost here (01 §4.2, 0.17).
 * A line still being strung up gets none — the engine refuses to redesign a
 * route mid-build.
 */
function lineUpgradeActions(state: GameState, line: LineState): HexAction[] {
  if (!isLineBuilt(line) || line.upgrade) return [];
  return lineUpgradeTargets(line).map((target) => {
    const spec = LINE_TYPES[target];
    return {
      key: `upgrade-line:${line.id}:${target}`,
      label: `ROZBUDUJ DO ${LINE_TYPE_LABELS[target]} · ${formatMw(spec.capacityMw)} · ${formatNumber(spec.lossPctPer100km)}%/100 KM — ${formatMoneyPln(lineUpgradeCostPln(state, line, target))}`,
      note: lineUpgradeNote(state, line, target),
      intent: {
        kind: "action" as const,
        action: { type: "upgradeLine" as const, lineId: line.id, lineType: target },
      },
    };
  });
}

/**
 * Lines running through the hex (01 §8 pt 6 — the design skipped this list).
 * The load is the one the last resolved turn measured on the stretch that
 * actually crosses this hex, not the line's average.
 */
export function hexLineRows(
  state: GameState,
  report: TurnReport | null,
  hex: HexCoord,
): HexLineRow[] {
  const key = hexKey(hex);
  return linesThrough(state, hex).map((line) => {
    const ends = [line.path[0], line.path[line.path.length - 1]]
      .map((end) => (end ? (objectNameAt(state, end) ?? "?") : "?"))
      .join(" ▸ ");
    const raise = line.upgrade;
    // The design system allows no arrow glyph (handoff README: ✓ ⚠ ✕ ◂ ▸ ⏭ ⬡),
    // and "▸" already means "from ▸ to" in this very label — hence the word.
    const label = raise
      ? `${LINE_TYPE_LABELS[line.type]} · ${ends} · ROZBUDOWA DO ${LINE_TYPE_LABELS[raise.type]}`
      : `${LINE_TYPE_LABELS[line.type]} · ${ends}`;
    if (!isLineBuilt(line)) {
      return {
        key: line.id,
        label,
        value: `w budowie · ${formatNumber(line.totalHours - line.builtHours)} H`,
        tone: "idle",
        actions: [
          {
            key: `cancel-line:${line.id}`,
            label: "ANULUJ BUDOWĘ LINII",
            note: null,
            intent: { kind: "action", action: { type: "cancelLine", lineId: line.id } },
            confirm: "POTWIERDŹ — NAKŁADY PRZEPADAJĄ",
          },
        ],
      };
    }
    const index = line.path.findIndex((step) => hexKey(step) === key);
    const segment = (report?.segments ?? []).find(
      (candidate) =>
        candidate.lineId === line.id && index >= candidate.fromIndex && index <= candidate.toIndex,
    );
    const capacityMw = LINE_TYPES[line.type].capacityMw;
    // A line being raised keeps carrying power on its old type (01 §4.2), so the
    // load read-out is the normal one — only the countdown is added next to it.
    return {
      key: line.id,
      label,
      value: segment
        ? `${formatNumber(segment.usedMw)} / ${formatMw(segment.capacityMw)}`
        : `— / ${formatMw(capacityMw)}`,
      tone: segment ? LOAD_TONES[lineLoad(segment.usedMw, segment.capacityMw)] : "idle",
      actions: raise
        ? [
            {
              key: `cancel-line-upgrade:${line.id}`,
              label: `ANULUJ ROZBUDOWĘ · ${formatNumber(raise.totalHours - raise.builtHours)} H`,
              note: null,
              intent: { kind: "action", action: { type: "cancelLineUpgrade", lineId: line.id } },
              confirm: "POTWIERDŹ — NAKŁADY PRZEPADAJĄ",
            },
          ]
        : lineUpgradeActions(state, line),
    };
  });
}

/** LINIA Z TEGO HEKSA: what a line of each type costs leaving this hex. */
export function lineTypeRows(state: GameState, hex: HexCoord): InfoRow[] {
  const multiplier = TERRAIN[terrainAt(state, hex)].line;
  return (["lv", "mv", "hv"] as const).map((type) => {
    const spec = LINE_TYPES[type];
    return {
      key: type,
      label: `${LINE_TYPE_LABELS[type]} · ${formatMw(spec.capacityMw)} · ${formatNumber(spec.lossPctPer100km)}%/100 KM`,
      value: `${formatMoneyPln(KM_PER_HEX * spec.capexPlnPerKm * multiplier)} / HEKS · ${formatNumber(spec.buildHoursPerHex)} H`,
    };
  });
}

// --- catalogue --------------------------------------------------------------

function entry(
  state: GameState,
  hex: HexCoord,
  spec: {
    key: string;
    name: string;
    size: string;
    basePln: number;
    action: Action;
    extraNote?: Diagnosis;
    steppers?: CatalogStepper[];
    /** Slot budget of THIS object; only a junction station differs (01 §5.4). */
    lineSlots?: number;
    /** Terrain price of THIS object; only a wind farm differs (02 §8.1, 0.22). */
    siteMultiplier?: number | null;
  },
): CatalogEntry {
  const multiplier =
    spec.siteMultiplier === undefined ? TERRAIN[terrainAt(state, hex)].object : spec.siteMultiplier;
  const cost = siteCostPln(state, hex, spec.basePln, multiplier);
  const note =
    siteNote(state, hex, spec.lineSlots, multiplier) ??
    spec.extraNote ??
    (cost === null ? null : moneyNote(state, cost));
  return {
    key: spec.key,
    name: spec.name,
    size: spec.size,
    price: cost === null ? "—" : formatMoneyPln(cost),
    note,
    action: spec.action,
    steppers: spec.steppers ?? [],
  };
}

/**
 * Everything that can be built on this hex, cheapest technology first (the
 * order of the reference build's catalogue). An entry that cannot be ordered
 * is greyed out with its diagnosis — never hidden, so the player learns the
 * rule instead of wondering where the option went (M7 brief).
 */
export function buildCatalog(
  state: GameState,
  hex: HexCoord,
  sizes: CatalogSizes = DEFAULT_CATALOG_SIZES,
): CatalogEntry[] {
  const plants = (["ocgt", "ccgt", "coal", "nuclear"] as const).map((tech) => {
    const spec = PLANT_TECHS[tech];
    const capacityMw = sizes.plantMw[tech];
    return entry(state, hex, {
      key: `plant:${tech}`,
      name: PLANT_CATALOG_NAMES[tech],
      size: `${formatMw(capacityMw)} · ${daysLabel(spec.buildDays)} BUDOWY`,
      basePln: capacityMw * spec.capexPlnPerMw,
      action: { type: "buildPlant", tech, capacityMw, hex },
      steppers: [
        {
          target: { kind: "plant", tech },
          label: "BLOK",
          value: capacityMw,
          unit: "MW",
          min: PLANT_BLOCKS[tech].stepMw,
          max: spec.maxBlockMw,
          step: PLANT_BLOCKS[tech].stepMw,
        },
      ],
    });
  });

  // 02 §8.1, §8.4 (0.22): a wind farm's price, hex cap and countdown come from
  // the SITE — at sea it is the same turbine, priced and bounded differently.
  const farms = (["wind", "pv"] as const).map((tech) => {
    const site = farmSiting(tech, terrainAt(state, hex));
    const capacityMw = Math.min(sizes.farmMw[tech], site.maxMwPerHex);
    return entry(state, hex, {
      key: `farm:${tech}`,
      name: FARM_CATALOG_NAMES[tech],
      size: `${formatMw(capacityMw)} · ${daysLabel(site.buildDays)} BUDOWY`,
      basePln: capacityMw * FARM_TECHS[tech].capexPlnPerMw,
      action: { type: "buildFarm", tech, capacityMw, hex },
      siteMultiplier: site.multiplier,
      steppers: [
        {
          target: { kind: "farm", tech },
          label: "MOC",
          value: capacityMw,
          unit: "MW",
          min: FARM_BLOCKS[tech].stepMw,
          max: site.maxMwPerHex,
          step: FARM_BLOCKS[tech].stepMw,
        },
      ],
    });
  });

  const powerMw = sizes.batteryPowerMw;
  const capacityMwh = sizes.batteryCapacityMwh;
  const battery = entry(state, hex, {
    key: "storage:battery",
    name: STORAGE_CATALOG_NAMES.battery,
    size: `${formatMw(powerMw)} / ${formatMwh(capacityMwh)} · ${daysLabel(STORAGE_TECHS.battery.buildDays)} BUDOWY`,
    basePln: powerMw * BATTERY.powerCapexPlnPerMw + capacityMwh * BATTERY.energyCapexPlnPerMwh,
    action: { type: "buildBattery", powerMw, capacityMwh, hex },
    steppers: [
      {
        target: { kind: "batteryPower" },
        label: "MOC",
        value: powerMw,
        unit: "MW",
        min: BATTERY_BLOCK.stepPowerMw,
        max: BATTERY.maxPowerMwPerHex,
        step: BATTERY_BLOCK.stepPowerMw,
      },
      {
        target: { kind: "batteryCapacity" },
        label: "POJEMNOŚĆ",
        value: capacityMwh,
        unit: "MWh",
        min: BATTERY_BLOCK.stepCapacityMwh,
        max: BATTERY.maxCapacityMwhPerHex,
        step: BATTERY_BLOCK.stepCapacityMwh,
      },
    ],
  });

  const pumped = entry(state, hex, {
    key: "storage:pumped",
    name: STORAGE_CATALOG_NAMES.pumped,
    size: `${formatMw(PUMPED_BLOCK.powerMw)} / ${formatMwh(PUMPED_BLOCK.capacityMwh)} · ${daysLabel(STORAGE_TECHS.pumped.buildDays)} BUDOWY`,
    basePln: PUMPED_BLOCK.capexPln,
    action: { type: "buildPumpedStorage", hex },
    extraNote: pumpedSiteNote(state, hex),
  });

  const junction = entry(state, hex, {
    key: "junction",
    name: JUNCTION_CATALOG_NAME,
    size: `${formatNumber(JUNCTION_SPEC.lineSlots)} PRZYŁĄCZY · BEZ LIMITU MOCY · ${daysLabel(JUNCTION_SPEC.buildDays)} BUDOWY`,
    basePln: JUNCTION_SPEC.capexPln,
    action: { type: "buildJunction", hex },
    lineSlots: JUNCTION_SPEC.lineSlots,
  });

  const border = entry(state, hex, {
    key: "border",
    name: BORDER_CATALOG_NAME,
    size: `${formatMw(BORDER_SPEC.throughputMw)} · ${daysLabel(BORDER_SPEC.buildDays)} BUDOWY`,
    basePln: BORDER_SPEC.capexPln,
    action: { type: "buildBorder", hex },
    extraNote: borderSiteNote(state, hex),
  });

  return [...plants, ...farms, battery, pumped, junction, border];
}

// --- object -----------------------------------------------------------------

export interface HexObjectView {
  /** RODZAJ — what stands here, in the catalogue's own wording. The object's
   * own name is the panel's title, so it is not repeated here. */
  kind: string;
  status: { tone: StatusTone; label: string };
  /** PRZYŁĄCZA — `2 / 6`; null on a site that is still being built. */
  connections: string | null;
  rows: InfoRow[];
  actions: HexAction[];
}

/** `POPROWADŹ LINIĘ STĄD` — greyed out when the object has no free slot. */
function routeAction(state: GameState, hex: HexCoord): HexAction {
  const key = hexKey(hex);
  const used = connectionsAt(state, hex);
  const slots = lineSlotsAt(state, key);
  return {
    key: "route",
    label: "POPROWADŹ LINIĘ STĄD",
    note:
      used < slots
        ? null
        : `✕ brak wolnego przyłącza — ${formatNumber(used)}/${formatNumber(slots)}`,
    intent: { kind: "route" },
  };
}

/** `POKAŻ WĄSKIE GARDŁO` — only next to an alert, and only after a turn ran. */
function bottleneckAction(report: TurnReport | null): HexAction[] {
  const ref = report ? worstBottleneck(report) : null;
  if (!ref) return [];
  return [
    {
      key: "bottleneck",
      label: "POKAŻ WĄSKIE GARDŁO",
      note: null,
      intent: { kind: "bottleneck", ref },
    },
  ];
}

/** Expansions of this object still in the queue — each one cancellable. */
function expansionActions(state: GameState, objectId: string): HexAction[] {
  const targets = (pending: PendingObject): string | null => {
    switch (pending.kind) {
      case "plantExpansion":
        return pending.plantId;
      case "farmExpansion":
        return pending.farmId;
      case "batteryExpansion":
      case "pumpedExpansion":
        return pending.storageId;
      case "borderExpansion":
        return pending.borderId;
      default:
        return null;
    }
  };
  return state.constructions
    .filter((construction) => targets(construction.pending) === objectId)
    .map((construction) => ({
      key: `cancel:${construction.id}`,
      label: `ANULUJ ROZBUDOWĘ · ${daysLabel(construction.remainingDays)}`,
      note: null,
      intent: {
        kind: "action" as const,
        action: { type: "cancelConstruction" as const, constructionId: construction.id },
      },
      confirm: "POTWIERDŹ — NAKŁADY PRZEPADAJĄ",
    }));
}

function expansionAction(
  state: GameState,
  hex: HexCoord,
  spec: {
    key: string;
    label: string;
    basePln: number;
    action: Action;
    limit: Diagnosis;
    /** Terrain price of THIS object; only a wind farm differs (02 §8.1, 0.22). */
    siteMultiplier?: number | null;
  },
): HexAction {
  const cost =
    spec.siteMultiplier === undefined
      ? siteCostPln(state, hex, spec.basePln)
      : siteCostPln(state, hex, spec.basePln, spec.siteMultiplier);
  return {
    key: spec.key,
    label: `${spec.label} — ${cost === null ? "—" : formatMoneyPln(cost)}`,
    note: spec.limit ?? (cost === null ? null : moneyNote(state, cost)),
    intent: { kind: "action", action: spec.action },
  };
}

function cityView(state: GameState, report: TurnReport | null, city: CityState): HexObjectView {
  const row = report?.cities.find((candidate) => candidate.cityId === city.id);
  const short = (row?.ensMw ?? 0) > 0;
  const rows: InfoRow[] = [
    { key: "households", label: "GOSPODARSTWA", value: formatNumber(city.households) },
    { key: "firms", label: "FIRMY", value: formatNumber(city.firms) },
  ];
  if (row) {
    rows.push({ key: "demand", label: "POBÓR", value: formatMw(row.demandMw) });
    rows.push({
      key: "delivered",
      label: "DOSTARCZONO",
      value: formatMw(row.deliveredMw),
      tone: short ? "danger" : "ok",
    });
  }
  return {
    kind: CITY_CATALOG_NAME,
    status: city.connected
      ? short
        ? { tone: "danger", label: `niedobór ${formatMw(row?.ensMw ?? 0)}` }
        : { tone: "ok", label: "zasilane" }
      : { tone: "idle", label: "nieprzyłączone" },
    connections: null,
    rows,
    actions: [
      routeAction(state, city.hex),
      {
        key: "connect",
        label: `PRZYŁĄCZ MIASTO — ${formatMoneyPln(CITY_CONNECTION_COST_PLN)}`,
        note: connectCityNote(state, city, CITY_CONNECTION_COST_PLN),
        intent: { kind: "action", action: { type: "connectCity", cityId: city.id } },
      },
      ...(short ? bottleneckAction(report) : []),
    ],
  };
}

function plantView(state: GameState, report: TurnReport | null, plant: PlantState): HexObjectView {
  const spec = PLANT_TECHS[plant.tech];
  const used = report?.sources.find((source) => source.sourceId === plant.id);
  const alert = inBottleneck(state, report, plant.hex);
  // A new block matches the ones already standing here (01 §7 — expansion adds
  // blocks in place), capped by the technology's own block limit.
  const blockMw = Math.min(spec.maxBlockMw, Math.round(plant.capacityMw / plant.blocks));
  const pending = queued(state, (item) =>
    item.kind === "plantExpansion" && item.plantId === plant.id ? 1 : 0,
  );
  return {
    kind: PLANT_CATALOG_NAMES[plant.tech],
    status: alert
      ? { tone: "danger", label: "wąskie gardło" }
      : { tone: "ok", label: "praca normalna" },
    connections: connectionsLabel(state, plant.hex),
    rows: [
      { key: "power", label: "NASTAWA", value: formatSetpoint(plant.setpointMw, plant.capacityMw) },
      {
        key: "blocks",
        label: "BLOKI",
        value: `${formatNumber(plant.blocks)} / ${formatNumber(MAX_PLANT_BLOCKS_PER_HEX)}`,
      },
      {
        key: "cost",
        label: "KOSZT ZMIENNY",
        value: `${formatNumber(spec.varCostPlnPerMwh)} zł/MWh`,
      },
      ...(used ? [{ key: "used", label: "UŻYTA MOC", value: formatMw(used.usedMw) }] : []),
    ],
    actions: [
      routeAction(state, plant.hex),
      expansionAction(state, plant.hex, {
        key: "expand",
        label: `ROZBUDUJ · +BLOK ${formatMw(blockMw)}`,
        basePln: blockMw * spec.capexPlnPerMw * EXPANSION.capexShare,
        action: { type: "expandPlant", plantId: plant.id, capacityMw: blockMw },
        limit: limitNote(plant.blocks, pending, 1, MAX_PLANT_BLOCKS_PER_HEX, "bloków"),
      }),
      ...expansionActions(state, plant.id),
      ...(alert ? bottleneckAction(report) : []),
    ],
  };
}

function farmView(state: GameState, report: TurnReport | null, farm: FarmState): HexObjectView {
  const spec = FARM_TECHS[farm.tech];
  // 02 §8.1, §8.4 (0.22): an offshore farm expands at ITS hex's price and up to
  // ITS hex's cap — 600 MW at 2.5×, not 300 MW at the land multiplier.
  const site = farmSiting(farm.tech, terrainAt(state, farm.hex));
  const produced = report?.sources.find((source) => source.sourceId === farm.id);
  const alert = inBottleneck(state, report, farm.hex);
  const stepMw = FARM_BLOCKS[farm.tech].stepMw;
  const pending = queued(state, (item) =>
    item.kind === "farmExpansion" && item.farmId === farm.id ? item.capacityMw : 0,
  );
  return {
    kind: FARM_CATALOG_NAMES[farm.tech],
    status: !farm.enabled
      ? { tone: "idle", label: "wyłączona" }
      : alert
        ? { tone: "danger", label: "wąskie gardło" }
        : { tone: "ok", label: "praca normalna" },
    connections: connectionsLabel(state, farm.hex),
    rows: [
      {
        key: "power",
        label: "MOC ZAINSTALOWANA",
        value: formatSetpoint(farm.capacityMw, site.maxMwPerHex),
      },
      ...(produced
        ? [
            {
              key: "produced",
              label: "PRODUKCJA",
              value: `~${formatMw(produced.offeredMw)}`,
              tone: "info" as StatusTone,
            },
          ]
        : []),
    ],
    actions: [
      routeAction(state, farm.hex),
      expansionAction(state, farm.hex, {
        key: "expand",
        label: `ROZBUDUJ · +${formatMw(stepMw)}`,
        basePln: stepMw * spec.capexPlnPerMw * EXPANSION.capexShare,
        action: { type: "expandFarm", farmId: farm.id, capacityMw: stepMw },
        limit: limitNote(farm.capacityMw, pending, stepMw, site.maxMwPerHex, "MW"),
        siteMultiplier: site.multiplier,
      }),
      ...expansionActions(state, farm.id),
      ...(alert ? bottleneckAction(report) : []),
    ],
  };
}

function storageView(
  state: GameState,
  report: TurnReport | null,
  storage: StorageState,
): HexObjectView {
  const alert = inBottleneck(state, report, storage.hex);
  const socPercent = storage.capacityMwh > 0 ? (storage.socMwh / storage.capacityMwh) * 100 : 0;
  const rows: InfoRow[] = [
    { key: "power", label: "MOC", value: formatMw(storage.powerMw) },
    { key: "capacity", label: "POJEMNOŚĆ", value: formatMwh(storage.capacityMwh) },
    {
      key: "soc",
      label: "SOC",
      value: `${formatMwh(storage.socMwh)} · ${formatPercent(socPercent)}`,
    },
    { key: "mode", label: "TRYB", value: STORAGE_MODE_LABELS[storage.setpoint.mode] },
  ];
  const actions: HexAction[] = [routeAction(state, storage.hex)];

  if (storage.tech === "battery") {
    const power = queued(state, (item) =>
      item.kind === "batteryExpansion" && item.storageId === storage.id ? item.powerMw : 0,
    );
    const capacity = queued(state, (item) =>
      item.kind === "batteryExpansion" && item.storageId === storage.id ? item.capacityMwh : 0,
    );
    // 01 §5.3: power and capacity are two decisions, so they are two actions.
    actions.push(
      expansionAction(state, storage.hex, {
        key: "expand-power",
        label: `ROZBUDUJ · +MOC ${formatMw(BATTERY_BLOCK.stepPowerMw)}`,
        basePln: BATTERY_BLOCK.stepPowerMw * BATTERY.powerCapexPlnPerMw,
        action: {
          type: "expandBattery",
          storageId: storage.id,
          powerMw: BATTERY_BLOCK.stepPowerMw,
          capacityMwh: 0,
        },
        limit: limitNote(
          storage.powerMw,
          power,
          BATTERY_BLOCK.stepPowerMw,
          BATTERY.maxPowerMwPerHex,
          "MW",
        ),
      }),
      expansionAction(state, storage.hex, {
        key: "expand-capacity",
        label: `ROZBUDUJ · +POJEMNOŚĆ ${formatMwh(BATTERY_BLOCK.stepCapacityMwh)}`,
        basePln: BATTERY_BLOCK.stepCapacityMwh * BATTERY.energyCapexPlnPerMwh,
        action: {
          type: "expandBattery",
          storageId: storage.id,
          powerMw: 0,
          capacityMwh: BATTERY_BLOCK.stepCapacityMwh,
        },
        limit: limitNote(
          storage.capacityMwh,
          capacity,
          BATTERY_BLOCK.stepCapacityMwh,
          BATTERY.maxCapacityMwhPerHex,
          "MWh",
        ),
      }),
    );
  } else {
    const blocks = Math.round(storage.powerMw / PUMPED_BLOCK.powerMw);
    const pending = queued(state, (item) =>
      item.kind === "pumpedExpansion" && item.storageId === storage.id ? 1 : 0,
    );
    rows.splice(2, 0, {
      key: "blocks",
      label: "BLOKI",
      value: `${formatNumber(blocks)} / ${formatNumber(PUMPED_BLOCK.maxBlocks)}`,
    });
    actions.push(
      expansionAction(state, storage.hex, {
        key: "expand",
        label: `ROZBUDUJ · +BLOK ${formatMw(PUMPED_BLOCK.powerMw)}`,
        basePln: PUMPED_BLOCK.capexPln,
        action: { type: "expandPumpedStorage", storageId: storage.id },
        limit: limitNote(blocks, pending, 1, PUMPED_BLOCK.maxBlocks, "bloków"),
      }),
    );
  }

  actions.push(...expansionActions(state, storage.id), ...(alert ? bottleneckAction(report) : []));
  return {
    kind: STORAGE_CATALOG_NAMES[storage.tech],
    status: alert
      ? { tone: "danger", label: "wąskie gardło" }
      : { tone: "ok", label: "praca normalna" },
    connections: connectionsLabel(state, storage.hex),
    rows,
    actions,
  };
}

function junctionView(
  state: GameState,
  report: TurnReport | null,
  junction: JunctionState,
): HexObjectView {
  // 0.21: the station passes on whatever its lines bring, so it has no meter of
  // its own — the only bottleneck it can report is a line running through it.
  const alert = inBottleneck(state, report, junction.hex);
  return {
    kind: JUNCTION_CATALOG_NAME,
    status: alert
      ? { tone: "danger", label: "wąskie gardło" }
      : { tone: "ok", label: "praca normalna" },
    connections: connectionsLabel(state, junction.hex),
    rows: [{ key: "throughput", label: "PRZEPUSTOWOŚĆ", value: "bez ograniczeń" }],
    actions: [routeAction(state, junction.hex), ...(alert ? bottleneckAction(report) : [])],
  };
}

function borderView(
  state: GameState,
  report: TurnReport | null,
  border: BorderState,
): HexObjectView {
  const row = report?.nodes.find((candidate) => candidate.nodeId === border.id);
  const alert = inBottleneck(state, report, border.hex);
  return {
    kind: BORDER_CATALOG_NAME,
    status: alert
      ? { tone: "danger", label: "wąskie gardło" }
      : { tone: "ok", label: "praca normalna" },
    connections: connectionsLabel(state, border.hex),
    rows: [
      {
        key: "throughput",
        label: "PRZEPUSTOWOŚĆ",
        value: row ? formatSetpoint(row.usedMw, row.throughputMw) : formatMw(border.throughputMw),
      },
      { key: "import", label: "IMPORT", value: formatMw(border.importSetpointMw) },
      { key: "export", label: "EKSPORT", value: formatMw(border.exportSetpointMw) },
    ],
    actions: [
      routeAction(state, border.hex),
      // 01 §5.7 sets no cap on border modules — only the budget stops this one.
      expansionAction(state, border.hex, {
        key: "expand",
        label: `ROZBUDUJ · +${formatMw(BORDER_SPEC.moduleThroughputMw)}`,
        basePln: BORDER_SPEC.moduleCapexPln,
        action: { type: "expandBorder", borderId: border.id },
        limit: null,
      }),
      ...expansionActions(state, border.id),
      ...(alert ? bottleneckAction(report) : []),
    ],
  };
}

/** `PRZYŁĄCZA 2 / 6` — how many lines already tap this object (01 §3.3). */
function connectionsLabel(state: GameState, hex: HexCoord): string {
  const used = connectionsAt(state, hex);
  return `${formatNumber(used)} / ${formatNumber(lineSlotsAt(state, hexKey(hex)))}`;
}

/** What a queued object will be, in the catalogue's wording. */
function describeSite(pending: PendingObject): { kind: string; size: string } | null {
  switch (pending.kind) {
    case "plant":
      return {
        kind: PLANT_CATALOG_NAMES[pending.plant.tech],
        size: formatMw(pending.plant.capacityMw),
      };
    case "farm":
      return {
        kind: FARM_CATALOG_NAMES[pending.farm.tech],
        size: formatMw(pending.farm.capacityMw),
      };
    case "storage":
      return {
        kind: STORAGE_CATALOG_NAMES[pending.storage.tech],
        size: `${formatMw(pending.storage.powerMw)} / ${formatMwh(pending.storage.capacityMwh)}`,
      };
    case "junction":
      return {
        kind: JUNCTION_CATALOG_NAME,
        size: `${formatNumber(JUNCTION_SPEC.lineSlots)} PRZYŁĄCZY`,
      };
    case "border":
      return { kind: BORDER_CATALOG_NAME, size: formatMw(pending.border.throughputMw) };
    default:
      return null;
  }
}

/** The site of an object still counting down — nothing to operate yet (01 §2.6). */
function siteView(state: GameState, hex: HexCoord): HexObjectView | null {
  const construction = constructionAt(state, hex);
  if (!construction) return null;
  const site = describeSite(construction.pending);
  if (!site) return null;
  return {
    kind: site.kind,
    status: { tone: "idle", label: `w budowie · ${daysLabel(construction.remainingDays)}` },
    connections: null,
    rows: [
      { key: "size", label: "PARAMETRY", value: site.size },
      { key: "left", label: "DO URUCHOMIENIA", value: daysLabel(construction.remainingDays) },
    ],
    actions: [
      {
        key: `cancel:${construction.id}`,
        label: "ANULUJ BUDOWĘ",
        note: null,
        intent: {
          kind: "action",
          action: { type: "cancelConstruction", constructionId: construction.id },
        },
        confirm: "POTWIERDŹ — NAKŁADY PRZEPADAJĄ",
      },
    ],
  };
}

/**
 * OBIEKT: what stands on the hex — a finished object or a site still counting
 * down. null means the hex is free and the catalogue takes its place.
 */
export function hexObjectView(
  state: GameState,
  report: TurnReport | null,
  hex: HexCoord,
): HexObjectView | null {
  const found = objectAt(state, hex);
  if (found.city) return cityView(state, report, found.city);
  if (found.plant) return plantView(state, report, found.plant);
  if (found.farm) return farmView(state, report, found.farm);
  if (found.storage) return storageView(state, report, found.storage);
  if (found.junction) return junctionView(state, report, found.junction);
  if (found.border) return borderView(state, report, found.border);
  return siteView(state, hex);
}
