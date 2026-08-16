// The day chart's model (01 §8 pt 2): what the renderer is handed. Snapshots
// cover the model, never the SVG (CLAUDE.md); every number in it traces back to
// a turn report or to the engine's forecast.

import { describe, expect, test } from "vitest";
import {
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  applyAction,
  cityDemandForecast,
  finishedLine,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type HexCoord,
  type Scenario,
} from "../../../src/engine";
import {
  CHART_WIDTH,
  DAY_CHART_LAYERS,
  buildDayChart,
  type ChartPoint,
  type DayChartModel,
} from "../../../src/app/chart/dayChart";
import { makeScenario } from "../../helpers/scenario";

/** Hex `q` of a straight axial row — the line every object of the fixture taps. */
function at(q: number): HexCoord {
  return { q, r: 0 };
}

/**
 * One city fed over a single MV line that runs through every kind of source the
 * doc's layer list names: nuclear, coal, gas, wind, PV, storage and a border
 * point. A line crossing an object's hex taps it (01 §3.3), so the whole
 * fixture is one connected grid.
 */
const LAYERS_SCENARIO: Scenario = makeScenario({
  cities: [
    {
      id: "city-a",
      name: "A",
      hex: at(8),
      connected: true,
      households: 80_000,
      firms: 6_900,
      householdsStart: 80_000,
      firmsStart: 6_900,
      connectedSinceDay: 0,
      monthDemandMwh: 0,
      monthDeliveredMwh: 0,
    },
  ],
  plants: [
    { id: "plant-nuclear", name: "EJ", hex: at(0), tech: "nuclear", capacityMw: 20, setpointMw: 0 },
    { id: "plant-coal", name: "EW", hex: at(1), tech: "coal", capacityMw: 20, setpointMw: 0 },
    { id: "plant-gas", name: "EC", hex: at(2), tech: "ccgt", capacityMw: 20, setpointMw: 0 },
  ],
  farms: [
    {
      id: "farm-wind",
      name: "FW",
      hex: at(3),
      tech: "wind",
      capacityMw: 30,
      enabled: true,
      windClass: "open",
      solarMultiplier: 1,
    },
    {
      id: "farm-pv",
      name: "FPV",
      hex: at(4),
      tech: "pv",
      capacityMw: 30,
      enabled: true,
      windClass: "open",
      solarMultiplier: 1,
    },
  ],
  storages: [
    {
      id: "storage-1",
      name: "BESS",
      hex: at(5),
      tech: "battery",
      powerMw: 20,
      capacityMwh: 400,
      socMwh: 400,
      setpoint: { mode: "discharge", mw: 10 },
    },
  ],
  borders: [
    {
      id: "border-1",
      name: "GR",
      hex: at(6),
      throughputMw: 500,
      importSetpointMw: 0,
      exportSetpointMw: 0,
    },
  ],
  lines: [finishedLine("line-1", "mv", [0, 1, 2, 3, 4, 5, 6, 7, 8].map(at))],
});

/**
 * Deliberately thin: the city peaks near 90 MW, so every layer above the free
 * ones has to be reached for before the import closes the balance. The flow
 * takes the cheapest path first (02 §4), which IS the merit order the chart
 * stacks bottom-up.
 */
const SETPOINTS: readonly Action[] = [
  { type: "setPlantSetpoint", plantId: "plant-nuclear", mw: 10 },
  { type: "setPlantSetpoint", plantId: "plant-coal", mw: 10 },
  { type: "setPlantSetpoint", plantId: "plant-gas", mw: 10 },
  { type: "setImport", borderId: "border-1", mw: 80 },
];

function playedDay(turns: number): GameState {
  let state = newGame(5, LAYERS_SCENARIO);
  for (const action of SETPOINTS) state = applyAction(state, action);
  for (let turn = 0; turn < turns; turn++) state = resolveTurn(state);
  return state;
}

function layerMw(model: DayChartModel, key: string): number {
  const index = DAY_CHART_LAYERS.findIndex((layer) => layer.key === key);
  return model.blocks.reduce((sum, block) => sum + (block.layersMw[index] ?? 0), 0);
}

/**
 * Point runs collapse into the very string the renderer feeds to `points=`, so
 * a snapshot diff stays readable instead of scrolling past a thousand braces.
 */
function snapshotOf(model: DayChartModel) {
  const path = (points: readonly ChartPoint[]): string =>
    points.map((point) => `${point.x},${point.y}`).join(" ");
  return {
    ...model,
    areas: model.areas.map((area) => ({ ...area, points: path(area.points) })),
    demandLine: path(model.demandLine),
    forecast: model.forecast && {
      band: path(model.forecast.band),
      mid: path(model.forecast.mid),
    },
  };
}

describe("01 §8 pt 2: coverage by technology, merit order from the bottom", () => {
  test("the layers are the doc's seven, bottom-up", () => {
    expect(DAY_CHART_LAYERS.map((layer) => layer.key)).toStrictEqual([
      "nuclear",
      "coal",
      "gas",
      "wind",
      "pv",
      "storage",
      "import",
    ]);
    // Every layer is its own colour: two of them sharing one would be a stack
    // that cannot be read (the handoff had storage and import on one token).
    expect(new Set(DAY_CHART_LAYERS.map((layer) => layer.color)).size).toBe(
      DAY_CHART_LAYERS.length,
    );
  });

  test("each block's layers add up to the coverage the reports recorded", () => {
    const state = playedDay(TURNS_PER_DAY - 1);
    const model = buildDayChart(state);

    expect(model.blocks).toHaveLength(TURNS_PER_DAY - 1);
    model.blocks.forEach((block, index) => {
      const report = state.dayReports[index];
      const usedMw = (report?.sources ?? []).reduce((sum, source) => sum + source.usedMw, 0);
      expect(block.layersMw.reduce((sum, mw) => sum + mw, 0)).toBeCloseTo(block.coverageMw, 3);
      expect(block.coverageMw).toBeCloseTo(usedMw, 3);
      expect(block.demandMw).toBe(report?.totals.demandMw);
    });
  });

  test("every layer of the fixture carries energy, each grouped by technology", () => {
    const model = buildDayChart(playedDay(TURNS_PER_DAY - 1));
    for (const layer of DAY_CHART_LAYERS) {
      expect({ layer: layer.key, mw: layerMw(model, layer.key) > 0 }).toStrictEqual({
        layer: layer.key,
        mw: true,
      });
    }
    // Only the layers that carry something are drawn, bottom layer first.
    expect(model.areas.map((area) => area.key)).toStrictEqual(
      DAY_CHART_LAYERS.map((layer) => layer.key),
    );
  });

  test("a block holds its 3 h average flat, and only its ends round off", () => {
    const model = buildDayChart(playedDay(2));
    const width = CHART_WIDTH / TURNS_PER_DAY;
    // Two points per block at the same height: the block's flat average, which
    // is what a turn is (01 §2.2) — the renderer may curve between the runs, it
    // may never tilt one.
    expect(model.demandLine).toHaveLength(4);
    expect(model.demandLine[0]?.y).toBe(model.demandLine[1]?.y);
    expect(model.demandLine[2]?.y).toBe(model.demandLine[3]?.y);
    // The run of the day squares off at both its ends: nothing precedes the
    // first turn, and past TERAZ there is no truth to lean toward.
    expect(model.demandLine[0]?.x).toBe(0);
    expect(model.demandLine[3]?.x).toBe(2 * width);
    // What is left open at the inner boundary is the rounding window, centred
    // on it — and never so wide that it eats the middle of either block.
    const opens = model.demandLine[1]?.x ?? 0;
    const closes = model.demandLine[2]?.x ?? 0;
    expect(opens).toBeGreaterThan(width / 2);
    expect(closes).toBeLessThan(1.5 * width);
    expect(closes - width).toBeCloseTo(width - opens, 6);
  });

  test("the whole day fits under the scale, and the scale is a round number", () => {
    const model = buildDayChart(playedDay(5));
    const peak = Math.max(
      ...model.blocks.map((block) => Math.max(block.coverageMw, block.demandMw)),
    );
    expect(model.scaleMw).toBeGreaterThanOrEqual(peak);
    expect(model.scaleMw % 100).toBe(0);
    expect(model.scaleLabel.text).toBe(`${model.scaleMw} MW`.replace(/\B(?=(\d{3})+(?!\d))/, " "));
  });

  test("model of the day's last turn", () => {
    expect(snapshotOf(buildDayChart(playedDay(TURNS_PER_DAY - 1)))).toMatchSnapshot();
  });
});

describe("01 §2.4 + 06 §8.6.4: what lies ahead is a band, never a line", () => {
  test("a fresh day draws the forecast alone", () => {
    const model = buildDayChart(newGame(5, LAYERS_SCENARIO));

    expect(model.blocks).toStrictEqual([]);
    expect(model.areas).toStrictEqual([]);
    expect(model.demandLine).toStrictEqual([]);
    expect(model.nowX).toBe(0);
    expect(model.forecast).not.toBeNull();
    // The key stays: it says what the colours mean, not what today happened to
    // burn — and read bottom-up it is the merit order itself.
    expect(model.legend).toHaveLength(DAY_CHART_LAYERS.length);
    expect(snapshotOf(model)).toMatchSnapshot();
  });

  test("the band is the engine's own demand forecast, hour by hour", () => {
    const state = playedDay(4);
    const model = buildDayChart(state);
    const hour = state.calendar.turnIndex * HOURS_PER_TURN;
    const point = cityDemandForecast(state, "city-a", hour);
    if (!point || !model.forecast) throw new Error("the pending day always has a forecast");

    const y = (mw: number) =>
      Math.round((model.height - (mw / model.scaleMw) * model.height) * 10) / 10;
    expect(model.forecast.mid[0]).toStrictEqual({ x: model.nowX, y: y(point.mw) });
    // Band edges bracket the middle: hi sits above it, lo below.
    expect(model.forecast.band[0]?.y).toBe(y(point.mw + point.bandMw));
    expect(model.forecast.band.at(-1)?.y).toBe(y(Math.max(0, point.mw - point.bandMw)));
    // 24 h of axis: the forecast runs from TERAZ to the right edge.
    expect(model.forecast.mid.at(-1)?.x).toBe(CHART_WIDTH);
  });

  test("TERAZ tracks the pending turn and highlights its block", () => {
    const model = buildDayChart(playedDay(6));
    expect(model.nowX).toBe((6 / TURNS_PER_DAY) * CHART_WIDTH);
    expect(model.currentBlock).toStrictEqual({
      x: model.nowX,
      width: CHART_WIDTH / TURNS_PER_DAY,
    });
    expect(model.gridX).toHaveLength(TURNS_PER_DAY - 1);
  });

  test("a finished day leaves the chart: its axis belongs to the new day", () => {
    const state = playedDay(TURNS_PER_DAY);
    // The history outlives the day it describes (WYNIK DOBY still reads it)…
    expect(state.dayReports).toHaveLength(TURNS_PER_DAY);
    expect(state.calendar).toStrictEqual({ dayIndex: 1, turnIndex: 0 });
    // …but the chart under the axis of the NEW day starts empty.
    expect(buildDayChart(state).blocks).toStrictEqual([]);
  });
});
