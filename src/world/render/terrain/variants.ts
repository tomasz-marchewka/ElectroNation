// The ground layers and their variants (docs/08 §3 — zróżnicowanie biomów).
// Every land layer has its classic tile (painted on the CPU, terrainTextures.ts)
// and a few variants with a structure and a palette of their own — strip
// fields, large fields, meadows, a spruce forest cut into sections, heather
// burnt in patches, reed beds… — painted once on the GPU (variantPainters.ts).
// All of them live in one texture array: the eight classic slices first, in
// LAYERS order, then the variants in VARIANTS order. The hex looks pick a
// variant per hex (looks.ts) and the ground shader samples its slice.
//
// A static table on purpose: the painter, the texture set and the looks all
// read the same order, so a slice number means the same thing everywhere.

/** Ground layers in the order of the vertex weights and the classic slices. */
export const LAYERS = [
  "grass",
  "canopy",
  "rock",
  "moor",
  "wet",
  "pavement",
  "sand",
  "snow",
] as const;

export type GroundLayer = (typeof LAYERS)[number];

/** World size of one tile of each classic layer [km], LAYERS order. */
export const LAYER_TILE_KM: readonly number[] = [9, 5.5, 11, 8, 6, 4.2, 6, 6];

/** The id of a layer's classic tile. */
export const CLASSIC = "classic";

export interface GroundVariant {
  layer: GroundLayer;
  id: string;
  /** Painter index in variantPainters.ts. */
  painter: number;
  /** Normal-map strength, as the classic layers' `bump`. */
  bump: number;
  /** World size of one tile [km]: large structures take a larger tile, so they repeat less. */
  tileKm: number;
}

export const VARIANTS: readonly GroundVariant[] = [
  // Plains: narrow strip fields, large fields, meadows with tree lines, a
  // small hedged mosaic.
  { layer: "grass", id: "strips", painter: 0, bump: 2.2, tileKm: 11 },
  { layer: "grass", id: "large", painter: 1, bump: 1.6, tileKm: 16 },
  { layer: "grass", id: "meadow", painter: 2, bump: 2.6, tileKm: 12 },
  { layer: "grass", id: "bocage", painter: 3, bump: 3.2, tileKm: 10 },
  // Forest: spruce cut into sections, broadleaf crowns, clear-cuts and plantations.
  { layer: "canopy", id: "conifer", painter: 4, bump: 3.6, tileKm: 8 },
  { layer: "canopy", id: "broadleaf", painter: 5, bump: 4.4, tileKm: 5.5 },
  { layer: "canopy", id: "young", painter: 6, bump: 3.2, tileKm: 8 },
  // Mountains: pale karst limestone, dark foliated schist.
  { layer: "rock", id: "limestone", painter: 7, bump: 4.5, tileKm: 11 },
  { layer: "rock", id: "schist", painter: 8, bump: 4.5, tileKm: 11 },
  // Highlands: heather burnt in patches, walled upland pasture, scree.
  { layer: "moor", id: "heather", painter: 9, bump: 3.2, tileKm: 10 },
  { layer: "moor", id: "pasture", painter: 10, bump: 3.4, tileKm: 11 },
  { layer: "moor", id: "scree", painter: 11, bump: 4.6, tileKm: 12 },
  // Swamp: reed beds with channels, drained peat with ditches.
  { layer: "wet", id: "reeds", painter: 12, bump: 3, tileKm: 14 },
  { layer: "wet", id: "peat", painter: 13, bump: 2.4, tileKm: 10 },
];

/** Slices in the ground arrays: the classic layers, then the variants. */
export const SLICE_COUNT = LAYERS.length + VARIANTS.length;

/** Tile size of every slice [km], slice order. */
export const SLICE_TILE_KM: readonly number[] = [
  ...LAYER_TILE_KM,
  ...VARIANTS.map((variant) => variant.tileKm),
];

/** The texture-array slice of a layer's variant (`classic` or a VARIANTS id). */
export function sliceOf(layer: GroundLayer, id: string): number {
  if (id === CLASSIC) return LAYERS.indexOf(layer);
  const index = VARIANTS.findIndex((variant) => variant.layer === layer && variant.id === id);
  if (index < 0) throw new Error(`terrain: no ${layer} variant "${id}"`);
  return LAYERS.length + index;
}

/** Every variant id of a layer, the classic tile first. */
export function variantsOf(layer: GroundLayer): string[] {
  return [
    CLASSIC,
    ...VARIANTS.filter((variant) => variant.layer === layer).map((variant) => variant.id),
  ];
}
