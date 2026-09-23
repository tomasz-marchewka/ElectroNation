// OPCJE GRY (docs/08 §7): every setting of the game in one place — picture,
// sound, session — in the right column, opened from the top bar. The choices
// write the players' stores and the browser remembers them; the clouds
// default to PRZEJRZYSTE, because clouds must never cost the read of the map
// (docs/08 §3, §6).

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { offsetToAxial } from "../../src/engine";
import { App } from "../../src/app/App";
import { OptionsPanel } from "../../src/app/components/OptionsPanel";
import { DEFAULT_SEED, useGameStore } from "../../src/app/store/gameStore";
import { useThemeStore } from "../../src/app/store/themeStore";
import {
  SETTINGS_STORAGE_KEY,
  defaultSettings,
  useWorldSettings,
} from "../../src/world/hud/settingsStore";

beforeEach(() => {
  localStorage.clear();
  useGameStore.getState().restart(DEFAULT_SEED);
  useThemeStore.getState().setTheme("dark");
  useWorldSettings.setState(defaultSettings());
});

function panelTitle(container: HTMLElement): string | null {
  return container.querySelector(".en-panel__title")?.textContent?.trim() ?? null;
}

function group(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

function pressed(name: string): string[] {
  return within(group(name))
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.textContent ?? "");
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
}

describe("OPCJE GRY in the shell", () => {
  test("the top bar opens it in the right column and ◂ WRÓĆ gives the column back", async () => {
    const { container } = render(<App />);
    const toggle = screen.getByRole("button", { name: "OPCJE GRY" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(panelTitle(container)).toBe("OPCJE GRY");
    for (const label of ["GRAFIKA", "DŹWIĘK", "GRA"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    // The column holds one thing at a time: the dispatcher panel steps aside.
    expect(screen.queryByText("ZATWIERDŹ TURĘ ▸")).toBeNull();

    await userEvent.click(screen.getByText("◂ WRÓĆ DO PANELU DYSPOZYTORA"));
    expect(screen.getByText("ZATWIERDŹ TURĘ ▸")).toBeDefined();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  test("the same button closes it again", async () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "OPCJE GRY" });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(screen.getByText("ZATWIERDŹ TURĘ ▸")).toBeDefined();
  });

  test("ESC closes the options before it steps back anywhere else", async () => {
    render(<App />);
    act(() => useGameStore.getState().selectTurn(0));
    await userEvent.click(screen.getByRole("button", { name: "OPCJE GRY" }));

    await userEvent.keyboard("{Escape}");
    expect(useGameStore.getState().optionsOpen).toBe(false);
    // The turn being read back is the next level, still where it was.
    expect(useGameStore.getState().selectedTurn).toBe(0);
  });

  test("a hex picked on the map takes the column back for the hex panel", async () => {
    const { container } = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "OPCJE GRY" }));

    act(() => useGameStore.getState().selectHex(offsetToAxial({ col: 5, row: 5 })));
    expect(useGameStore.getState().optionsOpen).toBe(false);
    expect(panelTitle(container)).not.toBe("OPCJE GRY");
  });

  test("the bottom strip keeps only the chart legend", () => {
    const { container } = render(<App />);
    const legend = container.querySelector(".en-chartlegend");
    expect(legend?.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("choices", () => {
  const renderPanel = (props: { webgl?: boolean; world3d?: boolean } = {}) =>
    render(
      <OptionsPanel
        webgl={props.webgl ?? true}
        world3d={props.world3d ?? true}
        activeTier="high"
        onClose={vi.fn()}
      />,
    );

  test("the clouds default to PRZEJRZYSTE and say what that means", () => {
    renderPanel();
    expect(pressed("CHMURY")).toEqual(["PRZEJRZYSTE"]);
    expect(
      screen.getByText("nad planszą tylko cienie chmur — warstwa zostaje wokół granic"),
    ).toBeDefined();
  });

  test("a cloud choice reaches the store and the browser remembers it", async () => {
    renderPanel();
    await userEvent.click(within(group("CHMURY")).getByText("BRAK"));

    expect(useWorldSettings.getState().clouds).toBe("none");
    expect(stored().clouds).toBe("none");
    expect(pressed("CHMURY")).toEqual(["BRAK"]);
    expect(
      screen.getByText("bez chmur i ich cieni — zachmurzenie podaje pasek pogody"),
    ).toBeDefined();
  });

  test("the arrow keys walk a group as one control", async () => {
    renderPanel();
    within(group("CHMURY")).getByText("PRZEJRZYSTE").focus();

    await userEvent.keyboard("{ArrowLeft}");
    expect(useWorldSettings.getState().clouds).toBe("full");
    expect(document.activeElement?.textContent).toBe("PEŁNE");

    await userEvent.keyboard("{End}");
    expect(useWorldSettings.getState().clouds).toBe("none");
  });

  test("quality, motion, renderer and theme reach their stores", async () => {
    renderPanel();
    await userEvent.click(within(group("JAKOŚĆ")).getByText("NISKA"));
    await userEvent.click(within(group("RUCH")).getByText("BRAK"));
    await userEvent.click(within(group("RENDERER")).getByText("SVG"));
    await userEvent.click(within(group("MOTYW")).getByText("JASNY"));

    const settings = useWorldSettings.getState();
    expect([settings.quality, settings.motion, settings.renderer]).toEqual(["low", "none", "svg"]);
    expect(useThemeStore.getState().theme).toBe("light");
    expect(stored()).toMatchObject({ quality: "low", motion: "none", renderer: "svg" });
  });

  test("the sound is off until the player turns it on, and the level follows the slider", async () => {
    renderPanel();
    expect(pressed("ODGŁOSY")).toEqual(["WYŁ."]);

    await userEvent.click(within(group("ODGŁOSY")).getByText("WŁ."));
    fireEvent.change(screen.getByRole("slider", { name: "GŁOŚNOŚĆ" }), {
      target: { value: "35" },
    });

    expect(useWorldSettings.getState().audio).toEqual({ enabled: true, volume: 0.35 });
    expect(screen.getByText("35 %")).toBeDefined();
  });

  test("without WebGL2 the 3D choices stand disabled under a diagnosis", () => {
    renderPanel({ webgl: false, world3d: false });
    expect(screen.getByText("⚠ brak WebGL2 — mapa w trybie SVG")).toBeDefined();
    for (const name of ["JAKOŚĆ", "CHMURY", "RUCH", "RENDERER"]) {
      for (const button of within(group(name)).getAllByRole("button")) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      }
    }
    for (const name of ["MOTYW", "ODGŁOSY"]) {
      expect((within(group(name)).getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(
        false,
      );
    }
  });

  test("on the SVG map the renderer stays switchable, the 3D-only choices do not", () => {
    renderPanel({ webgl: true, world3d: false });
    expect(screen.getByText("▸ jakość, chmury i ruch dotyczą mapy 3D")).toBeDefined();
    expect((within(group("CHMURY")).getByText("BRAK") as HTMLButtonElement).disabled).toBe(true);
    expect((within(group("RENDERER")).getByText("3D") as HTMLButtonElement).disabled).toBe(false);
  });
});
