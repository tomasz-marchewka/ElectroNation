// Weather of the shown turn (docs/08 §6, ARCHITECTURE.md §8): the block
// averages of the day's hourly truth (06 §8.6.1), plus the derivations the
// renderer needs and the engine has no reason to carry — precipitation, fog,
// snow cover, wind direction. Every derivation is a pure function of the truth
// and the regime; nothing here is random except the per-day wind heading,
// which comes from an engine PRNG stream keyed by the day (deterministic).

import {
  HOURS_PER_TURN,
  TURBINE,
  WIND_CLASSES,
  generateWeatherDay,
  nextFloat01,
  seedStream,
  turbinePowerFraction,
  type DayTruth,
  type RegimeId,
  type WeatherTruth,
  type WindClass,
} from "../../engine";
import type { PrecipitationKind, WorldWeather } from "./worldScene";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function blockAverage(values: readonly number[] | undefined, startHour: number): number {
  if (!values) return 0;
  let sum = 0;
  for (let h = 0; h < HOURS_PER_TURN; h++) sum += values[startHour + h] ?? 0;
  return sum / HOURS_PER_TURN;
}

function blockMax(values: readonly number[] | undefined, startHour: number): number {
  if (!values) return 0;
  let max = 0;
  for (let h = 0; h < HOURS_PER_TURN; h++) max = Math.max(max, values[startHour + h] ?? 0);
  return max;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Where the wind usually blows from under each regime (06 §8.2), clockwise from north. */
const WIND_FROM_BASE: Record<RegimeId, number> = {
  frostHigh: 100,
  fogHigh: 20,
  atlanticLow: 250,
  storm: 280,
  summerHigh: 90,
  summerLow: 240,
  transitional: 220,
  coldWave: 70,
};

/** How gusty each regime is — shapes plume and cloth motion, not the numbers. */
const GUSTINESS: Record<RegimeId, number> = {
  frostHigh: 0.1,
  fogHigh: 0.05,
  atlanticLow: 0.6,
  storm: 1,
  summerHigh: 0.15,
  summerLow: 0.5,
  transitional: 0.35,
  coldWave: 0.3,
};

/** Base fog density per regime; night deepens radiation fog under the fog high. */
const FOG_BASE: Record<RegimeId, number> = {
  frostHigh: 0.15,
  fogHigh: 0.9,
  atlanticLow: 0.25,
  storm: 0.35,
  summerHigh: 0.08,
  summerLow: 0.3,
  transitional: 0.15,
  coldWave: 0.1,
};

/** Share of the cloud-driven rain a regime actually drops. */
const RAIN_FACTOR: Record<RegimeId, number> = {
  frostHigh: 0,
  fogHigh: 0,
  atlanticLow: 0.7,
  storm: 1,
  summerHigh: 0,
  summerLow: 0.6,
  transitional: 0.3,
  coldWave: 0.4,
};

export interface WeatherInput {
  seed: number;
  dayIndex: number;
  dayOfYear: number;
  month: number;
  /** Hour the shown block starts at (turnIndex × 3). */
  startHour: number;
  /** Whether the shown hour is night — deepens fog, dims haze. */
  night: boolean;
}

/**
 * The truth to show: the day's own, unless a capture asks for another regime,
 * in which case the SAME day is regenerated under that regime with the
 * engine's own generator — the same seed and day always give the same
 * "what if" weather.
 */
export function weatherTruthFor(
  truth: DayTruth,
  input: WeatherInput,
  override: RegimeId | null,
): { weather: WeatherTruth; regime: RegimeId } {
  if (override === null || override === truth.regime) {
    return { weather: truth.weather, regime: truth.regime };
  }
  const generated = generateWeatherDay(
    seedStream(input.seed, `weather-day-${input.dayIndex}`),
    input.dayOfYear,
    input.month,
    override,
  );
  return { weather: generated.weather, regime: override };
}

/** Per-day heading jitter of ±25°, from a stream keyed by the day. */
function windHeadingJitter(seed: number, dayIndex: number): number {
  const draw = nextFloat01(seedStream(seed, `world-wind-day-${dayIndex}`));
  return (draw.value - 0.5) * 50;
}

export function precipitationOf(
  regime: RegimeId,
  cloudCover: number,
  tempC: number,
): { kind: PrecipitationKind; intensity: number } {
  const factor = RAIN_FACTOR[regime];
  const threshold = regime === "coldWave" ? 0.4 : 0.7;
  const drive = clamp01((cloudCover - threshold) / (1 - threshold));
  const intensity = clamp01(drive * factor);
  if (intensity <= 0.02) return { kind: "none", intensity: 0 };
  const kind: PrecipitationKind = tempC < 0.5 ? "snow" : tempC < 2 ? "sleet" : "rain";
  return { kind, intensity };
}

/** 0..1 lowland snow cover from the day's mean temperature, forced by the cold regimes. */
export function snowCoverOf(regime: RegimeId, dailyMeanTempC: number): number {
  // 1 at −3 °C and below, 0 at +3 °C and above.
  const thermal = clamp01((3 - dailyMeanTempC) / 6);
  const forced = regime === "coldWave" || regime === "frostHigh" ? 0.8 : 0;
  return Math.max(thermal, forced);
}

export function buildWeather(
  truth: DayTruth,
  input: WeatherInput,
  override: RegimeId | null,
): WorldWeather {
  const { weather, regime } = weatherTruthFor(truth, input, override);
  const cloudCover = blockAverage(weather.cloudCover, input.startHour);
  const tempC = blockAverage(weather.tempC, input.startHour);
  const dailyMeanTempC = mean(weather.tempC);
  const windMs = {} as Record<WindClass, number>;
  let storm = false;
  let openFraction = 0;
  for (const windClass of Object.keys(WIND_CLASSES) as WindClass[]) {
    const series = weather.windMs[windClass];
    windMs[windClass] = blockAverage(series, input.startHour);
    if (blockMax(series, input.startHour) >= TURBINE.vOut) storm = true;
  }
  for (let h = 0; h < HOURS_PER_TURN; h++) {
    openFraction += turbinePowerFraction(weather.windMs.open[input.startHour + h] ?? 0);
  }
  openFraction /= HOURS_PER_TURN;
  const ghiW = blockAverage(weather.ghiW, input.startHour);
  const precipitation = precipitationOf(regime, cloudCover, tempC);
  const fogBase = FOG_BASE[regime];
  const fog = clamp01(regime === "fogHigh" && input.night ? fogBase + 0.1 : fogBase);
  const haze = clamp01(0.15 + 0.5 * cloudCover + (regime === "summerHigh" ? 0.25 : 0));
  const winterHigh = regime === "frostHigh" || regime === "fogHigh";
  return {
    regime,
    cloudCover,
    ghiW,
    tempC,
    dailyMeanTempC,
    windMs,
    windFromDeg:
      (((WIND_FROM_BASE[regime] + windHeadingJitter(input.seed, input.dayIndex)) % 360) + 360) %
      360,
    gustiness: GUSTINESS[regime],
    precipitation,
    fog,
    haze,
    snowCover: snowCoverOf(regime, dailyMeanTempC),
    storm,
    // 06 §12.12 in the small: the winter high, no usable wind, next to no sun.
    dunkelflaute: winterHigh && openFraction < 0.05 && ghiW < 60,
  };
}
