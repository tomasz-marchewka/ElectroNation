// Map geometry of the UI layer: the axial → offset conversion the whole
// renderer stands on (01 §3.1 vs the design system's odd-q layout) and the
// corridor routing of parallel lines (01 §3.3).

import { describe, expect, test } from "vitest";
import { axialToOffset, offsetToAxial, type HexCoord } from "../../../src/engine";
import {
  CORRIDOR_SPACING,
  MAX_CORRIDOR_FAN,
  hexCenter,
  hexCenterOf,
  routeLines,
  worldSize,
} from "../../../src/app/map/geometry";

/** The handoff's own formula (routing.js `fromCube`), bit tricks included. */
function handoffOffsetRow(q: number, r: number): number {
  return r + (q - (q & 1)) / 2;
}

describe("01 §3.1: axial (engine) ↔ odd-q offset (design system)", () => {
  const cases: { hex: HexCoord; col: number; row: number }[] = [
    { hex: { q: 0, r: 0 }, col: 0, row: 0 },
    { hex: { q: 1, r: 0 }, col: 1, row: 0 },
    { hex: { q: 2, r: 3 }, col: 2, row: 4 },
    { hex: { q: 3, r: 3 }, col: 3, row: 4 },
    { hex: { q: 23, r: 4 }, col: 23, row: 15 },
    // Negative and odd q — where a naive `q / 2` breaks.
    { hex: { q: -1, r: 2 }, col: -1, row: 1 },
    { hex: { q: -2, r: 0 }, col: -2, row: -1 },
    { hex: { q: -3, r: 5 }, col: -3, row: 3 },
    { hex: { q: -7, r: -1 }, col: -7, row: -5 },
  ];

  test.each(cases)("$hex.q,$hex.r → col $col row $row", ({ hex, col, row }) => {
    expect(axialToOffset(hex)).toEqual({ col, row });
    expect(offsetToAxial({ col, row })).toEqual(hex);
  });

  test("agrees with the handoff's conversion over the whole map and beyond", () => {
    for (let q = -12; q <= 30; q++) {
      for (let r = -12; r <= 30; r++) {
        expect(axialToOffset({ q, r }).row).toBe(handoffOffsetRow(q, r));
      }
    }
  });
});

describe("hex layout of the design system", () => {
  test("centers match the handoff's own sample world", () => {
    // sampleWorld.js: the coal plant of hex [6,6] sits at 340 / 383.5, the
    // junction of [9,6] at 493 / 413.
    expect(hexCenter(6, 6)).toEqual({ x: 340, y: 383.5 });
    expect(hexCenter(9, 6)).toEqual({ x: 493, y: 413 });
    // Odd columns hang half a step lower.
    expect(hexCenter(0, 0)).toEqual({ x: 34, y: 29.5 });
    expect(hexCenter(1, 0)).toEqual({ x: 85, y: 59 });
  });

  test("an axial hex lands where its offset address does", () => {
    expect(hexCenterOf({ q: 6, r: 3 })).toEqual(hexCenter(6, 6));
  });

  test("the 24×16 board of 02 §8.6 is 1241 × 973,5 px", () => {
    expect(worldSize({ cols: 24, rows: 16 })).toEqual({ width: 1241, height: 973.5 });
    expect(worldSize({ cols: 1, rows: 1 })).toEqual({ width: 68, height: 59 });
  });
});

describe("01 §3.3: lines sharing a corridor spread into parallel tracks", () => {
  /** `count` lines running through the same vertical corridor. */
  const stack = (count: number) =>
    routeLines(
      Array.from({ length: count }, (_, index) => ({
        id: `line-${index}`,
        path: [
          { q: 0, r: 0 },
          { q: 0, r: 1 },
        ],
      })),
    );

  test("a lone line runs through the hex centers, unshifted", () => {
    const [route] = routeLines([
      {
        id: "line-1",
        path: [
          { q: 0, r: 0 },
          { q: 0, r: 1 },
          { q: 0, r: 2 },
        ],
      },
    ]);
    expect(route?.points).toEqual([hexCenter(0, 0), hexCenter(0, 1), hexCenter(0, 2)]);
  });

  test("the route is the line's own path — never an interpolated one", () => {
    // A dog-leg: straight interpolation between the ends would cut the corner.
    const [route] = routeLines([
      {
        id: "line-1",
        path: [
          { q: 0, r: 0 },
          { q: 0, r: 1 },
          { q: 1, r: 1 },
        ],
      },
    ]);
    expect(route?.points).toHaveLength(3);
    expect(route?.points[1]).toEqual(hexCenter(0, 1));
  });

  test("two lines sit CORRIDOR_SPACING apart, symmetrically about the axis", () => {
    const routes = stack(2);
    const xs = routes.map((route) => route.points[0]?.x ?? 0);
    expect(Math.abs((xs[0] ?? 0) - (xs[1] ?? 0))).toBeCloseTo(CORRIDOR_SPACING, 6);
    expect(((xs[0] ?? 0) + (xs[1] ?? 0)) / 2).toBeCloseTo(hexCenter(0, 0).x, 6);
  });

  test("six tracks keep the handoff's spacing; a seventh shrinks it to fit", () => {
    const fan = (count: number) => {
      const xs = stack(count).map((route) => route.points[0]?.x ?? 0);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(fan(6)).toBeCloseTo(CORRIDOR_SPACING * 5, 6);
    expect(fan(7)).toBeCloseTo(MAX_CORRIDOR_FAN, 6);
    // 01 §3.3 allows 9 of one type through a hex — the fan still fits inside it.
    expect(fan(9)).toBeCloseTo(MAX_CORRIDOR_FAN, 6);
    expect(fan(9)).toBeLessThan(59);
  });
});
