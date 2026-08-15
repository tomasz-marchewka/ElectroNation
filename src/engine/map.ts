// Map geometry per 01 §3.1: a flat-top hex grid addressed in axial (q, r) and
// bounded to a cols × rows rectangle (02 §8.6 — v1 plays on 24×16). Axial
// coordinates on their own span a rhombus, so the bounds are expressed in
// "odd-q" OFFSET coordinates: column = q, and every odd column sits half a hex
// lower, which is exactly the rectangle a hand-designed map is authored in
// (row by row). Hexes outside the rectangle do not exist.

import type { HexCoord } from "./network";

/** Map bounds, in offset coordinates: columns across, rows down (01 §3.1). */
export interface MapSize {
  cols: number;
  rows: number;
}

/** Offset ("odd-q") address of a hex — the rectangle's own coordinates. */
export interface OffsetCoord {
  col: number;
  row: number;
}

/** 01 §3.1 small grid = the v1 playing field (02 §8.6). */
export const DEFAULT_MAP_SIZE: MapSize = { cols: 24, rows: 16 };

/** Axial → offset (odd-q): `col = q`, `row = r + floor(q / 2)`. */
export function axialToOffset(hex: HexCoord): OffsetCoord {
  return { col: hex.q, row: hex.r + Math.floor(hex.q / 2) };
}

/** Offset → axial — the inverse of {@link axialToOffset}. */
export function offsetToAxial(offset: OffsetCoord): HexCoord {
  return { q: offset.col, r: offset.row - Math.floor(offset.col / 2) };
}

/** Flat-top axial neighbor offsets, clockwise from due east (01 §3.1). */
const NEIGHBOR_OFFSETS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

/** The six hexes touching this one — the map's edges are not considered. */
export function hexNeighbors(hex: HexCoord): HexCoord[] {
  return NEIGHBOR_OFFSETS.map(([dq, dr]) => ({ q: hex.q + dq, r: hex.r + dr }));
}

export function areNeighbors(a: HexCoord, b: HexCoord): boolean {
  return NEIGHBOR_OFFSETS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
}

/**
 * Whether a hex exists on a map of this size. Non-integer coordinates never
 * do — actions arrive as plain JSON, so the check has to be total.
 */
export function isInsideMap(size: MapSize, hex: HexCoord): boolean {
  if (!Number.isInteger(hex.q) || !Number.isInteger(hex.r)) return false;
  const { col, row } = axialToOffset(hex);
  return col >= 0 && col < size.cols && row >= 0 && row < size.rows;
}
