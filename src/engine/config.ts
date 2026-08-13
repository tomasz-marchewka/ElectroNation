// Engine constants mirroring the design docs. Docs are canon: when a value
// here disagrees with docs 01/02/05/06, the doc wins — fix this file (and its
// tests) in the same commit.

/** Scenario-level constants (01 §11, 02 §5, 06 §2). */
export const CONFIG = {
  latitudeDeg: 52.0,
  startingMoneyPln: 10_000_000_000,
  /** 01 §6: flat tariff per MWh delivered to cities. */
  tariffPlnPerMwh: 650,
  /** 01 §4.5: penalty per MWh of energy not served. */
  ensPenaltyPlnPerMwh: 4_000,
  /** 02 §5: balancing penalty per MWh of dumped dispatchable energy. */
  dumpPenaltyPlnPerMwh: 400,
  /** 01 §5.7: import is take-or-pay — charged on the setpoint. */
  importPricePlnPerMwh: 800,
  exportPricePlnPerMwh: 150,
} as const;

/** 01 §2.1: representative-day weights (how many real days a played day stands for). */
export const DAY_WEIGHTS = { working: 10.9, free: 8.7 } as const;

/** 01 §5.1: dispatchable plant technologies. */
export const PLANT_TECHS = {
  nuclear: { varCostPlnPerMwh: 60, fixedPlnPerMwYear: 500_000 },
  coal: { varCostPlnPerMwh: 250, fixedPlnPerMwYear: 260_000 },
  ccgt: { varCostPlnPerMwh: 350, fixedPlnPerMwYear: 120_000 },
  ocgt: { varCostPlnPerMwh: 600, fixedPlnPerMwYear: 70_000 },
} as const;
export type PlantTech = keyof typeof PLANT_TECHS;

/** 01 §5.2, 02 §8.3: weather-dependent farm technologies. */
export const FARM_TECHS = {
  wind: { fixedPlnPerMwYear: 130_000 },
  pv: { fixedPlnPerMwYear: 50_000 },
} as const;
export type FarmTech = keyof typeof FARM_TECHS;

/** 01 §5.3, 02 §8.2: storage technologies (cycle efficiency split half per leg). */
export const STORAGE_TECHS = {
  battery: { cycleEfficiency: 0.9, fixedPlnPerMwYear: 40_000 },
  pumped: { cycleEfficiency: 0.75, fixedPlnPerMwYear: 80_000 },
} as const;
export type StorageTech = keyof typeof STORAGE_TECHS;

/** 01 §4.2: line types; loss is % of transmitted power per 100 km. */
export const LINE_TYPES = {
  lv: { capacityMw: 150, lossPctPer100km: 4, fixedPlnPerKmYear: 18_000 },
  mv: { capacityMw: 500, lossPctPer100km: 2, fixedPlnPerKmYear: 37_500 },
  hv: { capacityMw: 1500, lossPctPer100km: 1, fixedPlnPerKmYear: 90_000 },
} as const;
export type LineType = keyof typeof LINE_TYPES;

export const KM_PER_HEX = 25; // 01 §3.1

/** 02 §8.3: node objects pay 2% of CAPEX yearly; base CAPEX per 01 §5.4, §5.7. */
export const NODE_FIXED_PLN_PER_YEAR = {
  junction: 3_000_000, // 2% × 150 mln
  border: 20_000_000, // 2% × 1.0 mld
} as const;

/**
 * 06 §6.1: Weibull parameters per wind location class (@100 m), λ calibrated
 * so annual capacity factors hit the acceptance targets of 06 §12.7–8
 * (open ~24.6%, coastal ~29.6%, baltic ~45.5% under the §6.4 seasonal shape).
 */
export const WIND_CLASSES = {
  open: { k: 2.0, lambda: 7.3 },
  coastal: { k: 2.1, lambda: 8.0 },
  baltic: { k: 2.2, lambda: 10.2 },
} as const;
export type WindClass = keyof typeof WIND_CLASSES;

/**
 * 06 §6.4: monthly mean wind speed, open terrain @100 m — used as the
 * seasonality SHAPE only (normalized to its own annual mean), scaled onto each
 * class's Weibull λ.
 */
export const WIND_MONTHLY_MEAN_MS = [
  8.0, 7.8, 7.3, 6.6, 6.0, 5.7, 5.6, 5.6, 6.2, 7.0, 7.7, 8.0,
] as const;

/** 06 §6.3: turbine power curve breakpoints [m/s]. */
export const TURBINE = { vIn: 3, vRated: 12, vOut: 25 } as const;

/** 06 §5: PV production model. */
export const PV = { noctC: 45, gammaPerC: -0.004, etaSystem: 0.85 } as const;

/** 06 §7: temperature model for Poland. */
export const TEMPERATURE = {
  annualMeanC: 9.0,
  annualAmplitudeC: 10.5,
  /** Day of year of the warmest day (~Jul 21). */
  peakDayOfYear: 202,
  /** Diurnal base amplitude: ~10 °C in summer, ~4 °C in winter. */
  diurnalBaseMeanC: 7,
  diurnalBaseAmplitudeC: 3,
  /** 06 §7.2: cloud cover flattens the diurnal swing. */
  cloudDamping: 0.6,
  /** Diurnal maximum at ~14:30. */
  warmestHour: 14.5,
} as const;

/** 05 §3.1: daily energy per unit [kWh], annual averages. */
export const UNIT_ENERGY_KWH = {
  household: { working: 10, free: 10.5 },
  firm: { working: 50, free: 15 },
} as const;

/**
 * 05 §3.2: hourly profiles as multipliers of the segment's daily average power
 * (each sums to 24.00).
 */
export const DEMAND_PROFILES = {
  household: {
    working: [
      0.8, 0.7, 0.65, 0.65, 0.7, 0.8, 0.95, 1.05, 1.05, 0.95, 0.95, 0.95, 0.95,
      0.95, 0.95, 0.95, 1.1, 1.3, 1.45, 1.5, 1.4, 1.25, 1.05, 0.95,
    ],
    free: [
      0.85, 0.75, 0.7, 0.65, 0.65, 0.7, 0.75, 0.85, 1.0, 1.05, 1.1, 1.1, 1.1,
      1.05, 1.0, 1.0, 1.1, 1.25, 1.4, 1.45, 1.35, 1.2, 1.05, 0.9,
    ],
  },
  firm: {
    working: [
      0.55, 0.55, 0.55, 0.55, 0.55, 0.6, 0.75, 1.05, 1.35, 1.55, 1.65, 1.65,
      1.6, 1.6, 1.55, 1.45, 1.35, 1.1, 0.9, 0.75, 0.65, 0.6, 0.55, 0.55,
    ],
    free: [
      0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.0, 1.05, 1.05, 1.1, 1.1, 1.1, 1.1, 1.1,
      1.1, 1.05, 1.05, 1.05, 1.05, 1.0, 1.0, 0.9, 0.9, 0.9,
    ],
  },
} as const;

/** 05 §4.2: monthly demand multipliers (annual mean ≈ 1.00). */
export const DEMAND_SEASONAL = [
  1.15, 1.12, 1.05, 0.95, 0.85, 0.87, 0.9, 0.9, 0.95, 1.02, 1.08, 1.13,
] as const;

/** 05 §4.3: temperature "V" modifier for demand. */
export const DEMAND_WEATHER = {
  heatingThresholdC: 15,
  heatingPerC: 0.008,
  coolingThresholdC: 22,
  coolingPerC: 0.01,
  cap: 1.25,
} as const;

/** 05 §6: city growth/shrink mechanics. */
export const CITY_GROWTH = {
  /** Grow when undelivered share of the month is below 1%. */
  growThresholdU: 0.99,
  /** Shrink when delivered share falls below 90%. */
  shrinkThresholdU: 0.9,
  maxMonthlyGrowth: 0.04,
  /** Segment capacity = 16 × starting count (01 §2.7 parameter). */
  capacityMultiple: 16,
  /** Shrink by half of the undelivered share. */
  shrinkFactor: 0.5,
  minHouseholds: 100,
  minFirms: 10,
} as const;
