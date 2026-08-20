// The hex panel: the catalogue that is the only way to build (01 §8 pt 6) and
// the actions of what already stands on the hex. Prices are asserted against
// the engine's own CONFIG — never against the numbers printed in the reference
// build, which are stale by design decision (plan/README.md).

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  BATTERY,
  CITY_CONNECTION_COST_PLN,
  EXPANSION,
  JUNCTION_SPEC,
  KM_PER_HEX,
  LINE_TYPES,
  FARM_TECHS,
  MAX_PLANT_BLOCKS_PER_HEX,
  OFFSHORE_WIND,
  PLANT_TECHS,
  TERRAIN,
  applyAction,
  finishedLine,
  hexKey,
  newGame,
  offsetToAxial,
  type Action,
  type GameState,
  type HexCoord,
  type Scenario,
  type TerrainId,
} from "../../src/engine";
import { App } from "../../src/app/App";
import { HexPanel } from "../../src/app/components/HexPanel";
import { formatMoneyPln } from "../../src/app/format";
import { DEFAULT_CATALOG_SIZES } from "../../src/app/panel/hex";
import { DEFAULT_SEED, useGameStore } from "../../src/app/store/gameStore";
import { useThemeStore } from "../../src/app/store/themeStore";
import { makeScenario } from "../helpers/scenario";

function at(col: number, row: number): HexCoord {
  return offsetToAxial({ col, row });
}

/** Terrain picture of the fixture, one string per offset row. */
const TERRAIN_ROWS = ["..m.~l", "......", "......"] as const;
const TERRAIN_LETTERS: Record<string, TerrainId> = {
  ".": "plains",
  m: "mountains",
  l: "lake",
  "~": "sea",
};

function terrain(): Record<string, TerrainId> {
  const out: Record<string, TerrainId> = {};
  TERRAIN_ROWS.forEach((line, row) => {
    [...line].forEach((letter, col) => {
      out[hexKey(at(col, row))] = TERRAIN_LETTERS[letter] ?? "plains";
    });
  });
  return out;
}

/** One plant, one unconnected city, plains everywhere but two marked hexes. */
function fixture(overrides: Partial<Scenario> = {}): Scenario {
  return makeScenario({
    map: { cols: 6, rows: 3 },
    terrain: terrain(),
    borderSites: [at(0, 2)],
    plants: [
      {
        id: "plant-1",
        name: "EC Modrzyca",
        hex: at(0, 1),
        tech: "ccgt",
        capacityMw: 400,
        setpointMw: 0,
      },
    ],
    cities: [
      {
        id: "city-a",
        name: "Modrzyca",
        hex: at(5, 1),
        connected: false,
        households: 62_000,
        firms: 5_300,
        householdsStart: 62_000,
        firmsStart: 5_300,
        connectedSinceDay: 0,
        monthDemandMwh: 0,
        monthDeliveredMwh: 0,
      },
    ],
    lines: [],
    ...overrides,
  });
}

function renderPanel(game: GameState, hex: HexCoord) {
  const onAction = vi.fn<(action: Action) => boolean>(() => true);
  const onRoute = vi.fn();
  const onBottleneck = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <HexPanel
      game={game}
      report={game.lastTurnReport}
      hex={hex}
      onAction={onAction}
      onRoute={onRoute}
      onBottleneck={onBottleneck}
      onClose={onClose}
    />,
  );
  return { ...view, onAction, onRoute, onBottleneck, onClose };
}

/** A catalogue entry by the name it prints. */
function entry(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>(".en-catalog__buy")].find(
    (button) => button.querySelector(".en-catalog__name")?.textContent?.startsWith(name),
  );
  if (!found) throw new Error(`no catalogue entry named ${name}`);
  return found;
}

function priceOf(container: HTMLElement, name: string): string {
  return entry(container, name).querySelector(".en-catalog__price")?.textContent ?? "";
}

/** The row of a `.en-kv` pair, by its label. */
function value(container: HTMLElement, label: string): string {
  const row = [...container.querySelectorAll(".en-kv")].find(
    (candidate) => candidate.firstElementChild?.textContent === label,
  );
  return row?.lastElementChild?.textContent ?? "";
}

function action(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

beforeEach(() => {
  useGameStore.getState().restart(DEFAULT_SEED);
  useThemeStore.getState().setTheme("dark");
});

describe("catalogue — prices carry the terrain multiplier (02 §8.1)", () => {
  test("the same block costs ×1,0 on the plains and ×2,5 in the mountains", () => {
    const game = newGame(7, fixture());
    const base = 400 * PLANT_TECHS.ccgt.capexPlnPerMw;

    const plains = renderPanel(game, at(1, 1));
    expect(priceOf(plains.container, "CCGT")).toBe(formatMoneyPln(base * TERRAIN.plains.object!));
    expect(value(plains.container, "MNOŻNIK — OBIEKTY")).toBe("×1,0");
    plains.unmount();

    const mountains = renderPanel(game, at(2, 0));
    expect(priceOf(mountains.container, "CCGT")).toBe(
      formatMoneyPln(base * TERRAIN.mountains.object!),
    );
    expect(value(mountains.container, "MNOŻNIK — OBIEKTY")).toBe("×2,5");
  });

  test("the battery is priced from BATTERY, not from the design's catalogue", () => {
    // The reference build prints "150 MW / 300 MWh — 900 mln"; 02 §8.2 makes it
    // 150 × 1,6 mln + 300 × 1,1 mln = 570 mln.
    const { container } = renderPanel(newGame(7, fixture()), at(1, 1));
    const expected = 150 * BATTERY.powerCapexPlnPerMw + 300 * BATTERY.energyCapexPlnPerMwh;

    expect(expected).toBe(570_000_000);
    expect(priceOf(container, "Bateria BESS")).toBe(formatMoneyPln(expected));
  });

  test("stepping the block size reprices the entry and the action it dispatches", async () => {
    const { container, onAction } = renderPanel(newGame(7, fixture()), at(1, 1));

    await userEvent.click(action("CCGT — blok gazowy · BLOK +50 MW"));
    expect(priceOf(container, "CCGT")).toBe(formatMoneyPln(450 * PLANT_TECHS.ccgt.capexPlnPerMw));

    await userEvent.click(entry(container, "CCGT"));
    expect(onAction).toHaveBeenCalledWith({
      type: "buildPlant",
      tech: "ccgt",
      capacityMw: 450,
      hex: at(1, 1),
    });
  });

  test("an entry out of reach is greyed out with its diagnosis, never hidden", () => {
    const { container } = renderPanel(newGame(7, fixture()), at(1, 1));

    // Pumped storage takes elevation and water next to it (01 §3.2).
    expect(entry(container, "Szczytowo-pompowa").disabled).toBe(true);
    expect(container.textContent).toContain("✕ wymaga gór lub wyżyny");
    // A border connection only goes on a border site of the map (01 §5.7).
    expect(entry(container, "Przyłącze graniczne").disabled).toBe(true);
    expect(container.textContent).toContain("✕ tylko w punkcie granicznym");
    // The junction fits everywhere and stays clickable.
    expect(entry(container, "Stacja rozdzielcza").disabled).toBe(false);
    expect(priceOf(container, "Stacja rozdzielcza")).toBe(formatMoneyPln(JUNCTION_SPEC.capexPln));
  });

  test("on water nothing can be built, but a line is still priced (01 §3.2)", () => {
    const { container } = renderPanel(newGame(7, fixture()), at(5, 0));

    expect(entry(container, "CCGT").disabled).toBe(true);
    expect(priceOf(container, "CCGT")).toBe("—");
    expect(container.textContent).toContain("✕ budowa na wodzie niemożliwa (jezioro)");
    expect(value(container, "MNOŻNIK — OBIEKTY")).toBe("budowa niemożliwa");

    const perHex = KM_PER_HEX * LINE_TYPES.mv.capexPlnPerKm * TERRAIN.lake.line;
    expect(value(container, "SN · 500 MW · 2%/100 KM")).toBe(
      `${formatMoneyPln(perHex)} / HEKS · 6 H`,
    );
  });

  // 01 §5.2, 02 §8.1 (0.22): the sea is the one water that carries something.
  test("the sea prices a wind farm at 2.5× and refuses the rest of the catalogue", () => {
    const { container } = renderPanel(newGame(7, fixture()), at(4, 0));

    expect(value(container, "MNOŻNIK — OBIEKTY")).toBe("budowa niemożliwa");
    expect(value(container, "MNOŻNIK — FARMA WIATROWA")).toBe("×2,5");

    const wind = entry(container, "Farma wiatrowa");
    expect(wind.disabled).toBe(false);
    const capacityMw = Math.min(DEFAULT_CATALOG_SIZES.farmMw.wind, OFFSHORE_WIND.maxMwPerHex);
    expect(priceOf(container, "Farma wiatrowa")).toBe(
      formatMoneyPln(capacityMw * FARM_TECHS.wind.capexPlnPerMw * (TERRAIN.sea.windFarm ?? 0)),
    );
    expect(wind.textContent).toContain(`${OFFSHORE_WIND.buildDays} DOBY BUDOWY`);

    for (const name of ["CCGT", "Farma PV", "Bateria BESS", "Stacja rozdzielcza"]) {
      expect(entry(container, name).disabled).toBe(true);
      expect(priceOf(container, name)).toBe("—");
    }
  });

  test("the sea hex stretches the wind stepper to 600 MW, the land hex stops at 300", async () => {
    const user = userEvent.setup();
    const plus = (container: HTMLElement) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
        button.getAttribute("aria-label")?.startsWith("Farma wiatrowa · MOC +"),
      );

    for (const [hex, cap] of [
      [at(4, 0), OFFSHORE_WIND.maxMwPerHex],
      [at(1, 1), FARM_TECHS.wind.maxMwPerHex],
    ] as const) {
      const { container, unmount } = renderPanel(newGame(7, fixture()), hex);
      for (let click = 0; click < 20; click++) {
        const button = plus(container);
        if (!button || button.disabled) break;
        await user.click(button);
      }
      expect(entry(container, "Farma wiatrowa").textContent).toContain(`${cap} MW`);
      expect(plus(container)?.disabled).toBe(true);
      unmount();
    }
  });

  test("a hex whose corridor eats every line slot is no site (01 §3.3)", () => {
    // Four finished routes crossing (2,1): the day an object stood there they
    // would be cut on it, ending eight lines in an object that has six slots.
    const corridor = [at(1, 1), at(2, 1), at(3, 1)];
    const crossed = fixture({
      lines: Array.from({ length: 4 }, (_, index) => finishedLine(`line-${index}`, "mv", corridor)),
    });
    const { container } = renderPanel(newGame(7, crossed), at(2, 1));

    expect(entry(container, "CCGT").disabled).toBe(true);
    expect(container.textContent).toContain("linie przez heks zajmą 8 przyłączy");
    // The same corridor is a site for a junction station: 8 ends, 12 slots (0.21).
    expect(entry(container, "Stacja rozdzielcza").disabled).toBe(false);
    // Three of them leave room for any object: 6 ends, 6 slots.
    const thinner = fixture({
      lines: Array.from({ length: 3 }, (_, index) => finishedLine(`line-${index}`, "mv", corridor)),
    });
    const room = renderPanel(newGame(7, thinner), at(2, 1));
    expect(entry(room.container, "CCGT").disabled).toBe(false);
  });

  test("even a junction station runs out of slots (01 §5.4, 0.21)", () => {
    // Seven routes crossing (2,1) = 14 ends against the station's 12. Types are
    // mixed so the corridor itself stays legal (⩽9 of one type per hex).
    const corridor = [at(1, 1), at(2, 1), at(3, 1)];
    const lines = [
      ...Array.from({ length: 4 }, (_, i) => finishedLine(`mv-${i}`, "mv", corridor)),
      ...Array.from({ length: 3 }, (_, i) => finishedLine(`lv-${i}`, "lv", corridor)),
    ];
    const { container } = renderPanel(newGame(7, fixture({ lines })), at(2, 1));

    expect(entry(container, "Stacja rozdzielcza").disabled).toBe(true);
    expect(container.textContent).toContain("linie przez heks zajmą 14 przyłączy — obiekt ma 12");
  });

  test("an entry the budget cannot reach says how much is missing", () => {
    const poor = { ...newGame(7, fixture()), moneyPln: 1_000_000_000 };
    const { container } = renderPanel(poor, at(1, 1));

    expect(entry(container, "Blok jądrowy").disabled).toBe(true);
    expect(container.textContent).toContain("✕ brak środków — brakuje");
  });
});

describe("object — parameters and contextual actions (01 §8 pt 6)", () => {
  test("a city gains the connection act only once a finished line reaches it", async () => {
    const alone = renderPanel(newGame(7, fixture()), at(5, 1));
    expect(action(/^PRZYŁĄCZ MIASTO/).disabled).toBe(true);
    expect(alone.container.textContent).toContain("✕ brak ukończonej linii w heksie miasta");
    expect(alone.container.textContent).toContain("nieprzyłączone");
    alone.unmount();

    const wired = renderPanel(
      newGame(
        7,
        fixture({
          lines: [
            finishedLine("line-1", "mv", [
              at(0, 1),
              at(1, 1),
              at(2, 1),
              at(3, 1),
              at(4, 1),
              at(5, 1),
            ]),
          ],
        }),
      ),
      at(5, 1),
    );
    const connect = action(`PRZYŁĄCZ MIASTO — ${formatMoneyPln(CITY_CONNECTION_COST_PLN)}`);
    expect(connect.disabled).toBe(false);
    await userEvent.click(connect);
    expect(wired.onAction).toHaveBeenCalledWith({ type: "connectCity", cityId: "city-a" });
    // 01 §8 pt 6: the panel lists the lines running through the hex.
    expect(wired.container.textContent).toContain("SN · EC MODRZYCA ▸ MODRZYCA");
  });

  test("a plant offers one more block, priced at 85% of a new site (01 §7)", async () => {
    const { container, onAction } = renderPanel(newGame(7, fixture()), at(0, 1));

    expect(value(container, "RODZAJ")).toBe("CCGT — blok gazowy");
    expect(value(container, "BLOKI")).toBe(`1 / ${MAX_PLANT_BLOCKS_PER_HEX}`);
    expect(value(container, "PRZYŁĄCZA")).toBe("0 / 6");

    const expected = 400 * PLANT_TECHS.ccgt.capexPlnPerMw * EXPANSION.capexShare;
    const expand = action(`ROZBUDUJ · +BLOK 400 MW — ${formatMoneyPln(expected)}`);
    await userEvent.click(expand);
    expect(onAction).toHaveBeenCalledWith({
      type: "expandPlant",
      plantId: "plant-1",
      capacityMw: 400,
    });
  });

  // 01 §7, 02 §8.4 (0.22): the hex the farm STANDS on sets the expansion, so an
  // offshore farm grows toward 600 MW at 2.5×, not toward 300 MW at the land price.
  test("an offshore farm expands against its own hex, not against the land rule", async () => {
    const game = newGame(
      7,
      fixture({
        farms: [
          {
            id: "farm-sea",
            name: "Farma morska",
            hex: at(4, 0),
            tech: "wind",
            capacityMw: 300,
            enabled: true,
            windClass: "baltic",
            solarMultiplier: 1,
          },
        ],
      }),
    );
    const { container, onAction } = renderPanel(game, at(4, 0));

    expect(value(container, "MOC ZAINSTALOWANA")).toBe(`300 / ${OFFSHORE_WIND.maxMwPerHex} MW`);

    const stepMw = 50;
    const expected = Math.round(
      stepMw * FARM_TECHS.wind.capexPlnPerMw * EXPANSION.capexShare * (TERRAIN.sea.windFarm ?? 0),
    );
    await userEvent.click(action(`ROZBUDUJ · +${stepMw} MW — ${formatMoneyPln(expected)}`));
    expect(onAction).toHaveBeenCalledWith({
      type: "expandFarm",
      farmId: "farm-sea",
      capacityMw: stepMw,
    });
  });

  test("a battery expands power and capacity as two separate acts (01 §5.3)", async () => {
    const game = newGame(
      7,
      fixture({
        storages: [
          {
            id: "storage-1",
            name: "BESS Polana",
            hex: at(1, 1),
            tech: "battery",
            powerMw: 150,
            capacityMwh: 300,
            socMwh: 0,
            setpoint: { mode: "idle", mw: 0 },
          },
        ],
      }),
    );
    const { container, onAction } = renderPanel(game, at(1, 1));

    expect(value(container, "MOC")).toBe("150 MW");
    expect(value(container, "POJEMNOŚĆ")).toBe("300 MWh");

    await userEvent.click(action(/^ROZBUDUJ · \+MOC 50 MW/));
    expect(onAction).toHaveBeenCalledWith({
      type: "expandBattery",
      storageId: "storage-1",
      powerMw: 50,
      capacityMwh: 0,
    });

    await userEvent.click(action(/^ROZBUDUJ · \+POJEMNOŚĆ 100 MWh/));
    expect(onAction).toHaveBeenCalledWith({
      type: "expandBattery",
      storageId: "storage-1",
      powerMw: 0,
      capacityMwh: 100,
    });
  });

  test("a site under construction can be cancelled — after confirming (01 §2.6)", async () => {
    useGameStore.setState({
      game: newGame(7, fixture()),
    });
    useGameStore
      .getState()
      .dispatch({ type: "buildPlant", tech: "coal", capacityMw: 500, hex: at(1, 1) });
    const game = useGameStore.getState().game;
    const construction = game.constructions[0];
    if (!construction) throw new Error("the order must be queued");

    const { container, onAction } = renderPanel(game, at(1, 1));
    expect(value(container, "RODZAJ")).toBe("Blok węglowy");
    expect(container.textContent).toContain("w budowie · 5 DÓB");
    expect(container.querySelector(".en-catalog")).toBeNull();

    // One click arms the confirmation, the second one throws the money away.
    await userEvent.click(action("ANULUJ BUDOWĘ"));
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(action("POTWIERDŹ — NAKŁADY PRZEPADAJĄ"));
    expect(onAction).toHaveBeenCalledWith({
      type: "cancelConstruction",
      constructionId: construction.id,
    });
  });
});

describe("line raises — the corridor grows in place (01 §4.2, 0.17)", () => {
  const ROUTE = [at(0, 1), at(1, 1), at(2, 1), at(3, 1), at(4, 1), at(5, 1)];

  function wired(type: "lv" | "mv" | "hv" = "lv"): GameState {
    return newGame(7, fixture({ lines: [finishedLine("line-1", type, ROUTE)] }));
  }

  /** What the engine charges: 85% of a new line of that type over the route. */
  function raisePln(type: "mv" | "hv"): number {
    const full = Math.round(5 * KM_PER_HEX * LINE_TYPES[type].capexPlnPerKm);
    return Math.round(full * EXPANSION.capexShare);
  }

  test("every higher type is offered, priced off the engine's own arithmetic", async () => {
    const { container, onAction } = renderPanel(wired(), at(2, 1));

    expect(container.textContent).toContain("NN · EC MODRZYCA ▸ MODRZYCA");
    expect(action(/^ROZBUDUJ DO SN/).textContent).toContain(formatMoneyPln(raisePln("mv")));
    expect(action(/^ROZBUDUJ DO WN/).textContent).toContain(formatMoneyPln(raisePln("hv")));

    await userEvent.click(action(/^ROZBUDUJ DO WN/));
    expect(onAction).toHaveBeenCalledWith({
      type: "upgradeLine",
      lineId: "line-1",
      lineType: "hv",
    });
  });

  test("an HV line has nothing left to raise to — only a parallel track", () => {
    const { container } = renderPanel(wired("hv"), at(2, 1));

    expect(container.textContent).toContain("WN · EC MODRZYCA ▸ MODRZYCA");
    expect(screen.queryByRole("button", { name: /^ROZBUDUJ DO/ })).toBeNull();
  });

  test("a raise the budget cannot carry is greyed out with the shortfall", () => {
    const poor = newGame(
      7,
      fixture({ startingMoneyPln: 1_000_000, lines: [finishedLine("line-1", "lv", ROUTE)] }),
    );
    const { container } = renderPanel(poor, at(2, 1));

    expect(action(/^ROZBUDUJ DO SN/).disabled).toBe(true);
    expect(container.textContent).toContain("✕ brak środków");
  });

  test("while the work runs the row says so and the only action is the cancel", async () => {
    const raising = applyAction(wired(), { type: "upgradeLine", lineId: "line-1", lineType: "mv" });
    const { container, onAction } = renderPanel(raising, at(2, 1));

    expect(container.textContent).toContain("NN · EC MODRZYCA ▸ MODRZYCA · ROZBUDOWA DO SN");
    expect(screen.queryByRole("button", { name: /^ROZBUDUJ DO/ })).toBeNull();
    // 5 steps × 6 h × 70% = 21 h of work still to play.
    expect(action(/^ANULUJ ROZBUDOWĘ/).textContent).toContain("21 H");

    // Forfeiting money asks twice (01 §2.6).
    await userEvent.click(action(/^ANULUJ ROZBUDOWĘ/));
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(action("POTWIERDŹ — NAKŁADY PRZEPADAJĄ"));
    expect(onAction).toHaveBeenCalledWith({ type: "cancelLineUpgrade", lineId: "line-1" });
  });
});

describe("alerts — the panel points at the tight spot (01 §8 pt 1, pt 6)", () => {
  /** A city too big for the thin line feeding it: the segment runs at its cap. */
  function starved(): Scenario {
    return fixture({
      cities: [
        {
          id: "city-a",
          name: "Modrzyca",
          hex: at(5, 1),
          connected: true,
          households: 600_000,
          firms: 50_000,
          householdsStart: 600_000,
          firmsStart: 50_000,
          connectedSinceDay: 0,
          monthDemandMwh: 0,
          monthDeliveredMwh: 0,
        },
      ],
      lines: [
        finishedLine("line-1", "lv", [at(0, 1), at(1, 1), at(2, 1), at(3, 1), at(4, 1), at(5, 1)]),
      ],
    });
  }

  test("a city in deficit turns danger and offers the bottleneck", async () => {
    const game = newGame(7, starved());
    useGameStore.setState({
      game: { ...game, plants: game.plants.map((plant) => ({ ...plant, setpointMw: 400 })) },
    });
    useGameStore.getState().resolve();
    const report = useGameStore.getState().game.lastTurnReport;
    expect(report?.totals.ensMw).toBeGreaterThan(0);

    const { container } = render(<App />);
    await userEvent.click(container.querySelector(`path[data-hex='${hexKey(at(5, 1))}']`)!);
    expect(value(container, "STAN")).toContain("niedobór");

    expect(container.querySelector(".en-map__highlight")).toBeNull();
    await userEvent.click(action("POKAŻ WĄSKIE GARDŁO"));
    expect(container.querySelector(".en-map__highlight")).not.toBeNull();
  });

  test("a junction station shows no meter and nothing to expand (01 §4.3, 0.21)", () => {
    const withJunction = fixture({
      junctions: [{ id: "junction-1", name: "Węzeł", hex: at(2, 1) }],
    });
    const { container } = renderPanel(newGame(7, withJunction), at(2, 1));

    expect(value(container, "PRZEPUSTOWOŚĆ")).toBe("bez ograniczeń");
    expect(value(container, "PRZYŁĄCZA")).toBe("0 / 12");
    expect(screen.queryByText(/ROZBUDUJ/)).toBeNull();
  });

  test("a healthy object neither alerts nor offers the bottleneck", async () => {
    useGameStore.setState({ game: newGame(7, fixture()) });
    const { container } = render(<App />);

    await userEvent.click(container.querySelector(`path[data-hex='${hexKey(at(0, 1))}']`)!);
    expect(value(container, "STAN")).toContain("praca normalna");
    expect(screen.queryByText("POKAŻ WĄSKIE GARDŁO")).toBeNull();
  });
});

describe("the panel switch — one column, never two panels (M7 pt 3)", () => {
  test("clicking a hex opens its panel and ESC brings the dispatcher back", async () => {
    useGameStore.setState({ game: newGame(7, fixture()) });
    const { container } = render(<App />);
    expect(screen.getByText("NASTAWY")).toBeDefined();

    await userEvent.click(container.querySelector(`path[data-hex='${hexKey(at(1, 1))}']`)!);
    expect(screen.getByText("KATALOG BUDOWY — CENY Z MNOŻNIKIEM TERENU")).toBeDefined();
    expect(screen.queryByText("NASTAWY")).toBeNull();
    expect(container.querySelectorAll(".en-panel")).toHaveLength(1);

    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("NASTAWY")).toBeDefined();
  });

  test("routing takes over the map: the selection cannot move until it ends", async () => {
    useGameStore.setState({ game: newGame(7, fixture()) });
    const { container } = render(<App />);
    const hex = (coord: HexCoord) =>
      container.querySelector(`path[data-hex='${hexKey(coord)}']`) as Element;

    await userEvent.click(hex(at(0, 1)));
    await userEvent.click(action("POPROWADŹ LINIĘ STĄD"));
    expect(screen.getByText("TRASOWANIE LINII")).toBeDefined();

    // A click on the city locks the route instead of selecting the city.
    await userEvent.click(hex(at(5, 1)));
    expect(useGameStore.getState().selectedHex).toEqual(at(0, 1));
    expect(value(container, "CEL")).toBe("MODRZYCA");

    // The route is on the map, priced, and the engine takes it.
    expect(container.querySelector(".en-map__route")).not.toBeNull();
    const plan = useGameStore.getState().game;
    await userEvent.click(screen.getByRole("button", { name: /^ZATWIERDŹ — / }));

    const after = useGameStore.getState().game;
    expect(after.lines).toHaveLength(plan.lines.length + 1);
    expect(useGameStore.getState().routing).toBeNull();
    expect(after.lines[0]?.type).toBe("lv");
  });

  test("exactly one primary action on screen, whichever panel is up", async () => {
    useGameStore.setState({ game: newGame(7, fixture()) });
    const { container } = render(<App />);
    const primaries = () =>
      [...container.querySelectorAll(".en-btn")].filter(
        (button) => !button.classList.contains("en-btn--ghost"),
      );
    // The dispatcher panel owns it: ZATWIERDŹ TURĘ ▸ (01 §2.3).
    expect(primaries()).toHaveLength(1);

    await userEvent.click(container.querySelector(`path[data-hex='${hexKey(at(0, 1))}']`)!);
    expect(primaries()).toHaveLength(0);

    await userEvent.click(action("POPROWADŹ LINIĘ STĄD"));
    expect(primaries()).toHaveLength(1);
  });

  test("the panels use the allowed glyphs and nothing else", async () => {
    useGameStore.setState({ game: newGame(7, fixture()) });
    const { container } = render(<App />);
    // As in panel.test.tsx: the design system's own chart legend prints "┄" for
    // the dashed forecast line, which the README's glyph list predates.
    const allowed = new Set(["–", "—", "−", "✓", "⚠", "✕", "◂", "▸", "⏭", "⬡", "┄"]);
    const check = () => {
      const used = new Set(
        [...(container.textContent ?? "")].filter((char) => (char.codePointAt(0) ?? 0) >= 0x2000),
      );
      expect([...used].filter((char) => !allowed.has(char))).toEqual([]);
    };

    await userEvent.click(container.querySelector(`path[data-hex='${hexKey(at(1, 1))}']`)!);
    check();
    await userEvent.click(container.querySelector(`path[data-hex='${hexKey(at(0, 1))}']`)!);
    check();
    await userEvent.click(action("POPROWADŹ LINIĘ STĄD"));
    check();
  });

  test("ESC leaves routing first, and only then the hex panel", async () => {
    useGameStore.setState({ game: newGame(7, fixture()) });
    const { container } = render(<App />);

    await userEvent.click(container.querySelector(`path[data-hex='${hexKey(at(0, 1))}']`)!);
    await userEvent.click(action("POPROWADŹ LINIĘ STĄD"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("TRASOWANIE LINII")).toBeNull();
    expect(screen.getByText("OBIEKT")).toBeDefined();

    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("NASTAWY")).toBeDefined();
  });
});
