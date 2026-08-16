// The save layer (M9): the autosave slot, the save file and the store hooks
// that drive them. Everything runs on the in-memory slot — IndexedDB is the
// production backing store, not part of the contract.

import { beforeEach, describe, expect, test } from "vitest";
import { STATE_SCHEMA_VERSION, newGame, type GameState } from "../../../src/engine";
import { clearSave, loadGame, saveGame, setSaveStorage } from "../../../src/app/save/autosave";
import { readSaveFile, saveFileName, saveFileText } from "../../../src/app/save/file";
import { memoryStorage } from "../../../src/app/save/storage";
import { DEFAULT_SEED, seedIsPinned, useGameStore } from "../../../src/app/store/gameStore";
import { stateHash } from "../../helpers/hash";
import { playTurns, runTurns } from "../../helpers/run";

beforeEach(() => {
  setSaveStorage(memoryStorage());
});

describe("autosave slot", () => {
  test("an empty slot has nothing to continue", async () => {
    expect(await loadGame()).toBeNull();
  });

  test("save → load returns the very same state", async () => {
    const state = playTurns(2026, 5);
    expect(await saveGame(state)).toBe(true);

    const result = await loadGame();
    expect(result?.ok).toBe(true);
    if (result?.ok) expect(result.state).toStrictEqual(state);
  });

  test("a loaded save continues exactly like an uninterrupted session", async () => {
    const original = playTurns(777, 5);
    await saveGame(original);

    const result = await loadGame();
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    expect(stateHash(runTurns(result.state, 19))).toBe(stateHash(runTurns(original, 19)));
  });

  test("a slot holding something else fails as a domain error", async () => {
    setSaveStorage(memoryStorage({ hello: "world" }));

    const result = await loadGame();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.error.code).toBe("notASave");
  });

  test("clearSave empties the slot", async () => {
    await saveGame(newGame(1));
    await clearSave();
    expect(await loadGame()).toBeNull();
  });

  test("a storage that refuses to write does not break the turn", async () => {
    setSaveStorage({
      read: () => Promise.reject(new Error("denied")),
      write: () => Promise.reject(new Error("denied")),
      clear: () => Promise.reject(new Error("denied")),
    });

    expect(await saveGame(newGame(1))).toBe(false);
    expect(await loadGame()).toBeNull();
    await expect(clearSave()).resolves.toBeUndefined();
  });
});

describe("save file", () => {
  test("the name carries the local date of the export", () => {
    expect(saveFileName(new Date(2026, 7, 16, 23, 30))).toBe("electronation-save-2026-08-16.json");
    expect(saveFileName(new Date(2027, 0, 3))).toBe("electronation-save-2027-01-03.json");
  });

  test("a written file reads back as the same state", async () => {
    const state = playTurns(9, 4);
    const file = new Blob([saveFileText(state)], { type: "application/json" });

    const result = await readSaveFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toStrictEqual(state);
  });

  test("a foreign file is rejected with a domain error", async () => {
    const result = await readSaveFile(new Blob(["<html></html>"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("notASave");
  });
});

describe("store hooks", () => {
  beforeEach(() => {
    useGameStore.getState().restart(DEFAULT_SEED);
    setSaveStorage(memoryStorage());
  });

  test("a URL that names a seed asks for that session, not the autosave", () => {
    expect(seedIsPinned("?seed=42")).toBe(true);
    expect(seedIsPinned("?other=1")).toBe(false);
    expect(seedIsPinned("")).toBe(false);
  });

  test("resolving a turn writes the slot", async () => {
    useGameStore.getState().resolve();
    const game = useGameStore.getState().game;

    const result = await loadGame();
    expect(result?.ok).toBe(true);
    if (result?.ok) expect(result.state).toStrictEqual(game);
  });

  test("hydrate() continues the stored session", async () => {
    const stored = playTurns(2026, 9);
    await saveGame(stored);

    await useGameStore.getState().hydrate();

    expect(useGameStore.getState().game).toStrictEqual(stored);
    expect(useGameStore.getState().saveNotice).toBeNull();
  });

  test("hydrate() on an empty slot leaves the fresh session standing", async () => {
    const before = useGameStore.getState().game;
    await useGameStore.getState().hydrate();
    expect(useGameStore.getState().game).toBe(before);
  });

  test("hydrate() keeps playing when the slot cannot be read, and says why", async () => {
    setSaveStorage(memoryStorage({ schema: STATE_SCHEMA_VERSION + 1, seed: 1 }));
    const before = useGameStore.getState().game;

    await useGameStore.getState().hydrate();

    expect(useGameStore.getState().game).toBe(before);
    expect(useGameStore.getState().saveNotice).toEqual({
      kind: "error",
      error: { code: "futureSchema", schema: STATE_SCHEMA_VERSION + 1 },
    });
  });

  test("a new game overwrites the autosave", async () => {
    useGameStore.getState().resolve();
    useGameStore.getState().restart(99);

    const result = await loadGame();
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.state.seed).toBe(99);
      expect(result.state.calendar).toEqual({ dayIndex: 0, turnIndex: 0 });
    }
  });

  test("importSave() takes over the file's state and autosaves it", async () => {
    const imported: GameState = playTurns(4242, 6);
    await useGameStore.getState().importSave(new Blob([saveFileText(imported)]));

    expect(useGameStore.getState().game).toStrictEqual(imported);
    expect(useGameStore.getState().saveNotice).toEqual({ kind: "loaded" });

    const result = await loadGame();
    expect(result?.ok).toBe(true);
    if (result?.ok) expect(result.state).toStrictEqual(imported);
  });

  test("importSave() on a foreign file changes nothing but the notice", async () => {
    const before = useGameStore.getState().game;
    await useGameStore.getState().importSave(new Blob(["nie zapis"]));

    expect(useGameStore.getState().game).toBe(before);
    expect(useGameStore.getState().saveNotice).toEqual({
      kind: "error",
      error: { code: "notASave" },
    });
  });
});
