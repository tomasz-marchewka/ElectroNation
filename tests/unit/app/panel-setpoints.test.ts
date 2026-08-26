// NASTAWY rows: one per dispatchable unit, built straight off the state
// (01 §5.1–5.3, §5.7). Prices and limits are read back from the engine tables,
// never from the numbers printed in the handoff.

import { describe, expect, test } from "vitest";
import {
  CONFIG,
  HOURS_PER_TURN,
  PLANT_DYNAMICS,
  PLANT_TECHS,
  farmProductionForecast,
  newGame,
  type GameState,
  type ScenarioPlant,
  type StorageState,
} from "../../../src/engine";
import { formatMw } from "../../../src/app/format";
import {
  setpointRowKey,
  setpointRows,
  type PlantSetpointRow,
  type StorageSetpointRow,
  type TradeSetpointRow,
} from "../../../src/app/panel/setpoints";
import { makeScenario } from "../../helpers/scenario";

function plant(id: string, tech: ScenarioPlant["tech"], name = id): ScenarioPlant {
  // Automation endowed: these tests read the aggregate (AUTO) rows.
  return { id, name, hex: { q: 0, r: 0 }, tech, capacityMw: 400, automation: true, setpointMw: 0 };
}

describe("plants — merit order as a lesson (SetpointSlider.prompt.md)", () => {
  test("cheapest first, and the note is the technology's variable cost", () => {
    const state = newGame(7, {
      ...makeScenario(),
      plants: [plant("p-ocgt", "ocgt"), plant("p-coal", "coal"), plant("p-nuclear", "nuclear")],
    });
    const rows = setpointRows(state).filter((row) => row.kind === "plant");

    expect(rows.map((row) => row.id)).toEqual(["p-nuclear", "p-coal", "p-ocgt"]);
    const coal = rows[1] as PlantSetpointRow;
    expect(coal.note).toBe(`${PLANT_TECHS.coal.varCostPlnPerMwh} zł/MWh`);
    expect(coal.tech).toBe("węgiel");
    expect(coal.maxMw).toBe(400);
  });

  test("object names are printed in caps (copy rules)", () => {
    const state = newGame(7, makeScenario({ plants: [plant("p-1", "ccgt", "EC Modrzyca")] }));
    expect(setpointRows(state)[0]?.name).toBe("EC MODRZYCA");
  });
});

describe("plants — manual control is one slider per block (01 §5.1, 0.28)", () => {
  test("a manual plant lists its blocks; an automated one carries the switch", () => {
    const manual = newGame(
      7,
      makeScenario({
        plants: [{ ...plant("p-1", "ccgt", "EC Modrzyca"), automation: false, blocks: 2 }],
      }),
    );
    const rows = setpointRows(manual).filter((row) => row.kind === "plantBlock");
    expect(rows.map((row) => row.name)).toEqual(["EC MODRZYCA · BLOK 1", "EC MODRZYCA · BLOK 2"]);
    expect(rows.map((row) => row.blockIndex)).toEqual([0, 1]);
    expect(rows[0]?.maxMw).toBe(200); // the BLOCK's rated power, not the plant's
    // A cold block says so instead of pretending to ramp.
    expect(rows[0]?.note).toContain("POSTÓJ · ZIMNY");
    // No retrofit — no switch to render.
    expect(rows.some((row) => row.modeToggle)).toBe(false);

    const automated = newGame(
      7,
      makeScenario({ plants: [{ ...plant("p-1", "ccgt", "EC Modrzyca"), blocks: 2 }] }),
    );
    const auto = setpointRows(automated).find((row) => row.kind === "plant");
    expect(auto?.modeToggle).toBe("auto");
  });
});

describe("plants — technical minimum on the slider (01 §5.1 pt 4)", () => {
  test("a block row carries its own minimum, the AUTO row the smallest block's", () => {
    const manual = newGame(
      7,
      makeScenario({ plants: [{ ...plant("p-1", "ccgt"), automation: false, blocks: 2 }] }),
    );
    const blockRows = setpointRows(manual).filter((row) => row.kind === "plantBlock");
    expect(blockRows.map((row) => row.minMw)).toEqual([
      PLANT_DYNAMICS.ccgt.minLoadShare * 200,
      PLANT_DYNAMICS.ccgt.minLoadShare * 200,
    ]);

    const automated = newGame(
      7,
      makeScenario({ plants: [{ ...plant("p-1", "coal"), blocks: 2 }] }),
    );
    const autoRow = setpointRows(automated).find((row) => row.kind === "plant");
    // The controller's smallest stable order is one 200 MW block at its minimum.
    expect(autoRow?.minMw).toBe(PLANT_DYNAMICS.coal.minLoadShare * 200);
  });

  test("OCGT has no minimum — its slider keeps the full range", () => {
    const state = newGame(7, makeScenario({ plants: [plant("p-1", "ocgt")] }));
    const row = setpointRows(state).find((r) => r.kind === "plant");
    expect(row?.minMw).toBe(0);
  });
});

describe("storage — one signed setpoint and the state of charge (01 §5.3)", () => {
  function storageState(setpoint: StorageState["setpoint"]): GameState {
    return newGame(7, {
      ...makeScenario(),
      plants: [],
      storages: [
        {
          id: "storage-1",
          name: "BESS Polana",
          hex: { q: 0, r: 0 },
          tech: "battery",
          powerMw: 150,
          capacityMwh: 300,
          socMwh: 186,
          setpoint,
        },
      ],
    });
  }

  test("row carries the mode, the power limit and the SOC share", () => {
    const row = setpointRows(storageState({ mode: "discharge", mw: 100 }))[0] as StorageSetpointRow;

    expect(row.kind).toBe("storage");
    expect(row.mode).toBe("discharge");
    expect(row.valueMw).toBe(100);
    expect(row.maxMw).toBe(150);
    expect(row.valueLabel).toBe("ODDAWAJ 100 / 150 MW");
    expect(row.socPercent).toBeCloseTo(62, 6);
    expect(row.socLabel).toBe("SOC 62%");
    expect(row.tech).toBe("150 MW / 300 MWh");
  });

  test("charging is the negative half of the range", () => {
    const row = setpointRows(storageState({ mode: "charge", mw: 100 }))[0] as StorageSetpointRow;

    expect(row.valueMw).toBe(-100);
    expect(row.mode).toBe("charge");
    // The power keeps its sign out of the label — the direction is a word.
    expect(row.valueLabel).toBe("ŁADUJ 100 / 150 MW");
  });

  test("a power of zero rests, whatever mode the state carries", () => {
    const row = setpointRows(storageState({ mode: "discharge", mw: 0 }))[0] as StorageSetpointRow;

    expect(row.valueMw).toBe(0);
    expect(row.mode).toBe("idle");
    expect(row.valueLabel).toBe("STOP 0 / 150 MW");
  });
});

describe("border — import and export (01 §5.7)", () => {
  test("one border point produces both rows, priced from CONFIG", () => {
    const state = newGame(7, {
      ...makeScenario(),
      plants: [],
      borders: [
        {
          id: "border-1",
          name: "Granica Wschód",
          hex: { q: 0, r: 0 },
          throughputMw: 500,
          importSetpointMw: 100,
          exportSetpointMw: 50,
        },
      ],
    });
    const rows = setpointRows(state).filter(
      (row): row is TradeSetpointRow => row.kind === "import" || row.kind === "export",
    );

    expect(rows.map((row) => row.kind)).toEqual(["import", "export"]);
    expect(rows[0]?.name).toBe("IMPORT GRANICA WSCHÓD");
    expect(rows[0]?.valueMw).toBe(100);
    expect(rows[0]?.note).toBe(`${CONFIG.importPricePlnPerMwh} zł/MWh`);
    expect(rows[1]?.name).toBe("EKSPORT GRANICA WSCHÓD");
    expect(rows[1]?.valueMw).toBe(50);
    expect(rows[1]?.note).toBe(`${CONFIG.exportPricePlnPerMwh} zł/MWh`);
    // Both rows belong to one border, so the key has to carry the direction.
    expect(setpointRowKey(rows[0]!)).not.toBe(setpointRowKey(rows[1]!));
  });
});

describe("farms — a switch and the weather's own number (01 §4.1)", () => {
  test("running: the block forecast marked AUTO; switched off: nothing", () => {
    const scenario = makeScenario({
      plants: [],
      farms: [
        {
          id: "farm-1",
          name: "FW Grzbiet",
          hex: { q: 0, r: 0 },
          tech: "wind",
          capacityMw: 300,
          enabled: true,
          windClass: "open",
          solarMultiplier: 1,
        },
      ],
    });
    const state = newGame(7, scenario);
    let expected = 0;
    for (let hour = 0; hour < HOURS_PER_TURN; hour++) {
      expected += farmProductionForecast(state, "farm-1", hour)?.mw ?? 0;
    }
    const row = setpointRows(state)[0];
    if (row?.kind !== "farm") throw new Error("expected a farm row");

    expect(row.name).toBe("FW GRZBIET");
    expect(row.size).toBe("300 MW");
    expect(row.value).toBe(`~${formatMw(expected / HOURS_PER_TURN)} · AUTO`);

    const off = setpointRows(
      newGame(7, { ...scenario, farms: [{ ...scenario.farms[0]!, enabled: false }] }),
    )[0];
    if (off?.kind !== "farm") throw new Error("expected a farm row");
    expect(off.enabled).toBe(false);
    expect(off.value).toBe("0 MW");
  });
});
