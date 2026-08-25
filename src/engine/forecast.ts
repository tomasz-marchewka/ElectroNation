// Forecast model per docs/06 §8.6: the player never sees current weather or
// true demand — only a forecast band around a truth that already exists.
// One error process per day and quantity (§8.6.2 pt 3), scaled by the horizon;
// the demand error is systemic — one factor shared by all cities (doc 02 §7).
//
// The horizon ROLLS with the turn (§8.6.3, 01 §2.4 v0.18): the forecast system
// owned decides how many days ahead are visible (1 / 3 / 7) and how wide the
// bands are, counted from the PENDING turn — not to the end of the current day.
// In the game's own unit that is exactly 8·D turns, always, whatever the hour.
// Truth of a look-ahead day is generated on demand from that day's own PRNG
// streams, so what the forecast points at today is bit-for-bit what the day
// resolves to.

import { CONFIG, FORECAST_LEVELS, STORAGE_TECHS, type ForecastLevel } from "./config";
import type { DayType } from "./demand";
import { projectPlantOutputMw } from "./dispatch";
import { FARM_LAYERS, PLANT_LAYERS } from "./history";
import {
  COVERAGE_LAYERS,
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  type CoverageLayer,
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
    FORECAST_LEVELS[level].sigmaMultiplier * (1 + CONFIG.forecastSigmaGrowthPerDay) ** dayOffset
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

/** The same reach in hours — the rolling limit itself: `1 ≤ h ≤ 24·D`. */
export function forecastHorizonHours(state: GameState): number {
  return forecastHorizonDays(state) * HOURS_PER_DAY;
}

/**
 * The same reach in turns, which is the number the interface works in: the
 * forecast covers the pending turn and `8·D − 1` after it, whatever the hour
 * of the day. A turn is 3 h and the limit is a whole number of days from a
 * turn boundary, so a block is never half inside the horizon.
 */
export function forecastHorizonTurns(state: GameState): number {
  return forecastHorizonDays(state) * TURNS_PER_DAY;
}

/**
 * Truth of the day `dayOffset` days from the current one, or undefined past the
 * forecast horizon. Day 0 is the state's own truth; later days are generated
 * from their day-keyed streams (see truth.ts on the city-roster caveat).
 *
 * The bound is `dayOffset ≤ D`, not `< D` (06 §8.6.3): a rolling horizon reaches
 * into the day AFTER the last full one in every turn but the first. Which hours
 * of that day are actually visible is decided per hour, by `horizonHours`.
 */
export function dayTruthAtOffset(state: GameState, dayOffset: number): DayTruth | undefined {
  if (!Number.isInteger(dayOffset) || dayOffset < 0) return undefined;
  if (dayOffset > forecastHorizonDays(state)) return undefined;
  if (dayOffset === 0) return state.dayTruth;
  return generateDayTruth(state.seed, state.calendar.dayIndex + dayOffset, state.cities);
}

/**
 * Forecast horizon [h] of a target hour, seen from the pending turn. Hours
 * before the pending block of the current day are revealed truth (horizon ≤ 0).
 */
function horizonHours(state: GameState, hour: number, dayOffset: number): number {
  return dayOffset * HOURS_PER_DAY + hour - state.calendar.turnIndex * HOURS_PER_TURN + 1;
}

/** Whether a target hour is still inside the rolling horizon (06 §8.6.3). */
function inHorizon(state: GameState, horizon: number): boolean {
  return horizon <= forecastHorizonHours(state);
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
  const horizon = horizonHours(state, hour, dayOffset);
  if (!inHorizon(state, horizon)) return undefined;
  return demandPoint(truth, cityId, hour, horizon, state.forecastLevel, dayOffset);
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
  const horizon = horizonHours(state, hour, dayOffset);
  if (!inHorizon(state, horizon)) return undefined;
  return farmPoint(truth, farm, hour, horizon, state.forecastLevel, dayOffset);
}

/** One day of the multi-day forecast panel — aggregates, hour by hour. */
export interface DayForecast {
  dayOffset: number;
  dayIndex: number;
  dayType: DayType;
  /**
   * Hourly points, summed over connected cities / enabled farms, indexed BY
   * HOUR. The current day always has all 24; the last day of a rolling horizon
   * is cut where the horizon ends, so the arrays are a prefix of the day and
   * `length` names the first hour nobody can see yet (06 §8.6.3).
   */
  demand: ForecastPoint[];
  wind: ForecastPoint[];
  pv: ForecastPoint[];
}

/**
 * Whole-day aggregated forecast — what the multi-day panel draws. Generates the
 * day's truth once, unlike per-hour calls. Undefined past the horizon.
 */
export function dayForecast(state: GameState, dayOffset: number): DayForecast | undefined {
  const truth = dayTruthAtOffset(state, dayOffset);
  if (!truth) return undefined;
  const level = state.forecastLevel;
  const demand: ForecastPoint[] = [];
  const wind: ForecastPoint[] = [];
  const pv: ForecastPoint[] = [];
  for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
    const horizon = horizonHours(state, hour, dayOffset);
    if (!inHorizon(state, horizon)) break;
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
  if (demand.length === 0) return undefined;
  return {
    dayOffset,
    dayIndex: state.calendar.dayIndex + dayOffset,
    dayType: truth.dayType,
    demand,
    wind,
    pv,
  };
}

/** Block-average forecast of one turn — what a ribbon column ahead of TERAZ shows. */
export interface TurnForecast {
  dayOffset: number;
  turnIndex: number;
  demand: ForecastPoint;
  wind: ForecastPoint;
  pv: ForecastPoint;
}

/**
 * The forecast for one whole turn, averaged over its three hours exactly as the
 * resolution averages truth (01 §2.2) — so what the report strip prints ahead of
 * TERAZ is comparable, number for number, with what it prints behind it.
 * Undefined past the rolling horizon, and for the turns already resolved: their
 * band is gone, and the archive keeps what it was (02 §4.1).
 */
export function turnForecast(
  state: GameState,
  dayOffset: number,
  turnIndex: number,
): TurnForecast | undefined {
  if (!Number.isInteger(turnIndex) || turnIndex < 0 || turnIndex >= TURNS_PER_DAY) return undefined;
  const truth = dayTruthAtOffset(state, dayOffset);
  if (!truth) return undefined;
  const level = state.forecastLevel;
  const startHour = turnIndex * HOURS_PER_TURN;
  const totals = {
    demand: { mw: 0, bandMw: 0 },
    wind: { mw: 0, bandMw: 0 },
    pv: { mw: 0, bandMw: 0 },
  };
  for (let hour = startHour; hour < startHour + HOURS_PER_TURN; hour++) {
    const horizon = horizonHours(state, hour, dayOffset);
    if (horizon <= 0 || !inHorizon(state, horizon)) return undefined;
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
  }
  const average = (point: ForecastPoint): ForecastPoint => ({
    mw: point.mw / HOURS_PER_TURN,
    bandMw: point.bandMw / HOURS_PER_TURN,
  });
  return {
    dayOffset,
    turnIndex,
    demand: average(totals.demand),
    wind: average(totals.wind),
    pv: average(totals.pv),
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

/** What the dispatchable half of the plan is worth at the current setpoints. */
interface SetpointPlan {
  /** Per COVERAGE_LAYERS, aligned by index; the two RES layers stay at 0. */
  coverageMw: number[];
  /** The same numbers summed — plants + import + discharge. */
  dispatchableMw: number;
  /** Extra load the plan also has to carry: storage charging + export. */
  extraLoadMw: number;
}

/**
 * The dispatchable part of the plan, read off the setpoints (01 §8 pt 3).
 * Plants project their BLOCK DYNAMICS (01 §5.1 in 0.27): `stepsAhead`
 * resolutions from now under the current setpoint — deterministic, so the plan
 * honestly shows a coal order still ramping instead of the setpoint it will
 * only reach later. Storage power is capped by the CURRENT state of charge and
 * held there for every hour projected: the projection never simulates a turn,
 * so it cannot know how the charge would actually run down.
 */
function planAtSetpoints(state: GameState, stepsAhead: number): SetpointPlan {
  const coverageMw = COVERAGE_LAYERS.map(() => 0);
  const add = (layer: CoverageLayer, mw: number): void => {
    const index = COVERAGE_LAYERS.indexOf(layer);
    coverageMw[index] = (coverageMw[index] ?? 0) + mw;
  };
  let extraLoadMw = 0;

  for (const plant of state.plants) {
    add(PLANT_LAYERS[plant.tech], projectPlantOutputMw(plant, stepsAhead));
  }
  for (const border of state.borders) {
    add("import", border.importSetpointMw);
    extraLoadMw += border.exportSetpointMw;
  }
  for (const storage of state.storages) {
    const leg = Math.sqrt(STORAGE_TECHS[storage.tech].cycleEfficiency);
    if (storage.setpoint.mode === "discharge") {
      add("storage", Math.min(storage.setpoint.mw, (storage.socMwh * leg) / HOURS_PER_TURN));
    } else if (storage.setpoint.mode === "charge") {
      extraLoadMw += Math.min(
        storage.setpoint.mw,
        Math.max(0, (storage.capacityMwh - storage.socMwh) / (HOURS_PER_TURN * leg)),
      );
    }
  }
  return {
    coverageMw,
    dispatchableMw: coverageMw.reduce((sum, mw) => sum + mw, 0),
    extraLoadMw,
  };
}

/**
 * Projects the system balance for the remaining hours of the current day,
 * holding today's setpoints constant — the "will the plan survive the next
 * hours" column (01 §8 pt 3). Deliberately network-blind: no line limits, no
 * losses. Bands within one quantity share the day's error factor, so summing
 * them is exact; across quantities the worst case is conservative — as a safety
 * check should be. Stays on the current day: the multi-day panel reads
 * `dayForecast` instead.
 */
export function projectBalance(state: GameState): BalanceProjectionPoint[] {
  // One plan per future turn: the plant half moves with the block dynamics,
  // so an hour three turns out shows what the blocks will hold by then.
  const planCache = new Map<number, SetpointPlan>();
  const planAtStep = (stepsAhead: number): SetpointPlan => {
    let plan = planCache.get(stepsAhead);
    if (!plan) {
      plan = planAtSetpoints(state, stepsAhead);
      planCache.set(stepsAhead, plan);
    }
    return plan;
  };

  const points: BalanceProjectionPoint[] = [];
  for (let hour = state.calendar.turnIndex * HOURS_PER_TURN; hour < HOURS_PER_DAY; hour++) {
    const stepsAhead = Math.floor(hour / HOURS_PER_TURN) - state.calendar.turnIndex + 1;
    const { dispatchableMw, extraLoadMw } = planAtStep(stepsAhead);
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

/**
 * One future turn drawn the way a resolved one is (01 §8 pt 2): the coverage
 * the CURRENT setpoints promise, layer for layer, with wind and PV taken from
 * the forecast instead of from truth.
 */
export interface TurnCoverageProjection {
  dayOffset: number;
  turnIndex: number;
  /** Planned power per COVERAGE_LAYERS, aligned by index [MW]. */
  coverageMw: number[];
  /** Demand forecast of the same block — what the plan is measured against. */
  demand: ForecastPoint;
  /** ±1σ of the RES half of the plan; the setpoints themselves carry no band. */
  resBandMw: number;
  /** Storage charging + export at the current setpoints [MW]. */
  extraLoadMw: number;
}

/**
 * The plan for one turn ahead of TERAZ, stacked into the ribbon's own layers.
 * Same simplifications as `projectBalance` — network-blind, setpoints held
 * constant, storage capped by today's state of charge — and the same reach as
 * `turnForecast`: undefined past the rolling horizon and for turns already
 * resolved, which have an archive entry of their own (02 §4.1).
 *
 * It is a PLAN, not a dispatch: nothing here is trimmed to demand, so a stack
 * that overshoots the demand forecast is exactly the surplus the turn would
 * dump (01 §4.1), and one that falls short is the deficit the player still has
 * to cover.
 */
export function projectTurnCoverage(
  state: GameState,
  dayOffset: number,
  turnIndex: number,
): TurnCoverageProjection | undefined {
  const forecast = turnForecast(state, dayOffset, turnIndex);
  if (forecast === undefined) return undefined;
  const stepsAhead = dayOffset * TURNS_PER_DAY + turnIndex - state.calendar.turnIndex + 1;
  const plan = planAtSetpoints(state, stepsAhead);
  const coverageMw = [...plan.coverageMw];
  const windIndex = COVERAGE_LAYERS.indexOf(FARM_LAYERS.wind);
  const pvIndex = COVERAGE_LAYERS.indexOf(FARM_LAYERS.pv);
  coverageMw[windIndex] = (coverageMw[windIndex] ?? 0) + forecast.wind.mw;
  coverageMw[pvIndex] = (coverageMw[pvIndex] ?? 0) + forecast.pv.mw;
  return {
    dayOffset,
    turnIndex,
    coverageMw,
    demand: forecast.demand,
    resBandMw: forecast.wind.bandMw + forecast.pv.bandMw,
    extraLoadMw: plan.extraLoadMw,
  };
}
