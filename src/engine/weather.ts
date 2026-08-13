// Weather truth per docs/06 §5–§7: temperature, wind speeds (Weibull per
// location class with §6.4 seasonality shape) and production models for PV and
// wind turbines. Stage-1 weather (01 §12): hourly draws are independent — the
// regime generator and intraday variability (06 §8) land on top of this layer
// without changing its interface.

import { clearSkyGhiW, cloudAttenuation, solarAltitudeDeg } from "./astronomy";
import {
  CONFIG,
  PV,
  TEMPERATURE,
  TURBINE,
  WIND_CLASSES,
  WIND_MONTHLY_MEAN_MS,
  type WindClass,
} from "./config";
import { nextFloat01, type PrngState } from "./prng";
import { quantize001, quantize01 } from "./quantize";

/** 06 §6.4 shape, normalized to its own annual mean (see config note). */
const WIND_SEASONAL_FACTOR = (() => {
  const mean = WIND_MONTHLY_MEAN_MS.reduce((a, b) => a + b, 0) / 12;
  return WIND_MONTHLY_MEAN_MS.map((v) => v / mean);
})();

/** 06 §7.1: daily mean temperature for day of year n. */
export function dailyMeanTempC(dayOfYear: number): number {
  return (
    TEMPERATURE.annualMeanC +
    TEMPERATURE.annualAmplitudeC *
      Math.cos((2 * Math.PI * (dayOfYear - TEMPERATURE.peakDayOfYear)) / 365)
  );
}

/** 06 §7.2: hourly temperature; cloud cover flattens the diurnal swing. */
export function hourlyTempC(
  dayOfYear: number,
  hour: number,
  cloudCover: number,
): number {
  const baseAmplitude =
    TEMPERATURE.diurnalBaseMeanC +
    TEMPERATURE.diurnalBaseAmplitudeC *
      Math.cos((2 * Math.PI * (dayOfYear - TEMPERATURE.peakDayOfYear)) / 365);
  const amplitude = baseAmplitude * (1 - TEMPERATURE.cloudDamping * cloudCover);
  return (
    dailyMeanTempC(dayOfYear) -
    (amplitude / 2) *
      Math.cos((2 * Math.PI * (hour - TEMPERATURE.warmestHour)) / 24)
  );
}

/** Weibull λ for a class in a month: class λ × normalized §6.4 seasonality. */
export function windLambda(windClass: WindClass, month: number): number {
  return WIND_CLASSES[windClass].lambda * (WIND_SEASONAL_FACTOR[month] ?? 1);
}

/** Inverse Weibull CDF: quantile q ∈ [0,1) → wind speed [m/s]. */
export function windSpeedFromQuantile(
  windClass: WindClass,
  month: number,
  quantile: number,
): number {
  const { k } = WIND_CLASSES[windClass];
  return windLambda(windClass, month) * Math.pow(-Math.log(1 - quantile), 1 / k);
}

/** 06 §6.3: turbine power curve with storm cutout, as a fraction of P_nom. */
export function turbinePowerFraction(windSpeedMs: number): number {
  const { vIn, vRated, vOut } = TURBINE;
  if (windSpeedMs < vIn || windSpeedMs >= vOut) return 0;
  if (windSpeedMs >= vRated) return 1;
  const v3 = windSpeedMs ** 3;
  return (v3 - vIn ** 3) / (vRated ** 3 - vIn ** 3);
}

/** 06 §5: PV output [MW] from GHI [W/m²] and air temperature [°C]. */
export function pvPowerMw(
  capacityMw: number,
  ghiW: number,
  airTempC: number,
): number {
  if (ghiW <= 0) return 0;
  const cellTempC = airTempC + ((PV.noctC - 20) / 800) * ghiW;
  const etaTemp = 1 + PV.gammaPerC * (cellTempC - 25);
  return capacityMw * (ghiW / 1000) * etaTemp * PV.etaSystem;
}

/** Hourly weather truth for one day (see state.ts WeatherTruth). */
export interface WeatherDay {
  cloudCover: number[];
  ghiW: number[];
  tempC: number[];
  /** Wind speed [m/s] per location class, 24 values each, quantized. */
  windMs: Record<WindClass, number[]>;
}

/**
 * Generates one day of weather truth from the weather stream. The draw count
 * is fixed (1 + 24 + 24) regardless of state, so stream alignment never
 * depends on the map or on player actions.
 *
 * Placeholder structure until 06 §8 regimes land: a daily cloud base with
 * hourly jitter, and i.i.d. hourly Weibull wind quantiles ("static wind",
 * 06 §13 step 5).
 */
export function generateWeatherDay(
  rng: PrngState,
  dayOfYear: number,
  month: number,
): { weather: WeatherDay; rng: PrngState } {
  let state = rng;
  const draw = () => {
    const r = nextFloat01(state);
    state = r.state;
    return r.value;
  };

  const cloudBase = draw();
  const cloudCover: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const jitter = 0.35 * (draw() - 0.5);
    cloudCover.push(quantize001(Math.min(1, Math.max(0, cloudBase + jitter))));
  }

  const windMs: Record<WindClass, number[]> = { open: [], coastal: [], baltic: [] };
  for (let hour = 0; hour < 24; hour++) {
    // One quantile shared by all classes: sites are perfectly correlated until
    // regimes introduce structured weather.
    const quantile = Math.min(draw(), 0.999999);
    for (const windClass of Object.keys(WIND_CLASSES) as WindClass[]) {
      windMs[windClass].push(
        quantize01(windSpeedFromQuantile(windClass, month, quantile)),
      );
    }
  }

  const ghiW: number[] = [];
  const tempC: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const altitude = solarAltitudeDeg(CONFIG.latitudeDeg, dayOfYear, hour + 0.5);
    ghiW.push(
      quantize01(clearSkyGhiW(altitude) * cloudAttenuation(cloudCover[hour] ?? 0)),
    );
    tempC.push(quantize01(hourlyTempC(dayOfYear, hour, cloudCover[hour] ?? 0)));
  }

  return { weather: { cloudCover, ghiW, tempC, windMs }, rng: state };
}
