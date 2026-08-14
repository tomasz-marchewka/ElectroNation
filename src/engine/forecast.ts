// Forecast model per docs/06 §8.6: the player never sees current weather or
// true demand — only a forecast band around a truth that already exists.
// One error process per day and quantity (§8.6.2 pt 3), scaled by the horizon;
// the demand error is systemic — one factor shared by all cities (doc 02 §7).

import { STORAGE_TECHS } from "./config";
import { HOURS_PER_TURN, type FarmState, type GameState } from "./state";
import { farmPowerMwAtHour } from "./weather";

/** §8.6.2: σ as share of installed capacity (wind/PV) or of peak (demand). */
export function sigmaWind(horizonHours: number): number {
  return 0.04 + 0.022 * Math.min(horizonHours, 12);
}

export function sigmaPv(horizonHours: number): number {
  return 0.03 + 0.02 * Math.min(horizonHours, 12);
}

export function sigmaDemand(horizonHours: number): number {
  return 0.01 + 0.004 * Math.min(horizonHours, 12);
}

export interface ForecastPoint {
  /** Expected value shown to the player [MW]. */
  mw: number;
  /** ±1σ band half-width [MW]; 0 for hours already revealed. */
  bandMw: number;
}

/**
 * Forecast horizon [h] of a target hour, seen from the pending turn. Hours
 * before the pending block are revealed truth (horizon ≤ 0).
 */
function horizonHours(state: GameState, hour: number): number {
  return hour - state.calendar.turnIndex * HOURS_PER_TURN + 1;
}

/** True hourly demand is exposed through the forecast only (01 §2.4). */
export function cityDemandForecast(
  state: GameState,
  cityId: string,
  hour: number,
): ForecastPoint | undefined {
  const truth = state.dayTruth.cityDemandMw[cityId];
  const truthMw = truth?.[hour];
  if (truth === undefined || truthMw === undefined) return undefined;
  const horizon = horizonHours(state, hour);
  if (horizon <= 0) return { mw: truthMw, bandMw: 0 };
  const peakMw = Math.max(...truth);
  const sigma = sigmaDemand(horizon);
  return {
    mw: Math.max(0, truthMw + state.dayTruth.forecastZ.demand * sigma * peakMw),
    bandMw: sigma * peakMw,
  };
}

/**
 * Production forecast of a farm. Reflects the weather potential — the on/off
 * switch (01 §4.1) is the player's own lever, not a forecast input.
 */
export function farmProductionForecast(
  state: GameState,
  farmId: string,
  hour: number,
): ForecastPoint | undefined {
  const farm: FarmState | undefined = state.farms.find((f) => f.id === farmId);
  if (!farm || hour < 0 || hour >= 24) return undefined;
  const truthMw = farmPowerMwAtHour(farm, state.dayTruth.weather, hour);
  const horizon = horizonHours(state, hour);
  if (horizon <= 0) return { mw: truthMw, bandMw: 0 };
  const sigma = farm.tech === "wind" ? sigmaWind(horizon) : sigmaPv(horizon);
  const z =
    farm.tech === "wind" ? state.dayTruth.forecastZ.wind : state.dayTruth.forecastZ.pv;
  return {
    mw: Math.min(farm.capacityMw, Math.max(0, truthMw + z * sigma * farm.capacityMw)),
    bandMw: sigma * farm.capacityMw,
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
  for (let hour = state.calendar.turnIndex * HOURS_PER_TURN; hour < 24; hour++) {
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
      horizonHours: horizonHours(state, hour),
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
