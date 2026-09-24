// The character of every hex of ground (docs/08 §3). Without it each hex of a
// biome is the same tile and the board reads as wallpaper. Each land hex gets:
//
// - a CHARACTER of its biome — strip fields, large fields, meadows, a hedged
//   mosaic; a spruce forest in compartments, broadleaf, clear-cuts; burnt
//   heather, walled pasture, scree; limestone, schist; reeds, drained peat —
//   each with a ground variant of its own (variants.ts), so hexes of one biome
//   differ in structure and palette, not only in tone. The characters are
//   picked in loose regional clusters (one noise field per character slot plus
//   a draw per hex): regions show, yet neighbours often differ;
// - its own tone inside that character, a value and hue jitter;
// - its own ground transform — tile rotation, scale and offset — so no two
//   hexes show the same stretch of a tile and the tiles never line up. The
//   rotation follows a slow regional direction with a small jitter: field
//   systems, forest lines and ditches of neighbouring hexes run roughly the
//   same way, as they do in a real landscape, instead of a quilt of tiles
//   turned at random.
//
// A hex's look travels with its ground: where it reaches over a border into a
// neighbour (blend.ts) it keeps its own variant, tile frame and tone, so a
// forest tongue in a field is that forest, not a copy in the field's frame.
// Legibility first: every variant keeps its biome's hue family, a hex still
// reads as its biome at one glance from the strategic view. Deterministic: one
// renderer stream per scene seed, visited in a fixed order.

import type { WorldBoard, WorldHex } from "../../bridge/worldScene";
import type { Rng } from "../core/prng";
import { BLEND_FRAY_OF } from "./blend";
import { fbm, gradientNoise, type Noise2D } from "./noise";
import { CLASSIC, LAYERS, sliceOf, type GroundLayer } from "./variants";

type TerrainKind = WorldHex["terrain"];
type Rgb = readonly [number, number, number];

/** The ground layer that carries each biome; water has none. */
export const BIOME_LAYER: Readonly<Record<TerrainKind, GroundLayer | null>> = {
  plains: "grass",
  forest: "canopy",
  mountains: "rock",
  highlands: "moor",
  swamp: "wet",
  urban: "pavement",
  lake: null,
  sea: null,
};

/** One character of a biome. */
export interface Character {
  id: string;
  /** The ground variant of the biome's layer (variants.ts), `classic` for the classic tile. */
  variant: string;
  /** Multiplier of the linear ground albedo. */
  tint: Rgb;
  /** Saturation around the pixel's luminance: < 1 duller, > 1 more vivid. */
  saturation: number;
  /** Range of the ground tile scale: > 1 = larger fields, clumps and pools. */
  scale: readonly [number, number];
  /** Forest: share of broadleaf crowns among the trees. */
  broadleaf: number;
  /** Forest: tree density factor. */
  density: number;
  /** Forest: tree size factor. */
  treeScale: number;
}

function character(
  id: string,
  variant: string,
  tint: Rgb,
  saturation: number,
  scale: readonly [number, number],
  forest: { broadleaf: number; density: number; treeScale?: number } = {
    broadleaf: 0,
    density: 1,
  },
): Character {
  return {
    id,
    variant,
    tint,
    saturation,
    scale,
    broadleaf: forest.broadleaf,
    density: forest.density,
    treeScale: forest.treeScale ?? 1,
  };
}

/**
 * The characters of each biome. The variant carries the structure and most of
 * the colour; the tints are linear, so ×1.1 is about 4 % in sRGB — they tell
 * two hexes of one variant apart and never pass a hex off as another biome.
 */
export const CHARACTERS: Readonly<Record<TerrainKind, readonly Character[]>> = {
  plains: [
    character("mosaic", CLASSIC, [1, 1, 1], 1, [0.85, 1.2]),
    character("strips", "strips", [1, 1, 1], 1, [0.85, 1.2]),
    character("strips-ripe", "strips", [1.1, 1.04, 0.84], 1.05, [0.9, 1.25]),
    character("large", "large", [1, 1, 1], 1, [0.85, 1.2]),
    character("meadow", "meadow", [1, 1, 1], 1, [0.85, 1.2]),
    character("bocage", "bocage", [1, 1, 1], 1, [0.85, 1.2]),
  ],
  forest: [
    character("mixed", CLASSIC, [1, 1, 1], 1, [0.9, 1.15], { broadleaf: 0.45, density: 1 }),
    character("conifer", "conifer", [1, 1, 1], 1, [0.85, 1.15], {
      broadleaf: 0.05,
      density: 1.15,
    }),
    character("broadleaf", "broadleaf", [1, 1, 1], 1, [0.9, 1.25], {
      broadleaf: 0.9,
      density: 0.95,
    }),
    character("young", "young", [1, 1, 1], 1, [0.85, 1.15], {
      broadleaf: 0.3,
      density: 0.55,
      treeScale: 0.75,
    }),
  ],
  highlands: [
    character("heath", CLASSIC, [1, 1, 1], 1, [0.85, 1.15]),
    character("heather", "heather", [1, 1, 1], 1, [0.85, 1.2]),
    character("pasture", "pasture", [1, 1, 1], 1, [0.85, 1.2]),
    character("scree", "scree", [1, 1, 1], 1, [0.85, 1.2]),
  ],
  mountains: [
    character("granite", CLASSIC, [1, 1, 1], 1, [0.85, 1.15]),
    character("limestone", "limestone", [1, 1, 1], 1, [0.85, 1.15]),
    character("schist", "schist", [1, 1, 1], 1, [0.85, 1.15]),
  ],
  // The pools are the marsh's most recognisable shape: never shrunk, so their
  // tile does not repeat more often inside a hex than it did before.
  swamp: [
    character("sedge", CLASSIC, [1, 1, 1], 1, [1.0, 1.25]),
    character("reeds", "reeds", [1, 1, 1], 1, [0.95, 1.25]),
    character("peat", "peat", [1, 1, 1], 1, [0.9, 1.2]),
  ],
  urban: [character("plain", CLASSIC, [1, 1, 1], 1, [0.9, 1.1])],
  lake: [],
  sea: [],
};

/** Bounds of every character's tile scale. */
export const LOOK_SCALE_MIN = 0.6;
export const LOOK_SCALE_MAX = 1.6;
/** Range of the tile offset [km] — more than the largest tile. */
export const LOOK_OFFSET_KM = 100;
/** Virtual hexes around the board in the look grid: the skirt is ~3 hexes wide. */
export const LOOK_PAD = 4;
/** Texels per hex in the look grid: the tile map, the ground, the tone. */
export const LOOK_TEXELS = 3;

/**
 * Scale of the regional fields that cluster the characters [km], about four
 * hexes, and the weight of the per-hex draw against them: regions show, yet
 * about two neighbours in three differ.
 */
const REGION_KM = 100;
const PICK_JITTER = 0.3;
/** Per-hex value jitter (linear, ±) and hue jitter per channel (±). */
const VALUE_JITTER = 0.1;
const HUE_JITTER = 0.04;
/** Tile scale of the virtual hexes around the board. */
const VIRTUAL_SCALE: readonly [number, number] = [0.85, 1.2];
/**
 * Scale of the regional direction field [km] and the per-hex jitter around it
 * [rad]. A quarter turn covers every direction of a rectangular pattern.
 */
const DIRECTION_KM = 260;
const DIRECTION_JITTER = 0.2;

const AXIAL_NEIGHBOURS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

export interface HexLook {
  /** Index into CHARACTERS[terrain]; -1 on water. */
  character: number;
  /** Multiplier of the linear ground albedo, character × jitter. */
  tint: [number, number, number];
  saturation: number;
  /** Rotation of the ground tiles [rad]. */
  angle: number;
  /** Tile scale: > 1 = larger fields, clumps and pools. */
  scale: number;
  /** Offset of the ground tiles [km]. */
  offsetX: number;
  offsetZ: number;
  /** Texture-array slice of the hex's own ground (variants.ts). */
  ground: number;
  /** Slice its steep faces turn to: its own range's rock, a neighbouring range's, or the classic rock. */
  rock: number;
  /** Index of its ground layer in variants.ts LAYERS; −1 on water, which has none. */
  layer: number;
  /** How hard its border frays (blend.ts BLEND_FRAY_OF); negative on water. */
  fray: number;
}

export interface LookGrid {
  /** Virtual hexes on each side of the board. */
  pad: number;
  /** Hexes across and down, virtual ones included. */
  width: number;
  height: number;
  /**
   * LOOK_TEXELS texels of four floats per hex, row-major from (col − pad,
   * row − pad): the tile map as the shader applies it, uv = [[a, −b], [b, a]]
   * · p + offset (a = cos(angle) / scale, b = sin(angle) / scale, then offset
   * x, offset z — rotation and scale folded on the CPU, no trigonometry per
   * pixel); then the ground slice, the rock slice, the layer and the fray;
   * then the tone — linear tint rgb and saturation.
   */
  data: Float32Array;
}

export interface BoardLooks {
  /** Look per hex key (`q,r`); water hexes have a neutral tone. */
  byKey: Map<string, HexLook>;
  grid: LookGrid;
}

const CLASSIC_GRASS = sliceOf("grass", CLASSIC);
const CLASSIC_ROCK = sliceOf("rock", CLASSIC);

/** The neutral look: what water shows — it has no ground of its own. */
export const NEUTRAL_LOOK: Readonly<HexLook> = {
  character: -1,
  tint: [1, 1, 1],
  saturation: 1,
  angle: 0,
  scale: 1,
  offsetX: 0,
  offsetZ: 0,
  ground: CLASSIC_GRASS,
  rock: CLASSIC_ROCK,
  layer: -1,
  fray: -1,
};

interface Ground {
  ground: number;
  rock: number;
  layer: number;
  fray: number;
}

interface Picked {
  character: number;
  tint: Rgb;
  saturation: number;
  scale: number;
}

/** The look of every hex of the board and the look grid the ground shader reads. */
export function boardLooks(board: WorldBoard, rng: Rng): BoardLooks {
  const slots = Math.max(...Object.values(CHARACTERS).map((list) => list.length));
  const fields: Noise2D[] = [];
  for (let i = 0; i < slots; i++) fields.push(gradientNoise(rng));
  const direction = gradientNoise(rng);
  const pitch = board.pitchKm;

  // Characters and tones, in board order.
  const picked = new Map<string, Picked>();
  for (const hex of board.hexes) {
    const list = CHARACTERS[hex.terrain];
    if (list.length === 0) continue;
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < list.length; i++) {
      const regional = fbm(fields[i]!, hex.x / REGION_KM, hex.z / REGION_KM, 2);
      const score = regional + PICK_JITTER * (rng.next() * 2 - 1);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const spec = list[best]!;
    const value = 1 + VALUE_JITTER * (rng.next() * 2 - 1);
    const tint: Rgb = [
      spec.tint[0] * value * (1 + HUE_JITTER * (rng.next() * 2 - 1)),
      spec.tint[1] * value * (1 + HUE_JITTER * (rng.next() * 2 - 1)),
      spec.tint[2] * value * (1 + HUE_JITTER * (rng.next() * 2 - 1)),
    ];
    const scale = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * rng.next();
    picked.set(hex.key, { character: best, tint, saturation: spec.saturation, scale });
  }

  // Ground: a hex's own layer in its character's variant. A town stands in
  // fields: its ground is the variant of a neighbouring plain. Steep faces
  // turn to the rock of the hex's own range, or of a neighbouring one.
  const byAxial = new Map<string, WorldHex>();
  for (const hex of board.hexes) byAxial.set(hex.key, hex);
  const variantSlice = (hex: WorldHex): number | null => {
    const layer = BIOME_LAYER[hex.terrain];
    const pick = picked.get(hex.key);
    if (!layer || !pick) return null;
    return sliceOf(layer, CHARACTERS[hex.terrain][pick.character]!.variant);
  };
  const nearest = (hex: WorldHex, terrain: TerrainKind): WorldHex | undefined => {
    if (hex.terrain === terrain) return hex;
    for (const [dq, dr] of AXIAL_NEIGHBOURS) {
      const neighbour = byAxial.get(`${hex.q + dq},${hex.r + dr}`);
      if (neighbour?.terrain === terrain) return neighbour;
    }
    return undefined;
  };
  const groundOf = (hex: WorldHex): Ground => {
    const range = nearest(hex, "mountains");
    const rock = (range && variantSlice(range)) ?? CLASSIC_ROCK;
    const layer = BIOME_LAYER[hex.terrain];
    const fray = BLEND_FRAY_OF[hex.terrain];
    if (!layer) return { ground: CLASSIC_GRASS, rock, layer: -1, fray };
    if (hex.terrain === "urban") {
      const field = nearest(hex, "plains");
      return {
        ground: (field && variantSlice(field)) ?? CLASSIC_GRASS,
        rock,
        layer: LAYERS.indexOf("grass"),
        fray,
      };
    }
    return {
      ground: variantSlice(hex) ?? sliceOf(layer, CLASSIC),
      rock,
      layer: LAYERS.indexOf(layer),
      fray,
    };
  };

  // The grid: every texel of the board and of the virtual ring around it.
  const pad = LOOK_PAD;
  const width = board.cols + 2 * pad;
  const height = board.rows + 2 * pad;
  const data = new Float32Array(width * height * LOOK_TEXELS * 4);
  const byOffset = new Map<string, WorldHex>();
  for (const hex of board.hexes) byOffset.set(`${hex.col},${hex.row}`, hex);
  const edgeHex = (col: number, row: number): WorldHex | undefined =>
    byOffset.get(
      `${Math.min(board.cols - 1, Math.max(0, col))},${Math.min(board.rows - 1, Math.max(0, row))}`,
    );
  const byKey = new Map<string, HexLook>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The texel's hex centre (odd-q, like units.hexCenter) for the direction field.
      const col = x - pad;
      const cx = col * pitch * 0.8660254;
      const cz = (y - pad) * pitch + (((col % 2) + 2) % 2 === 1 ? pitch / 2 : 0);
      const regional = fbm(direction, cx / DIRECTION_KM, cz / DIRECTION_KM, 2) * 0.5 + 0.5;
      const angle = regional * Math.PI + DIRECTION_JITTER * (rng.next() * 2 - 1);
      const offsetX = rng.next() * LOOK_OFFSET_KM;
      const offsetZ = rng.next() * LOOK_OFFSET_KM;
      const scaleDraw = rng.next();
      const hex = byOffset.get(`${x - pad},${y - pad}`);
      const tone = hex ? picked.get(hex.key) : undefined;
      const scale = tone
        ? tone.scale
        : VIRTUAL_SCALE[0] + (VIRTUAL_SCALE[1] - VIRTUAL_SCALE[0]) * scaleDraw;
      // The virtual ring carries on the look of the board's edge: the skirt
      // extends the edge hexes' biomes outward, each ring hex in its own frame.
      const source = hex ?? edgeHex(x - pad, y - pad);
      const ground = source
        ? groundOf(source)
        : { ground: CLASSIC_GRASS, rock: CLASSIC_ROCK, layer: -1, fray: -1 };
      const sourceTone = source ? picked.get(source.key) : undefined;
      const tint = sourceTone?.tint ?? NEUTRAL_LOOK.tint;
      const o = (y * width + x) * LOOK_TEXELS * 4;
      data[o] = Math.cos(angle) / scale;
      data[o + 1] = Math.sin(angle) / scale;
      data[o + 2] = offsetX;
      data[o + 3] = offsetZ;
      data[o + 4] = ground.ground;
      data[o + 5] = ground.rock;
      data[o + 6] = ground.layer;
      data[o + 7] = ground.fray;
      data[o + 8] = tint[0];
      data[o + 9] = tint[1];
      data[o + 10] = tint[2];
      data[o + 11] = sourceTone?.saturation ?? NEUTRAL_LOOK.saturation;
      if (!hex) continue;
      const transform = { angle, scale, offsetX, offsetZ, ...ground };
      byKey.set(
        hex.key,
        tone
          ? {
              character: tone.character,
              tint: [...tone.tint],
              saturation: tone.saturation,
              ...transform,
            }
          : { ...NEUTRAL_LOOK, tint: [1, 1, 1], ...transform },
      );
    }
  }
  return { byKey, grid: { pad, width, height, data } };
}
