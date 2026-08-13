// Turn engine: newGame / applyAction / resolveTurn (01 §2.2–2.3). The resolve
// step follows docs/02 §4: three flow passes (cities → storage charging →
// export) on shared network residuals, dump penalty, per-city energy-not-served
// counters, day-weight-scaled finances, fixed costs at day end and monthly city
// growth after the free day.

import {
  buildBattery,
  buildBorder,
  buildFarm,
  buildJunction,
  buildLine,
  buildPlant,
  buildPumpedStorage,
  connectCity,
} from "./build";
import {
  CONFIG,
  DAY_WEIGHTS,
  FARM_TECHS,
  LINE_TYPES,
  NODE_FIXED_PLN_PER_YEAR,
  PLANT_TECHS,
  STORAGE_TECHS,
  KM_PER_HEX,
  type FarmTech,
  type LineType,
  type PlantTech,
} from "./config";
import { cityDemandDayMw, type DayType } from "./demand";
import { evaluateMonthlyGrowth } from "./growth";
import {
  buildSegments,
  emptyResidual,
  runFlowPass,
  type FlowSink,
  type FlowSource,
  type HexCoord,
  type NetworkNode,
} from "./network";
import { nextFloat01, seedStream, type PrngState } from "./prng";
import { quantize001 } from "./quantize";
import { pickMonthRegimes, type MonthRegimes } from "./regimes";
import { DEFAULT_SCENARIO, scenarioToStateFields, type Scenario } from "./scenario";
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  HOURS_PER_TURN,
  STATE_SCHEMA_VERSION,
  TURNS_PER_DAY,
  isLineBuilt,
  type CityState,
  type DayTruth,
  type GameState,
  type StorageMode,
} from "./state";
import { farmPowerMwAtHour, generateWeatherDay } from "./weather";

export { CONFIG } from "./config";

// Reference days of doc 06 §3.7 — the 21st of each month.
const MONTH_DAY_OF_YEAR = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355] as const;

export function monthForGameDay(dayIndex: number): number {
  return Math.floor((dayIndex % DAYS_PER_YEAR) / DAYS_PER_MONTH);
}

/** 01 §2.1: working A, working B, free — in this order within each month. */
export function dayTypeForGameDay(dayIndex: number): DayType {
  return dayIndex % DAYS_PER_MONTH === DAYS_PER_MONTH - 1 ? "free" : "working";
}

export function dayOfYearForGameDay(dayIndex: number): number {
  return MONTH_DAY_OF_YEAR[monthForGameDay(dayIndex)] ?? 21;
}

interface DayGenResult {
  truth: DayTruth;
  weatherRng: PrngState;
  forecastRng: PrngState;
  monthRegimes: MonthRegimes;
}

function generateDayTruth(
  weatherRng: PrngState,
  forecastRng: PrngState,
  dayIndex: number,
  cities: CityState[],
  monthRegimes: MonthRegimes | null,
): DayGenResult {
  const month = monthForGameDay(dayIndex);
  const dayType = dayTypeForGameDay(dayIndex);
  const dayOfYear = dayOfYearForGameDay(dayIndex);

  // Month init (06 §8.4): dominant regime + possible free-day switch. Always
  // exactly three uniforms, so the weather stream stays aligned.
  let wRng = weatherRng;
  let regimes = monthRegimes;
  if (dayIndex % DAYS_PER_MONTH === 0 || regimes === null) {
    const draws: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = nextFloat01(wRng);
      wRng = r.state;
      draws.push(r.value);
    }
    regimes = pickMonthRegimes(month, [draws[0] ?? 0, draws[1] ?? 0, draws[2] ?? 0]);
  }
  const regime =
    dayIndex % DAYS_PER_MONTH === DAYS_PER_MONTH - 1 ? regimes.lastDay : regimes.dominant;

  const generated = generateWeatherDay(wRng, dayOfYear, month, regime);

  // One forecast-error factor per quantity per day (06 §8.6.2 pt 3), from a
  // dedicated stream. Box–Muller output is quantized before it enters state.
  let fRng = forecastRng;
  const drawZ = (): number => {
    const u1 = nextFloat01(fRng);
    const u2 = nextFloat01(u1.state);
    fRng = u2.state;
    const z =
      Math.sqrt(-2 * Math.log(Math.max(u1.value, 1e-12))) *
      Math.cos(2 * Math.PI * u2.value);
    return quantize001(Math.max(-3, Math.min(3, z)));
  };
  const forecastZ = { wind: drawZ(), pv: drawZ(), demand: drawZ() };

  // Truth is generated for every city (unconnected included), so a city
  // connected mid-day starts consuming from the very next turn.
  const cityDemandMw: Record<string, number[]> = {};
  for (const city of cities) {
    cityDemandMw[city.id] = cityDemandDayMw(
      city.households,
      city.firms,
      dayType,
      month,
      generated.weather.tempC,
    );
  }
  return {
    truth: {
      dayOfYear,
      dayType,
      month,
      regime,
      weather: generated.weather,
      cityDemandMw,
      forecastZ,
    },
    weatherRng: generated.rng,
    forecastRng: fRng,
    monthRegimes: regimes,
  };
}

export function newGame(seed: number, scenario: Scenario = DEFAULT_SCENARIO): GameState {
  const fields = scenarioToStateFields(scenario);
  const gen = generateDayTruth(
    seedStream(seed, "weather"),
    seedStream(seed, "forecast"),
    0,
    fields.cities,
    null,
  );
  return {
    schema: STATE_SCHEMA_VERSION,
    seed,
    calendar: { dayIndex: 0, turnIndex: 0 },
    rng: {
      weather: gen.weatherRng,
      forecast: gen.forecastRng,
      cityGrowth: seedStream(seed, "city-growth"),
    },
    monthRegimes: gen.monthRegimes,
    ...fields,
    dayTruth: gen.truth,
  };
}

export type Action =
  | { type: "setPlantSetpoint"; plantId: string; mw: number }
  | { type: "setStorage"; storageId: string; mode: StorageMode; mw: number }
  | { type: "setFarmEnabled"; farmId: string; enabled: boolean }
  | { type: "setImport"; borderId: string; mw: number }
  | { type: "setExport"; borderId: string; mw: number }
  | { type: "buildPlant"; tech: PlantTech; capacityMw: number; hex: HexCoord }
  | { type: "buildFarm"; tech: FarmTech; capacityMw: number; hex: HexCoord }
  | { type: "buildBattery"; powerMw: number; capacityMwh: number; hex: HexCoord }
  | { type: "buildPumpedStorage"; hex: HexCoord }
  | { type: "buildJunction"; hex: HexCoord }
  | { type: "buildBorder"; hex: HexCoord }
  | { type: "buildLine"; lineType: LineType; path: HexCoord[] }
  | { type: "connectCity"; cityId: string }
  | { type: "noop" };

function clampMw(mw: number, max: number): number {
  if (!Number.isFinite(mw)) return 0;
  return Math.min(max, Math.max(0, mw));
}

/** Applies a dispatch action; unknown object ids are a no-op (replay-safe). */
export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "setPlantSetpoint":
      return {
        ...state,
        plants: state.plants.map((p) =>
          p.id === action.plantId
            ? { ...p, setpointMw: clampMw(action.mw, p.capacityMw) }
            : p,
        ),
      };
    case "setStorage":
      return {
        ...state,
        storages: state.storages.map((s) =>
          s.id === action.storageId
            ? { ...s, setpoint: { mode: action.mode, mw: clampMw(action.mw, s.powerMw) } }
            : s,
        ),
      };
    case "setFarmEnabled":
      return {
        ...state,
        farms: state.farms.map((f) =>
          f.id === action.farmId ? { ...f, enabled: action.enabled } : f,
        ),
      };
    case "setImport":
      return {
        ...state,
        borders: state.borders.map((b) =>
          b.id === action.borderId
            ? { ...b, importSetpointMw: clampMw(action.mw, b.throughputMw) }
            : b,
        ),
      };
    case "setExport":
      return {
        ...state,
        borders: state.borders.map((b) =>
          b.id === action.borderId
            ? { ...b, exportSetpointMw: clampMw(action.mw, b.throughputMw) }
            : b,
        ),
      };
    case "buildPlant":
      return buildPlant(state, action.tech, action.capacityMw, action.hex);
    case "buildFarm":
      return buildFarm(state, action.tech, action.capacityMw, action.hex);
    case "buildBattery":
      return buildBattery(state, action.powerMw, action.capacityMwh, action.hex);
    case "buildPumpedStorage":
      return buildPumpedStorage(state, action.hex);
    case "buildJunction":
      return buildJunction(state, action.hex);
    case "buildBorder":
      return buildBorder(state, action.hex);
    case "buildLine":
      return buildLine(state, action.lineType, action.path);
    case "connectCity":
      return connectCity(state, action.cityId);
    case "noop":
      return state;
  }
}

function blockAverage(values: number[] | undefined, startHour: number): number {
  if (!values) return 0;
  let sum = 0;
  for (let h = 0; h < HOURS_PER_TURN; h++) sum += values[startHour + h] ?? 0;
  return sum / HOURS_PER_TURN;
}

/** Split cycle efficiency half per leg (02 §4). */
function legEfficiency(cycleEfficiency: number): number {
  return Math.sqrt(cycleEfficiency);
}

function yearlyFixedCostsPln(state: GameState): number {
  let yearly = 0;
  for (const p of state.plants) yearly += p.capacityMw * PLANT_TECHS[p.tech].fixedPlnPerMwYear;
  for (const f of state.farms) yearly += f.capacityMw * FARM_TECHS[f.tech].fixedPlnPerMwYear;
  for (const s of state.storages) yearly += s.powerMw * STORAGE_TECHS[s.tech].fixedPlnPerMwYear;
  yearly += state.junctions.length * NODE_FIXED_PLN_PER_YEAR.junction;
  yearly += state.borders.length * NODE_FIXED_PLN_PER_YEAR.border;
  for (const line of state.lines) {
    if (!isLineBuilt(line)) continue; // under construction: no maintenance yet
    const km = (line.path.length - 1) * KM_PER_HEX;
    yearly += km * LINE_TYPES[line.type].fixedPlnPerKmYear;
  }
  return yearly;
}

/**
 * Resolves the current turn (the "next turn" click — 01 §2.3, 02 §4) and
 * advances the calendar; after the free day's last turn, evaluates monthly
 * city growth, then rolls the next day and generates its truth.
 */
export function resolveTurn(state: GameState): GameState {
  const truth = state.dayTruth;
  const startHour = state.calendar.turnIndex * HOURS_PER_TURN;
  const weight = DAY_WEIGHTS[truth.dayType];

  // 02 §4 steps 1–2: reveal block truth, collect setpoints and RES production.
  const cityBlockDemand = new Map<string, number>();
  for (const city of state.cities) {
    if (!city.connected) continue;
    cityBlockDemand.set(city.id, blockAverage(truth.cityDemandMw[city.id], startHour));
  }

  const farmBlockMw = new Map<string, number>();
  for (const farm of state.farms) {
    if (!farm.enabled) {
      farmBlockMw.set(farm.id, 0);
      continue;
    }
    let sum = 0;
    for (let h = 0; h < HOURS_PER_TURN; h++) {
      sum += farmPowerMwAtHour(farm, truth.weather, startHour + h);
    }
    farmBlockMw.set(farm.id, sum / HOURS_PER_TURN);
  }

  // Network graph: every object is a node; junctions and borders carry caps.
  const nodes: NetworkNode[] = [
    ...state.cities.map((c) => ({ id: c.id, hex: c.hex })),
    ...state.plants.map((p) => ({ id: p.id, hex: p.hex })),
    ...state.farms.map((f) => ({ id: f.id, hex: f.hex })),
    ...state.storages.map((s) => ({ id: s.id, hex: s.hex })),
    ...state.junctions.map((j) => ({ id: j.id, hex: j.hex, throughputMw: j.throughputMw })),
    ...state.borders.map((b) => ({ id: b.id, hex: b.hex, throughputMw: b.throughputMw })),
  ];
  const segments = buildSegments(nodes, state.lines.filter(isLineBuilt));

  const sources: FlowSource[] = [];
  for (const farm of state.farms) {
    sources.push({
      id: farm.id,
      nodeId: farm.id,
      availableMw: farmBlockMw.get(farm.id) ?? 0,
      costPlnPerMwh: 0,
    });
  }
  for (const storage of state.storages) {
    const eta = legEfficiency(STORAGE_TECHS[storage.tech].cycleEfficiency);
    const available =
      storage.setpoint.mode === "discharge"
        ? Math.min(storage.setpoint.mw, (storage.socMwh * eta) / HOURS_PER_TURN)
        : 0;
    sources.push({ id: storage.id, nodeId: storage.id, availableMw: available, costPlnPerMwh: 0 });
  }
  for (const plant of state.plants) {
    sources.push({
      id: plant.id,
      nodeId: plant.id,
      availableMw: Math.min(plant.setpointMw, plant.capacityMw),
      costPlnPerMwh: PLANT_TECHS[plant.tech].varCostPlnPerMwh,
    });
  }
  for (const border of state.borders) {
    sources.push({
      id: border.id,
      nodeId: border.id,
      availableMw: border.importSetpointMw,
      costPlnPerMwh: CONFIG.importPricePlnPerMwh,
    });
  }

  // 02 §4 steps 3–5: three passes on shared residual capacities.
  const residual = emptyResidual();
  const citySinks: FlowSink[] = [...cityBlockDemand].map(([cityId, demandMw]) => ({
    id: cityId,
    nodeId: cityId,
    demandMw,
  }));
  const cityPass = runFlowPass(segments, nodes, sources, citySinks, residual);

  const remainingSources = (used: Record<string, number>): FlowSource[] =>
    sources
      .map((s) => ({ ...s, availableMw: s.availableMw - (used[s.id] ?? 0) }))
      .filter((s) => s.availableMw > 0);

  const chargeSinks: FlowSink[] = state.storages
    .filter((s) => s.setpoint.mode === "charge")
    .map((storage) => {
      const eta = legEfficiency(STORAGE_TECHS[storage.tech].cycleEfficiency);
      const headroomMw =
        (storage.capacityMwh - storage.socMwh) / (HOURS_PER_TURN * eta);
      return {
        id: storage.id,
        nodeId: storage.id,
        demandMw: Math.min(storage.setpoint.mw, Math.max(0, headroomMw)),
      };
    });
  const chargePass = runFlowPass(
    segments,
    nodes,
    remainingSources(cityPass.usedMwBySource),
    chargeSinks,
    residual,
  );

  const usedAfterCharge: Record<string, number> = {};
  for (const s of sources) {
    usedAfterCharge[s.id] =
      (cityPass.usedMwBySource[s.id] ?? 0) + (chargePass.usedMwBySource[s.id] ?? 0);
  }
  const exportSinks: FlowSink[] = state.borders
    .filter((b) => b.exportSetpointMw > 0)
    .map((b) => ({ id: `${b.id}:export`, nodeId: b.id, demandMw: b.exportSetpointMw }));
  const exportPass = runFlowPass(
    segments,
    nodes,
    remainingSources(usedAfterCharge),
    exportSinks,
    residual,
  );

  const usedTotal = new Map<string, number>();
  for (const s of sources) {
    usedTotal.set(
      s.id,
      (usedAfterCharge[s.id] ?? 0) + (exportPass.usedMwBySource[s.id] ?? 0),
    );
  }

  // 02 §4 steps 6–8: dump penalty, ENS, finances (all flow-derived money
  // scales by the day weight — 01 §2.1).
  const hours = HOURS_PER_TURN;
  let revenuePln = 0;
  let costsPln = 0;

  const cities = state.cities.map((city): CityState => {
    if (!city.connected) return city;
    const demandMw = cityBlockDemand.get(city.id) ?? 0;
    const deliveredMw = cityPass.deliveredMwBySink[city.id] ?? 0;
    const ensMw = Math.max(0, demandMw - deliveredMw);
    revenuePln += deliveredMw * hours * CONFIG.tariffPlnPerMwh;
    costsPln += ensMw * hours * CONFIG.ensPenaltyPlnPerMwh;
    return {
      ...city,
      monthDemandMwh: quantize001(city.monthDemandMwh + demandMw * hours * weight),
      monthDeliveredMwh: quantize001(city.monthDeliveredMwh + deliveredMw * hours * weight),
    };
  });

  for (const plant of state.plants) {
    const available = Math.min(plant.setpointMw, plant.capacityMw);
    const used = usedTotal.get(plant.id) ?? 0;
    costsPln += used * hours * PLANT_TECHS[plant.tech].varCostPlnPerMwh;
    costsPln += Math.max(0, available - used) * hours * CONFIG.dumpPenaltyPlnPerMwh;
  }
  for (const border of state.borders) {
    costsPln += border.importSetpointMw * hours * CONFIG.importPricePlnPerMwh;
    revenuePln +=
      (exportPass.deliveredMwBySink[`${border.id}:export`] ?? 0) *
      hours *
      CONFIG.exportPricePlnPerMwh;
  }

  const storages = state.storages.map((storage) => {
    const eta = legEfficiency(STORAGE_TECHS[storage.tech].cycleEfficiency);
    let soc = storage.socMwh;
    const discharged = usedTotal.get(storage.id) ?? 0;
    if (discharged > 0) soc -= (discharged * hours) / eta;
    const charged = chargePass.deliveredMwBySink[storage.id] ?? 0;
    if (charged > 0) soc += charged * hours * eta;
    return {
      ...storage,
      socMwh: quantize001(Math.min(storage.capacityMwh, Math.max(0, soc))),
    };
  });

  let moneyPln = state.moneyPln + Math.round((revenuePln - costsPln) * weight);

  // Line construction advances by the played block (01 §2.6).
  const lines = state.lines.map((line) =>
    isLineBuilt(line)
      ? line
      : { ...line, builtHours: Math.min(line.totalHours, line.builtHours + HOURS_PER_TURN) },
  );

  const nextTurn = state.calendar.turnIndex + 1;
  if (nextTurn < TURNS_PER_DAY) {
    return {
      ...state,
      calendar: { ...state.calendar, turnIndex: nextTurn },
      moneyPln,
      cities,
      storages,
      lines,
    };
  }

  // Day end: fixed costs (yearly / 365 × represented days — 01 §6), then the
  // month boundary after the free day (05 §6.1), construction countdowns, and
  // the next day's truth.
  moneyPln -= Math.round((yearlyFixedCostsPln(state) / 365) * weight);

  let nextCities = cities;
  let cityGrowthRng = state.rng.cityGrowth;
  if (truth.dayType === "free") {
    // Month start day = free day index − 2 (05 §6.5: first FULL month counts).
    const growth = evaluateMonthlyGrowth(
      cities,
      cityGrowthRng,
      state.calendar.dayIndex - (DAYS_PER_MONTH - 1),
    );
    nextCities = growth.cities;
    cityGrowthRng = growth.rng;
  }

  const done = { ...state };
  const stillBuilding: typeof state.constructions = [];
  const spawned = {
    plants: [...state.plants],
    farms: [...state.farms],
    storages: [...storages],
    junctions: [...state.junctions],
    borders: [...state.borders],
  };
  for (const construction of state.constructions) {
    if (construction.remainingDays > 1) {
      stillBuilding.push({ ...construction, remainingDays: construction.remainingDays - 1 });
      continue;
    }
    const pending = construction.pending;
    switch (pending.kind) {
      case "plant":
        spawned.plants.push(pending.plant);
        break;
      case "farm":
        spawned.farms.push(pending.farm);
        break;
      case "storage":
        spawned.storages.push(pending.storage);
        break;
      case "junction":
        spawned.junctions.push(pending.junction);
        break;
      case "border":
        spawned.borders.push(pending.border);
        break;
    }
  }

  const nextDay = state.calendar.dayIndex + 1;
  const gen = generateDayTruth(
    state.rng.weather,
    state.rng.forecast,
    nextDay,
    nextCities,
    state.monthRegimes,
  );
  return {
    ...done,
    calendar: { dayIndex: nextDay, turnIndex: 0 },
    moneyPln,
    rng: { weather: gen.weatherRng, forecast: gen.forecastRng, cityGrowth: cityGrowthRng },
    monthRegimes: gen.monthRegimes,
    cities: nextCities,
    plants: spawned.plants,
    farms: spawned.farms,
    storages: spawned.storages,
    junctions: spawned.junctions,
    borders: spawned.borders,
    lines,
    constructions: stillBuilding,
    dayTruth: gen.truth,
  };
}
