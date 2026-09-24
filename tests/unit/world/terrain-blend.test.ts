// Soft borders between hexes (src/world/render/terrain/blend.ts, docs/08 §3):
// the ground of a point is a blend of the three hexes around it, the border
// wanders around the straight hex edge and frays, the middle of a hex stays
// its own, water never takes part, and the trees follow the forest's ground
// over its border (forest.ts).

import { describe, expect, test } from "vitest";
import { newGame } from "../../../src/engine";
import { buildWorldScene } from "../../../src/world/bridge";
import type { WorldHex } from "../../../src/world/bridge/worldScene";
import { CITY_FOOTPRINT } from "../../../src/world/render/core/exaggeration";
import { worldRng } from "../../../src/world/render/core/prng";
import {
  HEX_PITCH_KM,
  axialToOffset,
  hexToWorld,
  worldToHex,
} from "../../../src/world/render/core/units";
import {
  BLEND_FRAY_OF,
  BLEND_PER_KM,
  blendNoise,
  hexBlend,
  newHexBlend,
  type BlendNoise,
  type FrayOf,
} from "../../../src/world/render/terrain/blend";
import { buildForest } from "../../../src/world/render/terrain/forest";
import {
  PAD_BLEND_KM,
  PAD_FLAT_KM,
  buildHeightField,
} from "../../../src/world/render/terrain/heightfield";
import { CHARACTERS, boardLooks } from "../../../src/world/render/terrain/looks";

const board = buildWorldScene(newGame(7), null).board;
const noise = blendNoise();
const isWater = (hex: WorldHex) => hex.terrain === "lake" || hex.terrain === "sea";
const byOffset = new Map(board.hexes.map((hex) => [`${hex.col},${hex.row}`, hex]));
/** The board hex at an axial address; off the board, the edge hex the shader's virtual ring copies. */
function edgeHex(q: number, r: number): WorldHex {
  const { col, row } = axialToOffset({ q, r });
  const clamped = `${Math.min(board.cols - 1, Math.max(0, col))},${Math.min(board.rows - 1, Math.max(0, row))}`;
  return byOffset.get(clamped)!;
}
const frayOf: FrayOf = (q, r) => BLEND_FRAY_OF[edgeHex(q, r).terrain];
const onBoard = (q: number, r: number) => {
  const { col, row } = axialToOffset({ q, r });
  return col >= 0 && row >= 0 && col < board.cols && row < board.rows;
};

/** Weight of every hex (by key) at a point. */
function weightsAt(x: number, z: number): Map<string, number> {
  const blend = hexBlend(x, z, noise, frayOf, newHexBlend());
  const weights = new Map<string, number>();
  for (let i = 0; i < 3; i++) {
    const key = `${blend.q[i]},${blend.r[i]}`;
    weights.set(key, (weights.get(key) ?? 0) + blend.w[i]!);
  }
  return weights;
}

/** Points on a 0.5 km lattice over every land hex's own cell. */
function* landSamples(): Generator<{ hex: WorldHex; x: number; z: number; d: number }> {
  for (const hex of board.hexes) {
    if (isWater(hex)) continue;
    for (let dx = -14; dx <= 14; dx += 0.5) {
      for (let dz = -13; dz <= 13; dz += 0.5) {
        const x = hex.x + dx;
        const z = hex.z + dz;
        const home = worldToHex({ x, z });
        if (home.q !== hex.q || home.r !== hex.r) continue;
        yield { hex, x, z, d: Math.hypot(dx, dz) };
      }
    }
  }
}

describe("blend noise", () => {
  test("three channels, each spread evenly over 0..1", () => {
    const data = noise.texture.image.data as Uint8Array;
    for (let channel = 0; channel < 3; channel++) {
      const deciles = new Array<number>(10).fill(0);
      for (let i = channel; i < data.length; i += 4) deciles[Math.floor(data[i]! / 25.6)]!++;
      for (const count of deciles) expect(count / (data.length / 4)).toBeCloseTo(0.1, 2);
    }
    // Independent channels: no two alike.
    let same = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] === data[i + 1]) same++;
    expect(same / (data.length / 4)).toBeLessThan(0.02);
  });
});

describe("hex blend", () => {
  test("the three hexes around a point are its lattice cell, the nearest one among them", () => {
    const blend = newHexBlend();
    for (let i = 0; i < 2000; i++) {
      const x = 30 + ((i * 37.3) % 480);
      const z = 30 + ((i * 53.9) % 360);
      hexBlend(x, z, noise, frayOf, blend);
      const keys = [0, 1, 2].map((k) => `${blend.q[k]},${blend.r[k]}`);
      expect(new Set(keys).size).toBe(3);
      const home = worldToHex({ x, z });
      expect(keys).toContain(`${home.q},${home.r}`);
      // Mutual neighbours: every pair one step apart.
      for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) {
          const pa = hexToWorld({ q: blend.q[a]!, r: blend.r[a]! });
          const pb = hexToWorld({ q: blend.q[b]!, r: blend.r[b]! });
          expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeCloseTo(HEX_PITCH_KM, 6);
        }
      }
    }
  });

  test("the weights share the land: non-negative, summing to one, none on water", () => {
    const blend = newHexBlend();
    for (let i = 0; i < 5000; i++) {
      const x = -40 + ((i * 41.7) % 600);
      const z = -40 + ((i * 29.3) % 480);
      hexBlend(x, z, noise, frayOf, blend);
      let sum = 0;
      let land = false;
      for (let k = 0; k < 3; k++) {
        const w = blend.w[k]!;
        expect(w).toBeGreaterThanOrEqual(0);
        if (frayOf(blend.q[k]!, blend.r[k]!) < 0) expect(w).toBe(0);
        else land = true;
        sum += w;
      }
      expect(sum).toBeCloseTo(land ? 1 : 0, 9);
    }
  });

  test("without noise the blend is the hex grid itself", () => {
    const still: BlendNoise = {
      texture: noise.texture,
      sample(_u, _v, out) {
        out.fill(0.5);
      },
    };
    const blend = newHexBlend();
    for (let i = 0; i < 2000; i++) {
      const x = 30 + ((i * 37.3) % 480);
      const z = 30 + ((i * 53.9) % 360);
      hexBlend(x, z, still, () => 1, blend);
      const home = worldToHex({ x, z });
      const top = [0, 1, 2].reduce((a, b) => (blend.w[b]! > blend.w[a]! ? b : a));
      if (blend.w[top]! < 0.99) continue; // on the border itself
      expect(`${blend.q[top]},${blend.r[top]}`).toBe(`${home.q},${home.r}`);
    }
  });

  test("the weights are continuous: no jump where the lattice cell changes", () => {
    // Steps of 10 m along long lines crossing many cells; a weight moves by
    // at most the band's slope over a step, never by a jump.
    let worst = 0;
    for (let line = 0; line < 12; line++) {
      const angle = 0.37 + line * 0.51;
      const x0 = 60 + line * 31;
      const z0 = 40 + line * 17;
      let previous = weightsAt(x0, z0);
      for (let s = 1; s < 8000; s++) {
        const x = x0 + Math.cos(angle) * s * 0.01;
        const z = z0 + Math.sin(angle) * s * 0.01;
        const next = weightsAt(x, z);
        for (const key of new Set([...previous.keys(), ...next.keys()])) {
          worst = Math.max(worst, Math.abs((next.get(key) ?? 0) - (previous.get(key) ?? 0)));
        }
        previous = next;
      }
    }
    expect(worst).toBeLessThan(0.2);
  });

  test("the middle of every land hex is its own; the borders overlap by about a seventh", () => {
    const shares = new Map<string, { own: number; count: number }>();
    let shared = 0;
    let lost = 0;
    for (const { hex, x, z, d } of landSamples()) {
      const own = weightsAt(x, z).get(hex.key) ?? 0;
      // The flat building pad is the hex's alone; out to where the pad
      // blends into the relief no neighbour takes over.
      if (d < PAD_FLAT_KM && own < 1) shared++;
      if (d < PAD_BLEND_KM - 1 && own < 0.5) lost++;
      const share = shares.get(hex.key) ?? { own: 0, count: 0 };
      share.own += own;
      share.count += 1;
      shares.set(hex.key, share);
    }
    expect(shared).toBe(0);
    expect(lost).toBe(0);
    const list = [...shares.values()].map(({ own, count }) => own / count).sort((a, b) => a - b);
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    // Borders do wander: a hex gives up part of its cell and takes part of
    // its neighbours'…
    expect(mean).toBeGreaterThan(0.78);
    expect(mean).toBeLessThan(0.92);
    // …and still reads as its own: at least half of it, 95 % of hexes two thirds.
    expect(list[0]).toBeGreaterThan(0.5);
    expect(list[Math.floor(list.length * 0.05)]).toBeGreaterThan(0.66);
  });

  test("fields meet along gentler borders than wild ground", () => {
    // How bent a border is: the length of the border line inside a cell,
    // walked on a fine lattice, per straight kilometre of hex edge.
    const bent = (kinds: ReadonlySet<WorldHex["terrain"]>) => {
      let crossings = 0;
      let cells = 0;
      for (const hex of board.hexes) {
        if (!kinds.has(hex.terrain)) continue;
        for (let dx = -14; dx <= 14; dx += 0.25) {
          let last: boolean | null = null;
          for (let dz = -13; dz <= 13; dz += 0.25) {
            const x = hex.x + dx;
            const z = hex.z + dz;
            const home = worldToHex({ x, z });
            if (home.q !== hex.q || home.r !== hex.r) continue;
            const mine = (weightsAt(x, z).get(hex.key) ?? 0) > 0.5;
            if (last !== null && mine !== last) crossings++;
            last = mine;
            cells++;
          }
        }
      }
      return crossings / cells;
    };
    const fields = bent(new Set(["plains"]));
    const wild = bent(new Set(["forest", "highlands", "swamp", "mountains"]));
    expect(wild).toBeGreaterThan(fields * 1.1);
  });
});

describe("trees follow the forest's ground", () => {
  const looks = boardLooks(board, worldRng(7, "terrain:looks"));
  const field = buildHeightField(board, worldRng(7, "terrain:relief"), {
    cellKm: 4,
    skirtKm: 60,
  });
  const forest = buildForest(
    board,
    field,
    worldRng(7, "terrain:forest"),
    1,
    false,
    looks.byKey,
    noise,
  )!;
  const trees: { x: number; z: number }[] = [];
  for (const mesh of forest.group.children) {
    if (!mesh.name.endsWith("-near")) continue;
    const matrices = (mesh as unknown as { instanceMatrix: { array: Float32Array } }).instanceMatrix
      .array;
    for (let i = 0; i < matrices.length; i += 16) {
      trees.push({ x: matrices[i + 12]!, z: matrices[i + 14]! });
    }
  }
  const forestHexes = board.hexes.filter((hex) => hex.terrain === "forest");
  const canopyAt = (x: number, z: number) => {
    const blend = hexBlend(x, z, noise, frayOf, newHexBlend());
    let canopy = 0;
    let forestPush = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      if (!onBoard(blend.q[i]!, blend.r[i]!)) continue;
      if (edgeHex(blend.q[i]!, blend.r[i]!).terrain !== "forest") continue;
      canopy += blend.w[i]!;
      forestPush = Math.max(forestPush, blend.pushed[i]!);
    }
    const top = Math.max(...blend.pushed);
    return { canopy, outsideKm: (top - forestPush) / BLEND_PER_KM };
  };

  test("about as many trees as the forest hexes hold, less their building pads", () => {
    expect(trees.length).toBe(forest.count);
    const density =
      forestHexes.reduce(
        (sum, hex) => sum + CHARACTERS.forest[looks.byKey.get(hex.key)!.character]!.density,
        0,
      ) / forestHexes.length;
    // 520 a hex at full detail; the pad takes about a quarter of a hex.
    const nominal = forestHexes.length * 520 * density;
    expect(trees.length).toBeGreaterThan(nominal * 0.7);
    expect(trees.length).toBeLessThan(nominal);
  });

  test("they stand on the forest's ground and stray only a little past its edge", () => {
    let onForest = 0;
    let pastOutline = 0;
    for (const { x, z } of trees) {
      const { canopy, outsideKm } = canopyAt(x, z);
      if (canopy >= 0.5) onForest++;
      expect(outsideKm).toBeLessThan(6);
      const home = worldToHex({ x, z });
      if (edgeHex(home.q, home.r).terrain !== "forest") pastOutline++;
    }
    expect(onForest / trees.length).toBeGreaterThan(0.9);
    // The forest reaches over its hexes' outline, and so do its trees.
    expect(pastOutline / trees.length).toBeGreaterThan(0.03);
  });

  test("no tree on a building pad or in a town", () => {
    const land = board.hexes.filter((hex) => !isWater(hex));
    const towns = board.hexes.filter((hex) => hex.terrain === "urban");
    let nearestPad = Number.POSITIVE_INFINITY;
    let nearestTown = Number.POSITIVE_INFINITY;
    for (const { x, z } of trees) {
      for (const hex of land) nearestPad = Math.min(nearestPad, Math.hypot(x - hex.x, z - hex.z));
      for (const town of towns) {
        nearestTown = Math.min(nearestTown, Math.hypot(x - town.x, z - town.z));
      }
    }
    expect(nearestPad).toBeGreaterThan(PAD_BLEND_KM - 0.3);
    expect(nearestTown).toBeGreaterThan(CITY_FOOTPRINT.max * (HEX_PITCH_KM / 2));
  });
});
