// Scene model of the map: GameState (+ the turn report the player is looking
// at) in, plain JSON-able data out. No JSX, no DOM, no engine calls with side
// effects — the renderer only paints what it is handed, which is what keeps a
// Canvas/Pixi swap local (CLAUDE.md) and lets the tests snapshot the model
// instead of markup.
//
// Everything measured comes from the LAST RESOLVED turn (01 §2.3): before the
// first resolution the map shows the world without any flow — lines are idle
// and labels carry only what the state itself knows (setpoints, SOC, sizes).

import {
  HOURS_PER_TURN,
  TURNS_PER_DAY,
  hexKey,
  isInsideMap,
  isLineBuilt,
  offsetToAxial,
  type CityState,
  type FarmState,
  type GameState,
  type HexCoord,
  type LineType,
  type PendingObject,
  type PlantState,
  type TurnReport,
} from "../../engine";
import { formatMw, formatNumber, formatPercent, formatSignedNumber } from "../format";
import {
  FARM_TECH_LABELS,
  LINE_TYPE_LABELS,
  PLANT_TECH_LABELS,
  STORAGE_TECH_LABELS,
  daysLabel,
} from "../labels";
import { TERRAIN_BIOMES, biomeLegend, type BiomeLegendEntry, type BiomeSlug } from "./biomes";
import { hexCenter, hexCenterOf, routeLines, worldSize, type Point, type Size } from "./geometry";

// --- Load coding (01 §8 pt 1, brand-lines) ----------------------------------
// Colour codes load, thickness codes the line type; the two never mix.

/** Above this share of the segment's capacity the line turns warn. */
export const LOAD_WARN_RATIO = 0.75;
/** At or above this share the line is at its limit. */
export const LOAD_OVER_RATIO = 0.995;
/** Flow below this reads as no flow at all [MW] — report values are ±0,001. */
export const IDLE_FLOW_MW = 0.01;

export type LineLoad = "ok" | "warn" | "over" | "idle";

export function lineLoad(usedMw: number, capacityMw: number): LineLoad {
  if (!(usedMw > IDLE_FLOW_MW) || !(capacityMw > 0)) return "idle";
  const ratio = usedMw / capacityMw;
  if (ratio >= LOAD_OVER_RATIO) return "over";
  if (ratio > LOAD_WARN_RATIO) return "warn";
  return "ok";
}

// --- Scene ------------------------------------------------------------------

/** Icon set of the handoff (HexMap.jsx `ICONS`) plus the nuclear plant. */
export type MapObjectKind =
  "nuclear" | "coal" | "gas" | "wind" | "pv" | "bess" | "node" | "city" | "town" | "border";

/**
 * Ring drawn around an object's hex: `object` and `city` are the handoff's two
 * weights, `alert` is a city in deficit, `planned` marks a construction site.
 */
export type MapObjectRing = "object" | "city" | "alert" | "planned";

export type MapLabelTone = "default" | "city" | "danger";

export interface MapSceneHex {
  /** Engine hex key ("q,r") — stable identity of the tile. */
  key: string;
  hex: HexCoord;
  col: number;
  row: number;
  x: number;
  y: number;
  biome: BiomeSlug;
}

export interface MapSceneSegment {
  key: string;
  load: LineLoad;
  /** Polyline through the hex centers of this stretch of the route. */
  points: Point[];
}

export interface MapSceneLine {
  id: string;
  type: LineType;
  /** Still under construction (01 §2.6) — drawn as a dashed idle track. */
  planned: boolean;
  segments: MapSceneSegment[];
}

export interface MapSceneObject {
  id: string;
  x: number;
  y: number;
  kind: MapObjectKind;
  ring: MapObjectRing;
}

export interface MapSceneLabel {
  key: string;
  x: number;
  y: number;
  text: string;
  tone: MapLabelTone;
}

/** A piece of text the map writes next to a place on the board. */
export interface MapSceneCallout {
  x: number;
  y: number;
  text: string;
}

export type MapSceneOverload = MapSceneCallout;

export interface MapSceneSelection extends Point {
  /** Engine hex key of the selected tile — matches `MapSceneHex.key`. */
  key: string;
}

/** The route being drawn right now (01 §3.3, M7) — a preview, not a line yet. */
export interface MapSceneRoute {
  /** Polyline through the hex centers of the previewed route. */
  points: Point[];
  lineType: LineType;
  /** The engine would accept it; a blocked route is drawn in the danger tone. */
  valid: boolean;
  /** Stops the player pinned by hand, drawn as markers on the route. */
  waypoints: Point[];
  /** Price and build time, written at the cursor end of the route. */
  label: MapSceneCallout | null;
}

/** What POKAŻ WĄSKIE GARDŁO paints: one segment, or one node's hex. */
export interface MapSceneHighlight {
  kind: "segment" | "node";
  points: Point[];
}

export interface MapScene {
  /**
   * Pixel size of the board. The view fits it together with the labels around
   * it (`drawnBounds`), which reach past its edges.
   */
  world: Size;
  hexes: MapSceneHex[];
  lines: MapSceneLine[];
  objects: MapSceneObject[];
  labels: MapSceneLabel[];
  /** The selected hex, if one is selected and it exists on this map. */
  selection: MapSceneSelection | null;
  overload: MapSceneOverload | null;
  route: MapSceneRoute | null;
  highlight: MapSceneHighlight | null;
  biomeLegend: BiomeLegendEntry[];
  scaleLabel: string;
}

/** The route the player is drawing, as the app's routing module computed it. */
export interface RoutePreview {
  path: readonly HexCoord[];
  /** Stops pinned by hand — a subset of the path (01 §3.3). */
  waypoints: readonly HexCoord[];
  lineType: LineType;
  valid: boolean;
  /** Cost and time, e.g. `1,20 mld zł · 3 DOBY`. */
  label: string;
}

/** What the interface asks the map to paint on top of the world (M7). */
export interface MapSceneOverlay {
  route?: RoutePreview | null;
  bottleneck?: BottleneckRef | null;
}

/** What POKAŻ WĄSKIE GARDŁO points at — the tightest place in the report. */
export type BottleneckRef =
  | { kind: "segment"; segmentId: string }
  | { kind: "node"; nodeId: string };

/**
 * The tightest spot of the resolved turn: the segment or capped node closest
 * to its limit. Ties resolve by id, so one report always points at one place.
 */
export function worstBottleneck(report: TurnReport): BottleneckRef | null {
  const candidates: { ratio: number; id: string; ref: BottleneckRef }[] = [];
  for (const segment of report.segments) {
    if (!(segment.capacityMw > 0) || !(segment.usedMw > IDLE_FLOW_MW)) continue;
    candidates.push({
      ratio: segment.usedMw / segment.capacityMw,
      id: segment.segmentId,
      ref: { kind: "segment", segmentId: segment.segmentId },
    });
  }
  for (const node of report.nodes) {
    if (!(node.throughputMw > 0) || !(node.usedMw > IDLE_FLOW_MW)) continue;
    candidates.push({
      ratio: node.usedMw / node.throughputMw,
      id: node.nodeId,
      ref: { kind: "node", nodeId: node.nodeId },
    });
  }
  candidates.sort((a, b) => b.ratio - a.ratio || a.id.localeCompare(b.id));
  return candidates[0]?.ref ?? null;
}

// --- Placement constants ----------------------------------------------------

/**
 * Distance from a hex center down to its label's baseline. The handoff places
 * labels by hand between 45 and 48,5 px below the center (sampleWorld.js); one
 * constant in the middle of that range keeps a generated map even.
 */
const LABEL_DY = 48;

/** Leading of a second label line under the first (mono 10,5 px). */
const LABEL_LINE = 13;

/** How far a construction label sits above its line's track. */
const LINE_LABEL_DY = -8;

/** Offset of the overload callout from its segment's midpoint (handoff). */
const OVERLOAD_DX = 15;
const OVERLOAD_DY = 15;

/** Same offset for the routing callout, measured off the route's last hex. */
const ROUTE_LABEL_DX = 15;
const ROUTE_LABEL_DY = -15;

/** Build progress a line makes per game day: 8 turns × 3 h (01 §2.6). */
const BUILD_HOURS_PER_DAY = TURNS_PER_DAY * HOURS_PER_TURN;

/**
 * Upper bound of the "small city" class of 05 §5 — below it the map draws the
 * smaller town icon, above it the city one.
 */
const TOWN_MAX_HOUSEHOLDS = 170_000;

export const SCALE_LABEL = "1 HEKS = 25 KM";

// --- Labels -----------------------------------------------------------------

/**
 * `EC MODRZYCA CCGT · 320/400`. Object names are player data (Polish); the
 * technology is a suffix of the name, the measured parts follow after `·`.
 * Map labels drop the unit and the spaces of the setpoint copy rule — the
 * handoff's own samples are `EW JARNOWO · 800/900` and the field is dense.
 */
function objectLabel(name: string, tech: string | null, ...parts: (string | null)[]): string {
  const head = tech === null ? name.toUpperCase() : `${name.toUpperCase()} ${tech}`;
  return [head, ...parts.filter((part): part is string => part !== null)].join(" · ");
}

function ratioLabel(value: number, max: number): string {
  return `${formatNumber(value)}/${formatNumber(max)}`;
}

// --- Object mapping ---------------------------------------------------------

const PLANT_ICONS: Record<PlantState["tech"], MapObjectKind> = {
  nuclear: "nuclear",
  coal: "coal",
  // OCGT and CCGT share the gas icon — the technology is a label suffix.
  ccgt: "gas",
  ocgt: "gas",
};

const FARM_ICONS: Record<FarmState["tech"], MapObjectKind> = {
  wind: "wind",
  pv: "pv",
};

function cityKind(city: CityState): MapObjectKind {
  return city.households < TOWN_MAX_HOUSEHOLDS ? "town" : "city";
}

/** Site of a construction that puts a NEW object on the map (never expansion). */
function pendingSite(pending: PendingObject): { hex: HexCoord; kind: MapObjectKind } | null {
  switch (pending.kind) {
    case "plant":
      return { hex: pending.plant.hex, kind: PLANT_ICONS[pending.plant.tech] };
    case "farm":
      return { hex: pending.farm.hex, kind: FARM_ICONS[pending.farm.tech] };
    case "storage":
      return { hex: pending.storage.hex, kind: "bess" };
    case "junction":
      return { hex: pending.junction.hex, kind: "node" };
    case "border":
      return { hex: pending.border.hex, kind: "border" };
    default:
      return null;
  }
}

/** Hex of the object an expansion upgrades in place (01 §7). */
function expansionSite(pending: PendingObject, state: GameState): HexCoord | null {
  const find = <T extends { id: string; hex: HexCoord }>(list: readonly T[], id: string) =>
    list.find((item) => item.id === id)?.hex ?? null;
  switch (pending.kind) {
    case "plantExpansion":
      return find(state.plants, pending.plantId);
    case "farmExpansion":
      return find(state.farms, pending.farmId);
    case "batteryExpansion":
    case "pumpedExpansion":
      return find(state.storages, pending.storageId);
    case "junctionExpansion":
      return find(state.junctions, pending.junctionId);
    case "borderExpansion":
      return find(state.borders, pending.borderId);
    default:
      return null;
  }
}

// --- Scene builder ----------------------------------------------------------

function buildHexes(state: GameState): MapSceneHex[] {
  const hexes: MapSceneHex[] = [];
  for (let col = 0; col < state.map.cols; col++) {
    for (let row = 0; row < state.map.rows; row++) {
      const hex = offsetToAxial({ col, row });
      const key = hexKey(hex);
      const { x, y } = hexCenter(col, row);
      // Every hex has a biome — an unpainted tile is still terrain (01 §3.2).
      hexes.push({
        key,
        hex,
        col,
        row,
        x,
        y,
        biome: TERRAIN_BIOMES[state.terrain[key] ?? "plains"],
      });
    }
  }
  return hexes;
}

function midpoint(points: readonly Point[]): Point | null {
  if (points.length === 0) return null;
  const half = (points.length - 1) / 2;
  const before = points[Math.floor(half)];
  const after = points[Math.ceil(half)];
  if (!before || !after) return null;
  return { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 };
}

/** Whole game days still needed to finish a line (01 §2.6). */
function lineRemainingDays(builtHours: number, totalHours: number): number {
  return Math.max(0, Math.ceil((totalHours - builtHours) / BUILD_HOURS_PER_DAY));
}

/** The previewed route as the renderer takes it: pixels, not hexes. */
function buildRoute(preview: RoutePreview | null | undefined): MapSceneRoute | null {
  if (!preview || preview.path.length === 0) return null;
  const points = preview.path.map(hexCenterOf);
  const end = points[points.length - 1];
  return {
    points,
    lineType: preview.lineType,
    valid: preview.valid,
    waypoints: preview.waypoints.map(hexCenterOf),
    label:
      end && preview.label !== ""
        ? { x: end.x + ROUTE_LABEL_DX, y: end.y + ROUTE_LABEL_DY, text: preview.label }
        : null,
  };
}

/** The one place the player asked to see, taken straight from the report. */
function buildHighlight(
  state: GameState,
  report: TurnReport | null,
  routes: Map<string, Point[]>,
  ref: BottleneckRef | null | undefined,
): MapSceneHighlight | null {
  if (!ref || !report) return null;
  if (ref.kind === "node") {
    const node = [...state.junctions, ...state.borders].find((item) => item.id === ref.nodeId);
    return node ? { kind: "node", points: [hexCenterOf(node.hex)] } : null;
  }
  const segment = report.segments.find((candidate) => candidate.segmentId === ref.segmentId);
  if (!segment) return null;
  const points = (routes.get(segment.lineId) ?? []).slice(segment.fromIndex, segment.toIndex + 1);
  return points.length > 0 ? { kind: "segment", points } : null;
}

export function buildMapScene(
  state: GameState,
  report: TurnReport | null,
  selected: HexCoord | null,
  overlay: MapSceneOverlay = {},
): MapScene {
  const objects: MapSceneObject[] = [];
  const labels: MapSceneLabel[] = [];

  // --- lines ---------------------------------------------------------------
  const routes = new Map(routeLines(state.lines).map((route) => [route.id, route.points]));
  const reportedSegments = new Map<string, TurnReport["segments"]>();
  for (const segment of report?.segments ?? []) {
    const list = reportedSegments.get(segment.lineId);
    if (list) list.push(segment);
    else reportedSegments.set(segment.lineId, [segment]);
  }

  // Every segment at its limit is a candidate for the overload callout; the
  // hottest one gets it (01 §8 pt 1).
  const overloaded: { ratio: number; text: string; at: Point }[] = [];
  const lines: MapSceneLine[] = state.lines.map((line) => {
    const points = routes.get(line.id) ?? [];
    const planned = !isLineBuilt(line);
    // A finished line the report does not mention carries no flow: either the
    // turn has not been resolved yet or the line was built after it.
    const reported = planned ? [] : (reportedSegments.get(line.id) ?? []);

    if (planned) {
      const at = midpoint(points);
      if (at) {
        labels.push({
          key: `${line.id}:build`,
          x: at.x,
          y: at.y + LINE_LABEL_DY,
          text: `BUDOWA · ${daysLabel(lineRemainingDays(line.builtHours, line.totalHours))}`,
          tone: "default",
        });
      }
    }

    const segments: MapSceneSegment[] = reported.map((segment) => {
      const stretch = points.slice(segment.fromIndex, segment.toIndex + 1);
      const ratio = segment.capacityMw > 0 ? segment.usedMw / segment.capacityMw : 0;
      const at = midpoint(stretch);
      if (at && ratio >= LOAD_OVER_RATIO) {
        const load = ratioLabel(segment.usedMw, segment.capacityMw);
        overloaded.push({ ratio, at, text: `${LINE_TYPE_LABELS[line.type]} ${load} ⚠` });
      }
      return {
        key: segment.segmentId,
        load: lineLoad(segment.usedMw, segment.capacityMw),
        points: stretch,
      };
    });

    return {
      id: line.id,
      type: line.type,
      planned,
      segments:
        segments.length > 0 ? segments : [{ key: `${line.id}:whole`, load: "idle", points }],
    };
  });

  // --- objects -------------------------------------------------------------
  const cityRows = new Map((report?.cities ?? []).map((row) => [row.cityId, row]));
  const sourceRows = new Map((report?.sources ?? []).map((row) => [row.sourceId, row]));
  const nodeRows = new Map((report?.nodes ?? []).map((row) => [row.nodeId, row]));

  const addObject = (
    id: string,
    hex: HexCoord,
    kind: MapObjectKind,
    ring: MapObjectRing,
    text: string,
    tone: MapLabelTone = "default",
  ): void => {
    const { x, y } = hexCenterOf(hex);
    objects.push({ id, x, y, kind, ring });
    labels.push({ key: `${id}:label`, x, y: y + LABEL_DY, text, tone });
  };

  for (const city of state.cities) {
    const row = cityRows.get(city.id);
    const deficit = (row?.ensMw ?? 0) > 0;
    addObject(
      city.id,
      city.hex,
      cityKind(city),
      deficit ? "alert" : "city",
      objectLabel(city.name, null, row ? formatMw(row.demandMw) : null),
      deficit ? "danger" : "city",
    );
  }

  for (const plant of state.plants) {
    addObject(
      plant.id,
      plant.hex,
      PLANT_ICONS[plant.tech],
      "object",
      objectLabel(
        plant.name,
        PLANT_TECH_LABELS[plant.tech],
        ratioLabel(plant.setpointMw, plant.capacityMw),
      ),
    );
  }

  for (const farm of state.farms) {
    // Production is weather truth, so it only exists once a turn is resolved;
    // `~` marks it as a weather-driven number (handoff `FW GRZBIET · ~320`).
    const produced = sourceRows.get(farm.id)?.offeredMw;
    addObject(
      farm.id,
      farm.hex,
      FARM_ICONS[farm.tech],
      "object",
      objectLabel(
        farm.name,
        FARM_TECH_LABELS[farm.tech],
        produced === undefined ? null : `~${formatNumber(produced)}`,
      ),
    );
  }

  for (const storage of state.storages) {
    // Sign convention of the handoff: `+` feeds the grid, `−` draws from it.
    const setpoint = storage.setpoint;
    const flowMw =
      setpoint.mode === "discharge" ? setpoint.mw : setpoint.mode === "charge" ? -setpoint.mw : 0;
    const soc = storage.capacityMwh > 0 ? (storage.socMwh / storage.capacityMwh) * 100 : 0;
    addObject(
      storage.id,
      storage.hex,
      "bess",
      "object",
      objectLabel(
        storage.name,
        STORAGE_TECH_LABELS[storage.tech],
        formatSignedNumber(flowMw),
        `SOC ${formatPercent(soc)}`,
      ),
    );
  }

  for (const junction of state.junctions) {
    const row = nodeRows.get(junction.id);
    addObject(
      junction.id,
      junction.hex,
      "node",
      "object",
      objectLabel(junction.name, null, row ? ratioLabel(row.usedMw, row.throughputMw) : null),
    );
  }

  for (const border of state.borders) {
    addObject(
      border.id,
      border.hex,
      "border",
      "object",
      objectLabel(
        border.name,
        null,
        formatSignedNumber(border.importSetpointMw - border.exportSetpointMw),
      ),
    );
  }

  // --- construction in progress --------------------------------------------
  // Not in the handoff: a site is drawn as a ghost object (idle ring) with a
  // countdown, an expansion as a second label line under the object it grows.
  // Tokens and copy rules only — flagged for the designer's decision.
  const expansionNotes = new Map<string, number>();
  for (const construction of state.constructions) {
    const site = pendingSite(construction.pending);
    const countdown = daysLabel(construction.remainingDays);
    if (site) {
      addObject(construction.id, site.hex, site.kind, "planned", `BUDOWA · ${countdown}`);
      continue;
    }
    const hex = expansionSite(construction.pending, state);
    if (!hex) continue;
    const key = hexKey(hex);
    const stacked = expansionNotes.get(key) ?? 0;
    expansionNotes.set(key, stacked + 1);
    const { x, y } = hexCenterOf(hex);
    labels.push({
      key: `${construction.id}:build`,
      x,
      y: y + LABEL_DY + LABEL_LINE * (stacked + 1),
      text: `ROZBUDOWA · ${countdown}`,
      tone: "default",
    });
  }

  const hottest = overloaded.reduce<(typeof overloaded)[number] | null>(
    (worst, candidate) => (worst === null || candidate.ratio > worst.ratio ? candidate : worst),
    null,
  );

  return {
    world: worldSize(state.map),
    hexes: buildHexes(state),
    lines,
    objects,
    labels,
    selection:
      selected && isInsideMap(state.map, selected)
        ? { key: hexKey(selected), ...hexCenterOf(selected) }
        : null,
    overload:
      hottest === null
        ? null
        : { x: hottest.at.x + OVERLOAD_DX, y: hottest.at.y + OVERLOAD_DY, text: hottest.text },
    route: buildRoute(overlay.route),
    highlight: buildHighlight(state, report, routes, overlay.bottleneck),
    biomeLegend: biomeLegend(),
    scaleLabel: SCALE_LABEL,
  };
}
