// The detailed report as it behaves on the screen: opened from the top bar,
// switched between four scopes, scrolled period by period — and, above all,
// scrolled WITHOUT dragging the ribbon, the strip or the map along with it.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { TURNS_PER_DAY } from "../../src/engine";
import { App } from "../../src/app/App";
import { DEFAULT_SEED, useGameStore } from "../../src/app/store/gameStore";
import { useThemeStore } from "../../src/app/store/themeStore";

beforeEach(() => {
  useGameStore.getState().restart(DEFAULT_SEED);
  // Whether the report is docked and which scope it shows are layout choices
  // and deliberately survive `restart` (a new game keeps the player's screen).
  // A test therefore has to put them back itself.
  useGameStore.setState({ reportOpen: false, reportScope: "turn" });
  useThemeStore.getState().setTheme("dark");
});

/** Commits `turns` turns through the panel's own button. */
async function commit(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));
  }
}

function dock(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-region='report-detail']");
}

describe("opening the report", () => {
  test("the top bar's button docks and undocks it", async () => {
    const { container } = render(<App />);
    expect(dock(container)).toBeNull();

    await userEvent.click(screen.getByText("RAPORTY"));
    expect(dock(container)).not.toBeNull();
    // The map keeps standing next to it — the dock never unmounts the board,
    // only the narrow-screen media query hides it.
    expect(container.querySelector("[data-region='map']")).not.toBeNull();

    await userEvent.click(screen.getByText("RAPORTY"));
    expect(dock(container)).toBeNull();
  });

  test("before the first resolution it says so instead of printing zeros", async () => {
    const { container } = render(<App />);
    await userEvent.click(screen.getByText("RAPORTY"));
    const panel = dock(container);
    if (!panel) throw new Error("no report dock");
    expect(within(panel).getByText("BRAK DANYCH")).toBeDefined();
  });

  test("ESC closes the report before it gives up the selected turn", async () => {
    const { container } = render(<App />);
    await userEvent.click(screen.getByText("RAPORTY"));
    await userEvent.keyboard("{Escape}");
    expect(dock(container)).toBeNull();
  });
});

describe("the four scopes", () => {
  test("the switcher names all four and keeps the moment being read", async () => {
    const { container } = render(<App />);
    await commit(1);
    await userEvent.click(screen.getByText("RAPORTY"));
    const panel = dock(container);
    if (!panel) throw new Error("no report dock");

    const tabs = within(panel).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["TURA", "DOBA", "MIESIĄC", "ROK"]);
    expect(within(panel).getByText("TURA 1 · NOC")).toBeDefined();

    await userEvent.click(within(panel).getByText("MIESIĄC"));
    expect(useGameStore.getState().reportScope).toBe("month");
    expect(within(panel).getByText("STYCZEŃ")).toBeDefined();

    await userEvent.click(within(panel).getByText("ROK"));
    expect(within(panel).getByText("ROK 1")).toBeDefined();
  });
});

describe("scrolling the report", () => {
  test("◀ and ▶ walk the periods and stop at the archive's edges", async () => {
    const { container } = render(<App />);
    await commit(3);
    await userEvent.click(screen.getByText("RAPORTY"));
    const panel = dock(container);
    if (!panel) throw new Error("no report dock");

    const back = within(panel).getByLabelText("Poprzedni okres");
    const forward = within(panel).getByLabelText("Następny okres");

    // Newest turn first — there is nothing ahead of it.
    expect(within(panel).getByText("TURA 3 · RANO")).toBeDefined();
    expect(forward).toHaveProperty("disabled", true);

    await userEvent.click(back);
    await userEvent.click(back);
    expect(within(panel).getByText("TURA 1 · NOC")).toBeDefined();
    expect(within(panel).getByLabelText("Poprzedni okres")).toHaveProperty("disabled", true);

    await userEvent.click(within(panel).getByLabelText("Następny okres"));
    expect(within(panel).getByText("TURA 2 · PRZEDŚWIT")).toBeDefined();
  });

  test("scrolling back does NOT move the ribbon, the strip or the map", async () => {
    const { container } = render(<App />);
    await commit(3);
    await userEvent.click(screen.getByText("RAPORTY"));
    const panel = dock(container);
    if (!panel) throw new Error("no report dock");

    await userEvent.click(within(panel).getByLabelText("Poprzedni okres"));

    const store = useGameStore.getState();
    expect(store.reportAnchor).toBe(1);
    // The ribbon still follows now, and the strip below still describes the
    // last resolved turn (01 §2.3) — the report reads on its own axis.
    expect(store.selectedTurn).toBeNull();
    expect(store.timelineFrom).toBeNull();
    const strip = container.querySelector("[data-region='report']");
    expect(strip?.textContent).toContain("TURA 3 · RANO");
  });

  test("stepping back to the newest period re-arms following", async () => {
    render(<App />);
    await commit(2);
    const store = useGameStore.getState();
    store.toggleReport();
    store.stepReport(-1);
    expect(useGameStore.getState().reportAnchor).toBe(0);
    store.stepReport(1);
    // Back at the newest turn the anchor is dropped, so the next commit moves
    // the report with it instead of freezing it on a turn that is no longer new.
    expect(useGameStore.getState().reportAnchor).toBeNull();
  });

  test("a day report covers the whole day once it is played out", async () => {
    const { container } = render(<App />);
    await commit(TURNS_PER_DAY);
    await userEvent.click(screen.getByText("RAPORTY"));
    const panel = dock(container);
    if (!panel) throw new Error("no report dock");

    await userEvent.click(within(panel).getByText("DOBA"));
    expect(within(panel).getByText("DOBA ROBOCZA A")).toBeDefined();
    expect(panel.textContent).toContain("8/8 TUR");
    expect(within(panel).getByText("PROGNOZA vs PRAWDA")).toBeDefined();
    // PV is scored here even though the strip only had room for a shared tile.
    expect(within(panel).getByText("PV")).toBeDefined();
  });
});
