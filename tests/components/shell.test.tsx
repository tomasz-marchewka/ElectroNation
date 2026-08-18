// Shell components adapted from the design handoff. Structure and behavior are
// asserted, never pixels — the tokens own the looks.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { TURN_PHASES, newGame, resolveTurn, type GameState } from "../../src/engine";
import { Button } from "../../src/app/components/Button";
import { Panel } from "../../src/app/components/Panel";
import { PanelSection } from "../../src/app/components/PanelSection";
import { StatusDot } from "../../src/app/components/StatusDot";
import { TopBar } from "../../src/app/components/TopBar";
import { DAY_TURNS, dayTurnAt } from "../../src/app/labels";
import { TimelineView } from "../../src/app/timeline/TimelineView";
import { buildTimeline } from "../../src/app/timeline/timeline";

describe("TopBar", () => {
  test("renders the wordmark, the context and the KPIs", () => {
    render(
      <TopBar
        context="ROK 3 · LISTOPAD · DOBA ROBOCZA A"
        regime="NIŻ ATLANTYCKI"
        kpis={[
          { label: "BUDŻET", value: "7,42 mld zł" },
          { label: "PROGNOZY", value: "PODSTAWOWY · 24 H" },
        ]}
      />,
    );

    expect(screen.getByText("⬡ ELECTRONATION")).toBeDefined();
    expect(screen.getByText(/ROK 3 · LISTOPAD · DOBA ROBOCZA A/)).toBeDefined();
    expect(screen.getByText(/REŻIM: NIŻ ATLANTYCKI/)).toBeDefined();
    expect(screen.getByText("7,42 mld zł")).toBeDefined();
  });

  test("carries no actions — the bar is read-only (TopBar.prompt.md)", () => {
    const { container } = render(<TopBar context="ROK 1 · STYCZEŃ · DOBA ROBOCZA A" />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  test("a KPI tone becomes the design system's is-* class", () => {
    render(<TopBar kpis={[{ label: "WYNIK DOBY", value: "+46,9 mln zł", tone: "ok" }]} />);
    expect(screen.getByText("+46,9 mln zł").className).toBe("is-ok");
  });
});

describe("Panel", () => {
  test("head shows the turn meta, the phase name and its hour block", () => {
    render(
      <Panel meta="TURA 7/8 · LISTOPAD · ×10,9 DNIA" title="SZCZYT WIECZORNY" hours="18–21">
        <PanelSection label="NASTAWY" grow>
          <span>treść</span>
        </PanelSection>
        <PanelSection sunk>
          <span>bilans</span>
        </PanelSection>
      </Panel>,
    );

    expect(screen.getByText("TURA 7/8 · LISTOPAD · ×10,9 DNIA")).toBeDefined();
    expect(screen.getByText(/SZCZYT WIECZORNY/)).toBeDefined();
    expect(screen.getByText("18–21")).toBeDefined();
    expect(screen.getByText("NASTAWY")).toBeDefined();
  });

  test("grow and sunk map onto the section modifiers", () => {
    const { container } = render(
      <Panel>
        <PanelSection grow />
        <PanelSection sunk />
      </Panel>,
    );
    const sections = container.querySelectorAll("section");
    expect(sections[0]?.className).toBe("en-section en-section--grow");
    expect(sections[1]?.className).toBe("en-section en-section--sunk");
  });
});

describe("TimelineView", () => {
  const ribbon = (state: GameState, from: number | null = null, selected: number | null = null) =>
    buildTimeline(state, { from, selected });

  test("a window is 8 turns, never 24 hours (01 §2.2)", () => {
    const { container } = render(
      <TimelineView
        model={ribbon(newGame(7))}
        onSelect={vi.fn()}
        onScroll={vi.fn()}
        onNow={vi.fn()}
        atNow
      />,
    );
    expect(container.querySelectorAll(".en-turn")).toHaveLength(8);
    expect(DAY_TURNS).toHaveLength(8);
  });

  test("DAY_TURNS maps 1:1 onto the engine's TURN_PHASES", () => {
    expect(DAY_TURNS.map((turn) => turn.phase)).toEqual([...TURN_PHASES]);
    expect(dayTurnAt(7).name).toBe("PÓŹNY WIECZ.");
    // Out of range never crashes the axis; it falls back to the first turn.
    expect(dayTurnAt(99)).toBe(DAY_TURNS[0]);
  });

  test("marks the current turn, dims the resolved ones and outlines the read one", () => {
    let state = newGame(7);
    for (let turn = 0; turn < 6; turn++) state = resolveTurn(state);
    const { container } = render(
      <TimelineView
        model={ribbon(state, null, 2)}
        onSelect={vi.fn()}
        onScroll={vi.fn()}
        onNow={vi.fn()}
        atNow={false}
      />,
    );
    const cells = container.querySelectorAll(".en-turn");
    expect(cells[6]?.className).toContain("is-current");
    expect(cells[0]?.className).toContain("is-past");
    expect(cells[2]?.className).toContain("is-selected");
    expect(cells[7]?.className).toBe("en-turn");
    expect(cells[6]?.textContent).toContain("◂ TURA 7");
  });

  test("a click reads a turn — any turn, in both directions (01 §2.5)", async () => {
    const onSelect = vi.fn();
    let state = newGame(7);
    for (let turn = 0; turn < 3; turn++) state = resolveTurn(state);
    const { container } = render(
      <TimelineView
        model={ribbon(state)}
        onSelect={onSelect}
        onScroll={vi.fn()}
        onNow={vi.fn()}
        atNow
      />,
    );
    const cells = [...container.querySelectorAll<HTMLButtonElement>(".en-turn")];

    // Behind TERAZ, on it, and ahead of it: no cell is dead any more, and none
    // of them moves time — that is what the explicit scrub action is for.
    await userEvent.click(cells[0] as HTMLElement);
    await userEvent.click(cells[3] as HTMLElement);
    await userEvent.click(cells[5] as HTMLElement);
    expect(onSelect.mock.calls).toEqual([[0], [3], [5]]);
    expect(cells.some((cell) => cell.disabled)).toBe(false);
  });

  test("the window slides, and stops where the archive and the horizon do", async () => {
    const onScroll = vi.fn();
    const onNow = vi.fn();
    let state = newGame(7);
    for (let turn = 0; turn < 10; turn++) state = resolveTurn(state);
    const model = ribbon(state);
    render(
      <TimelineView
        model={model}
        onSelect={vi.fn()}
        onScroll={onScroll}
        onNow={onNow}
        atNow={false}
      />,
    );

    // Deltas, not targets: two clicks in one frame must move two turns.
    await userEvent.click(screen.getByTitle("Wcześniejsze tury"));
    expect(onScroll).toHaveBeenCalledWith(-1);
    await userEvent.click(screen.getByTitle("Późniejsze tury"));
    expect(onScroll).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByTitle("Wróć do tury bieżącej"));
    expect(onNow).toHaveBeenCalledTimes(1);

    // At the very start of the archive there is nothing earlier to show.
    const first = ribbon(state, model.range.minFrom);
    render(
      <TimelineView
        model={first}
        onSelect={vi.fn()}
        onScroll={onScroll}
        onNow={onNow}
        atNow={false}
      />,
    );
    expect(screen.getAllByTitle("Wcześniejsze tury").at(-1)).toHaveProperty("disabled", true);
  });
});

describe("Button", () => {
  test("primary by default, ghost on request, block stretches", () => {
    const { container } = render(
      <>
        <Button block>ZATWIERDŹ TURĘ ▸</Button>
        <Button variant="ghost">PRZEWIŃ ⏭</Button>
      </>,
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]?.className).toBe("en-btn en-btn--block");
    expect(buttons[1]?.className).toBe("en-btn en-btn--ghost");
  });

  test("clicking fires the handler; disabled does not", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>ZATWIERDŹ TURĘ ▸</Button>
        <Button onClick={onClick} disabled>
          PRZEWIŃ ⏭
        </Button>
      </>,
    );

    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));
    expect(onClick).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByText("PRZEWIŃ ⏭"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("StatusDot", () => {
  test("every tone resolves to its own state token", () => {
    const { container } = render(
      <>
        <StatusDot tone="ok" />
        <StatusDot tone="warn" label=">75%" />
        <StatusDot tone="danger" />
      </>,
    );
    const dots = container.querySelectorAll(".en-dot");
    expect(dots).toHaveLength(3);
    expect(dots[0]?.getAttribute("style")).toContain("var(--en-ok)");
    expect(dots[1]?.getAttribute("style")).toContain("var(--en-warn)");
    expect(dots[2]?.getAttribute("style")).toContain("var(--en-danger)");
    expect(screen.getByText(">75%")).toBeDefined();
  });
});
