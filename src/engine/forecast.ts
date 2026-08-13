// Forecast model per docs/06 §8.6: the player never sees current weather or
// true demand — only a forecast band around a truth that already exists.
// One error process per day and quantity (§8.6.2 pt 3), scaled by the horizon;
// the demand error is systemic — one factor shared by all cities (doc 02 §7).

import { type FarmState, type GameState } from "./state";
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
  return hour - state.calendar.turnIndex * 3 + 1;
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
