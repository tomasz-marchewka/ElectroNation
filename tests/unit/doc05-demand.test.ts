import { describe, expect, test } from "vitest";
import {
  DEMAND_PROFILES,
  DEMAND_SEASONAL,
  cityDemandMwAtHour,
  weatherDemandMultiplier,
} from "../../src/engine";

// Spec tests for docs/05 §3–§4 via the acceptance list in 05 §9.

// 05 §5: calibration split — households 70% / firms 30% of daily energy.
// 70 000 households × 10 kWh = 700 MWh; 6 000 firms × 50 kWh = 300 MWh.
const HOUSEHOLDS = 70_000;
const FIRMS = 6_000;
const MONTH = 3; // ratios below are invariant to the seasonal multiplier
const TEMP_C = 15; // weather multiplier = 1

function cityProfile(dayType: "working" | "free"): number[] {
  return Array.from({ length: 24 }, (_, hour) =>
    cityDemandMwAtHour(HOUSEHOLDS, FIRMS, dayType, hour, MONTH, TEMP_C),
  );
}

describe("doc 05 §9.1: profiles integrate to their daily average", () => {
  test.each([
    ["household working", DEMAND_PROFILES.household.working],
    ["household free", DEMAND_PROFILES.household.free],
    ["firm working", DEMAND_PROFILES.firm.working],
    ["firm free", DEMAND_PROFILES.firm.free],
  ])("%s sums to 24.00 ± 0.01", (_name, profile) => {
    const sum = profile.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 24)).toBeLessThanOrEqual(0.01);
  });
});

describe("doc 05 §9.2: emergent working-day city profile (70/30 split)", () => {
  const profile = cityProfile("working");
  const peak = Math.max(...profile);
  const peakHour = profile.indexOf(peak);

  test("evening peak falls at 18–19", () => {
    expect(peakHour === 18 || peakHour === 19).toBe(true);
  });

  test("late-morning hump is 85–95% of the peak", () => {
    const hump = Math.max(...profile.slice(9, 12));
    expect(hump / peak).toBeGreaterThanOrEqual(0.85);
    expect(hump / peak).toBeLessThanOrEqual(0.95);
  });

  test("night valley is 44–52% of the peak", () => {
    const valley = Math.min(...profile.slice(0, 6));
    expect(valley / peak).toBeGreaterThanOrEqual(0.44);
    expect(valley / peak).toBeLessThanOrEqual(0.52);
  });
});

describe("doc 05 §9.3: free day vs working day", () => {
  const working = cityProfile("working");
  const free = cityProfile("free");

  test("free-day energy is 80–85% of the working day", () => {
    const ratio = free.reduce((a, b) => a + b, 0) / working.reduce((a, b) => a + b, 0);
    expect(ratio).toBeGreaterThanOrEqual(0.8);
    expect(ratio).toBeLessThanOrEqual(0.85);
  });

  test("free-day peak is 87–93% of the working-day peak", () => {
    const ratio = Math.max(...free) / Math.max(...working);
    expect(ratio).toBeGreaterThanOrEqual(0.87);
    expect(ratio).toBeLessThanOrEqual(0.93);
  });
});

describe("doc 05 §9.4: seasonal multipliers", () => {
  test("annual mean = 1.00 ± 0.01", () => {
    const mean = DEMAND_SEASONAL.reduce((a, b) => a + b, 0) / 12;
    expect(Math.abs(mean - 1)).toBeLessThanOrEqual(0.01);
  });
});

describe("doc 05 §4.3: temperature V-curve", () => {
  test("neutral between 15 and 22 °C", () => {
    expect(weatherDemandMultiplier(15)).toBe(1);
    expect(weatherDemandMultiplier(18)).toBe(1);
    expect(weatherDemandMultiplier(22)).toBe(1);
  });

  test("heating: +0.8%/°C below 15 °C", () => {
    expect(weatherDemandMultiplier(5)).toBeCloseTo(1.08, 10);
  });

  test("cooling: +1.0%/°C above 22 °C", () => {
    expect(weatherDemandMultiplier(30)).toBeCloseTo(1.08, 10);
  });

  test("capped at 1.25 in deep frost", () => {
    expect(weatherDemandMultiplier(-40)).toBe(1.25);
  });
});
