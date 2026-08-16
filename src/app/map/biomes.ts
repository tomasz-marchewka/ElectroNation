// Terrain (engine, English) → biome (design system, Polish slugs that name the
// colour tokens `--en-biome-<slug>-{fill,edge,tex}`). Only the naming comes
// from the handoff: the legend's cost multipliers are read from the engine's
// TERRAIN table, because the ones printed in the handoff's own BIOMES array
// are stale (plan/README.md; canon is 02 §8.1).

import { TERRAIN, type TerrainId } from "../../engine";
import { formatMultiplier } from "../format";

export type BiomeSlug =
  "nizina" | "wyzyna" | "gory" | "las" | "bagno" | "jezioro" | "morze" | "miasto";

export const TERRAIN_BIOMES: Record<TerrainId, BiomeSlug> = {
  plains: "nizina",
  forest: "las",
  highlands: "wyzyna",
  swamp: "bagno",
  urban: "miasto",
  mountains: "gory",
  lake: "jezioro",
  sea: "morze",
};

/**
 * Legend order and wording of the handoff (HexMap.jsx `BIOMES`). It doubles as
 * the paint order of the hex field: hexes are drawn biome by biome, one group
 * per fill, exactly as the reference build does it.
 */
export const BIOMES: readonly { slug: BiomeSlug; terrain: TerrainId; name: string }[] = [
  { slug: "nizina", terrain: "plains", name: "nizina" },
  { slug: "wyzyna", terrain: "highlands", name: "wyżyna" },
  { slug: "gory", terrain: "mountains", name: "góry" },
  { slug: "las", terrain: "forest", name: "las" },
  { slug: "bagno", terrain: "swamp", name: "bagno" },
  { slug: "jezioro", terrain: "lake", name: "jezioro" },
  { slug: "morze", terrain: "sea", name: "morze" },
  { slug: "miasto", terrain: "urban", name: "zurbaniz." },
];

export interface BiomeLegendEntry {
  slug: BiomeSlug;
  /** `nizina ×1,0` … `morze ×3,5`. */
  label: string;
}

/**
 * Biome legend of the map. The multiplier shown is the LINE one: lines may
 * cross water, objects may not (01 §3.2), so it is the only multiplier every
 * biome has. Where an object can be built at all, both multipliers agree.
 */
export function biomeLegend(): BiomeLegendEntry[] {
  return BIOMES.map((biome) => ({
    slug: biome.slug,
    label: `${biome.name} ${formatMultiplier(TERRAIN[biome.terrain].line)}`,
  }));
}
