// Snow and ice of the relief model (docs/08 §6, ARCHITECTURE.md §8): the
// bridge hands over the lowland snow cover of the shown day; the terrain
// turns it into a snowline in kilometres of the exaggerated relief, capped
// by the winter months so the peaks stay white from November to March even
// when the lowlands are bare. The lowland cover itself is painted by the
// material as a patchwork (terrainMaterial.ts), not by the line.

import { clamp } from "./noise";

/** Snowline [km] at snow cover 0 — only the highest peaks are white. */
const SNOWLINE_BARE_KM = 5;
/** Snowline [km] at full lowland cover — below every hex, everything white. */
const SNOWLINE_FULL_KM = -1;

/** Month (0 = January) → the highest the snowline may sit [km]. */
const WINTER_CAP_KM: Partial<Record<number, number>> = {
  10: 3.6,
  11: 3.0,
  0: 2.8,
  1: 3.0,
  2: 3.8,
};

/**
 * The snowline of the shown turn [km]: a lapse-rate curve in the cover
 * (0 → 5 km, 0,25 → 3 km, 0,5 → 1,55 km, 0,75 → 0,25 km, 1 → −1 km) and
 * never above the month's cap. A half-covered plain therefore leaves the
 * line well above the lowland band (0,3 km), so the height noise of the
 * fields never draws it as contour lines; the material dithers the cover.
 */
export function snowlineKm(snowCover: number, month: number): number {
  const cover = clamp(snowCover, 0, 1);
  const line = SNOWLINE_BARE_KM + (SNOWLINE_FULL_KM - SNOWLINE_BARE_KM) * Math.pow(cover, 0.8);
  const cap = WINTER_CAP_KM[month];
  return cap === undefined ? line : Math.min(line, cap);
}

/**
 * How frozen standing water is, 0..1: a hard frost over a snowed-in country
 * freezes the lakes and rims the sea with shore ice; a mild day keeps the
 * water open whatever the cover.
 */
export function iceAmount(tempC: number, snowCover: number): number {
  const cold = clamp((-2 - tempC) / 7, 0, 1);
  return cold * clamp(snowCover * 1.25, 0, 1);
}

/**
 * How wet the ground looks, 0..1: rain darkens and glosses it, sleet less
 * so, snowfall and fog only slightly.
 */
export function wetness(
  precipitation: { kind: "none" | "rain" | "sleet" | "snow"; intensity: number },
  fog: number,
): number {
  const byKind = { none: 0, rain: 1, sleet: 0.7, snow: 0.15 }[precipitation.kind];
  return clamp(precipitation.intensity * byKind + fog * 0.3, 0, 1);
}
