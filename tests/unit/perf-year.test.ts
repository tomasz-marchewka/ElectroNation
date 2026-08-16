import { describe, expect, test } from "vitest";
import { DAYS_PER_MONTH, TURNS_PER_DAY, resolveTurn, type GameState } from "../../src/engine";
import { armedState } from "../helpers/perfPortfolio";

// Performance tripwire (plan M10 §4). Not a benchmark: the point is that a
// year of play stays LINEAR in turns. An accidental O(n²) in the flow, in the
// report or in the day roll-over would blow the budget by an order of
// magnitude, which is exactly what this catches.

const YEAR_TURNS = 36 * TURNS_PER_DAY; // 288 turns = 36 game days (01 §2.1)

/**
 * Budget for one game year [ms]. Measured on the machine this was written on
 * (Apple M-series, Node 22): 38 ms median of five runs, 57 ms for the first,
 * cold one. The plan asks for the measurement ×3; the budget below is ×5 of the
 * cold figure, because a CI runner is slower than a laptop and a tripwire that
 * fires on hardware would be worse than no tripwire. An O(n²) regression costs
 * an order of magnitude, not a factor of two, so the margin does not blunt it —
 * and the second test below watches the shape regardless of the machine.
 */
const YEAR_BUDGET_MS = 300;

describe("plan M10 §4: a game year of the real map stays within its time budget", () => {
  test(`${YEAR_TURNS} turns on map v1 with a mid-game portfolio`, () => {
    const state = armedState();
    const started = performance.now();
    let played = state;
    for (let turn = 0; turn < YEAR_TURNS; turn++) played = resolveTurn(played);
    const elapsedMs = performance.now() - started;

    // The run has to be a real one, or the budget would measure nothing.
    expect(played.calendar.dayIndex).toBe(YEAR_TURNS / TURNS_PER_DAY);
    expect(played.lastTurnReport?.totals.deliveredMw).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(YEAR_BUDGET_MS);
  });

  test("the cost per turn does not grow with the calendar (no O(n²) in the loop)", () => {
    const state = armedState();
    const timeMonth = (from: GameState): { ms: number; state: GameState } => {
      const started = performance.now();
      let played = from;
      for (let turn = 0; turn < DAYS_PER_MONTH * TURNS_PER_DAY; turn++)
        played = resolveTurn(played);
      return { ms: performance.now() - started, state: played };
    };

    // Warm the JIT on the first month, then compare an early month with a late
    // one: state grows (city counters, reports), the work per turn must not.
    let cursor = timeMonth(state).state;
    const early = timeMonth(cursor);
    cursor = early.state;
    for (let month = 0; month < 8; month++) cursor = timeMonth(cursor).state;
    const late = timeMonth(cursor);

    // Generous factor: this is a shape check on a millisecond-scale measurement,
    // not a claim about the constant.
    expect(late.ms).toBeLessThan(Math.max(early.ms * 4, 20));
  });
});
