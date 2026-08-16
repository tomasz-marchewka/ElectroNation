// The map renderer. Structure and behavior are asserted, never pixels — the
// scene model owns the data (tests/unit/app/map-scene.test.ts) and the tokens
// own the looks.

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { MAP_V1, newGame, resolveTurn, type GameState } from "../../src/engine";
import { App } from "../../src/app/App";
import { HexMapView } from "../../src/app/map/HexMapView";
import { buildMapScene } from "../../src/app/map/sceneModel";
import { DEFAULT_SEED, useGameStore } from "../../src/app/store/gameStore";

function sceneOf(state: GameState, selected: Parameters<typeof buildMapScene>[2] = null) {
  return buildMapScene(state, state.lastTurnReport, selected);
}

describe("HexMapView", () => {
  test("draws every hex of the board and every segment of the scene", () => {
    const scene = sceneOf(newGame(1, MAP_V1));
    const { container } = render(<HexMapView scene={scene} />);

    expect(container.querySelectorAll("path[data-hex]")).toHaveLength(24 * 16);
    expect(container.querySelectorAll("polyline")).toHaveLength(
      scene.lines.reduce((count, line) => count + line.segments.length, 0),
    );
  });

  test("a click on a hex reports it in the engine's own coordinates", async () => {
    const onHexClick = vi.fn();
    const { container } = render(
      <HexMapView scene={sceneOf(newGame(1, MAP_V1))} onHexClick={onHexClick} />,
    );

    const hex = container.querySelector("path[data-hex='3,1']");
    expect(hex).not.toBeNull();
    await userEvent.click(hex as Element);
    expect(onHexClick).toHaveBeenCalledWith({ q: 3, r: 1 });
  });

  test("the wheel zooms in, a drag then pans instead of selecting a hex", async () => {
    const onHexClick = vi.fn();
    const { container } = render(
      <HexMapView scene={sceneOf(newGame(1, MAP_V1))} onHexClick={onHexClick} />,
    );
    const hex = container.querySelector("path[data-hex='3,1']") as Element;
    const board = () => container.querySelector("svg > g")?.getAttribute("transform") ?? "";
    const scaleOf = (transform: string) => Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
    const fitted = scaleOf(board());

    act(() => {
      container
        .querySelector("svg")
        ?.dispatchEvent(
          new WheelEvent("wheel", { deltaY: -100, clientX: 500, clientY: 300, bubbles: true }),
        );
    });
    // Zoomed in, and a board larger than the frame can now be dragged.
    expect(scaleOf(board())).toBeGreaterThan(fitted);
    const before = board();

    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: hex, coords: { clientX: 200, clientY: 200 } },
      { target: hex, coords: { clientX: 260, clientY: 230 } },
      { keys: "[/MouseLeft]", target: hex, coords: { clientX: 260, clientY: 230 } },
    ]);
    expect(onHexClick).not.toHaveBeenCalled();
    // The gesture did something: the board moved under the cursor.
    expect(board()).not.toBe(before);

    // The next plain click is a click again — the pan does not linger.
    await userEvent.click(hex);
    expect(onHexClick).toHaveBeenCalledWith({ q: 3, r: 1 });
  });

  test("the selected hex is marked and outlined in the action colour", () => {
    const state = newGame(1, MAP_V1);
    const { container } = render(<HexMapView scene={sceneOf(state, { q: 3, r: 1 })} />);

    expect(container.querySelectorAll("[data-selected='true']")).toHaveLength(1);
    expect(container.querySelector("path[data-hex='3,1']")?.getAttribute("data-selected")).toBe(
      "true",
    );
    const outline = container.querySelector(".en-map__selection");
    expect(outline?.getAttribute("stroke")).toBe("var(--en-action)");
  });

  test("the legend prints the engine's line capacities (01 §4.2)", () => {
    render(<HexMapView scene={sceneOf(newGame(1, MAP_V1))} />);
    expect(screen.getByText("NN 150")).toBeDefined();
    expect(screen.getByText("SN 500")).toBeDefined();
    expect(screen.getByText("WN 1 500")).toBeDefined();
    expect(screen.getByText("1 HEKS = 25 KM")).toBeDefined();
  });

  test("the biome legend states the multipliers of 02 §8.1", () => {
    render(<HexMapView scene={sceneOf(newGame(1, MAP_V1))} />);
    expect(screen.getByText("góry ×2,5")).toBeDefined();
    expect(screen.getByText("morze ×3,5")).toBeDefined();
  });

  test("the whole board rides on one transform (CLAUDE.md)", () => {
    const scene = sceneOf(newGame(1, MAP_V1));
    const { container } = render(<HexMapView scene={scene} />);
    const svg = container.querySelector("svg");
    const transformed = svg?.querySelectorAll(":scope > g[transform]") ?? [];
    expect(transformed).toHaveLength(1);
    // The whole 1241 px board is fitted into the viewport it opens on.
    expect(transformed[0]?.getAttribute("transform")).toMatch(/^translate\(.+\) scale\(0\.6/);
  });
});

describe("the map inside the dispatcher screen", () => {
  test("clicking a hex selects it in the store and paints the selection", async () => {
    useGameStore.getState().restart(DEFAULT_SEED);
    const { container } = render(<App />);

    expect(container.querySelector(".en-map__selection")).toBeNull();
    await userEvent.click(container.querySelector("path[data-hex='5,2']") as Element);

    expect(useGameStore.getState().selectedHex).toEqual({ q: 5, r: 2 });
    expect(container.querySelector(".en-map__selection")).not.toBeNull();
  });

  test("resolving a turn repaints the map from the fresh report", async () => {
    useGameStore.getState().restart(DEFAULT_SEED);
    const { container } = render(<App />);

    // Before the first resolution nothing flows, so no city is in deficit.
    expect(container.querySelectorAll("path[stroke='var(--en-danger)']")).toHaveLength(0);
    await userEvent.click(screen.getByText("ZATWIERDŹ TURĘ ▸"));

    const resolved = resolveTurn(newGame(DEFAULT_SEED, MAP_V1));
    const deficits = (resolved.lastTurnReport?.cities ?? []).filter((city) => city.ensMw > 0);
    expect(deficits.length).toBeGreaterThan(0);
    expect(container.querySelectorAll("path[stroke='var(--en-danger)']")).toHaveLength(
      deficits.length,
    );
  });
});
