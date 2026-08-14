// Weather regimes per docs/06 §8.2–§8.4: a regime is a synoptic situation that
// imposes a CORRELATED set of parameters (cloud, wind multiplier, temperature
// offset). One dominant regime is drawn per month and covers all 3
// representative days; with ~15% probability the free day switches regime
// (§8.4). Winter regimes have zero probability in summer and vice versa.

export const REGIMES = {
  /** Wyż zimowy — mroźny: clear, still, cold. Dunkelflaute. */
  frostHigh: { cloud: [0.1, 0.3], windMult: 0.25, tempOffsetC: [-15, -8] },
  /** Wyż zimowy — mgła/stratus: overcast, still. Dunkelflaute. */
  fogHigh: { cloud: [0.9, 1.0], windMult: 0.2, tempOffsetC: [-6, -2] },
  /** Niż atlantycki: overcast, windy, mild. */
  atlanticLow: { cloud: [0.8, 1.0], windMult: 1.4, tempOffsetC: [3, 8] },
  /**
   * Sztorm / głęboki niż: overproduction, then cascading cutouts (§8.2 —
   * "skokowa → zero"). The wider gust noise is what pushes farms over the
   * 25 m/s cutout for a few hours (§12.11).
   */
  storm: { cloud: [0.9, 1.0], windMult: 2.2, tempOffsetC: [2, 6], gustSd: 0.22 },
  /** Wyż letni — upał: clear, weak wind, peak PV. */
  summerHigh: { cloud: [0.0, 0.2], windMult: 0.5, tempOffsetC: [5, 12] },
  /** Niż letni: cloudy, moderate wind, cool. */
  summerLow: { cloud: [0.7, 0.9], windMult: 1.2, tempOffsetC: [-5, -2] },
  /** Pogoda przejściowa. */
  transitional: { cloud: [0.4, 0.7], windMult: 1.0, tempOffsetC: [-2, 2] },
  /** Fala mrozów (kontynentalna): deep frost, weak wind. */
  coldWave: { cloud: [0.2, 0.5], windMult: 0.4, tempOffsetC: [-22, -12] },
} as const;

export type RegimeId = keyof typeof REGIMES;

export const REGIME_IDS = Object.keys(REGIMES) as RegimeId[];

/**
 * Monthly dominant-regime weights [%] in REGIME_IDS order. The doc pins the
 * January/July examples (§8.3) as illustrative; the remaining months are
 * tuned so each month's expected wind multiplier stays near 1.0 (the Weibull
 * λ of 06 §6.1 remains the class calibration) and the annual statistics pass
 * 06 §12.6–12.11.
 */
export const MONTHLY_REGIME_WEIGHTS: Record<RegimeId, number>[] = [
  // frostHigh, fogHigh, atlanticLow, storm, summerHigh, summerLow, transitional, coldWave
  { frostHigh: 12, fogHigh: 18, atlanticLow: 44, storm: 10, summerHigh: 0, summerLow: 0, transitional: 11, coldWave: 5 }, // Jan
  { frostHigh: 14, fogHigh: 18, atlanticLow: 37, storm: 9, summerHigh: 0, summerLow: 0, transitional: 16, coldWave: 6 }, // Feb
  { frostHigh: 10, fogHigh: 10, atlanticLow: 28, storm: 6, summerHigh: 0, summerLow: 4, transitional: 38, coldWave: 4 }, // Mar
  { frostHigh: 3, fogHigh: 2, atlanticLow: 24, storm: 5, summerHigh: 3, summerLow: 13, transitional: 49, coldWave: 1 }, // Apr
  { frostHigh: 0, fogHigh: 0, atlanticLow: 16, storm: 3, summerHigh: 11, summerLow: 25, transitional: 45, coldWave: 0 }, // May
  { frostHigh: 0, fogHigh: 0, atlanticLow: 11, storm: 2, summerHigh: 21, summerLow: 32, transitional: 34, coldWave: 0 }, // Jun
  { frostHigh: 0, fogHigh: 0, atlanticLow: 12, storm: 2, summerHigh: 26, summerLow: 36, transitional: 24, coldWave: 0 }, // Jul
  { frostHigh: 0, fogHigh: 0, atlanticLow: 13, storm: 2, summerHigh: 25, summerLow: 33, transitional: 27, coldWave: 0 }, // Aug
  { frostHigh: 0, fogHigh: 0, atlanticLow: 22, storm: 4, summerHigh: 8, summerLow: 22, transitional: 44, coldWave: 0 }, // Sep
  { frostHigh: 5, fogHigh: 7, atlanticLow: 30, storm: 6, summerHigh: 2, summerLow: 8, transitional: 41, coldWave: 1 }, // Oct
  { frostHigh: 10, fogHigh: 18, atlanticLow: 37, storm: 8, summerHigh: 0, summerLow: 2, transitional: 22, coldWave: 3 }, // Nov
  { frostHigh: 14, fogHigh: 22, atlanticLow: 39, storm: 8, summerHigh: 0, summerLow: 0, transitional: 12, coldWave: 5 }, // Dec
];

/** §8.4 pt 4: probability that the free day runs under a different regime. */
export const REGIME_SWITCH_PROBABILITY = 0.15;

/** Draws a regime from the month's distribution using one uniform sample. */
export function pickRegime(month: number, uniform: number): RegimeId {
  const weights = MONTHLY_REGIME_WEIGHTS[month] ?? MONTHLY_REGIME_WEIGHTS[0];
  if (!weights) return "transitional";
  let threshold = uniform * 100;
  for (const id of REGIME_IDS) {
    threshold -= weights[id];
    if (threshold < 0) return id;
  }
  return REGIME_IDS[REGIME_IDS.length - 1] ?? "transitional";
}

export interface MonthRegimes {
  dominant: RegimeId;
  /** Regime of the month's free (3rd) day — usually equals `dominant`. */
  lastDay: RegimeId;
}

/**
 * Month init (§8.4): draws the dominant regime and, with 15% probability, a
 * different regime for the free day. Always consumes exactly three uniforms.
 */
export function pickMonthRegimes(
  month: number,
  uniforms: [number, number, number],
): MonthRegimes {
  const dominant = pickRegime(month, uniforms[0]);
  const switched = uniforms[1] < REGIME_SWITCH_PROBABILITY;
  const lastDay = switched ? pickRegime(month, uniforms[2]) : dominant;
  return { dominant, lastDay };
}
