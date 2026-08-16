// BUDOWY — the build schedule of the standing panel (01 §8 pt 5). Objects
// count down in game days, lines in played hours (01 §2.6).

import { describe, expect, test } from "vitest";
import { applyAction, newGame } from "../../../src/engine";
import { buildQueue } from "../../../src/app/panel/constructions";
import { makeScenario } from "../../helpers/scenario";

const PATH = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: 3, r: 0 },
  { q: 4, r: 0 },
];

describe("build queue", () => {
  test("nothing under construction leaves the section empty", () => {
    expect(buildQueue(newGame(7, makeScenario()))).toEqual([]);
  });

  test("objects and lines share the list, soonest first, in their own units", () => {
    let state = newGame(7, makeScenario());
    // A coal block takes 5 game days; an LV line over 4 hexes takes 12 h.
    state = applyAction(state, {
      type: "buildPlant",
      tech: "coal",
      capacityMw: 500,
      hex: { q: 2, r: 2 },
    });
    state = applyAction(state, { type: "buildLine", lineType: "lv", path: PATH });
    const rows = buildQueue(state);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.remaining).toBe("12 H");
    expect(rows[0]?.name).toBe("LINIA NN · 100 KM");
    expect(rows[1]?.remaining).toBe("5 DÓB");
  });

  test("an expansion names the object it upgrades in place (01 §7)", () => {
    const state = applyAction(newGame(7, makeScenario()), {
      type: "expandPlant",
      plantId: "plant-1",
      capacityMw: 400,
    });
    expect(buildQueue(state)[0]?.name).toBe("ROZBUDOWA · P1");
  });
});
