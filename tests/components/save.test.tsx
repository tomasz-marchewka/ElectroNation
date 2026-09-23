// The session bar (M9), the GRA section of OPCJE GRY: the three actions that
// are not the turn loop — new game, save to file, load from file — and the
// diagnosis a rejected file gets.

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../../src/app/App";
import { saveFileText } from "../../src/app/save/file";
import { DEFAULT_SEED, useGameStore } from "../../src/app/store/gameStore";
import { useThemeStore } from "../../src/app/store/themeStore";
import { playTurns } from "../helpers/run";

beforeEach(() => {
  useGameStore.getState().restart(DEFAULT_SEED);
  useThemeStore.getState().setTheme("dark");
});

/** The session actions live in OPCJE GRY; the top bar opens it. */
async function openOptions(): Promise<void> {
  await userEvent.click(screen.getByText("OPCJE GRY"));
}

function filePicker(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(".en-sessionbar__file");
  if (!input) throw new Error("missing file picker");
  return input;
}

describe("session bar", () => {
  test("carries the three session actions and none of them is primary", async () => {
    const { container } = render(<App />);
    await openOptions();

    expect(screen.getByText("NOWA GRA")).toBeDefined();
    expect(screen.getByText("ZAPISZ DO PLIKU")).toBeDefined();
    expect(screen.getByText("WCZYTAJ Z PLIKU")).toBeDefined();
    // The options stand in for the dispatcher panel, which holds the screen's
    // one primary action; nothing in their place claims that role.
    expect(container.querySelectorAll(".en-btn:not(.en-btn--ghost)")).toHaveLength(0);
  });

  test("NOWA GRA states the cost and starts over only once confirmed", async () => {
    render(<App />);
    act(() => useGameStore.getState().resolve());
    expect(useGameStore.getState().game.calendar.turnIndex).toBe(1);

    await openOptions();
    await userEvent.click(screen.getByText("NOWA GRA"));
    expect(screen.getByText("NOWA GRA NADPISUJE AUTOZAPIS")).toBeDefined();
    expect(useGameStore.getState().game.calendar.turnIndex).toBe(1);

    await userEvent.click(screen.getByText("POTWIERDŹ ✓"));
    expect(useGameStore.getState().game.calendar).toEqual({ dayIndex: 0, turnIndex: 0 });
    // Starting over means playing: the options step aside for the dispatcher panel.
    expect(screen.queryByText("NOWA GRA")).toBeNull();
    expect(screen.getByText("ZATWIERDŹ TURĘ ▸")).toBeDefined();
  });

  test("ANULUJ backs out of the new game", async () => {
    render(<App />);
    act(() => useGameStore.getState().resolve());

    await openOptions();
    await userEvent.click(screen.getByText("NOWA GRA"));
    await userEvent.click(screen.getByText("ANULUJ ✕"));

    expect(useGameStore.getState().game.calendar.turnIndex).toBe(1);
    expect(screen.queryByText("NOWA GRA NADPISUJE AUTOZAPIS")).toBeNull();
  });
});

describe("loading a file", () => {
  test("a picked save takes over the session", async () => {
    const saved = playTurns(2026, 6);
    const { container } = render(<App />);
    await openOptions();

    await userEvent.upload(
      filePicker(container),
      new File([saveFileText(saved)], "electronation-save-2026-08-16.json", {
        type: "application/json",
      }),
    );

    expect(useGameStore.getState().game).toStrictEqual(saved);
    expect(await screen.findByText("✓ ZAPIS WCZYTANY")).toBeDefined();
  });

  test("a foreign file is refused with a diagnosis, and the session plays on", async () => {
    const { container } = render(<App />);
    await openOptions();
    const before = useGameStore.getState().game;

    // The picker's `accept` already keeps most files out of the dialog, so the
    // case worth covering is a .json that holds something else.
    await userEvent.upload(
      filePicker(container),
      new File(["<html></html>"], "strona.json", { type: "application/json" }),
    );

    expect(await screen.findByText("✕ PLIK NIE JEST ZAPISEM ELECTRONATION")).toBeDefined();
    expect(useGameStore.getState().game).toBe(before);
  });
});

describe("saving to a file", () => {
  const createObjectURL = vi.fn(() => "blob:save");
  const revokeObjectURL = vi.fn();
  let downloaded: { name: string; clicked: boolean } | null = null;

  beforeEach(() => {
    downloaded = null;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    // jsdom implements neither object URLs nor downloads; the test watches the
    // anchor the browser would have followed.
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded = { name: this.download, clicked: true };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  test("ZAPISZ DO PLIKU hands the state to the browser as a dated file", async () => {
    render(<App />);
    await openOptions();
    await userEvent.click(screen.getByText("ZAPISZ DO PLIKU"));

    expect(downloaded?.clicked).toBe(true);
    expect(downloaded?.name).toMatch(/^electronation-save-\d{4}-\d{2}-\d{2}\.json$/);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:save");
  });
});
