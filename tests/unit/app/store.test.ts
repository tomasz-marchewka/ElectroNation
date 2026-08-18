// The state bridge holds a GameState and mutates it only through the engine.

import { beforeEach, describe, expect, test } from "vitest";
import { STATE_SCHEMA_VERSION, TURNS_PER_DAY } from "../../../src/engine";
import { DEFAULT_SEED, seedFromSearch, useGameStore } from "../../../src/app/store/gameStore";
import { timelineRange } from "../../../src/app/timeline/timeline";
import { DEFAULT_THEME, otherTheme, parseTheme } from "../../../src/app/store/themeStore";

describe("seedFromSearch", () => {
  test("takes the seed off the URL, falling back to the default", () => {
    expect(seedFromSearch("?seed=42")).toBe(42);
    expect(seedFromSearch("?other=1")).toBe(DEFAULT_SEED);
    expect(seedFromSearch("")).toBe(DEFAULT_SEED);
  });

  test("a non-numeric or fractional seed never reaches the engine", () => {
    expect(seedFromSearch("?seed=abc")).toBe(DEFAULT_SEED);
    expect(seedFromSearch("?seed=7.9")).toBe(7);
  });
});

describe("gameStore", () => {
  beforeEach(() => {
    useGameStore.getState().restart(DEFAULT_SEED);
  });

  test("starts a session on the seeded engine state", () => {
    const { game } = useGameStore.getState();
    expect(game.schema).toBe(STATE_SCHEMA_VERSION);
    expect(game.seed).toBe(DEFAULT_SEED);
    expect(game.calendar).toEqual({ dayIndex: 0, turnIndex: 0 });
    expect(game.lastTurnReport).toBeNull();
  });

  test("resolve() runs the engine turn: calendar advances, report appears", () => {
    const before = useGameStore.getState().game;
    useGameStore.getState().resolve();
    const after = useGameStore.getState().game;

    expect(after).not.toBe(before);
    expect(before.lastTurnReport).toBeNull();
    expect(after.calendar.turnIndex).toBe(1);
    expect(after.lastTurnReport).not.toBeNull();
    // The report's money delta is exactly what hit the budget (M1 contract).
    expect(after.moneyPln).toBe(before.moneyPln + (after.lastTurnReport?.finance.netPln ?? 0));
  });

  test("a full day of resolutions rolls the calendar to the next day", () => {
    for (let i = 0; i < TURNS_PER_DAY; i++) useGameStore.getState().resolve();
    expect(useGameStore.getState().game.calendar).toEqual({ dayIndex: 1, turnIndex: 0 });
  });

  test("dispatch() goes through applyAction and leaves the input untouched", () => {
    const before = useGameStore.getState().game;
    const plant = before.plants[0];
    expect(plant).toBeDefined();

    useGameStore.getState().dispatch({
      type: "setPlantSetpoint",
      plantId: plant?.id ?? "",
      mw: 123,
    });

    expect(useGameStore.getState().game.plants[0]?.setpointMw).toBe(123);
    expect(before.plants[0]?.setpointMw).not.toBe(123);
  });

  test("skip() scrubs and remembers why it stopped (01 §2.5)", () => {
    // The starting endowment sits at 0 MW, so the first turn is a shortfall.
    useGameStore.getState().skip();
    const { game, skipStop } = useGameStore.getState();

    expect(game.calendar.turnIndex).toBe(1);
    expect(skipStop?.kind).toBe("shortfall");
    expect(skipStop?.turnIndex).toBe(0);
    // A hand-committed turn is not a scrub: the diagnosis goes with it.
    useGameStore.getState().resolve();
    expect(useGameStore.getState().skipStop).toBeNull();
  });

  test("resolveUntilTurn() runs the turns in between and clears the diagnosis", () => {
    useGameStore.getState().skip();
    useGameStore.getState().resolveUntilTurn(6);

    const { game, skipStop } = useGameStore.getState();
    expect(game.calendar).toEqual({ dayIndex: 0, turnIndex: 6 });
    expect(game.history).toHaveLength(6);
    expect(skipStop).toBeNull();
  });

  test("reading a turn on the ribbon changes nothing about the world (01 §2.5)", () => {
    useGameStore.getState().resolve();
    useGameStore.getState().resolve();
    const before = useGameStore.getState().game;

    useGameStore.getState().selectTurn(0);
    expect(useGameStore.getState().game).toBe(before);
    expect(useGameStore.getState().selectedTurn).toBe(0);

    // Time moving forward brings the ribbon back to now, every way it can move.
    useGameStore.getState().resolve();
    expect(useGameStore.getState().selectedTurn).toBeNull();
    useGameStore.getState().selectTurn(1);
    useGameStore.getState().skip();
    expect(useGameStore.getState().selectedTurn).toBeNull();
  });

  test("the ribbon scrolls by deltas and stops at its bounds", () => {
    for (let turn = 0; turn < 12; turn++) useGameStore.getState().resolve();
    const store = () => useGameStore.getState();
    const window = () =>
      timelineRange(store().game, { from: store().timelineFrom, selected: store().selectedTurn });
    const start = window().from;

    // Two steps in a row are two turns, even without a render in between.
    store().scrollTimeline(-1);
    store().scrollTimeline(-1);
    expect(window().from).toBe(start - 2);

    // Past the ends it clamps instead of running off the archive.
    store().scrollTimeline(-999);
    expect(window().from).toBe(window().minFrom);
    store().scrollTimeline(999);
    expect(window().from).toBe(window().maxFrom);

    store().showNow();
    expect(store().timelineFrom).toBeNull();
    expect(window().from).toBe(start);
  });

  test("restart(seed) starts a new session and clears the selection", () => {
    useGameStore.getState().selectHex({ q: 3, r: 4 });
    useGameStore.getState().skip();
    useGameStore.getState().restart(99);

    const { game, selectedHex, skipStop } = useGameStore.getState();
    expect(game.seed).toBe(99);
    expect(game.calendar).toEqual({ dayIndex: 0, turnIndex: 0 });
    expect(game.history).toStrictEqual([]);
    expect(selectedHex).toBeNull();
    expect(skipStop).toBeNull();
  });
});

describe("themeStore helpers", () => {
  test("only the two known themes survive parsing", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme("neon")).toBe(DEFAULT_THEME);
  });

  test("dark is the default and the two themes toggle into each other", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(otherTheme("dark")).toBe("light");
    expect(otherTheme("light")).toBe("dark");
  });
});
