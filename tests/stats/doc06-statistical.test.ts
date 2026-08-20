import { describe, expect, test } from "vitest";
import {
  farmPowerMwAtHour,
  generateWeatherDay,
  nextFloat01,
  pickMonthRegimes,
  pvPowerMw,
  seedStream,
  turbinePowerFraction,
  type FarmState,
  type PrngState,
  type WindClass,
} from "../../src/engine";

// doc 06 §12 tests 6–13: statistical acceptance on 100 simulated years of the
// full regime-driven generator (§8). The simulation is seeded, so results are
// reproducible; the assertions use the doc's own bands.

const DAY_OF_YEAR = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355];
const YEARS = 100;
/** One game day represents ~10.13 real days (30.4 / 3 — doc 01 §2.1). */
const REAL_DAYS_PER_GAME_DAY = 30.4 / 3;

/** 1 MW reference PV farms differing only in the insolation of their hex (01 §3.2). */
function referencePvFarm(solarMultiplier: number): FarmState {
  return {
    id: `pv-${solarMultiplier}`,
    name: "PV",
    hex: { q: 0, r: 0 },
    tech: "pv",
    capacityMw: 1,
    enabled: true,
    windClass: "open",
    solarMultiplier,
  };
}

/**
 * §12.12: a Dunkelflaute day is a game day under a winter high whose reference
 * RES portfolio (1 MW open-terrain wind + 1 MW PV) stays below this daily
 * capacity factor. An episode is a maximal run of such days, month boundaries
 * included — the regime is drawn per month (§8.4), so two winter-high months in
 * a row are one long episode, not two short ones.
 */
const DUNKELFLAUTE_CF = 0.1;

interface DunkelflauteStats {
  daysPerYear: number;
  episodesPerYear: number;
  atLeast2PerYear: number;
  atLeast3PerYear: number;
}

/**
 * §12.14: wind CF split by the regime of the day, for the two classes the test
 * compares. `all` repeats the annual figure so the ratio is read off one object.
 */
type RegimeGroup = "all" | "dunkelflaute" | "storm";
type RegimeCf = Record<RegimeGroup, { open: number; baltic: number }>;

interface SimStats {
  windCf: Record<WindClass, number>;
  regimeCf: RegimeCf;
  pvCf: number;
  /** CF of a farm on a 1.0 hex and of the same farm on a 0.8 hex. */
  pvFarmCf: number;
  pvDimFarmCf: number;
  pvEnergyByMonth: number[];
  meanSpeedByMonth: number[];
  stormHoursPerRealYear: number;
  dunkelflaute: DunkelflauteStats;
}

/** Runs of consecutive Dunkelflaute days, in the order the calendar played them. */
function episodeLengths(days: boolean[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const isDunkel of days) {
    if (isDunkel) {
      run += 1;
      continue;
    }
    if (run > 0) runs.push(run);
    run = 0;
  }
  if (run > 0) runs.push(run);
  return runs;
}

function simulate(seed: number): SimStats {
  let rng: PrngState = seedStream(seed, "stats-weather");
  const draw = () => {
    const r = nextFloat01(rng);
    rng = r.state;
    return r.value;
  };

  const windSum: Record<WindClass, number> = { sheltered: 0, open: 0, coastal: 0, baltic: 0 };
  /** §12.14: the same sums, but bucketed by the regime that produced the day. */
  const regimeSum: Record<RegimeGroup, { open: number; baltic: number; hours: number }> = {
    all: { open: 0, baltic: 0, hours: 0 },
    dunkelflaute: { open: 0, baltic: 0, hours: 0 },
    storm: { open: 0, baltic: 0, hours: 0 },
  };
  const fullFarm = referencePvFarm(1);
  const dimFarm = referencePvFarm(0.8);
  let pvSum = 0;
  let pvFarmSum = 0;
  let pvDimFarmSum = 0;
  let hours = 0;
  const pvEnergyByMonth = new Array<number>(12).fill(0);
  const speedSumByMonth = new Array<number>(12).fill(0);
  const speedHoursByMonth = new Array<number>(12).fill(0);
  let stormHours = 0;
  /** One entry per game day, in calendar order — the input of §12.12. */
  const dunkelflauteDays: boolean[] = [];

  for (let year = 0; year < YEARS; year++) {
    for (let month = 0; month < 12; month++) {
      const regimes = pickMonthRegimes(month, [draw(), draw(), draw()]);
      for (let day = 0; day < 3; day++) {
        const regime = day === 2 ? regimes.lastDay : regimes.dominant;
        const gen = generateWeatherDay(rng, DAY_OF_YEAR[month] ?? 21, month, regime);
        rng = gen.rng;
        // §12.14: a winter high is Dunkelflaute by regime alone here — the
        // portfolio threshold below is the game-calendar definition (§12.12).
        const buckets: RegimeGroup[] = ["all"];
        if (regime === "frostHigh" || regime === "fogHigh") buckets.push("dunkelflaute");
        if (regime === "storm") buckets.push("storm");
        let dayResEnergy = 0;
        for (let hour = 0; hour < 24; hour++) {
          for (const windClass of ["sheltered", "open", "coastal", "baltic"] as WindClass[]) {
            windSum[windClass] += turbinePowerFraction(gen.weather.windMs[windClass][hour] ?? 0);
          }
          for (const bucket of buckets) {
            const sums = regimeSum[bucket];
            sums.open += turbinePowerFraction(gen.weather.windMs.open[hour] ?? 0);
            sums.baltic += turbinePowerFraction(gen.weather.windMs.baltic[hour] ?? 0);
            sums.hours += 1;
          }
          const pv = pvPowerMw(1, gen.weather.ghiW[hour] ?? 0, gen.weather.tempC[hour] ?? 15);
          pvSum += pv;
          pvFarmSum += farmPowerMwAtHour(fullFarm, gen.weather, hour);
          pvDimFarmSum += farmPowerMwAtHour(dimFarm, gen.weather, hour);
          pvEnergyByMonth[month] = (pvEnergyByMonth[month] ?? 0) + pv;
          speedSumByMonth[month] =
            (speedSumByMonth[month] ?? 0) + (gen.weather.windMs.open[hour] ?? 0);
          speedHoursByMonth[month] = (speedHoursByMonth[month] ?? 0) + 1;
          if ((gen.weather.windMs.coastal[hour] ?? 0) >= 25) stormHours += 1;
          // §12.12 reference portfolio: 1 MW of open-terrain wind + 1 MW of PV.
          dayResEnergy += turbinePowerFraction(gen.weather.windMs.open[hour] ?? 0) + pv;
        }
        hours += 24;
        const winterHigh = regime === "frostHigh" || regime === "fogHigh";
        dunkelflauteDays.push(winterHigh && dayResEnergy / (2 * 24) < DUNKELFLAUTE_CF);
      }
    }
  }

  const episodes = episodeLengths(dunkelflauteDays);

  return {
    windCf: {
      sheltered: windSum.sheltered / hours,
      open: windSum.open / hours,
      coastal: windSum.coastal / hours,
      baltic: windSum.baltic / hours,
    },
    regimeCf: Object.fromEntries(
      (Object.keys(regimeSum) as RegimeGroup[]).map((group) => {
        const sums = regimeSum[group];
        const span = sums.hours || 1;
        return [group, { open: sums.open / span, baltic: sums.baltic / span }];
      }),
    ) as RegimeCf,
    pvCf: pvSum / hours,
    pvFarmCf: pvFarmSum / hours,
    pvDimFarmCf: pvDimFarmSum / hours,
    pvEnergyByMonth,
    meanSpeedByMonth: speedSumByMonth.map((sum, m) => sum / (speedHoursByMonth[m] ?? 1)),
    stormHoursPerRealYear: (stormHours / YEARS) * REAL_DAYS_PER_GAME_DAY,
    dunkelflaute: {
      daysPerYear: dunkelflauteDays.filter(Boolean).length / YEARS,
      episodesPerYear: episodes.length / YEARS,
      atLeast2PerYear: episodes.filter((length) => length >= 2).length / YEARS,
      atLeast3PerYear: episodes.filter((length) => length >= 3).length / YEARS,
    },
  };
}

const stats = simulate(2026);

describe("doc 06 §12.7: annual onshore wind capacity factor 24–30%", () => {
  test("open terrain", () => {
    expect(stats.windCf.open).toBeGreaterThanOrEqual(0.24);
    expect(stats.windCf.open).toBeLessThanOrEqual(0.3);
  });

  test("coast", () => {
    expect(stats.windCf.coastal).toBeGreaterThanOrEqual(0.24);
    expect(stats.windCf.coastal).toBeLessThanOrEqual(0.3);
  });
});

describe("doc 06 §12.13: annual sheltered-terrain wind capacity factor 13–18%", () => {
  test("sheltered class — half of what the coast yields", () => {
    expect(stats.windCf.sheltered).toBeGreaterThanOrEqual(0.13);
    expect(stats.windCf.sheltered).toBeLessThanOrEqual(0.18);
  });
});

describe("doc 06 §12.8: annual Baltic wind capacity factor 45–50%", () => {
  test("baltic class", () => {
    expect(stats.windCf.baltic).toBeGreaterThanOrEqual(0.45);
    expect(stats.windCf.baltic).toBeLessThanOrEqual(0.5);
  });
});

describe("doc 06 §12.14: the baltic class conditioned on the weather regime", () => {
  // Test 8 says how MUCH the sea yields over a year; this one says WHEN it does
  // not — the basis on which 01 §5.2 (0.22) admitted offshore wind to the game.
  test("Dunkelflaute stops the sea just like the land", () => {
    expect(stats.regimeCf.dunkelflaute.baltic).toBeLessThanOrEqual(0.01);
    expect(stats.regimeCf.dunkelflaute.open).toBeLessThanOrEqual(0.01);
  });

  test("a storm cuts the sea out BEFORE the land — it is already past rated", () => {
    expect(stats.regimeCf.storm.baltic).toBeLessThan(stats.regimeCf.storm.open);
  });

  test("over the year the sea still yields at least 1.6× open terrain", () => {
    expect(stats.regimeCf.all.baltic).toBeGreaterThanOrEqual(1.6 * stats.regimeCf.all.open);
    // The annual bucket must be the annual figure, or the split means nothing.
    expect(stats.regimeCf.all.baltic).toBeCloseTo(stats.windCf.baltic, 12);
  });
});

describe("doc 06 §12.6: annual PV capacity factor 11–12%", () => {
  test("1 MW reference installation", () => {
    expect(stats.pvCf).toBeGreaterThanOrEqual(0.11);
    expect(stats.pvCf).toBeLessThanOrEqual(0.12);
  });
});

describe("doc 01 §3.2: the insolation multiplier moves PV production, nothing else", () => {
  test("a farm on a 1.0 hex stays inside the §12.6 band", () => {
    expect(stats.pvFarmCf).toBeGreaterThanOrEqual(0.11);
    expect(stats.pvFarmCf).toBeLessThanOrEqual(0.12);
  });

  test("a 0.8 hex lowers the capacity factor proportionally", () => {
    expect(stats.pvDimFarmCf).toBeCloseTo(0.8 * stats.pvFarmCf, 12);
  });
});

describe("doc 06 §12.9: PV energy December : June between 1:10 and 1:12", () => {
  test("monthly energy ratio", () => {
    const ratio = (stats.pvEnergyByMonth[5] ?? 0) / (stats.pvEnergyByMonth[11] ?? 1);
    expect(ratio).toBeGreaterThanOrEqual(10);
    expect(ratio).toBeLessThanOrEqual(12);
  });
});

describe("doc 06 §12.10: mean wind speed January : July ≈ 1.43 : 1", () => {
  test("open-terrain monthly means", () => {
    const ratio = (stats.meanSpeedByMonth[0] ?? 0) / (stats.meanSpeedByMonth[6] ?? 1);
    expect(ratio).toBeGreaterThanOrEqual(1.33);
    expect(ratio).toBeLessThanOrEqual(1.53);
  });
});

describe("doc 06 §12.11: storm-cutout hours per year = 10–40", () => {
  test("coastal class, scaled to real days", () => {
    expect(stats.stormHoursPerRealYear).toBeGreaterThanOrEqual(10);
    expect(stats.stormHoursPerRealYear).toBeLessThanOrEqual(40);
  });
});

describe("doc 06 §12.12: Dunkelflaute in the game calendar", () => {
  // The doc's bands are per GAME year and per GAME day (§12.12): one game day
  // stands for ~10 real ones, so an episode here is already a multi-week spell.
  test("4–6 Dunkelflaute days per game year", () => {
    expect(stats.dunkelflaute.daysPerYear).toBeGreaterThanOrEqual(4);
    expect(stats.dunkelflaute.daysPerYear).toBeLessThanOrEqual(6);
  });

  test("1,0–1,5 episodes of at least two consecutive days per game year", () => {
    expect(stats.dunkelflaute.atLeast2PerYear).toBeGreaterThanOrEqual(1);
    expect(stats.dunkelflaute.atLeast2PerYear).toBeLessThanOrEqual(1.5);
  });

  test("0,8–1,4 episodes of at least three consecutive days per game year", () => {
    expect(stats.dunkelflaute.atLeast3PerYear).toBeGreaterThanOrEqual(0.8);
    expect(stats.dunkelflaute.atLeast3PerYear).toBeLessThanOrEqual(1.4);
  });

  test("06 §8.4 pt 2: the crisis builds up — most episodes span more than one day", () => {
    expect(stats.dunkelflaute.atLeast2PerYear / stats.dunkelflaute.episodesPerYear).toBeGreaterThan(
      0.8,
    );
  });
});
