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
  buyForecastSystem,
  cancelConstruction,
  cancelLine,
  connectCity,
  expandBattery,
  expandBorder,
  expandFarm,
  expandJunction,
  expandPlant,
  expandPumpedStorage,
} from "./build";
import {
  BORDER_SPEC,
  CONFIG,
  DAY_WEIGHTS,
  FARM_TECHS,
  JUNCTION_SPEC,
  LINE_TYPES,
  NODE_FIXED_CAPEX_SHARE_PER_YEAR,
  PLANT_TECHS,
  PUMPED_BLOCK,
  STORAGE_TECHS,
  KM_PER_HEX,
  type FarmTech,
  type ForecastLevel,
  type LineType,
  type PlantTech,
} from "./config";
import { cityDemandForecast, farmProductionForecast } from "./forecast";
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
import { seedStream } from "./prng";
import { quantize001 } from "./quantize";
import { DEFAULT_SCENARIO, scenarioToStateFields, type Scenario } from "./scenario";
import {
  DAYS_PER_MONTH,
  HOURS_PER_TURN,
  STATE_SCHEMA_VERSION,
  TURNS_PER_DAY,
  TURN_PHASES,
  isLineBuilt,
  type CityState,
  type GameState,
  type SourceKind,
  type StorageMode,
  type TurnCityReport,
  type TurnReport,
} from "./state";
import {
  generateDayTruth,
  monthRegimeForecastForDay,
  monthRegimesForDay,
} from "./truth";
import { farmPowerMwAtHour } from "./weather";

export { CONFIG } from "./config";

export function newGame(seed: number, scenario: Scenario = DEFAULT_SCENARIO): GameState {
  const fields = scenarioToStateFields(scenario);
  const forecastLevel: ForecastLevel = "basic";
  const monthRegimes = monthRegimesForDay(seed, 0);
  return {
    schema: STATE_SCHEMA_VERSION,
    seed,
    calendar: { dayIndex: 0, turnIndex: 0 },
    rng: { cityGrowth: seedStream(seed, "city-growth") },
    monthRegimes,
    monthRegimeForecast: monthRegimeForecastForDay(
      seed,
      0,
      monthRegimes.dominant,
      forecastLevel,
    ),
    forecastLevel,
    ...fields,
    dayTruth: generateDayTruth(seed, 0, fields.cities),
    lastTurnReport: null,
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
  | { type: "expandPlant"; plantId: string; capacityMw: number }
  | { type: "expandFarm"; farmId: string; capacityMw: number }
  | { type: "expandBattery"; storageId: string; powerMw: number; capacityMwh: number }
  | { type: "expandPumpedStorage"; storageId: string }
  | { type: "expandJunction"; junctionId: string }
  | { type: "expandBorder"; borderId: string }
  | { type: "cancelConstruction"; constructionId: string }
  | { type: "cancelLine"; lineId: string }
  | { type: "buyForecastSystem"; level: ForecastLevel }
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
    case "expandPlant":
      return expandPlant(state, action.plantId, action.capacityMw);
    case "expandFarm":
      return expandFarm(state, action.farmId, action.capacityMw);
    case "expandBattery":
      return expandBattery(state, action.storageId, action.powerMw, action.capacityMwh);
    case "expandPumpedStorage":
      return expandPumpedStorage(state, action.storageId);
    case "expandJunction":
      return expandJunction(state, action.junctionId);
    case "expandBorder":
      return expandBorder(state, action.borderId);
    case "cancelConstruction":
      return cancelConstruction(state, action.constructionId);
    case "cancelLine":
      return cancelLine(state, action.lineId);
    case "buyForecastSystem":
      return buyForecastSystem(state, action.level);
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
  // 02 §8.3: 2% of the node's CAPEX per year — capacity modules raise both.
  for (const junction of state.junctions) {
    const modules = Math.round(
      (junction.lineSlots - JUNCTION_SPEC.lineSlots) / JUNCTION_SPEC.moduleLineSlots,
    );
    yearly +=
      (JUNCTION_SPEC.capexPln + modules * JUNCTION_SPEC.moduleCapexPln) *
      NODE_FIXED_CAPEX_SHARE_PER_YEAR;
  }
  for (const border of state.borders) {
    const modules = Math.round(
      (border.throughputMw - BORDER_SPEC.throughputMw) / BORDER_SPEC.moduleThroughputMw,
    );
    yearly +=
      (BORDER_SPEC.capexPln + modules * BORDER_SPEC.moduleCapexPln) *
      NODE_FIXED_CAPEX_SHARE_PER_YEAR;
  }
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
  // scales by the day weight — 01 §2.1). Components are tracked alongside for
  // the report; revenuePln/costsPln stay the single source of the money delta.
  const hours = HOURS_PER_TURN;
  let revenuePln = 0;
  let costsPln = 0;
  let revenueEnergyPln = 0;
  let revenueExportPln = 0;
  let fuelCostPln = 0;
  let importCostPln = 0;
  let ensPenaltyPln = 0;
  let dumpPenaltyPln = 0;
  let totalDemandMw = 0;
  let totalDeliveredMw = 0;
  let totalEnsMw = 0;
  let dumpMw = 0;
  const cityReports: TurnCityReport[] = [];

  const cities = state.cities.map((city): CityState => {
    if (!city.connected) return city;
    const demandMw = cityBlockDemand.get(city.id) ?? 0;
    const deliveredMw = cityPass.deliveredMwBySink[city.id] ?? 0;
    const ensMw = Math.max(0, demandMw - deliveredMw);
    revenuePln += deliveredMw * hours * CONFIG.tariffPlnPerMwh;
    costsPln += ensMw * hours * CONFIG.ensPenaltyPlnPerMwh;
    revenueEnergyPln += deliveredMw * hours * CONFIG.tariffPlnPerMwh;
    ensPenaltyPln += ensMw * hours * CONFIG.ensPenaltyPlnPerMwh;
    totalDemandMw += demandMw;
    totalDeliveredMw += deliveredMw;
    totalEnsMw += ensMw;
    cityReports.push({
      cityId: city.id,
      demandMw: quantize001(demandMw),
      deliveredMw: quantize001(deliveredMw),
      ensMw: quantize001(ensMw),
    });
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
    fuelCostPln += used * hours * PLANT_TECHS[plant.tech].varCostPlnPerMwh;
    dumpPenaltyPln += Math.max(0, available - used) * hours * CONFIG.dumpPenaltyPlnPerMwh;
    dumpMw += Math.max(0, available - used);
  }
  for (const border of state.borders) {
    costsPln += border.importSetpointMw * hours * CONFIG.importPricePlnPerMwh;
    revenuePln +=
      (exportPass.deliveredMwBySink[`${border.id}:export`] ?? 0) *
      hours *
      CONFIG.exportPricePlnPerMwh;
    importCostPln += border.importSetpointMw * hours * CONFIG.importPricePlnPerMwh;
    revenueExportPln +=
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

  const nextTurn = state.calendar.turnIndex + 1;
  // Fixed O&M hits at day end only (yearly / 365 × represented days — 01 §6).
  const fixedCostPln =
    nextTurn < TURNS_PER_DAY ? 0 : Math.round((yearlyFixedCostsPln(state) / 365) * weight);
  const moneyPln =
    state.moneyPln + Math.round((revenuePln - costsPln) * weight) - fixedCostPln;

  // The turn's bet against the forecast (01 §2.3): block averages of what the
  // pre-reveal forecast promised vs the revealed truth. Disabled farms are the
  // player's own lever, not a forecast miss — left out on both sides.
  const forecastBlockAvg = (atHour: (hour: number) => number): number => {
    let sum = 0;
    for (let h = 0; h < HOURS_PER_TURN; h++) sum += atHour(startHour + h);
    return sum / HOURS_PER_TURN;
  };
  const demandForecastMw = forecastBlockAvg((hour) => {
    let sum = 0;
    for (const city of state.cities) {
      if (city.connected) sum += cityDemandForecast(state, city.id, hour)?.mw ?? 0;
    }
    return sum;
  });
  const farmForecastMw = (tech: FarmTech): number =>
    forecastBlockAvg((hour) => {
      let sum = 0;
      for (const farm of state.farms) {
        if (farm.enabled && farm.tech === tech) {
          sum += farmProductionForecast(state, farm.id, hour)?.mw ?? 0;
        }
      }
      return sum;
    });
  const farmActualMw = (tech: FarmTech): number => {
    let sum = 0;
    for (const farm of state.farms) {
      if (farm.enabled && farm.tech === tech) sum += farmBlockMw.get(farm.id) ?? 0;
    }
    return sum;
  };
  let demandActualMw = 0;
  for (const demandMw of cityBlockDemand.values()) demandActualMw += demandMw;

  const sourceKind = (sourceId: string): SourceKind => {
    if (state.farms.some((f) => f.id === sourceId)) return "farm";
    if (state.storages.some((s) => s.id === sourceId)) return "storage";
    if (state.plants.some((p) => p.id === sourceId)) return "plant";
    return "import";
  };
  let resCurtailedMw = 0;
  for (const farm of state.farms) {
    resCurtailedMw += Math.max(
      0,
      (farmBlockMw.get(farm.id) ?? 0) - (usedTotal.get(farm.id) ?? 0),
    );
  }

  const report: TurnReport = {
    dayIndex: state.calendar.dayIndex,
    turnIndex: state.calendar.turnIndex,
    phase: TURN_PHASES[state.calendar.turnIndex] ?? "night",
    dayType: truth.dayType,
    month: truth.month,
    regime: truth.regime,
    dayWeight: weight,
    totals: {
      demandMw: quantize001(totalDemandMw),
      deliveredMw: quantize001(totalDeliveredMw),
      ensMw: quantize001(totalEnsMw),
      lossesMw: quantize001(cityPass.lossesMw + chargePass.lossesMw + exportPass.lossesMw),
      dumpMw: quantize001(dumpMw),
      resCurtailedMw: quantize001(resCurtailedMw),
    },
    forecastMiss: {
      demand: {
        forecastMw: quantize001(demandForecastMw),
        actualMw: quantize001(demandActualMw),
      },
      wind: {
        forecastMw: quantize001(farmForecastMw("wind")),
        actualMw: quantize001(farmActualMw("wind")),
      },
      pv: {
        forecastMw: quantize001(farmForecastMw("pv")),
        actualMw: quantize001(farmActualMw("pv")),
      },
    },
    cities: cityReports,
    sources: sources.map((s) => ({
      sourceId: s.id,
      kind: sourceKind(s.id),
      offeredMw: quantize001(s.availableMw),
      usedMw: quantize001(usedTotal.get(s.id) ?? 0),
    })),
    storages: state.storages.map((storage, i) => ({
      storageId: storage.id,
      mode: storage.setpoint.mode,
      dischargedMw: quantize001(usedTotal.get(storage.id) ?? 0),
      chargedMw: quantize001(chargePass.deliveredMwBySink[storage.id] ?? 0),
      socMwhAfter: storages[i]?.socMwh ?? 0,
    })),
    borders: state.borders.map((border) => ({
      borderId: border.id,
      importSetpointMw: border.importSetpointMw,
      importUsedMw: quantize001(usedTotal.get(border.id) ?? 0),
      exportSetpointMw: border.exportSetpointMw,
      exportDeliveredMw: quantize001(exportPass.deliveredMwBySink[`${border.id}:export`] ?? 0),
    })),
    segments: segments.map((segment) => ({
      segmentId: segment.id,
      lineId: segment.lineId,
      fromNodeId: segment.from,
      toNodeId: segment.to,
      fromIndex: segment.fromIndex,
      toIndex: segment.toIndex,
      usedMw: quantize001(residual.segmentUsedMw[segment.id] ?? 0),
      capacityMw: segment.capacityMw,
    })),
    nodes: [...state.junctions, ...state.borders].map((node) => ({
      nodeId: node.id,
      usedMw: quantize001(residual.nodeUsedMw[node.id] ?? 0),
      throughputMw: node.throughputMw,
    })),
    finance: {
      revenueEnergyPln: Math.round(revenueEnergyPln * weight),
      revenueExportPln: Math.round(revenueExportPln * weight),
      fuelCostPln: Math.round(fuelCostPln * weight),
      importCostPln: Math.round(importCostPln * weight),
      ensPenaltyPln: Math.round(ensPenaltyPln * weight),
      dumpPenaltyPln: Math.round(dumpPenaltyPln * weight),
      fixedCostPln,
      netPln: moneyPln - state.moneyPln,
    },
  };

  // Line construction advances by the played block (01 §2.6).
  const lines = state.lines.map((line) =>
    isLineBuilt(line)
      ? line
      : { ...line, builtHours: Math.min(line.totalHours, line.builtHours + HOURS_PER_TURN) },
  );

  if (nextTurn < TURNS_PER_DAY) {
    return {
      ...state,
      calendar: { ...state.calendar, turnIndex: nextTurn },
      moneyPln,
      cities,
      storages,
      lines,
      lastTurnReport: report,
    };
  }

  // Day end: month boundary after the free day (05 §6.1), construction
  // countdowns, and the next day's truth.
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
  const upgrade = <T extends { id: string }>(list: T[], id: string, patch: (item: T) => T) =>
    list.map((item) => (item.id === id ? patch(item) : item));
  for (const construction of state.constructions) {
    if (construction.remainingDays > 1) {
      stillBuilding.push({ ...construction, remainingDays: construction.remainingDays - 1 });
      continue;
    }
    // A finished expansion upgrades the object in place (01 §7); a finished
    // object joins the world. Both were paid for when they were ordered.
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
      case "plantExpansion":
        spawned.plants = upgrade(spawned.plants, pending.plantId, (plant) => ({
          ...plant,
          capacityMw: plant.capacityMw + pending.capacityMw,
          blocks: plant.blocks + 1,
        }));
        break;
      case "farmExpansion":
        spawned.farms = upgrade(spawned.farms, pending.farmId, (farm) => ({
          ...farm,
          capacityMw: farm.capacityMw + pending.capacityMw,
        }));
        break;
      case "batteryExpansion":
        spawned.storages = upgrade(spawned.storages, pending.storageId, (storage) => ({
          ...storage,
          powerMw: storage.powerMw + pending.powerMw,
          capacityMwh: storage.capacityMwh + pending.capacityMwh,
        }));
        break;
      case "pumpedExpansion":
        spawned.storages = upgrade(spawned.storages, pending.storageId, (storage) => ({
          ...storage,
          powerMw: storage.powerMw + PUMPED_BLOCK.powerMw,
          capacityMwh: storage.capacityMwh + PUMPED_BLOCK.capacityMwh,
        }));
        break;
      case "junctionExpansion":
        spawned.junctions = upgrade(spawned.junctions, pending.junctionId, (junction) => ({
          ...junction,
          throughputMw: junction.throughputMw + JUNCTION_SPEC.moduleThroughputMw,
          lineSlots: junction.lineSlots + JUNCTION_SPEC.moduleLineSlots,
        }));
        break;
      case "borderExpansion":
        spawned.borders = upgrade(spawned.borders, pending.borderId, (border) => ({
          ...border,
          throughputMw: border.throughputMw + BORDER_SPEC.moduleThroughputMw,
        }));
        break;
    }
  }

  const nextDay = state.calendar.dayIndex + 1;
  const monthRegimes = monthRegimesForDay(state.seed, nextDay);
  // The regime forecast is rolled once per month, when the month opens, against
  // the forecast level owned at that moment (06 §8.4 pt 5).
  const monthRegimeForecast =
    nextDay % DAYS_PER_MONTH === 0
      ? monthRegimeForecastForDay(
          state.seed,
          nextDay,
          monthRegimes.dominant,
          state.forecastLevel,
        )
      : state.monthRegimeForecast;
  return {
    ...done,
    calendar: { dayIndex: nextDay, turnIndex: 0 },
    moneyPln,
    rng: { cityGrowth: cityGrowthRng },
    monthRegimes,
    monthRegimeForecast,
    cities: nextCities,
    plants: spawned.plants,
    farms: spawned.farms,
    storages: spawned.storages,
    junctions: spawned.junctions,
    borders: spawned.borders,
    lines,
    constructions: stillBuilding,
    dayTruth: generateDayTruth(state.seed, nextDay, nextCities),
    lastTurnReport: report,
  };
}
