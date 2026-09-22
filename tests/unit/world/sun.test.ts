// The sun of the 3D world — the engine's astronomy (06 §3) plus the azimuth of
// 06 §3.5 that the bridge adds. Reference values are the doc's own.

import { describe, expect, test } from "vitest";
import { buildSun, solarAzimuthDeg, sunVector } from "../../../src/world/bridge";

const LATITUDE = 52;

describe("06 §3.5: solar azimuth", () => {
  test("solar noon is due south on every day of the year", () => {
    for (const day of [21, 80, 172, 264, 355]) {
      expect(Math.abs(solarAzimuthDeg(LATITUDE, day, 12) - 180)).toBeLessThan(1e-6);
    }
  });

  test("morning east of south, afternoon west of south, mirrored around noon", () => {
    const morning = solarAzimuthDeg(LATITUDE, 172, 9);
    const afternoon = solarAzimuthDeg(LATITUDE, 172, 15);
    expect(morning).toBeGreaterThan(90);
    expect(morning).toBeLessThan(180);
    expect(Math.abs(afternoon - (360 - morning))).toBeLessThan(1e-6);
  });

  test("21 June rises north of east and sets north of west; 21 December the reverse", () => {
    const june = buildSun(172, 12);
    expect(solarAzimuthDeg(LATITUDE, 172, june.sunriseHour + 0.05)).toBeLessThan(90);
    expect(solarAzimuthDeg(LATITUDE, 172, june.sunsetHour - 0.05)).toBeGreaterThan(270);
    const december = buildSun(355, 12);
    expect(solarAzimuthDeg(LATITUDE, 355, december.sunriseHour + 0.05)).toBeGreaterThan(90);
    expect(solarAzimuthDeg(LATITUDE, 355, december.sunsetHour - 0.05)).toBeLessThan(270);
  });
});

describe("the sun vector in world space (north = −Z, east = +X, up = +Y)", () => {
  test("noon points south and up, sunrise east", () => {
    const noon = sunVector(45, 180);
    expect(noon.z).toBeGreaterThan(0.7);
    expect(noon.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Math.abs(noon.x)).toBeLessThan(1e-9);
    const east = sunVector(0, 90);
    expect(east.x).toBeCloseTo(1, 5);
    expect(Math.abs(east.z)).toBeLessThan(1e-9);
  });

  test("is a unit vector", () => {
    const v = sunVector(30, 220);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9);
  });
});

describe("06 §3.7 through the bridge", () => {
  test("21 June at noon: α_max 61,5°, day 16 h 44 min", () => {
    const sun = buildSun(172, 12);
    expect(Math.abs(sun.altitudeDeg - 61.5)).toBeLessThan(0.15);
    expect(Math.abs(sun.dayLengthHours * 60 - (16 * 60 + 44))).toBeLessThan(5);
    expect(sun.daylight).toBe(1);
  });

  test("21 December: α_max 14,6°, and the evening peak (19:30) is night", () => {
    const noon = buildSun(355, 12);
    expect(Math.abs(noon.altitudeDeg - 14.6)).toBeLessThan(0.15);
    const peak = buildSun(355, 19.5);
    expect(peak.altitudeDeg).toBeLessThan(-6);
    expect(peak.daylight).toBe(0);
    expect(peak.sunsetHour).toBeLessThan(16);
  });
});
