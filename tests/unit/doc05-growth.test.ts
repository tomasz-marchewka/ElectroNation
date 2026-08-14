import { describe, expect, test } from "vitest";
import {
  evaluateMonthlyGrowth,
  seedStream,
  type CityState,
} from "../../src/engine";

// Spec tests for docs/05 §6 via the acceptance list in 05 §9.5–9.

function makeCity(overrides: Partial<CityState> & { id: string }): CityState {
  return {
    name: overrides.id,
    hex: { q: 0, r: 0 },
    connected: true,
    households: 1_000,
    firms: 100,
    householdsStart: 1_000,
    firmsStart: 100,
    connectedSinceDay: 0,
    monthDemandMwh: 100,
    monthDeliveredMwh: 100,
    ...overrides,
  };
}

const RNG = () => seedStream(42, "city-growth");

describe("doc 05 §9.7: shrink by half the undelivered share", () => {
  test("U = 60% → both segments −20%", () => {
    const city = makeCity({ id: "c1", monthDeliveredMwh: 60 });
    const { cities } = evaluateMonthlyGrowth([city], RNG(), 0);
    expect(cities[0]?.households).toBe(800);
    expect(cities[0]?.firms).toBe(80);
  });

  test("floor 100 households / 10 firms is never pierced", () => {
    const city = makeCity({
      id: "c1",
      households: 110,
      firms: 11,
      monthDeliveredMwh: 0,
    });
    const { cities } = evaluateMonthlyGrowth([city], RNG(), 0);
    expect(cities[0]?.households).toBe(100);
    expect(cities[0]?.firms).toBe(10);
  });
});

describe("doc 05 §9.6: growth band and saturation", () => {
  test("U > 99% grows within [0, 4%] per segment", () => {
    const city = makeCity({ id: "c1" });
    const { cities } = evaluateMonthlyGrowth([city], RNG(), 0);
    const grown = cities[0];
    expect(grown?.households).toBeGreaterThanOrEqual(1_000);
    expect(grown?.households).toBeLessThanOrEqual(1_040);
    expect(grown?.firms).toBeGreaterThanOrEqual(100);
    expect(grown?.firms).toBeLessThanOrEqual(104);
  });

  test("U in the 90–99% band stagnates", () => {
    const city = makeCity({ id: "c1", monthDeliveredMwh: 95 });
    const { cities } = evaluateMonthlyGrowth([city], RNG(), 0);
    expect(cities[0]?.households).toBe(1_000);
    expect(cities[0]?.firms).toBe(100);
  });

  test("growth dies at segment capacity (16× start)", () => {
    const city = makeCity({ id: "c1", households: 16_000, firms: 1_600 });
    const { cities } = evaluateMonthlyGrowth([city], RNG(), 0);
    expect(cities[0]?.households).toBe(16_000);
    expect(cities[0]?.firms).toBe(1_600);
  });
});

describe("doc 05 §9.8: unconnected cities are frozen", () => {
  test("no change regardless of accumulators", () => {
    const city = makeCity({ id: "c1", connected: false, monthDeliveredMwh: 0 });
    const { cities } = evaluateMonthlyGrowth([city], RNG(), 0);
    expect(cities[0]?.households).toBe(1_000);
    expect(cities[0]?.firms).toBe(100);
  });
});

describe("doc 05 §6.6: PRNG alignment independent of eligibility", () => {
  test("two draws are consumed per city whether or not it is evaluated", () => {
    const eligible = makeCity({ id: "c1" });
    const frozen = makeCity({ id: "c1", connected: false });
    const a = evaluateMonthlyGrowth([eligible], RNG(), 0);
    const b = evaluateMonthlyGrowth([frozen], RNG(), 0);
    expect(a.rng).toStrictEqual(b.rng);
  });

  test("evaluation is deterministic and order-independent", () => {
    const cities = [
      makeCity({ id: "c2", monthDeliveredMwh: 100 }),
      makeCity({ id: "c1", monthDeliveredMwh: 60 }),
    ];
    const forward = evaluateMonthlyGrowth(cities, RNG(), 0);
    const reversed = evaluateMonthlyGrowth([...cities].reverse(), RNG(), 0);
    const byId = (list: CityState[], id: string) => list.find((c) => c.id === id);
    expect(byId(forward.cities, "c1")).toStrictEqual(byId(reversed.cities, "c1"));
    expect(byId(forward.cities, "c2")).toStrictEqual(byId(reversed.cities, "c2"));
    expect(forward.rng).toStrictEqual(reversed.rng);
  });
});

describe("doc 05 §6.1: accumulators reset at month end", () => {
  test("both counters return to zero", () => {
    const city = makeCity({ id: "c1", monthDeliveredMwh: 60 });
    const { cities } = evaluateMonthlyGrowth([city], RNG(), 0);
    expect(cities[0]?.monthDemandMwh).toBe(0);
    expect(cities[0]?.monthDeliveredMwh).toBe(0);
  });
});
