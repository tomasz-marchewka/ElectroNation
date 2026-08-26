// The dispatcher panel and the report strip (01 §2.3, §8). Behaviour and
// numbers are asserted against the engine state, never against pixels or
// against the constants of the handoff's reference build.

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { applyAction, newGame, type Action, type GameState, type Scenario } from "../../src/engine";
import { App } from "../../src/app/App";
import { formatMw, formatNumber, formatSignedMoneyPln } from "../../src/app/format";
import { DispatcherPanel } from "../../src/app/panel/DispatcherPanel";
import { DEFAULT_SEED, useGameStore } from "../../src/app/store/gameStore";
import { useThemeStore } from "../../src/app/store/themeStore";
import { makeScenario } from "../helpers/scenario";

const DISPATCH_SCENARIO: Scenario = makeScenario({
  farms: [
    {
      id: "farm-wind",
      name: "FW Grzbiet",
      hex: { q: 0, r: 1 },
      tech: "wind",
      capacityMw: 300,
      enabled: true,
      windClass: "open",
      solarMultiplier: 1,
    },
  ],
  storages: [
    {
      id: "storage-1",
      name: "BESS Polana",
      hex: { q: 1, r: 1 },
      tech: "battery",
      powerMw: 150,
      capacityMwh: 300,
      socMwh: 186,
      setpoint: { mode: "idle", mw: 0 },
    },
  ],
  borders: [
    {
      id: "border-1",
      name: "Granica Wschód",
      hex: { q: 2, r: 1 },
      throughputMw: 500,
      importSetpointMw: 0,
      exportSetpointMw: 0,
    },
  ],
});

function renderPanel(game: GameState) {
  const onAction = vi.fn<(action: Action) => void>();
  const onCommit = vi.fn();
  const onSkip = vi.fn();
  const onScrubTo = vi.fn<(turnIndex: number) => void>();
  const view = render(
    <DispatcherPanel
      game={game}
      onAction={onAction}
      onCommit={onCommit}
      onSkip={onSkip}
      onScrubTo={onScrubTo}
    />,
  );
  return { ...view, onAction, onCommit, onSkip, onScrubTo };
}

function slider(name: string): HTMLInputElement {
  return screen.getByLabelText(name) as HTMLInputElement;
}

function tileValue(container: HTMLElement, label: string): string {
  const tile = [...container.querySelectorAll(".en-tile")].find(
    (candidate) => candidate.querySelector(".en-tile__label")?.textContent === label,
  );
  return tile?.querySelector(".en-tile__value")?.textContent ?? "";
}

beforeEach(() => {
  useGameStore.getState().restart(DEFAULT_SEED);
  useThemeStore.getState().setTheme("dark");
});

describe("setpoints — every unit set by hand (01 §8 pt 4)", () => {
  test("a plant slider dispatches setPlantSetpoint and steps by 10 MW", () => {
    const { onAction } = renderPanel(newGame(7, DISPATCH_SCENARIO));
    const input = slider("P1");

    expect(input.step).toBe("10");
    expect(input.max).toBe("400");
    fireEvent.change(input, { target: { value: "250" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 250,
    });
  });

  test("the dead zone below the technical minimum snaps to min or off (01 §5.1 pt 4)", () => {
    const { onAction } = renderPanel(newGame(7, DISPATCH_SCENARIO));
    const input = slider("P1");

    // CCGT holds at least 30%: a 400 MW plant has no orders inside (0, 120).
    fireEvent.change(input, { target: { value: "100" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 120,
    });

    // The lower half of the gap means "off" — the plant already sits at zero,
    // so the snap dispatches nothing at all.
    onAction.mockClear();
    fireEvent.change(input, { target: { value: "50" } });
    expect(onAction).not.toHaveBeenCalled();
  });

  test("arrow down from the minimum jumps the dead zone and turns the unit off", () => {
    const running = applyAction(newGame(7, DISPATCH_SCENARIO), {
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 120,
    });
    const { onAction } = renderPanel(running);

    fireEvent.keyDown(slider("P1"), { key: "ArrowDown" });
    expect(onAction).toHaveBeenCalledWith({
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 0,
    });
  });

  test("arrow up from zero jumps the dead zone and lands on the minimum", () => {
    const { onAction } = renderPanel(newGame(7, DISPATCH_SCENARIO));

    fireEvent.keyDown(slider("P1"), { key: "ArrowUp" });
    expect(onAction).toHaveBeenCalledWith({
      type: "setPlantSetpoint",
      plantId: "plant-1",
      mw: 120,
    });
  });

  test("one bipolar slider dispatches the storage: zero in the middle (01 §5.3)", () => {
    const { onAction } = renderPanel(newGame(7, DISPATCH_SCENARIO));
    const input = slider("BESS POLANA");

    expect(screen.getByText("SOC 62%")).toBeDefined();
    expect(input.min).toBe("-150");
    expect(input.max).toBe("150");
    expect(input.step).toBe("10");

    fireEvent.change(input, { target: { value: "-100" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "setStorage",
      storageId: "storage-1",
      mode: "charge",
      mw: 100,
    });

    fireEvent.change(input, { target: { value: "100" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "setStorage",
      storageId: "storage-1",
      mode: "discharge",
      mw: 100,
    });
  });

  test("sliding back to the centre rests the storage", () => {
    const game = applyAction(newGame(7, DISPATCH_SCENARIO), {
      type: "setStorage",
      storageId: "storage-1",
      mode: "charge",
      mw: 100,
    });
    const { onAction } = renderPanel(game);

    fireEvent.change(slider("BESS POLANA"), { target: { value: "0" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "setStorage",
      storageId: "storage-1",
      mode: "idle",
      mw: 0,
    });
  });

  test("the mode buttons follow the slider and mark the current direction", () => {
    const game = applyAction(newGame(7, DISPATCH_SCENARIO), {
      type: "setStorage",
      storageId: "storage-1",
      mode: "charge",
      mw: 100,
    });
    renderPanel(game);

    expect(screen.getByRole("button", { name: "ŁADUJ" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "ODDAWAJ" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    // The direction is spelled out where the number is, so the slider does not
    // announce a bare "−100" to a screen reader.
    expect(slider("BESS POLANA").getAttribute("aria-valuetext")).toBe("ŁADUJ 100 / 150 MW");
    expect(screen.getByText("ŁADUJ 100 / 150 MW")).toBeDefined();
  });

  test("a mode button dispatches half rated power, STOP rests the storage", () => {
    const { onAction } = renderPanel(newGame(7, DISPATCH_SCENARIO));

    fireEvent.click(screen.getByRole("button", { name: "ŁADUJ" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "setStorage",
      storageId: "storage-1",
      mode: "charge",
      mw: 75,
    });

    fireEvent.click(screen.getByRole("button", { name: "ODDAWAJ" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "setStorage",
      storageId: "storage-1",
      mode: "discharge",
      mw: 75,
    });

    fireEvent.click(screen.getByRole("button", { name: "STOP" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "setStorage",
      storageId: "storage-1",
      mode: "idle",
      mw: 0,
    });
  });

  test("a storage at rest keeps no direction, whatever the state carries", () => {
    const game = applyAction(newGame(7, DISPATCH_SCENARIO), {
      type: "setStorage",
      storageId: "storage-1",
      mode: "discharge",
      mw: 0,
    });
    renderPanel(game);

    expect(screen.getByRole("button", { name: "STOP" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "ODDAWAJ" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(slider("BESS POLANA").value).toBe("0");
  });

  test("import and export get a slider each (01 §5.7)", () => {
    const { onAction } = renderPanel(newGame(7, DISPATCH_SCENARIO));

    fireEvent.change(slider("IMPORT GRANICA WSCHÓD"), { target: { value: "200" } });
    expect(onAction).toHaveBeenCalledWith({ type: "setImport", borderId: "border-1", mw: 200 });

    fireEvent.change(slider("EKSPORT GRANICA WSCHÓD"), { target: { value: "50" } });
    expect(onAction).toHaveBeenCalledWith({ type: "setExport", borderId: "border-1", mw: 50 });
  });

  test("switching a farm off drops it out of the forecast band entirely", async () => {
    const game = newGame(7, DISPATCH_SCENARIO);
    const { onAction, rerender } = renderPanel(game);
    const windRow = screen.getByText("WIATR").parentElement;
    expect(windRow?.textContent).toMatch(/±/);

    await userEvent.click(screen.getByRole("button", { name: "FW GRZBIET" }));
    const action = onAction.mock.calls[0]?.[0];
    expect(action).toEqual({ type: "setFarmEnabled", farmId: "farm-wind", enabled: false });

    rerender(
      <DispatcherPanel
        game={applyAction(game, action!)}
        onAction={onAction}
        onCommit={vi.fn()}
        onSkip={vi.fn()}
        onScrubTo={vi.fn()}
      />,
    );
    expect(screen.getByText("0 · WYŁ.")).toBeDefined();
    expect(screen.getByText("WIATR").parentElement?.textContent).not.toMatch(/±/);
  });
});

describe("panel structure", () => {
  test("BUDOWY shows up only while something is being built", () => {
    const idle = renderPanel(newGame(7, DISPATCH_SCENARIO));
    expect(idle.container.querySelectorAll(".en-section")).toHaveLength(3);
    expect(screen.queryByText("BUDOWY")).toBeNull();
    idle.unmount();

    const building = applyAction(newGame(7, DISPATCH_SCENARIO), {
      type: "buildPlant",
      tech: "coal",
      size: "medium",
      hex: { q: 5, r: 5 },
    });
    const { container } = renderPanel(building);
    expect(screen.getByText("BUDOWY")).toBeDefined();
    expect(screen.getByText("5 DÓB")).toBeDefined();
    // Four sections is the hard limit (PanelSection.prompt.md).
    expect(container.querySelectorAll(".en-section")).toHaveLength(4);
  });

  test("the skip button scrubs; the commit stays the only primary action", async () => {
    const { onSkip, onCommit } = renderPanel(newGame(7, DISPATCH_SCENARIO));
    const skip = screen.getByText("PRZEWIŃ ⏭");
    expect(skip).toHaveProperty("disabled", false);

    await userEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("turn scrubbing (01 §2.5)", () => {
  test("the scrub action shows up on future turns of this day, and only there", async () => {
    useGameStore.setState({ game: newGame(7, DISPATCH_SCENARIO) });
    useGameStore.getState().resolve();
    const { container } = render(<App />);

    const cells = [...container.querySelectorAll<HTMLButtonElement>(".en-turn")];
    expect(cells).toHaveLength(8);
    // Every cell is readable now (01 §2.5) — the ribbon has no dead columns.
    expect(cells.some((cell) => cell.disabled)).toBe(false);

    // One ghost button next to the commit, aimed by the ribbon: with nothing
    // ahead selected it is the "run until something happens" scrub (01 §2.5).
    const scrub = () => screen.getByRole("button", { name: /^PRZEWIŃ/ }).textContent;
    expect(scrub()).toBe("PRZEWIŃ ⏭"); // the last resolved turn: nothing to aim at

    await userEvent.click(cells[0] as HTMLElement);
    expect(scrub()).toBe("PRZEWIŃ ⏭"); // a resolved turn is never replayable
    await userEvent.click(cells[1] as HTMLElement);
    expect(scrub()).toBe("PRZEWIŃ ⏭"); // the pending turn is where time already is
    await userEvent.click(cells[5] as HTMLElement);
    expect(scrub()).toBe("PRZEWIŃ DO T6 ⏭");
  });

  test("clicking a cell reads a turn; only the explicit scrub moves time (01 §2.5)", async () => {
    useGameStore.setState({ game: newGame(7, DISPATCH_SCENARIO) });
    const { container } = render(<App />);
    const label = () => container.querySelector(".en-report__label")?.textContent ?? "";

    const cells = container.querySelectorAll<HTMLButtonElement>(".en-turn");
    await userEvent.click(cells[4] as HTMLElement);

    // The calendar did not budge, and the strip turned into a forecast card:
    // ahead of TERAZ there is no result to report, only a bet to place.
    expect(useGameStore.getState().game.calendar).toEqual({ dayIndex: 0, turnIndex: 0 });
    expect(label()).toContain("PROGNOZA TURY");
    expect(label()).toContain("TURA 5 · POŁUDNIE");
    // Bands, not results: ahead of TERAZ there is nothing settled to report.
    const tiles = [...container.querySelectorAll(".en-report .en-tile__label")];
    expect(tiles.map((tile) => tile.textContent)).toStrictEqual([
      "POPYT",
      "WIATR",
      "PV",
      "HORYZONT",
    ]);

    await userEvent.click(screen.getByRole("button", { name: /^PRZEWIŃ DO T5/ }));

    const game = useGameStore.getState().game;
    expect(game.calendar).toEqual({ dayIndex: 0, turnIndex: 4 });
    expect(game.history).toHaveLength(4);
    expect(screen.getByText(/TURA 5\/8/)).toBeDefined();
    // Time moving brings the strip back to the last turn the scrub resolved.
    expect(label()).toContain("RAPORT TURY");
    expect(label()).toContain("TURA 4 · PRZEDPOŁ.");
  });

  test("a turn read back keeps its own numbers, and the map stays on now", async () => {
    useGameStore.setState({ game: newGame(7, DISPATCH_SCENARIO) });
    const { container } = render(<App />);
    const label = () => container.querySelector(".en-report__label")?.textContent ?? "";
    const tiles = () =>
      [...container.querySelectorAll(".en-tile__value")].map((t) => t.textContent);

    await userEvent.click(screen.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }));
    const firstTurn = tiles();
    await userEvent.click(screen.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }));
    expect(label()).toContain("TURA 2 · PRZEDŚWIT");

    // Back to turn 1: the strip shows exactly what it showed when it resolved.
    const cells = container.querySelectorAll<HTMLButtonElement>(".en-turn");
    await userEvent.click(cells[0] as HTMLElement);
    expect(label()).toContain("TURA 1 · NOC");
    expect(tiles()).toStrictEqual(firstTurn);
    expect(useGameStore.getState().game.calendar).toEqual({ dayIndex: 0, turnIndex: 2 });

    // TERAZ brings the strip back to the last resolved turn.
    await userEvent.click(screen.getByTitle("Wróć do tury bieżącej"));
    expect(label()).toContain("TURA 2 · PRZEDŚWIT");
  });

  test("a scrub that stops prints the diagnosis above the buttons", async () => {
    // Nothing is dispatched on the starting grid, so the very first turn is a
    // shortfall — the first stop rule of 01 §2.5.
    useGameStore.setState({ game: newGame(7, DISPATCH_SCENARIO) });
    const { container } = render(<App />);
    expect(container.querySelector(".en-panel__stop")).toBeNull();

    await userEvent.click(screen.getByText("PRZEWIŃ ⏭"));

    expect(useGameStore.getState().skipStop?.kind).toBe("shortfall");
    expect(container.querySelector(".en-panel__stop")?.textContent).toMatch(
      /^⏭ zatrzymano: TURA 1 — niedobór .* w A$/,
    );
    // Committing one turn by hand clears the diagnosis with it.
    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));
    expect(container.querySelector(".en-panel__stop")).toBeNull();
  });
});

describe("commit — the one action that moves time (01 §2.3)", () => {
  test("resolving fills the strip with the numbers of lastTurnReport", async () => {
    useGameStore.setState({
      game: applyAction(newGame(7, DISPATCH_SCENARIO), {
        type: "setPlantSetpoint",
        plantId: "plant-1",
        mw: 40,
      }),
    });
    const { container } = render(<App />);
    expect(container.querySelector("[data-region='report']")).toBeNull();

    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));

    const game = useGameStore.getState().game;
    const report = game.lastTurnReport;
    if (report === null) throw new Error("resolveTurn must record lastTurnReport");
    expect(game.calendar.turnIndex).toBe(1);
    expect(screen.getByText("TURA 1 · NOC")).toBeDefined();
    expect(tileValue(container, "WYNIK TURY")).toBe(formatSignedMoneyPln(report.finance.netPln));
    expect(tileValue(container, "NIEDOBÓR")).toBe(formatMw(report.totals.ensMw));
    expect(tileValue(container, "WIATR / PV REALNE")).toBe(
      `${formatNumber(report.forecastMiss.wind.actualMw)} / ${formatMw(report.forecastMiss.pv.actualMw)}`,
    );
    expect(tileValue(container, "DOSTARCZONO")).toContain(formatMw(report.totals.demandMw));
    // The panel has moved on to the next turn's forecast.
    expect(screen.getByText("PROGNOZA · TURA 2")).toBeDefined();
  });
});

describe("copy rules — plan/README.md", () => {
  test("the screen uses the allowed glyphs and nothing else", async () => {
    useGameStore.setState({ game: newGame(7, DISPATCH_SCENARIO) });
    const { container } = render(<App />);
    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));

    // Everything above U+2000 is a glyph decision: the design system allows
    // exactly these, plus the dashes the typography already uses, plus the "┄"
    // its own chart legend prints for the dashed forecast line. No emoji.
    const allowed = new Set(["–", "—", "−", "✓", "⚠", "✕", "◂", "▸", "⏭", "⬡", "┄"]);
    const used = new Set(
      [...(container.textContent ?? "")].filter((char) => (char.codePointAt(0) ?? 0) >= 0x2000),
    );
    expect([...used].filter((char) => !allowed.has(char))).toEqual([]);
  });
});
