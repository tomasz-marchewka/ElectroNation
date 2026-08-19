// The time ribbon's model (01 §8 pt 2). Snapshots pin the geometry; the
// assertions around them pin the things a snapshot cannot argue about: which
// turns a window may show, where the archive ends and the forecast begins, and
// that eight columns are built whatever the length of the history.

import { describe, expect, test } from "vitest";
import {
  COVERAGE_LAYERS,
  TURNS_PER_DAY,
  applyAction,
  digestAt,
  forecastHorizonTurns,
  newGame,
  projectTurnCoverage,
  resolveTurn,
  type GameState,
} from "../../../src/engine";
import {
  TIMELINE_LAYERS,
  WINDOW_TURNS,
  buildTimeline,
  timelineRange,
} from "../../../src/app/timeline/timeline";
import { makeScenario } from "../../helpers/scenario";

/** A day played out with the plant running, so every layer has something in it. */
function played(turns: number, seed = 7): GameState {
  let state = applyAction(newGame(seed, makeScenario()), {
    type: "setPlantSetpoint",
    plantId: "plant-1",
    mw: 300,
  });
  for (let turn = 0; turn < turns; turn++) state = resolveTurn(state);
  return state;
}

const ribbon = (state: GameState, from: number | null = null, selected: number | null = null) =>
  buildTimeline(state, { from, selected });

describe("01 §8 pt 2: the window is eight turns, wherever it stands", () => {
  test("a fresh session shows the day it is about to play", () => {
    const model = ribbon(newGame(7, makeScenario()));

    expect(model.cells).toHaveLength(WINDOW_TURNS);
    expect(model.cells.map((cell) => cell.absTurn)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(model.cells[0]?.state).toBe("current");
    expect(model.cells.slice(1).every((cell) => cell.state === "future")).toBe(true);
    // Nothing resolved yet: no coverage, no truth line, forecast alone — and
    // nothing set either, so the plan draws nothing rather than drawing zero.
    expect(model.areas).toStrictEqual([]);
    expect(model.demandLine).toStrictEqual([]);
    expect(model.plannedAreas).toStrictEqual([]);
    expect(model.forecast).not.toBeNull();
    expect(model.nowX).toBe(0);
  });

  test("eight columns are built however long the archive is", () => {
    const long = played(3 * TURNS_PER_DAY);
    expect(long.history.length).toBe(3 * TURNS_PER_DAY);
    expect(ribbon(long).cells).toHaveLength(WINDOW_TURNS);
    expect(ribbon(long, 0).cells).toHaveLength(WINDOW_TURNS);
    expect(ribbon(long, 0).cells.map((cell) => cell.absTurn)).toStrictEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  test("the window straddles a day boundary and captions both days", () => {
    const state = played(TURNS_PER_DAY + 2);
    const model = ribbon(state, TURNS_PER_DAY - 3);

    expect(model.days.map((day) => day.dayIndex)).toStrictEqual([0, 1]);
    expect(model.days.map((day) => day.columns)).toStrictEqual([3, 5]);
    expect(model.days[0]?.label).toBe("ROK 1 · STYCZEŃ · DOBA ROBOCZA A");
    expect(model.days[1]?.label).toBe("ROK 1 · STYCZEŃ · DOBA ROBOCZA B");
    // A stronger divider marks where one day ends and the next begins.
    expect(model.dayGridX).toHaveLength(1);
    expect(model.dayGridX[0]).toBe(model.cells[3]?.x);
  });
});

describe("01 §2.5: how far the ribbon may be pushed", () => {
  test("back to the first turn ever played, forward to the horizon", () => {
    const state = played(TURNS_PER_DAY + 3);
    const range = timelineRange(state, { from: null, selected: null });

    expect(range.pendingTurn).toBe(TURNS_PER_DAY + 3);
    expect(range.minFrom).toBe(0);
    expect(range.lastTurn).toBe(range.pendingTurn + forecastHorizonTurns(state) - 1);
    expect(range.maxFrom).toBe(range.lastTurn - WINDOW_TURNS + 1);
    // Out-of-bounds scrolling is clamped, never rejected.
    expect(timelineRange(state, { from: -50, selected: null }).from).toBe(range.minFrom);
    expect(timelineRange(state, { from: 9_999, selected: null }).from).toBe(range.maxFrom);
  });

  test("a better forecast system pushes the far end further out (01 §2.4)", () => {
    const basic = played(4);
    const advanced = applyAction(basic, { type: "buyForecastSystem", level: "advanced" });
    const reach = (state: GameState) =>
      timelineRange(state, { from: null, selected: null }).lastTurn;

    expect(reach(advanced) - reach(basic)).toBe(2 * TURNS_PER_DAY);
    expect(forecastHorizonTurns(advanced)).toBe(3 * TURNS_PER_DAY);
  });

  test("the default selection is the last resolved turn", () => {
    const state = played(5);
    expect(timelineRange(state, { from: null, selected: null }).selectedTurn).toBe(4);
    expect(timelineRange(state, { from: null, selected: 1 }).selectedTurn).toBe(1);
  });
});

describe("01 §8 pt 2: behind TERAZ the archive, ahead of it the plan", () => {
  test("coverage comes from the digests, layer for layer", () => {
    const state = played(4);
    const model = ribbon(state);

    expect(model.cells.filter((cell) => cell.state === "past")).toHaveLength(4);
    expect(model.demandLine).toHaveLength(8); // two points per resolved block
    for (const area of model.areas) {
      expect(COVERAGE_LAYERS).toContain(area.key);
      expect(area.color).toBe(TIMELINE_LAYERS.find((layer) => layer.key === area.key)?.color);
    }
    // Every layer drawn carries energy in at least one of the resolved turns.
    const drawn = new Set(model.areas.map((area) => area.key));
    for (const [index, layer] of COVERAGE_LAYERS.entries()) {
      const energy = state.history.reduce(
        (sum, digest) => sum + (digest.coverageMw[index] ?? 0),
        0,
      );
      expect(drawn.has(layer)).toBe(energy > 0);
    }
  });

  test("ahead of TERAZ the same layers carry the plan at the current setpoints", () => {
    const state = played(3);
    const model = ribbon(state);
    const plan = projectTurnCoverage(state, 0, state.calendar.turnIndex);
    const gas = model.plannedAreas.find((area) => area.key === "gas");

    // The plant runs at 300 MW, so the gas layer is what the plan promises —
    // stacked from the bottom, on the same scale as the truth behind TERAZ.
    expect(plan?.coverageMw[COVERAGE_LAYERS.indexOf("gas")]).toBe(300);
    expect(gas).toBeDefined();
    expect(gas?.color).toBe(TIMELINE_LAYERS.find((layer) => layer.key === "gas")?.color);
    expect(gas?.points[0]?.y).toBeCloseTo(130 - (300 / model.scaleMw) * 130, 0);

    // A plan never reaches back over a resolved turn: the archive owns those.
    const nowX = model.nowX;
    expect(nowX).not.toBeNull();
    for (const area of model.plannedAreas) {
      for (const point of area.points) expect(point.x).toBeGreaterThanOrEqual(nowX ?? 0);
    }
  });

  test("a window entirely behind TERAZ has no forecast, and one ahead has no truth", () => {
    const state = played(2 * TURNS_PER_DAY);
    const behind = ribbon(state, 0);
    expect(behind.forecast).toBeNull();
    expect(behind.plannedAreas).toStrictEqual([]);
    expect(behind.nowX).toBeNull();
    expect(behind.currentBlock).toBeNull();
    expect(behind.areas.length).toBeGreaterThan(0);

    const ahead = ribbon(state, state.history.length);
    expect(ahead.areas).toStrictEqual([]);
    expect(ahead.demandLine).toStrictEqual([]);
    expect(ahead.plannedAreas.length).toBeGreaterThan(0);
    expect(ahead.forecast).not.toBeNull();
  });

  test("the vertical scale follows the window, not the whole game", () => {
    const state = played(2 * TURNS_PER_DAY);
    for (const from of [0, TURNS_PER_DAY]) {
      const model = ribbon(state, from);
      const peak = Math.max(
        ...model.cells
          .map((cell) => digestAt(state.history, cell.absTurn))
          .map((digest) => digest?.totals.demandMw ?? 0),
      );
      expect(model.scaleMw).toBeGreaterThanOrEqual(peak);
      expect(model.scaleMw % 100).toBe(0);
    }
  });
});

describe("the model is the whole drawing", () => {
  test("a window over resolved turns", () => {
    expect(ribbon(played(TURNS_PER_DAY), 0, 2)).toMatchSnapshot();
  });

  test("a window straddling TERAZ: truth behind it, the plan ahead of it", () => {
    expect(ribbon(played(4))).toMatchSnapshot();
  });

  test("a fresh day: the forecast alone", () => {
    expect(ribbon(newGame(7, makeScenario()))).toMatchSnapshot();
  });
});
