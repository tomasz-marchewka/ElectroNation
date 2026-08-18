// Model of the time ribbon (01 §8 pt 2): GameState in, plain JSON-able geometry
// out. Same contract as the map's scene model — no JSX, no DOM — so the tests
// snapshot the model instead of markup and swapping the renderer stays local.
//
// The ribbon replaces the day axis and the day chart of M8, which were two
// components over the same eight columns. It shows a WINDOW of turns, not a
// day: behind TERAZ the archive (02 §4.1), ahead of it the forecast, up to the
// rolling horizon (§2.4). The window is eight turns wide — a day's worth — and
// slides over the whole game, so only eight columns are ever built no matter
// how long the archive is.

import {
  COVERAGE_LAYERS,
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  absoluteTurn,
  cityDemandForecast,
  digestAt,
  digestTurn,
  forecastHorizonTurns,
  type CoverageLayer,
  type GameState,
  type TurnDigest,
} from "../../engine";
import { formatMw } from "../format";
import { dayTurnAt } from "../labels";
import { dayContext } from "../store/selectors";

/** Chart box of the handoff (DayChart.jsx: viewBox 0 0 1060 130). */
export const CHART_WIDTH = 1060;
export const CHART_HEIGHT = 130;

/** Columns on screen at once. A day's worth — the unit the player plans in. */
export const WINDOW_TURNS = TURNS_PER_DAY;

/** The scale is rounded up to a whole multiple of this [MW] — as in the panel. */
const SCALE_STEP_MW = 100;

/**
 * How much of a block, at each of its inner ends, is given up to the rounding
 * window the renderer curves through (a fraction of the block's width).
 *
 * A turn IS a flat 3 h average (01 §2.2), so the level has to be readable
 * straight off the middle of its block — but the instant vertical wall between
 * two turns was never a claim about what happened at the boundary either, and
 * next to the hourly forecast curve it read as the odd one out. At 0,40 the
 * middle fifth of every block still sits level at the turn's own value, and
 * the two fifths at each end lean toward the neighbouring turn.
 */
const BLOCK_ROUNDING = 0.4;

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
 * Merit order from the bottom up (01 §8 pt 2), in the engine's own layer order
 * (COVERAGE_LAYERS) — the digest stores coverage aligned to it, so the two may
 * never drift apart.
 *
 * Colours are the technology tokens the rest of the app already uses — storage
 * on `--en-ok` and border points on `--en-storage`, as in the map icons and the
 * setpoint sliders — so a technology looks the same wherever it appears.
 * `--en-nuclear` is ours (tokens/colors.css), pending designer review.
 */
const LAYER_STYLE: Record<CoverageLayer, { label: string; color: string }> = {
  nuclear: { label: "JĄDROWA", color: "var(--en-nuclear)" },
  coal: { label: "WĘGIEL", color: "var(--en-coal)" },
  gas: { label: "GAZ", color: "var(--en-gas)" },
  wind: { label: "WIATR", color: "var(--en-wind)" },
  pv: { label: "PV", color: "var(--en-pv)" },
  storage: { label: "MAGAZYN", color: "var(--en-ok)" },
  import: { label: "IMPORT", color: "var(--en-storage)" },
};

export const TIMELINE_LAYERS = COVERAGE_LAYERS.map((key) => ({ key, ...LAYER_STYLE[key] }));

/** Where a column sits relative to the pending turn. */
export type TimelineCellState = "past" | "current" | "future";

export interface TimelineCell {
  /** Position on the one continuous axis: `dayIndex × 8 + turnIndex`. */
  absTurn: number;
  dayIndex: number;
  turnIndex: number;
  /** "SZCZYT WIECZ." */
  name: string;
  /** "18–21" */
  hours: string;
  state: TimelineCellState;
  selected: boolean;
  /** Column geometry in chart units, so the cells line up with the chart. */
  x: number;
  width: number;
}

/** One day's stretch of the window — the caption above the cells. */
export interface TimelineDaySpan {
  dayIndex: number;
  /** "ROK 1 · STYCZEŃ · DOBA ROBOCZA A". */
  label: string;
  /** How many columns of the window this day covers. */
  columns: number;
}

export interface TimelineArea {
  key: CoverageLayer;
  color: string;
  /** Closed outline: the layer's top block line, then its bottom one reversed. */
  points: ChartPoint[];
}

export interface TimelineBand {
  /** Closed lo..hi band polygon. */
  band: ChartPoint[];
  /** Center of the band — the value the forecast actually promised. */
  mid: ChartPoint[];
}

export interface TimelineBlock {
  x: number;
  width: number;
}

export interface TimelineRange {
  /** First column of the window, as an absolute turn. */
  from: number;
  /** Scroll bounds, both inclusive: the ribbon may not leave them. */
  minFrom: number;
  maxFrom: number;
  /** The turn awaiting a decision — TERAZ. */
  pendingTurn: number;
  /** Last turn the forecast reaches (01 §2.4): `pending + 8·D − 1`. */
  lastTurn: number;
  /** The turn the report strip is describing. */
  selectedTurn: number;
}

export interface TimelineLegendEntry {
  label: string;
  color: string;
}

export interface TimelineModel {
  width: number;
  height: number;
  /** Upper end of the shared vertical scale [MW]. */
  scaleMw: number;
  /** Column dividers, inner boundaries only. */
  gridX: number[];
  /** Stronger dividers where one day ends and the next begins. */
  dayGridX: number[];
  /** Boundary between the resolved turns and the forecast; null when off-window. */
  nowX: number | null;
  /** The pending block, highlighted under the TERAZ line; null when off-window. */
  currentBlock: TimelineBlock | null;
  /** The block the report strip is describing; null when off-window. */
  selectedBlock: TimelineBlock | null;
  cells: TimelineCell[];
  days: TimelineDaySpan[];
  /** Stacked coverage of the resolved columns; layers with no energy are dropped. */
  areas: TimelineArea[];
  /** Revealed demand, one level per resolved column. */
  demandLine: ChartPoint[];
  /**
   * The demand forecast that stood BEFORE each resolved turn (01 §8 pt 2): the
   * bet the player made, kept by the archive because a resolved hour has no
   * band of its own any more.
   */
  pastForecast: TimelineBand | null;
  /** Demand forecast ahead of TERAZ; null when the window is all history. */
  forecast: TimelineBand | null;
  range: TimelineRange;
  caption: ChartText;
  scaleLabel: ChartText;
  nowLabel: ChartText;
  legend: TimelineLegendEntry[];
  /** Right-hand note of the legend — what solid and dashed mean. */
  note: string;
}

/** Sub-pixel precision of the handoff's own chart geometry. */
export function round01(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface TimelineInput {
  /** First column of the window; null follows the current day. */
  from: number | null;
  /** Turn the report strip describes; null means the last resolved one. */
  selected: number | null;
}

/** Scroll bounds and the turn the ribbon is anchored on. */
export function timelineRange(state: GameState, input: TimelineInput): TimelineRange {
  const pendingTurn = absoluteTurn(state.calendar.dayIndex, state.calendar.turnIndex);
  const dayStart = pendingTurn - state.calendar.turnIndex;
  const first = state.history[0];
  const minFrom = first === undefined ? dayStart : Math.min(digestTurn(first), dayStart);
  const lastTurn = pendingTurn + forecastHorizonTurns(state) - 1;
  const maxFrom = Math.max(minFrom, lastTurn - WINDOW_TURNS + 1);
  const from = Math.min(Math.max(input.from ?? dayStart, minFrom), maxFrom);
  const selected = Math.min(Math.max(input.selected ?? pendingTurn - 1, minFrom), lastTurn);
  return { from, minFrom, maxFrom, pendingTurn, lastTurn, selectedTurn: selected };
}

interface Column {
  absTurn: number;
  dayIndex: number;
  turnIndex: number;
  state: TimelineCellState;
  digest?: TurnDigest;
  x: number;
  width: number;
}

interface ForecastHour {
  x: number;
  mw: number;
  lo: number;
  hi: number;
}

/** Demand forecast of one hour, summed over the connected cities (01 §2.4). */
function forecastHour(state: GameState, dayOffset: number, hour: number): ForecastHour | null {
  let mw = 0;
  let bandMw = 0;
  let found = false;
  for (const city of state.cities) {
    if (!city.connected) continue;
    const point = cityDemandForecast(state, city.id, hour, dayOffset);
    if (!point) return null;
    found = true;
    mw += point.mw;
    // Bands of one quantity share the day's error factor, so they sum exactly.
    bandMw += point.bandMw;
  }
  return found ? { x: 0, mw, lo: Math.max(0, mw - bandMw), hi: mw + bandMw } : null;
}

/** Everything the ribbon draws for the window it is standing on. */
export function buildTimeline(state: GameState, input: TimelineInput): TimelineModel {
  const range = timelineRange(state, input);
  const columnX = (index: number): number => round01((index / WINDOW_TURNS) * CHART_WIDTH);
  const columnWidth = round01(CHART_WIDTH / WINDOW_TURNS);

  const columns: Column[] = [];
  for (let index = 0; index < WINDOW_TURNS; index++) {
    const absTurn = range.from + index;
    const dayIndex = Math.floor(absTurn / TURNS_PER_DAY);
    columns.push({
      absTurn,
      dayIndex,
      turnIndex: absTurn - dayIndex * TURNS_PER_DAY,
      state:
        absTurn < range.pendingTurn ? "past" : absTurn === range.pendingTurn ? "current" : "future",
      digest: absTurn < range.pendingTurn ? digestAt(state.history, absTurn) : undefined,
      x: columnX(index),
      width: columnWidth,
    });
  }

  // Resolved columns are a prefix of the window and forecast columns a suffix:
  // both runs are contiguous, which is what lets them be drawn as one line each.
  const resolved = columns.filter((column) => column.digest !== undefined);
  const hours: ForecastHour[] = [];
  for (const [index, column] of columns.entries()) {
    if (column.state === "past") continue;
    const dayOffset = column.dayIndex - state.calendar.dayIndex;
    for (let hour = 0; hour < HOURS_PER_TURN; hour++) {
      const point = forecastHour(state, dayOffset, column.turnIndex * HOURS_PER_TURN + hour);
      if (point === null) continue;
      point.x = round01(((index + hour / HOURS_PER_TURN) / WINDOW_TURNS) * CHART_WIDTH);
      hours.push(point);
    }
  }

  let peak = 0;
  for (const column of resolved) {
    const digest = column.digest;
    if (!digest) continue;
    const coverage = digest.coverageMw.reduce((sum, mw) => sum + mw, 0);
    const band = digest.forecastMiss.demand;
    peak = Math.max(peak, coverage, digest.totals.demandMw, band.forecastMw + band.bandMw);
  }
  for (const hour of hours) peak = Math.max(peak, hour.hi);
  const scaleMw = Math.max(SCALE_STEP_MW, Math.ceil(peak / SCALE_STEP_MW) * SCALE_STEP_MW);
  const y = (mw: number): number => round01(CHART_HEIGHT - (mw / scaleMw) * CHART_HEIGHT);

  const roundX = round01(BLOCK_ROUNDING * columnWidth);
  /**
   * Two points per block, both at the turn's own level: the run the value holds
   * flat. What is left between two blocks is the rounding window the renderer
   * curves through — and the run's own ends stay square, because there is
   * nothing before the first column to lean toward and past TERAZ there is no
   * truth yet, only the forecast.
   */
  const blockLine = (valueOf: (digest: TurnDigest) => number): ChartPoint[] =>
    resolved.flatMap((column, index) => {
      const level = y(column.digest ? valueOf(column.digest) : 0);
      const from = column.x;
      const to = round01(column.x + column.width);
      return [
        { x: index === 0 ? from : round01(from + roundX), y: level },
        { x: index === resolved.length - 1 ? to : round01(to - roundX), y: level },
      ];
    });
  const stackedMw = (digest: TurnDigest, upTo: number): number =>
    digest.coverageMw.slice(0, upTo).reduce((sum, mw) => sum + mw, 0);

  const areas: TimelineArea[] = [];
  TIMELINE_LAYERS.forEach((layer, index) => {
    const energy = resolved.reduce(
      (sum, column) => sum + (column.digest?.coverageMw[index] ?? 0),
      0,
    );
    if (energy <= 0) return;
    const top = blockLine((digest) => stackedMw(digest, index + 1));
    const bottom = blockLine((digest) => stackedMw(digest, index)).reverse();
    areas.push({ key: layer.key, color: layer.color, points: [...top, ...bottom] });
  });

  const pastForecast: TimelineBand | null =
    resolved.length === 0
      ? null
      : {
          band: [
            ...blockLine(
              (digest) => digest.forecastMiss.demand.forecastMw + digest.forecastMiss.demand.bandMw,
            ),
            ...blockLine((digest) =>
              Math.max(
                0,
                digest.forecastMiss.demand.forecastMw - digest.forecastMiss.demand.bandMw,
              ),
            ).reverse(),
          ],
          mid: blockLine((digest) => digest.forecastMiss.demand.forecastMw),
        };

  // The last hour is held to the right edge: the samples are hourly, the axis
  // runs in 3 h blocks, and a band that stops short would read as certainty.
  const forecastLine = (valueOf: (hour: ForecastHour) => number): ChartPoint[] => {
    const points = hours.map((hour) => ({ x: hour.x, y: y(valueOf(hour)) }));
    const last = hours.at(-1);
    if (last) {
      const end = columns.at(-1);
      points.push({ x: end ? round01(end.x + end.width) : CHART_WIDTH, y: y(valueOf(last)) });
    }
    return points;
  };
  const forecast: TimelineBand | null = hours.some((hour) => hour.hi > 0)
    ? {
        band: [...forecastLine((hour) => hour.hi), ...forecastLine((hour) => hour.lo).reverse()],
        mid: forecastLine((hour) => hour.mw),
      }
    : null;

  const days: TimelineDaySpan[] = [];
  for (const column of columns) {
    const last = days.at(-1);
    if (last && last.dayIndex === column.dayIndex) {
      last.columns += 1;
      continue;
    }
    const context = dayContext(column.dayIndex);
    days.push({
      dayIndex: column.dayIndex,
      label: `ROK ${context.year} · ${context.monthName} · ${context.dayLabel}`,
      columns: 1,
    });
  }

  const blockOf = (absTurn: number): TimelineBlock | null => {
    const column = columns.find((candidate) => candidate.absTurn === absTurn);
    return column ? { x: column.x, width: column.width } : null;
  };
  const currentBlock = blockOf(range.pendingTurn);
  const nowX = currentBlock === null ? null : currentBlock.x;
  const nowLabelX = round01((nowX ?? 0) + 6);

  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    scaleMw,
    gridX: columns.slice(1).map((column) => column.x),
    dayGridX: columns
      .slice(1)
      .filter((column) => column.turnIndex === 0)
      .map((column) => column.x),
    nowX,
    currentBlock,
    selectedBlock: blockOf(range.selectedTurn),
    cells: columns.map((column) => ({
      absTurn: column.absTurn,
      dayIndex: column.dayIndex,
      turnIndex: column.turnIndex,
      name: dayTurnAt(column.turnIndex).name,
      hours: dayTurnAt(column.turnIndex).hours,
      state: column.state,
      selected: column.absTurn === range.selectedTurn,
      x: column.x,
      width: column.width,
    })),
    days,
    areas,
    demandLine: blockLine((digest) => digest.totals.demandMw),
    pastForecast,
    forecast,
    range,
    caption: { x: 8, y: 14, text: "OŚ CZASU · POPYT vs POKRYCIE [MW]" },
    // The chart has no vertical axis (handoff), so the scale is printed: without
    // it the layers show proportions and hide every absolute number.
    scaleLabel: { x: CHART_WIDTH - 8, y: 14, text: formatMw(scaleMw) },
    nowLabel: { x: nowLabelX, y: nowLabelX < CAPTION_RESERVED_X ? 28 : 14, text: "TERAZ" },
    // The full key, always: it is what the colours MEAN, not a summary of the
    // window — and read from the bottom up it is the merit order itself.
    legend: TIMELINE_LAYERS.map((layer) => ({ label: layer.label, color: layer.color })),
    note: "— PRAWDA · ┄ PROGNOZA (PASMO)",
  };
}
