// GameState (+ the turn report the player is looking at) → WorldScene.
//
// The one place in src/world that reads the engine (ARCHITECTURE.md §3). Pure:
// same inputs, same scene; the store memoises it per (game, report, overlay).
// Everything measured comes from the LAST RESOLVED turn (01 §8 pt 1); before
// the first resolution the world shows the pending turn with no flows, and
// says so through `time.resolved`.

import { plantOrderMw } from "../../app/dispatch";
import {
  BORDER_SPEC,
  DAYS_PER_YEAR,
  DAY_WEIGHTS,
  EXPANSION,
  FARM_TECHS,
  HOURS_PER_TURN,
  JUNCTION_SPEC,
  OFFSHORE_WIND,
  PLANT_DYNAMICS,
  PLANT_TECHS,
  STORAGE_TECHS,
  TURBINE,
  TURN_PHASES,
  axialToOffset,
  dayOfYearForGameDay,
  farmPowerMwAtHour,
  farmSiting,
  generateDayTruth,
  hexKey,
  hexNeighbors,
  isInsideMap,
  isLineBuilt,
  offsetToAxial,
  turbinePowerFraction,
  type DayTruth,
  type GameState,
  type HexCoord,
  type PendingObject,
  type RegimeId,
  type TerrainId,
  type TurnReport,
  type WindClass,
} from "../../engine";
import {
  IDLE_FLOW_MW,
  LOAD_OVER_RATIO,
  lineLoad,
  type BottleneckRef,
  type RoutePreview,
} from "../../app/map/sceneModel";
import { lineCensus, lineSlotsAt, terrainAt } from "../../app/validate";
import { segmentDirections } from "./flowDirection";
import {
  borderLabel,
  buildLabel,
  cityLabel,
  expansionLabel,
  farmLabel,
  overloadLabel,
  plantLabel,
  shortfallLabel,
  storageLabel,
  upgradeLabel,
} from "./labels";
import { buildSun } from "./sun";
import { buildWeather, weatherTruthFor } from "./weather";
import {
  WORLD_SCENE_VERSION,
  type CitySizeClass,
  type HexRef,
  type RotorState,
  type SiteKind,
  type WorldBoard,
  type WorldBorder,
  type WorldCity,
  type WorldFarm,
  type WorldHex,
  type WorldJunction,
  type WorldLabel,
  type WorldLane,
  type WorldLine,
  type WorldOverlay,
  type WorldPlant,
  type WorldScene,
  type WorldSegment,
  type WorldSite,
  type WorldStorage,
  type WorldTime,
} from "./worldScene";

/** Distance between neighbouring hex centres [km] (01 §3.1). */
export const HEX_PITCH_KM = 25;
const HEX_RADIUS_KM = HEX_PITCH_KM / Math.sqrt(3);
const COLUMN_STEP_KM = 1.5 * HEX_RADIUS_KM;

/** Below this share of households a settlement is a town (05 §5 small class). */
const TOWN_MAX_HOUSEHOLDS = 170_000;
/** From here up the city draws as a metropolis. */
const METRO_MIN_HOUSEHOLDS = 500_000;
/** Log scale bounds of the city footprint (docs/08 §2). */
const CITY_SCALE_MIN = 50_000;
const CITY_SCALE_MAX = 1_500_000;

/** Turbines and PV rows to draw per MW of capacity. */
const TURBINE_MW = 25;
const PV_ROW_MW = 12.5;

/** Bridge notes, in the player's words (diagnosis, not alarm). */
const NOTE_FLOW_DIRECTION =
  "kierunek przepływu na segmentach wnioskowany z odległości od źródeł — raport tury niesie moc bez znaku";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function ref(hex: HexCoord): HexRef {
  return { q: hex.q, r: hex.r, key: hexKey(hex) };
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

/** Offset key of a hex — corridors are keyed the way the SVG geometry keys them. */
function offsetKey(hex: HexCoord): string {
  const { col, row } = axialToOffset(hex);
  return `${col},${row}`;
}

function corridorKey(a: HexCoord, b: HexCoord): string {
  const first = offsetKey(a);
  const second = offsetKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

// --- time -------------------------------------------------------------------

interface ShownTurn {
  dayIndex: number;
  turnIndex: number;
  truth: DayTruth;
  report: TurnReport | null;
}

/**
 * The turn the world shows and the day truth behind it. After a day rolls
 * over the state holds the NEW day's truth while the report describes the old
 * one; the old truth is regenerated with the engine's own pure generator,
 * which is what makes it bit-identical to what the turn was resolved from.
 */
function shownTurn(state: GameState, report: TurnReport | null): ShownTurn {
  if (report === null) {
    return {
      dayIndex: state.calendar.dayIndex,
      turnIndex: state.calendar.turnIndex,
      truth: state.dayTruth,
      report: null,
    };
  }
  const truth =
    report.dayIndex === state.calendar.dayIndex
      ? state.dayTruth
      : generateDayTruth(state.seed, report.dayIndex, state.cities);
  return { dayIndex: report.dayIndex, turnIndex: report.turnIndex, truth, report };
}

function buildTime(state: GameState, shown: ShownTurn): WorldTime {
  const { report, truth } = shown;
  const dayType = report?.dayType ?? truth.dayType;
  return {
    dayIndex: shown.dayIndex,
    turnIndex: shown.turnIndex,
    phase: report?.phase ?? TURN_PHASES[shown.turnIndex] ?? "night",
    hour: shown.turnIndex * HOURS_PER_TURN + HOURS_PER_TURN / 2,
    month: report?.month ?? truth.month,
    dayType,
    dayOfYear: dayOfYearForGameDay(shown.dayIndex),
    year: Math.floor(shown.dayIndex / DAYS_PER_YEAR) + 1,
    resolved: report !== null,
    dayWeight: report?.dayWeight ?? DAY_WEIGHTS[dayType],
    regimeForecast: state.monthRegimeForecast,
  };
}

// --- board ------------------------------------------------------------------

function buildBoard(state: GameState): WorldBoard {
  const { cols, rows } = state.map;
  const borderSites = new Set(state.borderSites.map(hexKey));
  const hexes: WorldHex[] = [];
  const terrainOf = (hex: HexCoord): TerrainId | null =>
    isInsideMap(state.map, hex) ? terrainAt(state, hex) : null;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const hex = offsetToAxial({ col, row });
      const key = hexKey(hex);
      const terrain = terrainAt(state, hex);
      const neighbours = hexNeighbors(hex).map(terrainOf);
      const water = terrain === "sea" || terrain === "lake";
      const nextToSea = neighbours.some((id) => id === "sea");
      const nextToWater = neighbours.some((id) => id === "sea" || id === "lake");
      hexes.push({
        q: hex.q,
        r: hex.r,
        key,
        col,
        row,
        x: COLUMN_STEP_KM * col,
        z: HEX_PITCH_KM * row + (col % 2 !== 0 ? HEX_PITCH_KM / 2 : 0),
        terrain,
        windClass: state.windClasses[key] ?? "open",
        solarMultiplier: state.solarMultipliers[key] ?? 1,
        coastal: !water && nextToSea,
        shore: !water && nextToWater,
        edge: col === 0 || row === 0 || col === cols - 1 || row === rows - 1,
        pumpedSite: (terrain === "highlands" || terrain === "mountains") && nextToWater,
        borderSite: borderSites.has(key),
      });
    }
  }
  return {
    cols,
    rows,
    pitchKm: HEX_PITCH_KM,
    widthKm: COLUMN_STEP_KM * Math.max(0, cols - 1) + 2 * HEX_RADIUS_KM,
    depthKm: HEX_PITCH_KM * rows + (cols > 1 ? HEX_PITCH_KM / 2 : 0),
    hexes,
  };
}

// --- lines ------------------------------------------------------------------

/** Which lines share every corridor step, in state order — the lane index. */
function buildLanes(state: GameState): Map<string, WorldLane[]> {
  const users = new Map<string, string[]>();
  for (const line of state.lines) {
    for (let i = 0; i + 1 < line.path.length; i++) {
      const a = line.path[i];
      const b = line.path[i + 1];
      if (!a || !b) continue;
      const key = corridorKey(a, b);
      users.set(key, [...(users.get(key) ?? []), line.id]);
    }
  }
  const lanes = new Map<string, WorldLane[]>();
  for (const line of state.lines) {
    const list: WorldLane[] = [];
    for (let i = 0; i + 1 < line.path.length; i++) {
      const a = line.path[i];
      const b = line.path[i + 1];
      if (!a || !b) continue;
      const sharing = users.get(corridorKey(a, b)) ?? [line.id];
      list.push({ index: sharing.indexOf(line.id), count: sharing.length });
    }
    lanes.set(line.id, list);
  }
  return lanes;
}

function buildLines(
  state: GameState,
  report: TurnReport | null,
  labels: WorldLabel[],
): { lines: WorldLine[]; hotspots: { ratio: number; text: string; hex: HexRef }[] } {
  const lanes = buildLanes(state);
  const directions = report ? segmentDirections(report) : new Map();
  const reported = new Map<string, TurnReport["segments"]>();
  for (const segment of report?.segments ?? []) {
    reported.set(segment.lineId, [...(reported.get(segment.lineId) ?? []), segment]);
  }
  // Every overloaded line is named, not just the worst one: with two lines at
  // their limit the single label left the second alarm to the wire colour
  // alone, which a dispatcher could not read at the strategic view (final-gate
  // critic). The HUD stacks alerts; the layout caps the list.
  const hotspots: { ratio: number; text: string; hex: HexRef }[] = [];
  const hotLines = new Set<string>();

  const lines = state.lines.map((line): WorldLine => {
    const built = isLineBuilt(line);
    const path = line.path.map(ref);
    const middle = path[Math.floor((path.length - 1) / 2)] ?? path[0];
    const remainingDays = (builtHours: number, totalHours: number) =>
      Math.max(0, Math.ceil((totalHours - builtHours) / (HOURS_PER_TURN * 8)));

    if (!built && middle) {
      labels.push({
        key: `${line.id}:build`,
        hex: middle,
        text: buildLabel(remainingDays(line.builtHours, line.totalHours)),
        tone: "default",
        kind: "line",
        muted: false,
        priority: 3,
        placement: "above",
      });
    } else if (line.upgrade && middle) {
      labels.push({
        key: `${line.id}:upgrade`,
        hex: middle,
        text: upgradeLabel(
          line.upgrade.type,
          remainingDays(line.upgrade.builtHours, line.upgrade.totalHours),
        ),
        tone: "default",
        kind: "line",
        muted: false,
        priority: 3,
        placement: "above",
      });
    }

    const measured = built ? (reported.get(line.id) ?? []) : [];
    const segments: WorldSegment[] = measured.map((segment) => {
      const ratio = segment.capacityMw > 0 ? segment.usedMw / segment.capacityMw : 0;
      if (ratio >= LOAD_OVER_RATIO && segment.usedMw > IDLE_FLOW_MW && !hotLines.has(line.id)) {
        const at = path[Math.floor((segment.fromIndex + segment.toIndex) / 2)];
        if (at) {
          hotLines.add(line.id);
          hotspots.push({
            ratio,
            text: overloadLabel(line.type, segment.usedMw, segment.capacityMw),
            hex: at,
          });
        }
      }
      return {
        key: segment.segmentId,
        fromIndex: segment.fromIndex,
        toIndex: segment.toIndex,
        fromNodeId: segment.fromNodeId,
        toNodeId: segment.toNodeId,
        usedMw: segment.usedMw,
        capacityMw: segment.capacityMw,
        ratio: segment.usedMw > IDLE_FLOW_MW ? ratio : 0,
        load: lineLoad(segment.usedMw, segment.capacityMw),
        direction: (directions.get(segment.segmentId) ?? 0) as 1 | -1 | 0,
      };
    });

    return {
      id: line.id,
      type: line.type,
      path,
      built,
      progress: line.totalHours > 0 ? clamp01(line.builtHours / line.totalHours) : 1,
      upgrade: line.upgrade
        ? {
            type: line.upgrade.type,
            progress:
              line.upgrade.totalHours > 0
                ? clamp01(line.upgrade.builtHours / line.upgrade.totalHours)
                : 0,
          }
        : null,
      lanes: lanes.get(line.id) ?? [],
      segments:
        segments.length > 0 || !built
          ? segments
          : [
              {
                key: `${line.id}:whole`,
                fromIndex: 0,
                toIndex: path.length - 1,
                fromNodeId: "",
                toNodeId: "",
                usedMw: 0,
                capacityMw: 0,
                ratio: 0,
                load: "idle",
                direction: 0,
              },
            ],
    };
  });
  return { lines, hotspots };
}

// --- objects ----------------------------------------------------------------

function cityClass(households: number): CitySizeClass {
  if (households < TOWN_MAX_HOUSEHOLDS) return "town";
  if (households < METRO_MIN_HOUSEHOLDS) return "city";
  return "metro";
}

function cityScale(households: number): number {
  return clamp01(
    Math.log(Math.max(1, households) / CITY_SCALE_MIN) / Math.log(CITY_SCALE_MAX / CITY_SCALE_MIN),
  );
}

function rotorOf(enabled: boolean, meanMs: number, maxMs: number): RotorState {
  if (!enabled) return "off";
  if (maxMs >= TURBINE.vOut) return "feathered";
  if (meanMs < TURBINE.vIn) return "still";
  return "spinning";
}

function siteOf(
  state: GameState,
  pending: PendingObject,
): { hex: HexCoord; kind: SiteKind; tech: WorldSite["tech"]; totalDays: number } | null {
  const find = <T extends { id: string; hex: HexCoord }>(list: readonly T[], id: string) =>
    list.find((item) => item.id === id)?.hex ?? null;
  const expansionDays = (days: number) => Math.max(1, Math.ceil(days * EXPANSION.timeShare));
  switch (pending.kind) {
    case "plant":
      return {
        hex: pending.plant.hex,
        kind: "plant",
        tech: pending.plant.tech,
        totalDays: PLANT_TECHS[pending.plant.tech].buildDays,
      };
    case "farm":
      return {
        hex: pending.farm.hex,
        kind: "farm",
        tech: pending.farm.tech,
        totalDays: farmSiting(pending.farm.tech, terrainAt(state, pending.farm.hex)).buildDays,
      };
    case "storage":
      return {
        hex: pending.storage.hex,
        kind: "storage",
        tech: pending.storage.tech,
        totalDays: STORAGE_TECHS[pending.storage.tech].buildDays,
      };
    case "junction":
      return {
        hex: pending.junction.hex,
        kind: "junction",
        tech: null,
        totalDays: JUNCTION_SPEC.buildDays,
      };
    case "border":
      return {
        hex: pending.border.hex,
        kind: "border",
        tech: null,
        totalDays: BORDER_SPEC.buildDays,
      };
    case "plantExpansion": {
      const plant = state.plants.find((p) => p.id === pending.plantId);
      const hex = plant?.hex ?? null;
      return hex && plant
        ? {
            hex,
            kind: "expansion",
            tech: plant.tech,
            totalDays: expansionDays(PLANT_TECHS[plant.tech].buildDays),
          }
        : null;
    }
    case "farmExpansion": {
      const farm = state.farms.find((f) => f.id === pending.farmId);
      return farm
        ? {
            hex: farm.hex,
            kind: "expansion",
            tech: farm.tech,
            totalDays: expansionDays(farmSiting(farm.tech, terrainAt(state, farm.hex)).buildDays),
          }
        : null;
    }
    case "storagePowerExpansion":
    case "storageCapacityExpansion": {
      const storage = state.storages.find((s) => s.id === pending.storageId);
      return storage
        ? {
            hex: storage.hex,
            kind: "expansion",
            tech: storage.tech,
            totalDays: expansionDays(STORAGE_TECHS[storage.tech].buildDays),
          }
        : null;
    }
    case "borderExpansion": {
      const hex = find(state.borders, pending.borderId);
      return hex
        ? { hex, kind: "expansion", tech: null, totalDays: BORDER_SPEC.moduleBuildDays }
        : null;
    }
  }
}

// --- overlay ----------------------------------------------------------------

/** What the interface asks the world to paint on top of the state. */
export interface WorldOverlayInput {
  selected?: HexCoord | null;
  hover?: HexCoord | null;
  route?: RoutePreview | null;
  bottleneck?: BottleneckRef | null;
}

export interface BuildWorldSceneOptions {
  /** Capture-only: show the day under another regime (docs/08 §7, banner). */
  weatherOverride?: RegimeId | null;
  /** Name of the module staged alone, or null in the game. */
  showcase?: string | null;
}

function buildOverlay(
  state: GameState,
  report: TurnReport | null,
  lines: WorldLine[],
  input: WorldOverlayInput,
  options: BuildWorldSceneOptions,
): WorldOverlay {
  const inside = (hex: HexCoord | null | undefined): HexRef | null =>
    hex && isInsideMap(state.map, hex) ? ref(hex) : null;

  let bottleneck: WorldOverlay["bottleneck"] = null;
  const target = input.bottleneck;
  if (target && report) {
    if (target.kind === "node") {
      const node = [...state.junctions, ...state.borders].find((item) => item.id === target.nodeId);
      if (node)
        bottleneck = { kind: "node", hexes: [ref(node.hex)], lineId: null, segmentKey: null };
    } else {
      const segment = report.segments.find((s) => s.segmentId === target.segmentId);
      const line = segment ? lines.find((l) => l.id === segment.lineId) : undefined;
      if (segment && line) {
        bottleneck = {
          kind: "segment",
          hexes: line.path.slice(segment.fromIndex, segment.toIndex + 1),
          lineId: line.id,
          segmentKey: segment.segmentId,
        };
      }
    }
  }

  const route = input.route;
  return {
    selection: inside(input.selected),
    hover: inside(input.hover),
    route:
      route && route.path.length > 0
        ? {
            path: route.path.map(ref),
            lineType: route.lineType,
            valid: route.valid,
            waypoints: route.waypoints.map(ref),
            label: route.label,
          }
        : null,
    bottleneck,
    showcase: options.showcase ?? null,
    weatherOverride: options.weatherOverride ?? null,
  };
}

// --- the builder ------------------------------------------------------------

export function buildWorldScene(
  state: GameState,
  report: TurnReport | null,
  overlay: WorldOverlayInput = {},
  options: BuildWorldSceneOptions = {},
): WorldScene {
  const shown = shownTurn(state, report);
  const time = buildTime(state, shown);
  const startHour = shown.turnIndex * HOURS_PER_TURN;
  const sun = buildSun(time.dayOfYear, time.hour);
  const weatherInput = {
    seed: state.seed,
    dayIndex: shown.dayIndex,
    dayOfYear: time.dayOfYear,
    month: time.month,
    startHour,
    night: sun.altitudeDeg < -6,
  };
  const weather = buildWeather(shown.truth, weatherInput, options.weatherOverride ?? null);
  // The drawn weather: a capture override is a "what if" regenerated by the
  // engine's own generator, and everything weather-driven must agree with it —
  // a staged storm frame feathers the rotors, it does not leave them becalmed
  // under a storm sky. The turn's NUMBERS stay the report's either way.
  const drawnWeather = weatherTruthFor(
    shown.truth,
    weatherInput,
    options.weatherOverride ?? null,
  ).weather;
  const board = buildBoard(state);
  const labels: WorldLabel[] = [];
  const notes: string[] = [];

  const { lines, hotspots } = buildLines(state, report, labels);
  const sourceRows = new Map((report?.sources ?? []).map((row) => [row.sourceId, row]));
  const cityRows = new Map((report?.cities ?? []).map((row) => [row.cityId, row]));
  const storageRows = new Map((report?.storages ?? []).map((row) => [row.storageId, row]));
  const borderRows = new Map((report?.borders ?? []).map((row) => [row.borderId, row]));
  const nodeRows = new Map((report?.nodes ?? []).map((row) => [row.nodeId, row]));

  // Weather the objects felt: the SHOWN day's truth, regenerated under a
  // capture override so the staged weather drives their motion as well.
  const feltWeather = drawnWeather;

  const plants: WorldPlant[] = state.plants.map((plant) => {
    const dynamics = PLANT_DYNAMICS[plant.tech];
    const outputMw = plant.blocks.reduce((sum, block) => sum + block.outputMw, 0);
    const usedMw = sourceRows.get(plant.id)?.usedMw ?? 0;
    const dumpMw = shown.report ? Math.max(0, outputMw - usedMw) : 0;
    const largest = PLANT_TECHS[plant.tech].blockMw.xlarge * 6;
    labels.push({
      key: `${plant.id}:label`,
      hex: ref(plant.hex),
      text: plantLabel(plant.name, plant.tech, plantOrderMw(plant), plant.capacityMw, dumpMw),
      tone: "default",
      kind: "object",
      muted: false,
      priority: 2,
      placement: "below",
    });
    return {
      id: plant.id,
      name: plant.name,
      hex: ref(plant.hex),
      tech: plant.tech,
      capacityMw: plant.capacityMw,
      blocks: plant.blocks.map((block, index) => ({
        index,
        mw: block.mw,
        status: block.status,
        setpointMw: block.setpointMw,
        outputMw: block.outputMw,
        load: block.mw > 0 ? clamp01(block.outputMw / block.mw) : 0,
        startupTurnsLeft: block.startupTurnsLeft,
        warmup:
          block.status === "online"
            ? 1
            : block.status === "starting"
              ? clamp01(1 - block.startupTurnsLeft / Math.max(1, dynamics.startupColdTurns))
              : 0,
      })),
      outputMw,
      usedMw,
      dumpMw,
      controlMode: plant.controlMode,
      automation: plant.automation,
      footprint: Math.max(0.15, clamp01(plant.capacityMw / largest)),
    };
  });

  const farms: WorldFarm[] = state.farms.map((farm) => {
    const terrain = terrainAt(state, farm.hex);
    const offshore = terrain === "sea";
    const windSeries = feltWeather.windMs[farm.windClass];
    const meanMs = farm.tech === "wind" ? blockAverage(windSeries, startHour) : 0;
    const maxMs = farm.tech === "wind" ? blockMax(windSeries, startHour) : 0;
    let potentialMw = 0;
    for (let h = 0; h < HOURS_PER_TURN; h++) {
      potentialMw += farmPowerMwAtHour(farm, feltWeather, startHour + h);
    }
    potentialMw /= HOURS_PER_TURN;
    // Under a capture override the day's weather is a "what if", so the farm's
    // power is recomputed from the engine's own curve on that weather — a
    // staged windy frame must not show spinning rotors with a 0 MW label.
    const overridden =
      options.weatherOverride !== null && options.weatherOverride !== shown.truth.regime;
    const producedMw = farm.enabled
      ? overridden
        ? potentialMw
        : (sourceRows.get(farm.id)?.offeredMw ?? potentialMw)
      : 0;
    const usedMw = overridden ? producedMw : (sourceRows.get(farm.id)?.usedMw ?? 0);
    const cap =
      farm.tech === "wind" && offshore
        ? OFFSHORE_WIND.maxMwPerHex
        : FARM_TECHS[farm.tech].maxMwPerHex;
    labels.push({
      key: `${farm.id}:label`,
      hex: ref(farm.hex),
      text: farmLabel(farm.name, farm.tech, shown.report ? producedMw : null),
      tone: "default",
      kind: "object",
      muted: false,
      priority: 2,
      placement: "below",
    });
    return {
      id: farm.id,
      name: farm.name,
      hex: ref(farm.hex),
      tech: farm.tech,
      capacityMw: farm.capacityMw,
      enabled: farm.enabled,
      offshore,
      windClass: farm.windClass,
      windMs: meanMs,
      powerFraction: farm.tech === "wind" ? turbinePowerFraction(meanMs) : 0,
      rotor: farm.tech === "wind" ? rotorOf(farm.enabled, meanMs, maxMs) : "off",
      rotorSpeed:
        farm.tech === "wind" && farm.enabled && maxMs < TURBINE.vOut
          ? clamp01((meanMs - TURBINE.vIn) / (TURBINE.vRated - TURBINE.vIn))
          : 0,
      producedMw,
      usedMw,
      curtailedMw: shown.report ? Math.max(0, producedMw - usedMw) : 0,
      units:
        farm.tech === "wind"
          ? Math.min(24, Math.max(2, Math.round(farm.capacityMw / TURBINE_MW)))
          : Math.min(16, Math.max(2, Math.round(farm.capacityMw / PV_ROW_MW))),
      footprint: clamp01(farm.capacityMw / cap),
    };
  });

  const storages: WorldStorage[] = state.storages.map((storage) => {
    const row = storageRows.get(storage.id);
    const setpoint = storage.setpoint;
    const flowMw = row ? row.dischargedMw - row.chargedMw : 0;
    const soc = storage.capacityMwh > 0 ? clamp01(storage.socMwh / storage.capacityMwh) : 0;
    const plannedMw =
      setpoint.mode === "discharge" ? setpoint.mw : setpoint.mode === "charge" ? -setpoint.mw : 0;
    labels.push({
      key: `${storage.id}:label`,
      hex: ref(storage.hex),
      text: storageLabel(storage.name, storage.tech, plannedMw, soc),
      tone: "default",
      kind: "object",
      muted: false,
      priority: 2,
      placement: "below",
    });
    return {
      id: storage.id,
      name: storage.name,
      hex: ref(storage.hex),
      tech: storage.tech,
      powerMw: storage.powerMw,
      capacityMwh: storage.capacityMwh,
      socMwh: storage.socMwh,
      soc,
      mode: setpoint.mode,
      setpointMw: setpoint.mw,
      dischargedMw: row?.dischargedMw ?? 0,
      chargedMw: row?.chargedMw ?? 0,
      flowMw,
      footprint: clamp01(storage.powerMw / STORAGE_TECHS[storage.tech].maxPowerMwPerHex),
    };
  });

  const census = lineCensus(state);
  const junctions: WorldJunction[] = state.junctions.map((junction) => {
    const key = hexKey(junction.hex);
    labels.push({
      key: `${junction.id}:label`,
      hex: ref(junction.hex),
      text: junction.name.toUpperCase(),
      tone: "default",
      kind: "object",
      muted: false,
      priority: 1,
      placement: "below",
    });
    return {
      id: junction.id,
      name: junction.name,
      hex: ref(junction.hex),
      slotsUsed: census.get(key)?.total ?? 0,
      slots: lineSlotsAt(state, key),
    };
  });

  const borders: WorldBorder[] = state.borders.map((border) => {
    const row = borderRows.get(border.id);
    const node = nodeRows.get(border.id);
    const { col, row: offsetRow } = axialToOffset(border.hex);
    const outward =
      col === 0
        ? { x: -1, z: 0 }
        : col === state.map.cols - 1
          ? { x: 1, z: 0 }
          : offsetRow === 0
            ? { x: 0, z: -1 }
            : { x: 0, z: 1 };
    labels.push({
      key: `${border.id}:label`,
      hex: ref(border.hex),
      text: borderLabel(border.name, border.importSetpointMw - border.exportSetpointMw),
      tone: "default",
      kind: "object",
      muted: false,
      priority: 2,
      placement: "below",
    });
    return {
      id: border.id,
      name: border.name,
      hex: ref(border.hex),
      throughputMw: border.throughputMw,
      importSetpointMw: border.importSetpointMw,
      exportSetpointMw: border.exportSetpointMw,
      importUsedMw: row?.importUsedMw ?? 0,
      exportDeliveredMw: row?.exportDeliveredMw ?? 0,
      usedMw: node?.usedMw ?? 0,
      ratio: node && node.throughputMw > 0 ? clamp01(node.usedMw / node.throughputMw) : 0,
      outward,
    };
  });

  const cities: WorldCity[] = state.cities.map((city) => {
    const row = cityRows.get(city.id);
    const demandMw = row?.demandMw ?? 0;
    const deliveredMw = row?.deliveredMw ?? 0;
    const ensMw = row?.ensMw ?? 0;
    const served = row && demandMw > 0 ? clamp01(deliveredMw / demandMw) : 1;
    const blackout = ensMw > IDLE_FLOW_MW;
    labels.push({
      key: `${city.id}:label`,
      hex: ref(city.hex),
      text: cityLabel(city.name, row ? demandMw : null),
      tone: blackout ? "danger" : "city",
      kind: "city",
      muted: !city.connected,
      priority: blackout ? 8 : 4,
      placement: "below",
    });
    if (blackout) {
      labels.push({
        key: `${city.id}:shortfall`,
        hex: ref(city.hex),
        text: `${shortfallLabel(ensMw)} ⚠`,
        tone: "danger",
        kind: "shortfall",
        muted: false,
        priority: 9,
        placement: "above",
      });
    }
    return {
      id: city.id,
      name: city.name,
      hex: ref(city.hex),
      households: city.households,
      firms: city.firms,
      sizeClass: cityClass(city.households),
      scale: cityScale(city.households),
      connected: city.connected,
      demandMw,
      deliveredMw,
      ensMw,
      served,
      lit: city.connected ? (row ? served : 1) : 0,
      blackout,
    };
  });

  const sites: WorldSite[] = [];
  const stacked = new Map<string, number>();
  for (const construction of state.constructions) {
    const site = siteOf(state, construction.pending);
    if (!site) continue;
    const key = hexKey(site.hex);
    const total = Math.max(site.totalDays, construction.remainingDays);
    const text =
      site.kind === "expansion"
        ? expansionLabel(construction.remainingDays)
        : buildLabel(construction.remainingDays);
    const order = stacked.get(key) ?? 0;
    stacked.set(key, order + 1);
    labels.push({
      key: `${construction.id}:build`,
      hex: ref(site.hex),
      text,
      tone: "default",
      kind: "site",
      muted: false,
      priority: 2,
      placement: "below",
    });
    sites.push({
      id: construction.id,
      hex: ref(site.hex),
      kind: site.kind,
      tech: site.tech,
      remainingDays: construction.remainingDays,
      totalDays: total,
      progress: clamp01(1 - construction.remainingDays / total),
    });
  }

  // Worst first; three alarms is the cap a strategic frame can carry.
  [...hotspots]
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .forEach((hot, index) => {
      labels.push({
        key: `overload:${index}`,
        hex: hot.hex,
        text: hot.text,
        tone: "danger",
        kind: "overload",
        muted: false,
        priority: 10 - index,
        placement: "above",
      });
    });

  const overlayModel = buildOverlay(state, report, lines, overlay, options);
  if (overlayModel.route) {
    const end = overlayModel.route.path[overlayModel.route.path.length - 1];
    if (end && overlayModel.route.label !== "") {
      labels.push({
        key: "route",
        hex: end,
        text: overlayModel.route.label,
        tone: overlayModel.route.valid ? "action" : "danger",
        kind: "route",
        muted: false,
        priority: 20,
        placement: "above",
      });
    }
  }

  if (report && lines.some((line) => line.segments.some((s) => s.usedMw > IDLE_FLOW_MW))) {
    notes.push(NOTE_FLOW_DIRECTION);
  }

  return {
    version: WORLD_SCENE_VERSION,
    seed: state.seed,
    time,
    board,
    sun,
    weather,
    lines,
    plants,
    farms,
    storages,
    junctions,
    borders,
    cities,
    sites,
    overlay: overlayModel,
    labels,
    notes,
  };
}

/** Which wind class the map gives a hex — for showcase and tests. */
export function windClassAt(state: GameState, hex: HexCoord): WindClass {
  return state.windClasses[hexKey(hex)] ?? "open";
}
