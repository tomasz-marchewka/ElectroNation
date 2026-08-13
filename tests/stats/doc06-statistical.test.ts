import { describe, expect, test } from "vitest";
import {
  turbinePowerFraction,
  windLambda,
  windSpeedFromQuantile,
  type WindClass,
} from "../../src/engine";

// doc 06 §12 tests 6–12. Wind CF and the seasonal speed ratio follow directly
// from the Weibull layer (06 §6) and integrate deterministically over the
// quantile — no simulation years needed. The cloud-dependent tests (PV CF,
// December:June PV ratio, storm-hour and Dunkelflaute counts) require the
// regime generator (06 §8) and land together with it.

/** Annual CF: midpoint-rule integral over the quantile, averaged over months. */
function annualWindCf(windClass: WindClass): number {
  const steps = 20_000;
  let total = 0;
  for (let month = 0; month < 12; month++) {
    let sum = 0;
    for (let i = 0; i < steps; i++) {
      const q = (i + 0.5) / steps;
      sum += turbinePowerFraction(windSpeedFromQuantile(windClass, month, q));
    }
    total += sum / steps;
  }
  return total / 12;
}

describe("doc 06 §12.7: annual onshore wind capacity factor 24–30%", () => {
  test("open terrain sits at the bottom of the band", () => {
    const cf = annualWindCf("open");
    expect(cf).toBeGreaterThanOrEqual(0.24);
    expect(cf).toBeLessThanOrEqual(0.3);
  });

  test("coast sits at the top of the band", () => {
    const cf = annualWindCf("coastal");
    expect(cf).toBeGreaterThanOrEqual(0.24);
    expect(cf).toBeLessThanOrEqual(0.3);
  });
});

describe("doc 06 §12.8: annual Baltic wind capacity factor 45–50%", () => {
  test("baltic class", () => {
    const cf = annualWindCf("baltic");
    expect(cf).toBeGreaterThanOrEqual(0.45);
    expect(cf).toBeLessThanOrEqual(0.5);
  });
});

describe("doc 06 §12.10: mean wind speed January : July ≈ 1.43 : 1", () => {
  test("seasonal λ ratio matches", () => {
    const ratio = windLambda("open", 0) / windLambda("open", 6);
    expect(ratio).toBeGreaterThanOrEqual(1.38);
    expect(ratio).toBeLessThanOrEqual(1.48);
  });
});

test.todo("§12.6: annual PV capacity factor = 11–12% (needs 06 §8 regimes)");
test.todo("§12.9: PV energy December : June between 1:10 and 1:12 (needs 06 §8 regimes)");
test.todo("§12.11: hours with v ≥ 25 m/s per year = 10–40 (needs 06 §8 regimes)");
test.todo("§12.12: Dunkelflaute episodes (≥3 days) per year = 2–5 (needs 06 §8 regimes)");
