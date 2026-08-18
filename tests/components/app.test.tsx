// The dispatcher screen frame (01 §8): the shell renders, the top bar reads
// the engine state, the theme switch repaints the whole page.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { App } from "../../src/app/App";
import { DEFAULT_SEED, useGameStore } from "../../src/app/store/gameStore";
import { useThemeStore } from "../../src/app/store/themeStore";
import { budgetKpi } from "../../src/app/store/selectors";

beforeEach(() => {
  useGameStore.getState().restart(DEFAULT_SEED);
  useThemeStore.getState().setTheme("dark");
});

describe("frame", () => {
  test("renders top bar, map, day axis, chart strip and panel", () => {
    const { container } = render(<App />);

    expect(screen.getByText("⬡ ELECTRONATION")).toBeDefined();
    expect(container.querySelector(".en-app")).not.toBeNull();
    expect(container.querySelector("[data-region='map']")).not.toBeNull();
    expect(container.querySelector(".en-turnbar")).not.toBeNull();
    expect(container.querySelector("[data-region='chart']")).not.toBeNull();
    expect(container.querySelector(".en-panel")).not.toBeNull();
  });

  test("the panel holds the one primary action of the screen", () => {
    const { container } = render(<App />);
    const primary = container.querySelectorAll(".en-btn:not(.en-btn--ghost)");
    expect(primary).toHaveLength(1);
    expect(primary[0]?.textContent).toBe("ZATWIERDŹ TURĘ ▸");
  });

  test("the panel keeps at most four sections (PanelSection.prompt.md)", () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll(".en-panel .en-section").length).toBeLessThanOrEqual(4);
  });

  test("the report strip appears only once a turn has been resolved", async () => {
    const { container } = render(<App />);
    expect(container.querySelector("[data-region='report']")).toBeNull();

    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));
    expect(container.querySelector("[data-region='report']")).not.toBeNull();
  });
});

describe("top bar reads the engine state", () => {
  test("shows the budget, the calendar context and the forecast system", () => {
    const game = useGameStore.getState().game;
    render(<App />);

    expect(screen.getByText(budgetKpi(game))).toBeDefined();
    // The ribbon captions the same day below (01 §8 pt 2), so the bar is read
    // where the bar is.
    expect(document.querySelector(".en-topbar__ctx")?.textContent).toContain(
      "ROK 1 · STYCZEŃ · DOBA ROBOCZA A",
    );
    expect(screen.getByText("PODSTAWOWY · 24 H")).toBeDefined();
  });

  test("committing a turn advances the day axis and updates the budget", async () => {
    const before = useGameStore.getState().game;
    const { container } = render(<App />);
    expect(container.querySelectorAll(".en-turn")[0]?.className).toContain("is-current");

    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));

    const after = useGameStore.getState().game;
    expect(after.calendar.turnIndex).toBe(1);
    expect(container.querySelectorAll(".en-turn")[1]?.className).toContain("is-current");
    expect(screen.getByText(budgetKpi(after))).toBeDefined();
    expect(after.moneyPln).not.toBe(before.moneyPln);
  });
});

describe("theme", () => {
  test("dark is the default and the switch flips data-theme on <html>", async () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe("dark");

    await userEvent.click(screen.getByText("JASNY"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByText("JASNY").getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(screen.getByText("CIEMNY"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  test("the preference is remembered in localStorage", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("JASNY"));
    expect(localStorage.getItem("electronation.theme")).toBe("light");
  });
});
