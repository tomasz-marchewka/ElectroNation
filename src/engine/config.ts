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
  /**
   * 06 §8.6.3: past the first forecast day σ keeps growing with the horizon.
   * The doc gives a 20–30% per-day band; 25% is the midpoint — retune in doc 03.
   */
  forecastSigmaGrowthPerDay: 0.25,
} as const;

/**
 * 01 §2.4 + 06 §8.6.3: buyable forecast systems. Each level multiplies the σ
 * coefficients, extends the horizon in whole game days and raises the hit rate
 * of the monthly regime forecast (06 §8.4 pt 5). Prices are the doc's ~600 mln
 * / ~1,2 mld; `regimeAccuracy` has no doc value yet — proposal to tune in
 * doc 03. `basic` is the starting level, hence free.
 */
// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const FORECAST_LEVELS = {
  basic: { sigmaMultiplier: 1.0, horizonDays: 1, regimeAccuracy: 0.6, upgradeCostPln: 0 },
  advanced: { sigmaMultiplier: 0.7, horizonDays: 3, regimeAccuracy: 0.8, upgradeCostPln: 600_000_000 },
  ensemble: { sigmaMultiplier: 0.5, horizonDays: 7, regimeAccuracy: 0.95, upgradeCostPln: 1_200_000_000 },
} as const;
export type ForecastLevel = keyof typeof FORECAST_LEVELS;

/** Upgrade order — a level may only be bought upwards (01 §2.4). */
export const FORECAST_LEVEL_ORDER = ["basic", "advanced", "ensemble"] as const;

/** 01 §2.1: representative-day weights (how many real days a played day stands for). */
export const DAY_WEIGHTS = { working: 10.9, free: 8.7 } as const;

/** 01 §5.1, §2.6: dispatchable plant technologies. */
// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const PLANT_TECHS = {
  nuclear: { varCostPlnPerMwh: 60, fixedPlnPerMwYear: 500_000, capexPlnPerMw: 21_000_000, buildDays: 9, maxBlockMw: 1_600 },
  coal: { varCostPlnPerMwh: 250, fixedPlnPerMwYear: 260_000, capexPlnPerMw: 9_000_000, buildDays: 5, maxBlockMw: 1_000 },
  ccgt: { varCostPlnPerMwh: 350, fixedPlnPerMwYear: 120_000, capexPlnPerMw: 5_500_000, buildDays: 3, maxBlockMw: 500 },
  ocgt: { varCostPlnPerMwh: 600, fixedPlnPerMwYear: 70_000, capexPlnPerMw: 3_000_000, buildDays: 1, maxBlockMw: 150 },
} as const;
export type PlantTech = keyof typeof PLANT_TECHS;

/** 01 §5.2, 02 §8.3–8.4: weather-dependent farm technologies. */
export const FARM_TECHS = {
  wind: { fixedPlnPerMwYear: 130_000, capexPlnPerMw: 3_600_000, buildDays: 1, maxMwPerHex: 300 },
  pv: { fixedPlnPerMwYear: 50_000, capexPlnPerMw: 1_800_000, buildDays: 1, maxMwPerHex: 200 },
} as const;
export type FarmTech = keyof typeof FARM_TECHS;

/** 01 §5.3, 02 §8.2: storage technologies (cycle efficiency split half per leg). */
export const STORAGE_TECHS = {
  battery: { cycleEfficiency: 0.9, fixedPlnPerMwYear: 40_000, buildDays: 1 },
  pumped: { cycleEfficiency: 0.75, fixedPlnPerMwYear: 80_000, buildDays: 5 },
} as const;
export type StorageTech = keyof typeof STORAGE_TECHS;

/** 02 §8.2: battery modules are bought separately; hard per-hex limits. */
export const BATTERY = {
  powerCapexPlnPerMw: 1_600_000,
  energyCapexPlnPerMwh: 1_100_000,
  maxPowerMwPerHex: 500,
  maxCapacityMwhPerHex: 2_000,
} as const;

/** 02 §8.2: pumped storage comes in fixed 10-hour blocks. */
export const PUMPED_BLOCK = {
  powerMw: 250,
  capacityMwh: 2_500,
  capexPln: 1_100_000_000,
  maxBlocks: 4,
} as const;

/** 01 §4.2: line types; loss is % of transmitted power per 100 km. */
// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const LINE_TYPES = {
  lv: { capacityMw: 150, lossPctPer100km: 4, fixedPlnPerKmYear: 18_000, capexPlnPerKm: 1_200_000, buildHoursPerHex: 3 },
  mv: { capacityMw: 500, lossPctPer100km: 2, fixedPlnPerKmYear: 37_500, capexPlnPerKm: 2_500_000, buildHoursPerHex: 6 },
  hv: { capacityMw: 1500, lossPctPer100km: 1, fixedPlnPerKmYear: 90_000, capexPlnPerKm: 6_000_000, buildHoursPerHex: 12 },
} as const;
export type LineType = keyof typeof LINE_TYPES;

/**
 * The ladder a line upgrade climbs, cheapest first (01 §4.2, 0.17). Upgrades
 * only ever move UP: a built line can be raised to any higher type, never
 * lowered, and WN has nowhere left to go — there a parallel track is the only
 * way to more capacity.
 */
export const LINE_TYPE_ORDER = ["lv", "mv", "hv"] as const;

export const KM_PER_HEX = 25; // 01 §3.1

/**
 * 01 §3.3 (0.13): topology hard limits. `LINE_SLOTS_PER_OBJECT` is the BASE
 * slot count of an object; junctions carry their own (expandable) limit in
 * state, so `buildLine` reads the per-object value, not this constant.
 */
export const MAX_LINES_PER_HEX_PER_TYPE = 9;
export const LINE_SLOTS_PER_OBJECT = 6;

/**
 * 01 §5.4, §5.7, §3.4: node objects and the city connection act. Module prices
 * and times come straight from the docs' tables (see EXPANSION for why they are
 * NOT discounted by the 85%/70% rule).
 */
export const JUNCTION_SPEC = {
  capexPln: 150_000_000,
  buildDays: 1,
  throughputMw: 250,
  lineSlots: LINE_SLOTS_PER_OBJECT,
  moduleCapexPln: 90_000_000,
  moduleBuildDays: 1,
  moduleThroughputMw: 250,
  moduleLineSlots: 2,
  /** 6 modules → 1750 MW and 18 line slots. */
  maxModules: 6,
} as const;
export const BORDER_SPEC = {
  capexPln: 1_000_000_000,
  buildDays: 4,
  throughputMw: 500,
  moduleCapexPln: 700_000_000,
  moduleBuildDays: 2,
  moduleThroughputMw: 500,
} as const;
export const CITY_CONNECTION_COST_PLN = 30_000_000;

/**
 * 02 §8.3: junctions and border points pay 2% of their CAPEX yearly. Capacity
 * modules raise that CAPEX, so an expanded node also costs more to maintain;
 * an unexpanded one keeps the doc's 3 mln / 20 mln zł per year.
 */
export const NODE_FIXED_CAPEX_SHARE_PER_YEAR = 0.02;

/**
 * 01 §7, 02 §8.4: expanding an existing object costs 85% of a new site's CAPEX
 * and takes 70% of its build time. The rule applies to plants, farms and — since
 * 01 v0.17 — line upgrades, where the base is a new line of the TARGET type on
 * the same route. Where a doc prints a module price directly (junction, border
 * module, storage modules of 02 §8.2) that price is already modular and is used
 * as printed. Doc 03/04 may revisit this split.
 */
export const EXPANSION = { capexShare: 0.85, timeShare: 0.7 } as const;

/** 01 §7, 02 §8.4: hard site limit for dispatchable plants. */
export const MAX_PLANT_BLOCKS_PER_HEX = 6;

/** 02 §8.1: terrain cost multipliers; `object: null` = building impossible. */
export const TERRAIN = {
  plains: { line: 1.0, object: 1.0 as number | null },
  forest: { line: 1.3, object: 1.3 as number | null },
  highlands: { line: 1.5, object: 1.5 as number | null },
  swamp: { line: 2.0, object: 2.0 as number | null },
  urban: { line: 2.0, object: 2.0 as number | null },
  mountains: { line: 2.5, object: 2.5 as number | null },
  lake: { line: 2.5, object: null as number | null },
  sea: { line: 3.5, object: null as number | null },
} as const;
export type TerrainId = keyof typeof TERRAIN;

/**
 * 06 §6.1: Weibull parameters per wind location class (@100 m). λ is the
 * measured value of the doc's table, trimmed only where the full §8 generation
 * chain pushes the capacity factor out of its §12 band — the multiplicative
 * noise on a convex power curve lifts CF by ~2.5–3 pp over the analytical
 * Weibull integral. That happens for the coast alone (λ 8.0 → 32.5%, above the
 * 24–30% band of §12.7), hence 7.65 here. Measured CFs: sheltered ~15.3%,
 * open ~26.9%, coastal ~29.7%, baltic ~48.5%.
 */
export const WIND_CLASSES = {
  // meanFactor = Γ(1 + 1/k): mean speed = λ · meanFactor.
  sheltered: { k: 2.0, lambda: 5.8, meanFactor: 0.8862 },
  open: { k: 2.0, lambda: 7.3, meanFactor: 0.8862 },
  coastal: { k: 2.1, lambda: 7.65, meanFactor: 0.8857 },
  baltic: { k: 2.2, lambda: 10.2, meanFactor: 0.8856 },
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
      0.8, 0.7, 0.65, 0.65, 0.7, 0.8, 0.95, 1.05, 1.05, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95,
      1.1, 1.3, 1.45, 1.5, 1.4, 1.25, 1.05, 0.95,
    ],
    free: [
      0.85, 0.75, 0.7, 0.65, 0.65, 0.7, 0.75, 0.85, 1.0, 1.05, 1.1, 1.1, 1.1, 1.05, 1.0, 1.0, 1.1,
      1.25, 1.4, 1.45, 1.35, 1.2, 1.05, 0.9,
    ],
  },
  firm: {
    working: [
      0.55, 0.55, 0.55, 0.55, 0.55, 0.6, 0.75, 1.05, 1.35, 1.55, 1.65, 1.65, 1.6, 1.6, 1.55, 1.45,
      1.35, 1.1, 0.9, 0.75, 0.65, 0.6, 0.55, 0.55,
    ],
    free: [
      0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.0, 1.05, 1.05, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.05, 1.05, 1.05,
      1.05, 1.0, 1.0, 0.9, 0.9, 0.9,
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
