// The exaggeration table (ARCHITECTURE.md §6, docs/08 §2): at 25 km per hex a
// power plant is an invisible speck, so installations are drawn at map-marker
// scale. One factor per object class, declared here and nowhere else — a
// module never fudges a size per model. Vertical structures share ONE factor
// so their silhouettes keep their real proportions to each other.

/** Vertical exaggeration of the terrain relief. */
export const RELIEF_EXAGGERATION = 3;

/** Shared factor for every built structure's height. */
export const STRUCTURE_EXAGGERATION = 20;

/** Real heights [km] of the structure classes, before exaggeration. */
export const REAL_HEIGHT_KM = {
  pylonLv: 0.03,
  pylonMv: 0.045,
  pylonHv: 0.06,
  turbineTip: 0.15,
  turbineHub: 0.1,
  coolingTower: 0.15,
  stack: 0.25,
  containment: 0.06,
  hall: 0.025,
  container: 0.015,
  portal: 0.02,
  cityBlockLow: 0.02,
  cityBlockHigh: 0.04,
  /** A metro's landmark office tower. */
  landmark: 0.12,
  crane: 0.06,
} as const;

/** World heights [km] = real × STRUCTURE_EXAGGERATION. */
export const HEIGHT_KM: Record<keyof typeof REAL_HEIGHT_KM, number> = Object.fromEntries(
  Object.entries(REAL_HEIGHT_KM).map(([key, real]) => [key, real * STRUCTURE_EXAGGERATION]),
) as Record<keyof typeof REAL_HEIGHT_KM, number>;

/** Footprint factors: a ~1 km real plant site is drawn ~8 km across. */
export const FOOTPRINT_EXAGGERATION = 8;

/** Plant site diameter [km] at the largest rung of its technology. */
export const PLANT_SITE_KM = 8;

/** Share of the hex a farm covers at its smallest and largest rung. */
export const FARM_FOOTPRINT = { min: 0.4, max: 0.7 } as const;

/** Share of the hex a city covers between 50 k and 1,5 M households. */
export const CITY_FOOTPRINT = { min: 0.25, max: 0.8 } as const;

/** Pylon spacing along a route [km] — four per 25 km hex step. */
export const PYLON_SPACING_KM = 6.25;

/** Conductor sag as a share of the span. */
export const CONDUCTOR_SAG = 0.08;

/** Terrain relief bands [km] after exaggeration, by terrain kind. */
export const RELIEF_KM = {
  sea: -0.6,
  lake: -0.2,
  swamp: 0.05,
  plains: 0.3,
  urban: 0.35,
  forest: 0.6,
  highlands: 2.4,
  mountains: 6,
} as const;
