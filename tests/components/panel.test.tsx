// The dispatcher panel and the report strip (01 §2.3, §8). Behaviour and
// numbers are asserted against the engine state, never against pixels or
// against the constants of the handoff's reference build.

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { applyAction, newGame, type Action, type GameState, type Scenario } from "../../src/engine";
import { App } from "../../src/app/App";
import { formatMw, formatSignedMoneyPln } from "../../src/app/format";
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
  const view = render(<DispatcherPanel game={game} onAction={onAction} onCommit={onCommit} />);
  return { ...view, onAction, onCommit };
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

  test("the storage control switches mode and keeps the power setpoint", async () => {
    const game = applyAction(newGame(7, DISPATCH_SCENARIO), {
      type: "setStorage",
      storageId: "storage-1",
      mode: "idle",
      mw: 100,
    });
    const { onAction } = renderPanel(game);

    expect(screen.getByText("SOC 62%")).toBeDefined();
    await userEvent.click(screen.getByText("ODDAWAJ"));
    expect(onAction).toHaveBeenCalledWith({
      type: "setStorage",
      storageId: "storage-1",
      mode: "discharge",
      mw: 100,
    });
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
      <DispatcherPanel game={applyAction(game, action!)} onAction={onAction} onCommit={vi.fn()} />,
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
      capacityMw: 500,
      hex: { q: 5, r: 5 },
    });
    const { container } = renderPanel(building);
    expect(screen.getByText("BUDOWY")).toBeDefined();
    expect(screen.getByText("5 DÓB")).toBeDefined();
    // Four sections is the hard limit (PanelSection.prompt.md).
    expect(container.querySelectorAll(".en-section")).toHaveLength(4);
  });

  test("the skip button is present but inert until turn scrubbing lands", () => {
    renderPanel(newGame(7, DISPATCH_SCENARIO));
    const skip = screen.getByText("PRZEWIŃ ⏭");
    expect(skip).toHaveProperty("disabled", true);
    expect(skip.getAttribute("title")).toBe("Przewijanie tur — niedostępne w tej wersji");
  });

  test("the day axis is a read-out — no cell is clickable yet (01 §2.5)", () => {
    render(<App />);
    const cells = [...document.querySelectorAll<HTMLButtonElement>(".en-turn")];
    expect(cells).toHaveLength(8);
    expect(cells.every((cell) => cell.disabled)).toBe(true);
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
    expect(tileValue(container, "WIATR REALNY")).toBe(formatMw(report.forecastMiss.wind.actualMw));
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
    // exactly these, plus the dashes the typography already uses. No emoji.
    const allowed = new Set(["–", "—", "−", "✓", "⚠", "✕", "◂", "▸", "⏭", "⬡"]);
    const used = new Set(
      [...(container.textContent ?? "")].filter((char) => (char.codePointAt(0) ?? 0) >= 0x2000),
    );
    expect([...used].filter((char) => !allowed.has(char))).toEqual([]);
  });
});
