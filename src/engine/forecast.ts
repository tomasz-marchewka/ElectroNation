// Forecast model per docs/06 §8.6: the player never sees current weather or
// true demand — only a forecast band around a truth that already exists.
// One error process per day and quantity (§8.6.2 pt 3), scaled by the horizon;
// the demand error is systemic — one factor shared by all cities (doc 02 §7).
//
// The horizon spans whole days (§8.6.3): the forecast system owned decides how
// many days ahead are visible (1 / 3 / 7) and how wide the bands are. Truth of
// a look-ahead day is generated on demand from that day's own PRNG streams, so
// what the forecast points at today is bit-for-bit what the day resolves to.

import {
  CONFIG,
  FORECAST_LEVELS,
  STORAGE_TECHS,
  type ForecastLevel,
} from "./config";
import type { DayType } from "./demand";
import {
  HOURS_PER_TURN,
  type DayTruth,
  type FarmState,
  type GameState,
} from "./state";
import { generateDayTruth } from "./truth";
import { farmPowerMwAtHour } from "./weather";

const HOURS_PER_DAY = 24;

/**
 * §8.6.3: σ of a day `dayOffset` days ahead. The `min(h, 12)` cap of §8.6.2
 * shapes the run WITHIN a day; between days σ keeps growing by
 * `CONFIG.forecastSigmaGrowthPerDay`. The forecast system scales the whole
 * thing (×1.0 / ×0.7 / ×0.5).
 */
function levelScale(level: ForecastLevel, dayOffset: number): number {
  return (
    FORECAST_LEVELS[level].sigmaMultiplier *
    (1 + CONFIG.forecastSigmaGrowthPerDay) ** dayOffset
  );
}

/** §8.6.2: σ as share of installed capacity (wind/PV) or of peak (demand). */
export function sigmaWind(
  horizonHours: number,
  level: ForecastLevel = "basic",
  dayOffset = 0,
): number {
  return (0.04 + 0.022 * Math.min(horizonHours, 12)) * levelScale(level, dayOffset);
}

export function sigmaPv(
  horizonHours: number,
  level: ForecastLevel = "basic",
  dayOffset = 0,
): number {
  return (0.03 + 0.02 * Math.min(horizonHours, 12)) * levelScale(level, dayOffset);
}

export function sigmaDemand(
  horizonHours: number,
  level: ForecastLevel = "basic",
  dayOffset = 0,
): number {
  return (0.01 + 0.004 * Math.min(horizonHours, 12)) * levelScale(level, dayOffset);
}

export interface ForecastPoint {
  /** Expected value shown to the player [MW]. */
  mw: number;
  /** ±1σ band half-width [MW]; 0 for hours already revealed. */
  bandMw: number;
}

/** How many days ahead the owned forecast system reaches (01 §2.4). */
export function forecastHorizonDays(state: GameState): number {
  return FORECAST_LEVELS[state.forecastLevel].horizonDays;
}

/**
 * Truth of the day `dayOffset` days from the current one, or undefined past the
 * forecast horizon. Day 0 is the state's own truth; later days are generated
 * from their day-keyed streams (see truth.ts on the city-roster caveat).
 */
export function dayTruthAtOffset(
  state: GameState,
  dayOffset: number,
): DayTruth | undefined {
  if (!Number.isInteger(dayOffset) || dayOffset < 0) return undefined;
  if (dayOffset >= forecastHorizonDays(state)) return undefined;
  if (dayOffset === 0) return state.dayTruth;
  return generateDayTruth(state.seed, state.calendar.dayIndex + dayOffset, state.cities);
}

/**
 * Forecast horizon [h] of a target hour, seen from the pending turn. Hours
 * before the pending block of the current day are revealed truth (horizon ≤ 0).
 */
function horizonHours(state: GameState, hour: number, dayOffset: number): number {
  return (
    dayOffset * HOURS_PER_DAY + hour - state.calendar.turnIndex * HOURS_PER_TURN + 1
  );
}

function demandPoint(
  truth: DayTruth,
  cityId: string,
  hour: number,
  horizon: number,
  level: ForecastLevel,
  dayOffset: number,
): ForecastPoint | undefined {
  const series = truth.cityDemandMw[cityId];
  const truthMw = series?.[hour];
  if (series === undefined || truthMw === undefined) return undefined;
  if (horizon <= 0) return { mw: truthMw, bandMw: 0 };
  const peakMw = Math.max(...series);
  const sigma = sigmaDemand(horizon, level, dayOffset);
  return {
    mw: Math.max(0, truthMw + truth.forecastZ.demand * sigma * peakMw),
    bandMw: sigma * peakMw,
  };
}

function farmPoint(
  truth: DayTruth,
  farm: FarmState,
  hour: number,
  horizon: number,
  level: ForecastLevel,
  dayOffset: number,
): ForecastPoint {
  const truthMw = farmPowerMwAtHour(farm, truth.weather, hour);
  if (horizon <= 0) return { mw: truthMw, bandMw: 0 };
  const sigma =
    farm.tech === "wind"
      ? sigmaWind(horizon, level, dayOffset)
      : sigmaPv(horizon, level, dayOffset);
  const z = farm.tech === "wind" ? truth.forecastZ.wind : truth.forecastZ.pv;
  return {
    mw: Math.min(farm.capacityMw, Math.max(0, truthMw + z * sigma * farm.capacityMw)),
    bandMw: sigma * farm.capacityMw,
  };
}

/**
 * True hourly demand is exposed through the forecast only (01 §2.4).
 * `dayOffset` defaults to the current day, so callers of the single-day API
 * keep working unchanged.
 */
export function cityDemandForecast(
  state: GameState,
  cityId: string,
  hour: number,
  dayOffset = 0,
): ForecastPoint | undefined {
  const truth = dayTruthAtOffset(state, dayOffset);
  if (!truth || hour < 0 || hour >= HOURS_PER_DAY) return undefined;
  return demandPoint(
    truth,
    cityId,
    hour,
    horizonHours(state, hour, dayOffset),
    state.forecastLevel,
    dayOffset,
  );
}

/**
 * Production forecast of a farm. Reflects the weather potential — the on/off
 * switch (01 §4.1) is the player's own lever, not a forecast input.
 */
export function farmProductionForecast(
  state: GameState,
  farmId: string,
  hour: number,
  dayOffset = 0,
): ForecastPoint | undefined {
  const farm: FarmState | undefined = state.farms.find((f) => f.id === farmId);
  const truth = dayTruthAtOffset(state, dayOffset);
  if (!farm || !truth || hour < 0 || hour >= HOURS_PER_DAY) return undefined;
  return farmPoint(
    truth,
    farm,
    hour,
    horizonHours(state, hour, dayOffset),
    state.forecastLevel,
    dayOffset,
  );
}

/** One day of the multi-day forecast panel — aggregates, hour by hour. */
export interface DayForecast {
  dayOffset: number;
  dayIndex: number;
  dayType: DayType;
  /** 24 hourly points each, summed over connected cities / enabled farms. */
  demand: ForecastPoint[];
  wind: ForecastPoint[];
  pv: ForecastPoint[];
}

/**
 * Whole-day aggregated forecast — what the multi-day panel draws. Generates the
 * day's truth once, unlike per-hour calls. Undefined past the horizon.
 */
export function dayForecast(
  state: GameState,
  dayOffset: number,
): DayForecast | undefined {
  const truth = dayTruthAtOffset(state, dayOffset);
  if (!truth) return undefined;
  const level = state.forecastLevel;
  const demand: ForecastPoint[] = [];
  const wind: ForecastPoint[] = [];
  const pv: ForecastPoint[] = [];
  for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
    const horizon = horizonHours(state, hour, dayOffset);
    const totals = {
      demand: { mw: 0, bandMw: 0 },
      wind: { mw: 0, bandMw: 0 },
      pv: { mw: 0, bandMw: 0 },
    };
    for (const city of state.cities) {
      if (!city.connected) continue;
      const point = demandPoint(truth, city.id, hour, horizon, level, dayOffset);
      if (!point) continue;
      totals.demand.mw += point.mw;
      totals.demand.bandMw += point.bandMw;
    }
    for (const farm of state.farms) {
      if (!farm.enabled) continue;
      const point = farmPoint(truth, farm, hour, horizon, level, dayOffset);
      const bucket = farm.tech === "wind" ? totals.wind : totals.pv;
      bucket.mw += point.mw;
      bucket.bandMw += point.bandMw;
    }
    demand.push(totals.demand);
    wind.push(totals.wind);
    pv.push(totals.pv);
  }
  return {
    dayOffset,
    dayIndex: state.calendar.dayIndex + dayOffset,
    dayType: truth.dayType,
    demand,
    wind,
    pv,
  };
}

/** One hour of the "balance at current setpoints" projection (01 §8 pt 3). */
export interface BalanceProjectionPoint {
  /** Hour of the current day, 0..23. */
  hour: number;
  horizonHours: number;
  /** Aggregated forecast over connected cities / enabled farms. */
  demandMw: number;
  demandBandMw: number;
  resMw: number;
  resBandMw: number;
  /** Dispatchable supply at current setpoints: plants + import + discharge. */
  dispatchableMw: number;
  /** Extra load at current setpoints: storage charging + export. */
  extraLoadMw: number;
  expectedBalanceMw: number;
  /** Both forecast bands fully against the player (06 §8.6.4). */
  worstCaseBalanceMw: number;
}

/**
 * Projects the system balance for the remaining hours of the current day,
 * holding today's setpoints constant — the "will the plan survive the next
 * hours" column (01 §8 pt 3). Deliberately network-blind: no line limits, no
 * losses; storage power is capped by the CURRENT state of charge. Bands within
 * one quantity share the day's error factor, so summing them is exact; across
 * quantities the worst case is conservative — as a safety check should be.
 * Stays on the current day: the multi-day panel reads `dayForecast` instead.
 */
export function projectBalance(state: GameState): BalanceProjectionPoint[] {
  let dispatchableMw = 0;
  let extraLoadMw = 0;
  for (const plant of state.plants) {
    dispatchableMw += Math.min(plant.setpointMw, plant.capacityMw);
  }
  for (const border of state.borders) {
    dispatchableMw += border.importSetpointMw;
    extraLoadMw += border.exportSetpointMw;
  }
  for (const storage of state.storages) {
    const leg = Math.sqrt(STORAGE_TECHS[storage.tech].cycleEfficiency);
    if (storage.setpoint.mode === "discharge") {
      dispatchableMw += Math.min(
        storage.setpoint.mw,
        (storage.socMwh * leg) / HOURS_PER_TURN,
      );
    } else if (storage.setpoint.mode === "charge") {
      extraLoadMw += Math.min(
        storage.setpoint.mw,
        Math.max(0, (storage.capacityMwh - storage.socMwh) / (HOURS_PER_TURN * leg)),
      );
    }
  }

  const points: BalanceProjectionPoint[] = [];
  for (let hour = state.calendar.turnIndex * HOURS_PER_TURN; hour < HOURS_PER_DAY; hour++) {
    let demandMw = 0;
    let demandBandMw = 0;
    let resMw = 0;
    let resBandMw = 0;
    for (const city of state.cities) {
      if (!city.connected) continue;
      const point = cityDemandForecast(state, city.id, hour);
      if (point) {
        demandMw += point.mw;
        demandBandMw += point.bandMw;
      }
    }
    for (const farm of state.farms) {
      if (!farm.enabled) continue;
      const point = farmProductionForecast(state, farm.id, hour);
      if (point) {
        resMw += point.mw;
        resBandMw += point.bandMw;
      }
    }
    const expected = dispatchableMw + resMw - demandMw - extraLoadMw;
    points.push({
      hour,
      horizonHours: horizonHours(state, hour, 0),
      demandMw,
      demandBandMw,
      resMw,
      resBandMw,
      dispatchableMw,
      extraLoadMw,
      expectedBalanceMw: expected,
      worstCaseBalanceMw: expected - resBandMw - demandBandMw,
    });
  }
  return points;
}
