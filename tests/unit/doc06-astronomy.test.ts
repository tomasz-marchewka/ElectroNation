import { describe, expect, test } from "vitest";
import {
  clearSkyGhiW,
  cloudAttenuation,
  dayLengthHours,
  maxSolarAltitudeDeg,
  solarDeclinationDeg,
} from "../../src/engine";

const LATITUDE = 52.0; // doc 06 §2

function expectWithin(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function dayLengthMinutes(dayOfYear: number): number {
  return dayLengthHours(LATITUDE, dayOfYear) * 60;
}

// doc 06 §3.7 — reference table for φ = 52°N; the doc states these values
// exist to verify the implementation.
const REFERENCE_TABLE = [
  { date: "Jan 21", n: 21, declination: -20.1, dayLenMin: 8 * 60 + 29, alphaMax: 17.9, ghiNoon: 280 },
  { date: "Feb 21", n: 52, declination: -11.2, dayLenMin: 10 * 60 + 14, alphaMax: 26.8, ghiNoon: 436 },
  { date: "Mar 21", n: 80, declination: -0.4, dayLenMin: 12 * 60 + 7, alphaMax: 37.6, ghiNoon: 610 },
  { date: "Apr 21", n: 111, declination: 11.6, dayLenMin: 14 * 60 + 13, alphaMax: 49.6, ghiNoon: 776 },
  { date: "May 21", n: 141, declination: 20.1, dayLenMin: 15 * 60 + 57, alphaMax: 58.1, ghiNoon: 872 },
  { date: "Jun 21", n: 172, declination: 23.45, dayLenMin: 16 * 60 + 44, alphaMax: 61.5, ghiNoon: 904 },
  { date: "Jul 21", n: 202, declination: 20.4, dayLenMin: 16 * 60 + 1, alphaMax: 58.4, ghiNoon: 875 },
  { date: "Aug 21", n: 233, declination: 11.8, dayLenMin: 14 * 60 + 15, alphaMax: 49.8, ghiNoon: 778 },
  { date: "Sep 21", n: 264, declination: -0.2, dayLenMin: 12 * 60 + 9, alphaMax: 37.8, ghiNoon: 613 },
  { date: "Oct 21", n: 294, declination: -11.8, dayLenMin: 10 * 60 + 8, alphaMax: 26.2, ghiNoon: 427 },
  { date: "Nov 21", n: 325, declination: -20.4, dayLenMin: 8 * 60 + 25, alphaMax: 17.6, ghiNoon: 274 },
  { date: "Dec 21", n: 355, declination: -23.45, dayLenMin: 7 * 60 + 44, alphaMax: 14.6, ghiNoon: 220 },
];

describe("doc 06 §3.7: reference table, φ = 52°N", () => {
  test.each(REFERENCE_TABLE)(
    "$date (n=$n): δ, day length, α_max, clear-sky noon GHI",
    ({ n, declination, dayLenMin, alphaMax, ghiNoon }) => {
      expectWithin(solarDeclinationDeg(n), declination, 0.06);
      expectWithin(dayLengthMinutes(n), dayLenMin, 2);
      expectWithin(maxSolarAltitudeDeg(LATITUDE, n), alphaMax, 0.06);
      expectWithin(clearSkyGhiW(maxSolarAltitudeDeg(LATITUDE, n)), ghiNoon, 2);
    },
  );
});

describe("doc 06 §12: deterministic acceptance tests (1–5)", () => {
  test("§12.1: day length on Jun 21 = 16 h 44 min ± 5 min", () => {
    expectWithin(dayLengthMinutes(172), 16 * 60 + 44, 5);
  });

  test("§12.2: day length on Dec 21 = 7 h 44 min ± 5 min", () => {
    expectWithin(dayLengthMinutes(355), 7 * 60 + 44, 5);
  });

  test("§12.3: equinox day length = 12 h 07 min, slightly over 12 h (refraction)", () => {
    const minutes = dayLengthMinutes(80);
    expectWithin(minutes, 12 * 60 + 7, 5);
    expect(minutes).toBeGreaterThan(12 * 60);
  });

  test("§12.4: α_max on Jun 21 / Dec 21 = 61.5° / 14.6°", () => {
    expectWithin(maxSolarAltitudeDeg(LATITUDE, 172), 61.5, 0.1);
    expectWithin(maxSolarAltitudeDeg(LATITUDE, 355), 14.6, 0.1);
  });

  test("§12.5: clear-sky GHI at noon in June = 880–920 W/m²", () => {
    const ghi = clearSkyGhiW(maxSolarAltitudeDeg(LATITUDE, 172));
    expect(ghi).toBeGreaterThanOrEqual(880);
    expect(ghi).toBeLessThanOrEqual(920);
  });
});

describe("doc 06 §4.4: cloud attenuation table", () => {
  test.each([
    { cover: 0.0, multiplier: 1.0 },
    { cover: 0.3, multiplier: 0.99 },
    { cover: 0.5, multiplier: 0.93 },
    { cover: 0.8, multiplier: 0.64 },
    { cover: 1.0, multiplier: 0.25 },
  ])("C=$cover → ×$multiplier", ({ cover, multiplier }) => {
    expectWithin(cloudAttenuation(cover), multiplier, 0.015);
  });
});

describe("doc 06 §3.6: polar edge cases (future high-latitude maps)", () => {
  test("polar day: sun never sets at φ=80°N on Jun 21", () => {
    expect(dayLengthHours(80, 172)).toBe(24);
  });

  test("polar night: sun never rises at φ=80°N on Dec 21", () => {
    expect(dayLengthHours(80, 355)).toBe(0);
  });

  test("sun is below the horizon at midnight at φ=52°N on Jun 21", () => {
    expect(clearSkyGhiW(-10)).toBe(0);
  });
});
