// Shell components adapted from the design handoff. Structure and behavior are
// asserted, never pixels — the tokens own the looks.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { TURN_PHASES } from "../../src/engine";
import { Button } from "../../src/app/components/Button";
import { Panel } from "../../src/app/components/Panel";
import { PanelSection } from "../../src/app/components/PanelSection";
import { StatusDot } from "../../src/app/components/StatusDot";
import { TopBar } from "../../src/app/components/TopBar";
import { TurnBar } from "../../src/app/components/TurnBar";
import { DAY_TURNS, dayTurnAt } from "../../src/app/labels";

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

describe("TurnBar", () => {
  test("a day is 8 turns, never 24 hours (01 §2.2)", () => {
    render(<TurnBar current={0} />);
    expect(screen.getAllByRole("button")).toHaveLength(8);
    expect(DAY_TURNS).toHaveLength(8);
  });

  test("DAY_TURNS maps 1:1 onto the engine's TURN_PHASES", () => {
    expect(DAY_TURNS.map((turn) => turn.phase)).toEqual([...TURN_PHASES]);
    expect(dayTurnAt(7).name).toBe("PÓŹNY WIECZ.");
    // Out of range never crashes the axis; it falls back to the first turn.
    expect(dayTurnAt(99)).toBe(DAY_TURNS[0]);
  });

  test("marks the current turn and dims the resolved ones", () => {
    const { container } = render(<TurnBar current={6} />);
    const cells = container.querySelectorAll(".en-turn");
    expect(cells[6]?.className).toContain("is-current");
    expect(cells[0]?.className).toContain("is-past");
    expect(cells[7]?.className).toBe("en-turn");
    expect(cells[6]?.textContent).toContain("◂ TURA 7");
  });

  test("onSelect reports the clicked turn index", async () => {
    const onSelect = vi.fn();
    render(<TurnBar current={0} onSelect={onSelect} />);
    await userEvent.click(screen.getAllByRole("button")[3] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(3);
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
