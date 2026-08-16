// Model of the day chart (01 §8 pt 2): GameState in, plain JSON-able geometry
// out. Same contract as the map's scene model — no JSX, no DOM — so the tests
// snapshot the model instead of markup and swapping the renderer stays local.
//
// The axis is the whole day: 8 blocks of 3 h (01 §2.2). Left of TERAZ the
// resolved turns are drawn as hard block steps of coverage by technology; right
// of it the demand forecast keeps its band, because a forecast without one is a
// design error in this game (06 §8.6.4).

import {
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  cityDemandForecast,
  type FarmTech,
  type GameState,
  type PlantTech,
  type TurnReport,
  type TurnSourceReport,
} from "../../engine";
import { formatMw } from "../format";

/** Chart box of the handoff (DayChart.jsx: viewBox 0 0 1060 130). */
export const CHART_WIDTH = 1060;
export const CHART_HEIGHT = 130;

const HOURS_PER_DAY = TURNS_PER_DAY * HOURS_PER_TURN;

/** The scale is rounded up to a whole multiple of this [MW] — as in the panel. */
const SCALE_STEP_MW = 100;

/**
 * Left of this the caption still occupies the top line, so the TERAZ label
 * drops one line down. Mono at 10 px is ~6 units per character.
 */
const CAPTION_RESERVED_X = 190;

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartText extends ChartPoint {
  text: string;
}

/**
 * Merit order from the bottom up (01 §8 pt 2). Seven layers, not the handoff's
 * four: the doc names nuclear separately and keeps storage apart from import,
 * and two layers cannot share one colour.
 *
 * Colours are the technology tokens the rest of the app already uses — storage
 * on `--en-ok` and border points on `--en-storage`, as in the map icons and the
 * setpoint sliders — so a technology looks the same wherever it appears.
 * `--en-nuclear` is ours (tokens/colors.css), pending designer review.
 */
export const DAY_CHART_LAYERS = [
  { key: "nuclear", label: "JĄDROWA", color: "var(--en-nuclear)" },
  { key: "coal", label: "WĘGIEL", color: "var(--en-coal)" },
  { key: "gas", label: "GAZ", color: "var(--en-gas)" },
  { key: "wind", label: "WIATR", color: "var(--en-wind)" },
  { key: "pv", label: "PV", color: "var(--en-pv)" },
  { key: "storage", label: "MAGAZYN", color: "var(--en-ok)" },
  { key: "import", label: "IMPORT", color: "var(--en-storage)" },
] as const;

export type DayChartLayerKey = (typeof DAY_CHART_LAYERS)[number]["key"];

const PLANT_LAYERS: Record<PlantTech, DayChartLayerKey> = {
  nuclear: "nuclear",
  coal: "coal",
  ccgt: "gas",
  ocgt: "gas",
};

const FARM_LAYERS: Record<FarmTech, DayChartLayerKey> = { wind: "wind", pv: "pv" };

function layerIndex(key: DayChartLayerKey): number {
  return DAY_CHART_LAYERS.findIndex((layer) => layer.key === key);
}

export interface DayChartBlock {
  /** Turn of the day this block stands for, 0-based. */
  turnIndex: number;
  /** Block-average power per layer [MW], aligned with DAY_CHART_LAYERS. */
  layersMw: number[];
  /** Sum of the layers — the coverage the stack draws. */
  coverageMw: number;
  /** Revealed demand of the block (01 §4.1), the truth line. */
  demandMw: number;
}

export interface DayChartArea {
  key: DayChartLayerKey;
  color: string;
  /** Closed polygon: the layer's top step line, then its bottom one reversed. */
  points: ChartPoint[];
}

export interface DayChartForecast {
  /** Closed lo..hi band polygon. */
  band: ChartPoint[];
  /** Center of the band — the value the forecast actually promises. */
  mid: ChartPoint[];
}

export interface DayChartLegendEntry {
  label: string;
  color: string;
}

export interface DayChartModel {
  width: number;
  height: number;
  /** Upper end of the shared vertical scale [MW]. */
  scaleMw: number;
  /** Vertical block dividers, inner boundaries only. */
  gridX: number[];
  /** Boundary between the resolved turns and the forecast. */
  nowX: number;
  /** The pending block, highlighted under the TERAZ line. */
  currentBlock: { x: number; width: number };
  /** One entry per resolved turn of the day on the axis; empty on a fresh day. */
  blocks: DayChartBlock[];
  /** Stacked coverage, bottom layer first; layers with no energy are dropped. */
  areas: DayChartArea[];
  /** Revealed demand as block steps. */
  demandLine: ChartPoint[];
  /** Demand forecast for the rest of the day; null when there is none. */
  forecast: DayChartForecast | null;
  caption: ChartText;
  scaleLabel: ChartText;
  nowLabel: ChartText;
  legend: DayChartLegendEntry[];
  /** Right-hand note of the legend — what solid and dashed mean. */
  note: string;
}

/** Sub-pixel precision of the handoff's own chart geometry. */
function round01(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Report power is quantized to 0,001 MW; sums of it stay there too. */
function round001(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Which layer a source of the report belongs to: the kind says where to look,
 * the object in the state says which technology it is.
 */
function sourceLayer(
  source: TurnSourceReport,
  plantTechs: Map<string, PlantTech>,
  farmTechs: Map<string, FarmTech>,
): DayChartLayerKey | null {
  switch (source.kind) {
    case "plant": {
      const tech = plantTechs.get(source.sourceId);
      return tech === undefined ? null : PLANT_LAYERS[tech];
    }
    case "farm": {
      const tech = farmTechs.get(source.sourceId);
      return tech === undefined ? null : FARM_LAYERS[tech];
    }
    case "storage":
      return "storage";
    case "import":
      return "import";
  }
}

/**
 * Coverage of one resolved turn, split by technology. Power ACTUALLY drawn by
 * the flow, not offered: what a source dumped never covered anything.
 */
function blockOf(
  report: TurnReport,
  plantTechs: Map<string, PlantTech>,
  farmTechs: Map<string, FarmTech>,
): DayChartBlock {
  const layersMw = DAY_CHART_LAYERS.map(() => 0);
  for (const source of report.sources) {
    if (source.usedMw <= 0) continue;
    const key = sourceLayer(source, plantTechs, farmTechs);
    if (key === null) continue;
    const index = layerIndex(key);
    layersMw[index] = (layersMw[index] ?? 0) + source.usedMw;
  }
  const rounded = layersMw.map(round001);
  return {
    turnIndex: report.turnIndex,
    layersMw: rounded,
    coverageMw: round001(rounded.reduce((sum, mw) => sum + mw, 0)),
    demandMw: report.totals.demandMw,
  };
}

interface ForecastHour {
  hour: number;
  mw: number;
  lo: number;
  hi: number;
}

/** Demand forecast, summed over the connected cities, hour by hour (01 §2.4). */
function forecastHours(state: GameState): ForecastHour[] {
  const hours: ForecastHour[] = [];
  for (let hour = state.calendar.turnIndex * HOURS_PER_TURN; hour < HOURS_PER_DAY; hour++) {
    let mw = 0;
    let bandMw = 0;
    for (const city of state.cities) {
      if (!city.connected) continue;
      const point = cityDemandForecast(state, city.id, hour);
      if (!point) continue;
      mw += point.mw;
      // Bands of one quantity share the day's error factor, so they sum exactly.
      bandMw += point.bandMw;
    }
    hours.push({ hour, mw, lo: Math.max(0, mw - bandMw), hi: mw + bandMw });
  }
  return hours;
}

function scaleMwOf(blocks: readonly DayChartBlock[], hours: readonly ForecastHour[]): number {
  let peak = 0;
  for (const block of blocks) peak = Math.max(peak, block.coverageMw, block.demandMw);
  for (const hour of hours) peak = Math.max(peak, hour.hi);
  return Math.max(SCALE_STEP_MW, Math.ceil(peak / SCALE_STEP_MW) * SCALE_STEP_MW);
}

/** Everything the day chart draws, for the day the calendar is standing on. */
export function buildDayChart(state: GameState): DayChartModel {
  const plantTechs = new Map(state.plants.map((plant) => [plant.id, plant.tech]));
  const farmTechs = new Map(state.farms.map((farm) => [farm.id, farm.tech]));
  // The history outlives the day it belongs to (state.ts), so the chart takes
  // only the turns of the day its own axis shows: on a fresh day, none.
  const blocks = state.dayReports
    .filter((report) => report.dayIndex === state.calendar.dayIndex)
    .map((report) => blockOf(report, plantTechs, farmTechs));
  const hours = forecastHours(state);
  const scaleMw = scaleMwOf(blocks, hours);

  const blockX = (index: number): number => round01((index / TURNS_PER_DAY) * CHART_WIDTH);
  const hourX = (hour: number): number => round01((hour / HOURS_PER_DAY) * CHART_WIDTH);
  const y = (mw: number): number => round01(CHART_HEIGHT - (mw / scaleMw) * CHART_HEIGHT);

  /** Hard block steps — a resolved turn is a flat 3 h average, never a slope. */
  const stepLine = (valueOf: (block: DayChartBlock) => number): ChartPoint[] =>
    blocks.flatMap((block) => {
      const level = y(valueOf(block));
      return [
        { x: blockX(block.turnIndex), y: level },
        { x: blockX(block.turnIndex + 1), y: level },
      ];
    });
  const stackedMw = (block: DayChartBlock, upTo: number): number =>
    block.layersMw.slice(0, upTo).reduce((sum, mw) => sum + mw, 0);

  const areas: DayChartArea[] = [];
  DAY_CHART_LAYERS.forEach((layer, index) => {
    const energy = blocks.reduce((sum, block) => sum + (block.layersMw[index] ?? 0), 0);
    if (energy <= 0) return;
    const top = stepLine((block) => stackedMw(block, index + 1));
    const bottom = stepLine((block) => stackedMw(block, index)).reverse();
    areas.push({ key: layer.key, color: layer.color, points: [...top, ...bottom] });
  });

  // The last hour is held to the right edge: the samples are hourly, the axis
  // runs to midnight, and a band that stops short would read as certainty.
  const forecastLine = (valueOf: (hour: ForecastHour) => number): ChartPoint[] => {
    const points = hours.map((hour) => ({ x: hourX(hour.hour), y: y(valueOf(hour)) }));
    const last = hours.at(-1);
    if (last) points.push({ x: CHART_WIDTH, y: y(valueOf(last)) });
    return points;
  };
  const hasForecast = hours.some((hour) => hour.hi > 0);
  const forecast: DayChartForecast | null = hasForecast
    ? {
        band: [...forecastLine((hour) => hour.hi), ...forecastLine((hour) => hour.lo).reverse()],
        mid: forecastLine((hour) => hour.mw),
      }
    : null;

  const nowX = blockX(state.calendar.turnIndex);
  const nowLabelX = round01(nowX + 6);
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    scaleMw,
    gridX: Array.from({ length: TURNS_PER_DAY - 1 }, (_, index) => blockX(index + 1)),
    nowX,
    currentBlock: { x: nowX, width: round01(CHART_WIDTH / TURNS_PER_DAY) },
    blocks,
    areas,
    demandLine: stepLine((block) => block.demandMw),
    forecast,
    caption: { x: 8, y: 14, text: "DOBA · POPYT vs POKRYCIE [MW]" },
    // The chart has no vertical axis (handoff), so the scale is printed: without
    // it the layers show proportions and hide every absolute number.
    scaleLabel: { x: CHART_WIDTH - 8, y: 14, text: formatMw(scaleMw) },
    nowLabel: { x: nowLabelX, y: nowLabelX < CAPTION_RESERVED_X ? 28 : 14, text: "TERAZ" },
    // The full key, always: it is what the colours MEAN, not a summary of the
    // day — and read from the bottom up it is the merit order itself.
    legend: DAY_CHART_LAYERS.map((layer) => ({ label: layer.label, color: layer.color })),
    note: "— PRAWDA · ┄ PROGNOZA (PASMO)",
  };
}
