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
  advanced: { sigmaMultiplier: 0.7, horizonDays: 3, regimeAccuracy: 0.8, upgradeCostPln: 300_000_000 },
  ensemble: { sigmaMultiplier: 0.5, horizonDays: 7, regimeAccuracy: 0.95, upgradeCostPln: 600_000_000 },
} as const;
export type ForecastLevel = keyof typeof FORECAST_LEVELS;

/** Upgrade order — a level may only be bought upwards (01 §2.4). */
export const FORECAST_LEVEL_ORDER = ["basic", "advanced", "ensemble"] as const;

/** 01 §2.1: representative-day weights (how many real days a played day stands for). */
export const DAY_WEIGHTS = { working: 10.9, free: 8.7 } as const;

/**
 * 01 §5.1–§5.3 (0.24, extended in 0.26): the four sizes ANY buildable thing is
 * sold in, smallest first — a plant block, a farm, and each of a storage's two
 * axes. The rung is RELATIVE to what it sizes: a small nuclear block (800 MW)
 * dwarfs an extra-large gas one (500 MW). The order here is the order the
 * catalogue walks.
 */
export const BUILD_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type BuildSize = (typeof BUILD_SIZES)[number];

/** One row of the 01 §5.1 table; every technology carries all four rungs. */
interface PlantTechSpec {
  varCostPlnPerMwh: number;
  fixedPlnPerMwYear: number;
  capexPlnPerMw: number;
  buildDays: number;
  blockMw: Record<BuildSize, number>;
}

/**
 * 01 §5.1, §2.6: dispatchable plant technologies. `blockMw` is the whole
 * catalogue of that technology — a block has one of these four powers and no
 * other (01 §5.1 in 0.24); the largest rung is what used to be `maxBlockMw`.
 *
 * CAPEX is HALF of what it was through 0.24 (01 §5.1 in 0.25): the ~×0,6
 * discount of 01 §11 had only ever reached the weather-dependent technologies,
 * leaving dispatchable plants at real-world prices and paying back two years
 * slower than any farm. Halving is deliberately more than levelling — with it
 * a coal block overtakes onshore wind, and doc 03 owns the retune.
 */
// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const PLANT_TECHS = {
  nuclear: { varCostPlnPerMwh: 60, fixedPlnPerMwYear: 500_000, capexPlnPerMw: 10_500_000, buildDays: 9, blockMw: { small: 800, medium: 1_200, large: 1_600, xlarge: 2_400 } },
  coal: { varCostPlnPerMwh: 250, fixedPlnPerMwYear: 260_000, capexPlnPerMw: 4_500_000, buildDays: 5, blockMw: { small: 200, medium: 500, large: 750, xlarge: 1_000 } },
  ccgt: { varCostPlnPerMwh: 350, fixedPlnPerMwYear: 120_000, capexPlnPerMw: 2_750_000, buildDays: 3, blockMw: { small: 100, medium: 200, large: 400, xlarge: 500 } },
  ocgt: { varCostPlnPerMwh: 600, fixedPlnPerMwYear: 70_000, capexPlnPerMw: 1_500_000, buildDays: 1, blockMw: { small: 50, medium: 75, large: 100, xlarge: 150 } },
} as const satisfies Record<string, PlantTechSpec>;
export type PlantTech = keyof typeof PLANT_TECHS;

/**
 * One row of the 01 §5.1 dynamics table (0.27). Shares are of the BLOCK's rated
 * power; turn counts are whole resolutions. The values are game-scaled, not
 * realistic — at a 3 h turn real ramps would cross the whole range within one
 * block average and the mechanic would not exist (01 §5.1, 90 §3).
 */
export interface PlantDynamicsSpec {
  /** An online block never holds output below this share of its rated MW. */
  minLoadShare: number;
  /** Max output gain per turn, as share of rated MW. */
  rampUpSharePerTurn: number;
  /** Max output drop per turn — faster than up (shedding is easier). */
  rampDownSharePerTurn: number;
  /** Turns from a cold start order to first output (at minimum load). */
  startupColdTurns: number;
  /** Same, when the block is still warm. */
  startupWarmTurns: number;
  /** Offline turns within which a restart still counts as warm. */
  warmWindowTurns: number;
  /** One-off cost per rated MW, charged at every start order (day-weighted). */
  startupCostPlnPerMw: number;
}

/**
 * 01 §5.1 (0.27): block dynamics per technology. OCGT is the fully flexible
 * end on purpose — zero minimum, instant start, no startup cost — its whole
 * role is the flexibility premium; nuclear is the immovable other end.
 */
// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const PLANT_DYNAMICS = {
  nuclear: { minLoadShare: 0.5, rampUpSharePerTurn: 0.2, rampDownSharePerTurn: 0.4, startupColdTurns: 8, startupWarmTurns: 4, warmWindowTurns: 2, startupCostPlnPerMw: 4_000 },
  coal: { minLoadShare: 0.4, rampUpSharePerTurn: 0.3, rampDownSharePerTurn: 0.6, startupColdTurns: 3, startupWarmTurns: 1, warmWindowTurns: 4, startupCostPlnPerMw: 2_000 },
  ccgt: { minLoadShare: 0.3, rampUpSharePerTurn: 0.6, rampDownSharePerTurn: 1.0, startupColdTurns: 1, startupWarmTurns: 0, warmWindowTurns: 8, startupCostPlnPerMw: 600 },
  ocgt: { minLoadShare: 0, rampUpSharePerTurn: 1.0, rampDownSharePerTurn: 1.0, startupColdTurns: 0, startupWarmTurns: 0, warmWindowTurns: 0, startupCostPlnPerMw: 0 },
} as const satisfies Record<PlantTech, PlantDynamicsSpec>;

/**
 * MW of one block, or null when the size is not one of the four (a JSON action
 * off the wire can carry anything — the engine refuses instead of guessing).
 */
export function plantBlockMw(tech: PlantTech, size: BuildSize): number | null {
  const blocks: Partial<Record<string, number>> = PLANT_TECHS[tech].blockMw;
  return blocks[size] ?? null;
}

/**
 * The rung an existing block of `mw` belongs to — the nearest one, the larger
 * on a tie. Scenario endowments (01 §3.4) and older saves may carry a power
 * that is off the ladder, and the "add one more block like these" action still
 * has to name a size.
 */
export function nearestPlantBlockSize(tech: PlantTech, mw: number): BuildSize {
  const blocks = PLANT_TECHS[tech].blockMw;
  let best: BuildSize = BUILD_SIZES[0];
  for (const size of BUILD_SIZES) {
    if (Math.abs(blocks[size] - mw) <= Math.abs(blocks[best] - mw)) best = size;
  }
  return best;
}

/**
 * 01 §5.2, 02 §8.3–8.4: weather-dependent farm technologies. The wind row is
 * the ONSHORE site; offshore is the same technology on a sea hex and overrides
 * these two numbers through {@link OFFSHORE_WIND} (01 §5.2, 0.22).
 *
 * `sizeMw` is the four-rung ladder a farm is ordered in (01 §5.2 in 0.26). It
 * belongs to the TECHNOLOGY, the cap belongs to the SITE — so the sea does not
 * get bigger turbines, it just fits two extra-large farms instead of one.
 */
interface FarmTechSpec {
  fixedPlnPerMwYear: number;
  capexPlnPerMw: number;
  buildDays: number;
  maxMwPerHex: number;
  sizeMw: Record<BuildSize, number>;
}

// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const FARM_TECHS = {
  wind: { fixedPlnPerMwYear: 130_000, capexPlnPerMw: 1_800_000, buildDays: 1, maxMwPerHex: 300, sizeMw: { small: 50, medium: 100, large: 200, xlarge: 300 } },
  pv: { fixedPlnPerMwYear: 50_000, capexPlnPerMw: 900_000, buildDays: 1, maxMwPerHex: 200, sizeMw: { small: 25, medium: 50, large: 100, xlarge: 200 } },
} as const satisfies Record<string, FarmTechSpec>;
export type FarmTech = keyof typeof FARM_TECHS;

/** MW of a farm of this size, or null when the size is not one of the four. */
export function farmSizeMw(tech: FarmTech, size: BuildSize): number | null {
  const sizes: Partial<Record<string, number>> = FARM_TECHS[tech].sizeMw;
  return sizes[size] ?? null;
}

/**
 * 01 §5.2, §7, 02 §8.4 (0.22): what a sea hex changes for a wind farm. There is
 * no offshore TECHNOLOGY — the turbine, its power curve and its fixed cost are
 * the onshore ones; the sea only fits twice as much of it and takes twice as
 * long to build on. CAPEX comes from the terrain multiplier (`TERRAIN.sea.windFarm`),
 * productivity from the hex's wind class (06 §6.1, "baltic").
 */
export const OFFSHORE_WIND = { maxMwPerHex: 600, buildDays: 2 } as const;

/** One row of the 01 §5.3 table; both technologies have the same shape. */
interface StorageTechSpec {
  cycleEfficiency: number;
  fixedPlnPerMwYear: number;
  buildDays: number;
  /** Bought separately, so each axis has its own price and its own ladder. */
  powerCapexPlnPerMw: number;
  energyCapexPlnPerMwh: number;
  powerMw: Record<BuildSize, number>;
  capacityMwh: Record<BuildSize, number>;
  maxPowerMwPerHex: number;
  maxCapacityMwhPerHex: number;
}

/**
 * 01 §5.3, 02 §8.2: storage technologies (cycle efficiency split half per leg).
 *
 * Since 0.26 BOTH technologies work the same way: **power and capacity are two
 * independent axes**, each ordered from its own four-rung ladder and each
 * expanded by its own action. Pumped storage stops being a fixed 250 MW /
 * 2 500 MWh block — that pair is now simply its MEDIUM/MEDIUM order, and it
 * still costs the 550 mln zł the block used to (250 × 1,1 mln + 2 500 ×
 * 0,11 mln). The split of that price says what each technology is good at: a
 * battery buys power cheaply and energy dearly, pumped storage the other way
 * round — its reservoir is five times cheaper per MWh than a battery's cells.
 */
// One line per axis — reflowing the tables would hide them.
// prettier-ignore
export const STORAGE_TECHS = {
  battery: {
    cycleEfficiency: 0.9, fixedPlnPerMwYear: 40_000, buildDays: 1,
    powerCapexPlnPerMw: 800_000, energyCapexPlnPerMwh: 550_000,
    powerMw: { small: 50, medium: 100, large: 250, xlarge: 500 },
    capacityMwh: { small: 100, medium: 200, large: 500, xlarge: 1_000 },
    maxPowerMwPerHex: 500, maxCapacityMwhPerHex: 2_000,
  },
  pumped: {
    cycleEfficiency: 0.75, fixedPlnPerMwYear: 80_000, buildDays: 5,
    powerCapexPlnPerMw: 1_100_000, energyCapexPlnPerMwh: 110_000,
    powerMw: { small: 100, medium: 250, large: 500, xlarge: 1_000 },
    capacityMwh: { small: 1_000, medium: 2_500, large: 5_000, xlarge: 10_000 },
    maxPowerMwPerHex: 1_000, maxCapacityMwhPerHex: 10_000,
  },
} as const satisfies Record<string, StorageTechSpec>;
export type StorageTech = keyof typeof STORAGE_TECHS;

/**
 * The largest rung that still fits in `room`, or null when even the smallest
 * does not. This is what an expansion button offers (01 §7 in 0.26): the site
 * cap rarely leaves room for an extra-large order, and proposing one the engine
 * would refuse teaches the player nothing.
 */
export function largestSizeWithin(
  sizes: Record<BuildSize, number>,
  room: number,
): BuildSize | null {
  for (let i = BUILD_SIZES.length - 1; i >= 0; i--) {
    const size = BUILD_SIZES[i]!;
    if (sizes[size] <= room) return size;
  }
  return null;
}

/** MW of a storage of this size, or null when the size is not one of the four. */
export function storagePowerMw(tech: StorageTech, size: BuildSize): number | null {
  const sizes: Partial<Record<string, number>> = STORAGE_TECHS[tech].powerMw;
  return sizes[size] ?? null;
}

/** MWh of a storage of this size, or null when the size is not one of the four. */
export function storageCapacityMwh(tech: StorageTech, size: BuildSize): number | null {
  const sizes: Partial<Record<string, number>> = STORAGE_TECHS[tech].capacityMwh;
  return sizes[size] ?? null;
}

/** 01 §4.2: line types; loss is % of transmitted power per 100 km. */
// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const LINE_TYPES = {
  lv: { capacityMw: 150, lossPctPer100km: 4, fixedPlnPerKmYear: 9_000, capexPlnPerKm: 600_000, buildHoursPerHex: 3 },
  mv: { capacityMw: 500, lossPctPer100km: 2, fixedPlnPerKmYear: 18_750, capexPlnPerKm: 1_250_000, buildHoursPerHex: 6 },
  hv: { capacityMw: 1500, lossPctPer100km: 1, fixedPlnPerKmYear: 45_000, capexPlnPerKm: 3_000_000, buildHoursPerHex: 12 },
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
 * 01 §3.3 (0.13): topology hard limits. `LINE_SLOTS_PER_OBJECT` is the slot
 * count of an ordinary object; a junction station carries twice as many
 * (`JUNCTION_SPEC.lineSlots`), so `buildLine` asks the hex, not this constant.
 */
export const MAX_LINES_PER_HEX_PER_TYPE = 9;
export const LINE_SLOTS_PER_OBJECT = 6;

/**
 * 01 §5.4, §5.7, §3.4: node objects and the city connection act. Border module
 * prices and times come straight from the doc's table (see EXPANSION for why
 * they are NOT discounted by the 85%/70% rule). A junction station has no
 * module at all (0.21): it carries no throughput and its slot count is fixed.
 */
export const JUNCTION_SPEC = {
  capexPln: 30_000_000,
  buildDays: 1,
  /** Double an ordinary object's slots (01 §5.4, 0.21) — the station's only parameter. */
  lineSlots: 2 * LINE_SLOTS_PER_OBJECT,
} as const;
export const BORDER_SPEC = {
  capexPln: 500_000_000,
  buildDays: 4,
  throughputMw: 500,
  moduleCapexPln: 350_000_000,
  moduleBuildDays: 2,
  moduleThroughputMw: 500,
} as const;
export const CITY_CONNECTION_COST_PLN = 15_000_000;

/**
 * 02 §8.3: junctions and border points pay 2% of their CAPEX yearly. Border
 * capacity modules raise that CAPEX, so an expanded interconnector also costs
 * more to maintain; a junction is flat 1,2 mln zł per year (0.21).
 */
export const NODE_FIXED_CAPEX_SHARE_PER_YEAR = 0.02;

/**
 * 01 §7, 02 §8.4: expanding an existing object costs 85% of a new site's CAPEX
 * and takes 70% of its build time. The rule applies to plants, farms and — since
 * 01 v0.17 — line upgrades, where the base is a new line of the TARGET type on
 * the same route. Where a doc prints a module price directly (border module,
 * storage modules of 02 §8.2) that price is already modular and is used as
 * printed. Doc 03/04 may revisit this split.
 */
export const EXPANSION = { capexShare: 0.85, timeShare: 0.7 } as const;

/** 01 §7, 02 §8.4: hard site limit for dispatchable plants. */
export const MAX_PLANT_BLOCKS_PER_HEX = 6;

/** One row of the 02 §8.1 table; a `null` multiplier means "cannot be built here". */
interface TerrainCost {
  /** Multiplier on a line's CAPEX per km — water is crossable, just expensive. */
  line: number;
  /** Multiplier on a point object's CAPEX. */
  object: number | null;
  /**
   * Same, for wind farms alone. Repeats `object` everywhere but on water: the
   * sea carries turbines and nothing else (01 §3.2, 0.22), a lake still carries
   * nothing at all. ×2,5 and not the cable's ×3,5 — reasoning in 02 §8.1.
   */
  windFarm: number | null;
}

/** 02 §8.1: terrain cost multipliers; `null` = building impossible. */
// One line per doc row — reflowing the table would hide it.
// prettier-ignore
export const TERRAIN = {
  plains:    { line: 1.0, object: 1.0,  windFarm: 1.0 },
  forest:    { line: 1.3, object: 1.3,  windFarm: 1.3 },
  highlands: { line: 1.5, object: 1.5,  windFarm: 1.5 },
  swamp:     { line: 2.0, object: 2.0,  windFarm: 2.0 },
  urban:     { line: 2.0, object: 2.0,  windFarm: 2.0 },
  mountains: { line: 2.5, object: 2.5,  windFarm: 2.5 },
  lake:      { line: 2.5, object: null, windFarm: null },
  sea:       { line: 3.5, object: null, windFarm: 2.5 },
} as const satisfies Record<string, TerrainCost>;
export type TerrainId = keyof typeof TERRAIN;

/**
 * Where a farm of this technology may stand on this terrain, what its CAPEX is
 * multiplied by and how the site bounds it (01 §3.2, §5.2, §7; 02 §8.1, §8.4).
 * One entry point for the engine and the UI, so the offshore exception is
 * written down once. `multiplier === null` = no farm of this kind stands here.
 */
export function farmSiting(
  tech: FarmTech,
  terrain: TerrainId,
): { multiplier: number | null; maxMwPerHex: number; buildDays: number } {
  const spec = FARM_TECHS[tech];
  const site = { maxMwPerHex: spec.maxMwPerHex, buildDays: spec.buildDays };
  if (tech !== "wind") return { multiplier: TERRAIN[terrain].object, ...site };
  if (terrain === "sea") return { multiplier: TERRAIN.sea.windFarm, ...OFFSHORE_WIND };
  return { multiplier: TERRAIN[terrain].windFarm, ...site };
}

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
