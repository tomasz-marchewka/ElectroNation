// The state bridge holds a GameState and mutates it only through the engine.

import { beforeEach, describe, expect, test } from "vitest";
import { STATE_SCHEMA_VERSION, TURNS_PER_DAY } from "../../../src/engine";
import { DEFAULT_SEED, seedFromSearch, useGameStore } from "../../../src/app/store/gameStore";
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

  test("restart(seed) starts a new session and clears the selection", () => {
    useGameStore.getState().selectHex({ q: 3, r: 4 });
    useGameStore.getState().resolve();
    useGameStore.getState().restart(99);

    const { game, selectedHex } = useGameStore.getState();
    expect(game.seed).toBe(99);
    expect(game.calendar).toEqual({ dayIndex: 0, turnIndex: 0 });
    expect(selectedHex).toBeNull();
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
