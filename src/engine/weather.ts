// Weather truth per docs/06 §5–§8: temperature model, regime-driven wind and
// cloud with Ornstein–Uhlenbeck intraday variability (§8.5), and production
// models for PV and wind turbines. Truth is generated fully at day init and
// quantized at the generation boundary (§8.6.1).

import { clearSkyGhiW, cloudAttenuation, solarAltitudeDeg } from "./astronomy";
import {
  CONFIG,
  PV,
  TEMPERATURE,
  TURBINE,
  WIND_CLASSES,
  WIND_MONTHLY_MEAN_MS,
  type FarmTech,
  type WindClass,
} from "./config";
import { nextFloat01, type PrngState } from "./prng";
import { quantize001, quantize01 } from "./quantize";
import { REGIMES, type RegimeId } from "./regimes";

/** 06 §6.4 shape, normalized to its own annual mean (see config note). */
const WIND_SEASONAL_FACTOR = (() => {
  const mean = WIND_MONTHLY_MEAN_MS.reduce((a, b) => a + b, 0) / 12;
  return WIND_MONTHLY_MEAN_MS.map((v) => v / mean);
})();

/** §8.5: OU noise for wind — ±20–30% amplitude, ~2.5 h correlation time. */
const WIND_OU = { rho: Math.exp(-1 / 2.5), sd: 0.13, floor: 0.5, ceil: 1.5 };
/** Cloud jitter: short correlation (~30–60 min), hourly draws ~independent. */
const CLOUD_JITTER = 0.24;
/** Per-day lognormal factor: days within a regime differ (§8.4 pt 3). */
const DAY_FACTOR = { sigma: 0.12, floor: 0.7, ceil: 1.4 };

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

/** Mean wind speed of a location class in a month [m/s] (λ·Γ(1+1/k) × §6.4 shape). */
export function meanWindSpeedMs(windClass: WindClass, month: number): number {
  const spec = WIND_CLASSES[windClass];
  return spec.lambda * spec.meanFactor * (WIND_SEASONAL_FACTOR[month] ?? 1);
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

/**
 * Production of one farm at one truth hour [MW]. PV scales with the regional
 * insolation multiplier the farm recorded at build time (01 §3.2) — a location
 * property, so it multiplies the output rather than the irradiance itself.
 */
export function farmPowerMwAtHour(
  farm: {
    tech: FarmTech;
    capacityMw: number;
    windClass: WindClass;
    solarMultiplier: number;
  },
  weather: { ghiW: number[]; tempC: number[]; windMs: Record<WindClass, number[]> },
  hour: number,
): number {
  if (farm.tech === "wind") {
    return farm.capacityMw * turbinePowerFraction(weather.windMs[farm.windClass][hour] ?? 0);
  }
  return (
    farm.solarMultiplier *
    pvPowerMw(farm.capacityMw, weather.ghiW[hour] ?? 0, weather.tempC[hour] ?? 15)
  );
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
 * Generates one day of weather truth under a regime. The draw count is fixed
 * (1 + 1 + 2 + 24 + 48) regardless of state, so stream alignment never depends
 * on the map or on player actions.
 */
export function generateWeatherDay(
  rng: PrngState,
  dayOfYear: number,
  month: number,
  regimeId: RegimeId,
): { weather: WeatherDay; rng: PrngState } {
  const regime = REGIMES[regimeId];
  let state = rng;
  const draw = () => {
    const r = nextFloat01(state);
    state = r.state;
    return r.value;
  };
  /** Box–Muller; transcendentals are fine here — all outputs are quantized. */
  const drawNormal = () => {
    const u1 = Math.max(draw(), 1e-12);
    const u2 = draw();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const [cloudMin, cloudMax] = regime.cloud;
  const cloudBase = cloudMin + draw() * (cloudMax - cloudMin);
  const [tempMin, tempMax] = regime.tempOffsetC;
  const tempOffset = tempMin + draw() * (tempMax - tempMin);
  const dayFactor = Math.min(
    DAY_FACTOR.ceil,
    Math.max(DAY_FACTOR.floor, Math.exp(DAY_FACTOR.sigma * drawNormal())),
  );

  const cloudCover: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const jitter = CLOUD_JITTER * (draw() - 0.5);
    cloudCover.push(quantize001(Math.min(1, Math.max(0, cloudBase + jitter))));
  }

  // §8.5: one OU path shared by all classes — sites are perfectly correlated
  // until per-hex weather returns (90 §6). Storm days gust harder (§8.2).
  const windMs: Record<WindClass, number[]> = {
    sheltered: [],
    open: [],
    coastal: [],
    baltic: [],
  };
  let ou = 0;
  const ouSd = "gustSd" in regime ? regime.gustSd : WIND_OU.sd;
  const innovationSd = ouSd * Math.sqrt(1 - WIND_OU.rho * WIND_OU.rho);
  for (let hour = 0; hour < 24; hour++) {
    ou = hour === 0 ? ouSd * drawNormal() : WIND_OU.rho * ou + innovationSd * drawNormal();
    const swing = Math.min(WIND_OU.ceil, Math.max(WIND_OU.floor, 1 + ou));
    for (const windClass of Object.keys(WIND_CLASSES) as WindClass[]) {
      const base = meanWindSpeedMs(windClass, month) * regime.windMult * dayFactor;
      windMs[windClass].push(quantize01(Math.max(0, base * swing)));
    }
  }

  const ghiW: number[] = [];
  const tempC: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const altitude = solarAltitudeDeg(CONFIG.latitudeDeg, dayOfYear, hour + 0.5);
    ghiW.push(
      quantize01(clearSkyGhiW(altitude) * cloudAttenuation(cloudCover[hour] ?? 0)),
    );
    tempC.push(
      quantize01(hourlyTempC(dayOfYear, hour, cloudCover[hour] ?? 0) + tempOffset),
    );
  }

  return { weather: { cloudCover, ghiW, tempC, windMs }, rng: state };
}
