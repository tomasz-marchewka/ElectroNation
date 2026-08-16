// Monthly city growth/shrink per docs/05 §6. Runs after the free day's last
// turn resolves; only connected cities are evaluated, but the stream draws two
// values for EVERY city each month (ascending id order), so PRNG alignment
// never depends on the player's results (05 §6.6).

import { CITY_GROWTH } from "./config";
import { nextFloat01, type PrngState } from "./prng";
import type { CityState } from "./state";

export function evaluateMonthlyGrowth(
  cities: CityState[],
  rng: PrngState,
  /** First game day of the evaluated month — cities connected later skip it (05 §6.5). */
  monthStartDay: number,
): { cities: CityState[]; rng: PrngState } {
  let state = rng;
  const draws = new Map<string, { households: number; firms: number }>();
  for (const city of [...cities].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const g = nextFloat01(state);
    const f = nextFloat01(g.state);
    state = f.state;
    draws.set(city.id, { households: g.value, firms: f.value });
  }

  const grow = (count: number, startCount: number, roll: number): number => {
    const capacity = startCount * CITY_GROWTH.capacityMultiple;
    const damping = Math.max(0, 1 - count / capacity);
    return Math.round(count * (1 + roll * CITY_GROWTH.maxMonthlyGrowth * damping));
  };

  const updated = cities.map((city): CityState => {
    const reset = { ...city, monthDemandMwh: 0, monthDeliveredMwh: 0 };
    if (!city.connected || city.connectedSinceDay > monthStartDay) return reset;
    if (city.monthDemandMwh <= 0) return reset;

    const served = city.monthDeliveredMwh / city.monthDemandMwh;
    if (served > CITY_GROWTH.growThresholdU) {
      const roll = draws.get(city.id) ?? { households: 0, firms: 0 };
      return {
        ...reset,
        households: grow(city.households, city.householdsStart, roll.households),
        firms: grow(city.firms, city.firmsStart, roll.firms),
      };
    }
    if (served < CITY_GROWTH.shrinkThresholdU) {
      const shrink = (1 - served) * CITY_GROWTH.shrinkFactor;
      return {
        ...reset,
        households: Math.max(CITY_GROWTH.minHouseholds, Math.round(city.households * (1 - shrink))),
        firms: Math.max(CITY_GROWTH.minFirms, Math.round(city.firms * (1 - shrink))),
      };
    }
    return reset;
  });

  return { cities: updated, rng: state };
}
