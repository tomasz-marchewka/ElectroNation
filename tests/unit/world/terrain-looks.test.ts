// Per-hex looks of the ground (src/world/render/terrain/looks.ts, variants.ts):
// every hex of a biome gets its own character — a ground variant with its own
// structure and palette — plus a tone and a tile transform; the same for the
// same seed, different between neighbours, loosely clustered into regions, and
// narrow enough in tone that a hex still reads as its biome (docs/08 §3). The
// heightfield carries only what follows the relief and the water; the hexes'
// own ground is blended per pixel (terrain-blend.test.ts).

import { describe, expect, test } from "vitest";
import { newGame } from "../../../src/engine";
import { buildWorldScene } from "../../../src/world/bridge";
import type { WorldHex } from "../../../src/world/bridge/worldScene";
import { worldRng } from "../../../src/world/render/core/prng";
import { BLEND_FRAY_OF } from "../../../src/world/render/terrain/blend";
import { buildHeightField } from "../../../src/world/render/terrain/heightfield";
import {
  BIOME_LAYER,
  CHARACTERS,
  LOOK_OFFSET_KM,
  LOOK_PAD,
  LOOK_SCALE_MAX,
  LOOK_SCALE_MIN,
  LOOK_TEXELS,
  boardLooks,
} from "../../../src/world/render/terrain/looks";
import {
  CLASSIC,
  LAYERS,
  SLICE_COUNT,
  SLICE_TILE_KM,
  VARIANTS,
  sliceOf,
  variantsOf,
} from "../../../src/world/render/terrain/variants";

const board = buildWorldScene(newGame(7), null).board;
const looksFor = (seed: number) => boardLooks(board, worldRng(seed, "terrain:looks"));
const isWater = (hex: WorldHex) => hex.terrain === "lake" || hex.terrain === "sea";
const byAxial = new Map(board.hexes.map((hex) => [hex.key, hex]));

const AXIAL_NEIGHBOURS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

function neighbours(hex: WorldHex): WorldHex[] {
  return AXIAL_NEIGHBOURS.map(([dq, dr]) => byAxial.get(`${hex.q + dq},${hex.r + dr}`)).filter(
    (other): other is WorldHex => other !== undefined,
  );
}

/** Every unordered pair of adjacent land hexes of the same terrain. */
function sameKindPairs(): [WorldHex, WorldHex][] {
  const pairs: [WorldHex, WorldHex][] = [];
  for (const hex of board.hexes) {
    if (isWater(hex)) continue;
    for (const other of neighbours(hex)) {
      if (other.terrain === hex.terrain && other.key > hex.key) pairs.push([hex, other]);
    }
  }
  return pairs;
}

describe("ground variants", () => {
  test("every slice has one address: classic layers first, then the variants", () => {
    expect(SLICE_COUNT).toBe(LAYERS.length + VARIANTS.length);
    expect(SLICE_TILE_KM).toHaveLength(SLICE_COUNT);
    const slices = LAYERS.flatMap((layer) => variantsOf(layer).map((id) => sliceOf(layer, id)));
    expect([...slices].sort((a, b) => a - b)).toEqual([...Array(SLICE_COUNT).keys()]);
    LAYERS.forEach((layer, index) => expect(sliceOf(layer, CLASSIC)).toBe(index));
    expect(new Set(VARIANTS.map((variant) => variant.painter)).size).toBe(VARIANTS.length);
  });

  test("every character names a variant of its biome's layer", () => {
    for (const [terrain, list] of Object.entries(CHARACTERS)) {
      const layer = BIOME_LAYER[terrain as WorldHex["terrain"]];
      if (!layer) {
        expect(list).toHaveLength(0);
        continue;
      }
      for (const character of list) expect(variantsOf(layer)).toContain(character.variant);
    }
  });

  test("every land biome has at least three variants to show", () => {
    for (const terrain of ["plains", "forest", "highlands", "mountains", "swamp"] as const) {
      const variants = new Set(CHARACTERS[terrain].map((character) => character.variant));
      expect(variants.size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("hex looks", () => {
  test("the same seed gives the same looks; another seed another board", () => {
    const a = looksFor(7);
    const b = looksFor(7);
    expect(b.grid.data).toEqual(a.grid.data);
    expect([...b.byKey.entries()]).toEqual([...a.byKey.entries()]);
    expect(looksFor(8).grid.data).not.toEqual(a.grid.data);
  });

  test("every land hex has a character of its own biome; water stays neutral", () => {
    const { byKey } = looksFor(7);
    expect(byKey.size).toBe(board.hexes.length);
    for (const hex of board.hexes) {
      const look = byKey.get(hex.key)!;
      if (isWater(hex)) {
        expect(look.character).toBe(-1);
        expect(look.tint).toEqual([1, 1, 1]);
        expect(look.saturation).toBe(1);
      } else {
        expect(CHARACTERS[hex.terrain][look.character]).toBeDefined();
      }
    }
  });

  test("a hex's ground is its character's variant; a town stands in a neighbouring plain's", () => {
    const { byKey } = looksFor(7);
    const variantOf = (hex: WorldHex) => {
      const layer = BIOME_LAYER[hex.terrain]!;
      return sliceOf(layer, CHARACTERS[hex.terrain][byKey.get(hex.key)!.character]!.variant);
    };
    const nearest = (hex: WorldHex, terrain: WorldHex["terrain"]) =>
      hex.terrain === terrain ? hex : neighbours(hex).find((other) => other.terrain === terrain);
    for (const hex of board.hexes) {
      const look = byKey.get(hex.key)!;
      expect(look.fray).toBe(BLEND_FRAY_OF[hex.terrain]);
      const range = nearest(hex, "mountains");
      expect(look.rock).toBe(range ? variantOf(range) : sliceOf("rock", CLASSIC));
      if (isWater(hex)) {
        expect(look.layer).toBe(-1);
        continue;
      }
      if (hex.terrain === "urban") {
        const field = nearest(hex, "plains");
        expect(look.layer).toBe(LAYERS.indexOf("grass"));
        expect(look.ground).toBe(field ? variantOf(field) : sliceOf("grass", CLASSIC));
        continue;
      }
      expect(look.layer).toBe(LAYERS.indexOf(BIOME_LAYER[hex.terrain]!));
      expect(look.ground).toBe(variantOf(hex));
    }
  });

  test("the grid covers the board plus the virtual ring: tile map, ground and tone per hex", () => {
    const { byKey, grid } = looksFor(7);
    expect(grid.pad).toBe(LOOK_PAD);
    expect(grid.width).toBe(board.cols + 2 * LOOK_PAD);
    expect(grid.height).toBe(board.rows + 2 * LOOK_PAD);
    expect(grid.data.length).toBe(grid.width * grid.height * LOOK_TEXELS * 4);
    for (const hex of board.hexes) {
      const look = byKey.get(hex.key)!;
      const o = ((hex.row + LOOK_PAD) * grid.width + hex.col + LOOK_PAD) * LOOK_TEXELS * 4;
      expect(grid.data[o]).toBeCloseTo(Math.cos(look.angle) / look.scale, 6);
      expect(grid.data[o + 1]).toBeCloseTo(Math.sin(look.angle) / look.scale, 6);
      expect(grid.data[o + 2]).toBeCloseTo(look.offsetX, 4);
      expect(grid.data[o + 3]).toBeCloseTo(look.offsetZ, 4);
      expect([...grid.data.subarray(o + 4, o + 8)]).toEqual([
        ...new Float32Array([look.ground, look.rock, look.layer, look.fray]),
      ]);
      [...look.tint, look.saturation].forEach((value, c) =>
        expect(grid.data[o + 8 + c]).toBeCloseTo(value, 6),
      );
      expect(look.offsetX).toBeGreaterThanOrEqual(0);
      expect(look.offsetX).toBeLessThan(LOOK_OFFSET_KM);
    }
    // No texel is left empty: the virtual ring has tile maps, valid slices and
    // tones too — each a copy of the board's edge next to it.
    for (let hex = 0; hex < grid.width * grid.height; hex++) {
      const o = hex * LOOK_TEXELS * 4;
      const scale = 1 / Math.hypot(grid.data[o]!, grid.data[o + 1]!);
      expect(scale).toBeGreaterThanOrEqual(LOOK_SCALE_MIN - 1e-6);
      expect(scale).toBeLessThanOrEqual(LOOK_SCALE_MAX + 1e-6);
      for (const slice of [grid.data[o + 4]!, grid.data[o + 5]!]) {
        expect(Number.isInteger(slice)).toBe(true);
        expect(slice).toBeGreaterThanOrEqual(0);
        expect(slice).toBeLessThan(SLICE_COUNT);
      }
      expect(grid.data[o + 6]).toBeGreaterThanOrEqual(-1);
      expect(grid.data[o + 6]).toBeLessThan(LAYERS.length);
      expect(grid.data[o + 8]).toBeGreaterThan(0.7);
    }
    const ring = (x: number, y: number) => (y * grid.width + x) * LOOK_TEXELS * 4;
    const corner = byKey.get(board.hexes.find((hex) => hex.col === 0 && hex.row === 0)!.key)!;
    expect([...grid.data.subarray(ring(0, 0) + 4, ring(0, 0) + 12)]).toEqual([
      ...new Float32Array([
        corner.ground,
        corner.rock,
        corner.layer,
        corner.fray,
        ...corner.tint,
        corner.saturation,
      ]),
    ]);
  });

  test("no two neighbours of a biome show the same stretch of tile or the same tone", () => {
    const { byKey } = looksFor(7);
    const pairs = sameKindPairs();
    expect(pairs.length).toBeGreaterThan(100);
    for (const [a, b] of pairs) {
      const la = byKey.get(a.key)!;
      const lb = byKey.get(b.key)!;
      expect([la.angle, la.offsetX, la.offsetZ]).not.toEqual([lb.angle, lb.offsetX, lb.offsetZ]);
      expect(la.tint).not.toEqual(lb.tint);
    }
  });

  test("the characters cluster loosely: regions show, most neighbours still differ", () => {
    for (const seed of [1, 7, 42]) {
      const { byKey } = looksFor(seed);
      const pairs = sameKindPairs();
      const shared =
        pairs.filter(([a, b]) => byKey.get(a.key)!.character === byKey.get(b.key)!.character)
          .length / pairs.length;
      // Uniform picks would share about a fifth (3–7 characters per biome).
      expect(shared).toBeGreaterThan(0.25);
      expect(shared).toBeLessThan(0.55);
      const plains = new Set(
        board.hexes
          .filter((hex) => hex.terrain === "plains")
          .map((hex) => byKey.get(hex.key)!.character),
      );
      expect(plains.size).toBe(CHARACTERS.plains.length);
    }
  });

  test("tones stay narrow: a hex keeps reading as its biome", () => {
    for (const list of Object.values(CHARACTERS)) {
      for (const { tint, saturation, scale } of list) {
        const luma = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2];
        expect(luma).toBeGreaterThan(0.85);
        expect(luma).toBeLessThan(1.15);
        for (const channel of tint) {
          expect(channel).toBeGreaterThan(0.75);
          expect(channel).toBeLessThan(1.25);
        }
        expect(saturation).toBeGreaterThanOrEqual(0.7);
        expect(saturation).toBeLessThanOrEqual(1.15);
        expect(scale[0]).toBeGreaterThanOrEqual(LOOK_SCALE_MIN);
        expect(scale[1]).toBeLessThanOrEqual(LOOK_SCALE_MAX);
      }
    }
  });
});

describe("the heightfield's ground cover", () => {
  const field = buildHeightField(board, worldRng(7, "terrain:relief"), { cellKm: 4, skirtKm: 60 });

  /** The cover carried by the grid vertex nearest to a point. */
  function coverAt(x: number, z: number): number[] {
    const nearest = (axis: Float64Array, v: number) => {
      let best = 0;
      for (let i = 1; i < axis.length; i++) {
        if (Math.abs(axis[i]! - v) < Math.abs(axis[best]! - v)) best = i;
      }
      return best;
    };
    const i = nearest(field.zs, z) * field.nx + nearest(field.xs, x);
    return [...field.cover.subarray(i * 4, i * 4 + 4)];
  }

  test("only what follows the relief and the water: a town's pavement, the beach, the seabed", () => {
    for (const hex of board.hexes) {
      const [pavement, beach, seabed, sky] = coverAt(hex.x, hex.z);
      expect(pavement! + beach! + seabed!).toBeLessThanOrEqual(1 + 1e-6);
      expect(sky).toBeGreaterThanOrEqual(0.55 - 1e-6);
      expect(sky).toBeLessThanOrEqual(1 + 1e-6);
      if (hex.terrain === "sea" || hex.terrain === "lake") {
        expect(seabed).toBeGreaterThan(0.9);
      } else if (hex.terrain === "urban") {
        expect(pavement).toBeGreaterThan(0.9);
      } else {
        // The land's own ground is left to the hexes' blend.
        expect(pavement! + beach! + seabed!).toBeLessThan(0.05);
      }
    }
  });
});
