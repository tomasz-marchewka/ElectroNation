// Network graph and power flow per docs/02 §2–§3: lines split into segments at
// every object on their route (taps), junction/border nodes carry a throughput
// cap, and the flow is resolved by successive cheapest paths — lexicographic
// objective (delivered energy first, then cost = variable cost / path
// efficiency), fully deterministic tie-breaks.

import { KM_PER_HEX, LINE_TYPES, type LineType } from "./config";

export interface HexCoord {
  q: number;
  r: number;
}

export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

export interface NetworkNode {
  id: string;
  hex: HexCoord;
  /** Node throughput cap [MW] — junctions and border points (02 §2). */
  throughputMw?: number;
}

export interface NetworkLine {
  id: string;
  type: LineType;
  /** Chain of hexes from one endpoint object to the other, inclusive. */
  path: HexCoord[];
}

export interface Segment {
  id: string;
  from: string;
  to: string;
  capacityMw: number;
  /** 1 − loss% × km/100 for this segment's length (02 §2). */
  efficiency: number;
}

/**
 * Splits lines into node-to-node segments. Every hex on a line's path that
 * holds an object becomes a node on the route (01 §3.3 — a passing line taps
 * the object). Path endpoints must be objects.
 */
export function buildSegments(
  nodes: NetworkNode[],
  lines: NetworkLine[],
): Segment[] {
  const byHex = new Map<string, string>();
  for (const node of nodes) byHex.set(hexKey(node.hex), node.id);

  const segments: Segment[] = [];
  for (const line of lines) {
    const spec = LINE_TYPES[line.type];
    const stops: { index: number; nodeId: string }[] = [];
    line.path.forEach((hex, index) => {
      const nodeId = byHex.get(hexKey(hex));
      if (nodeId !== undefined) stops.push({ index, nodeId });
    });
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (!a || !b) continue;
      const km = (b.index - a.index) * KM_PER_HEX;
      segments.push({
        id: `${line.id}:${i}`,
        from: a.nodeId,
        to: b.nodeId,
        capacityMw: spec.capacityMw,
        efficiency: 1 - (spec.lossPctPer100km / 100) * (km / 100),
      });
    }
  }
  return segments;
}

export interface FlowSource {
  id: string;
  nodeId: string;
  availableMw: number;
  costPlnPerMwh: number;
}

export interface FlowSink {
  id: string;
  nodeId: string;
  demandMw: number;
}

/** Capacity usage shared between the turn's flow passes (02 §4). */
export interface FlowResidual {
  segmentUsedMw: Record<string, number>;
  nodeUsedMw: Record<string, number>;
}

export function emptyResidual(): FlowResidual {
  return { segmentUsedMw: {}, nodeUsedMw: {} };
}

export interface FlowResult {
  deliveredMwBySink: Record<string, number>;
  usedMwBySource: Record<string, number>;
  lossesMw: number;
}

const EPS = 1e-6;
const MAX_PUSHES = 10_000;

interface PathStep {
  segment: Segment;
  /** Node reached by traversing the segment. */
  nodeId: string;
}

interface BestPath {
  efficiency: number;
  steps: PathStep[];
}

/**
 * Deterministic max-efficiency Dijkstra from a source node. Efficiencies are
 * compared multiplicatively (no logarithms — transcendental functions could
 * order ties differently across JS engines). Extending a path only lowers its
 * efficiency (factors ≤ 1), so the greedy expansion is exact.
 */
function bestPathsFrom(
  startNode: string,
  segmentsByNode: Map<string, Segment[]>,
  nodeCapById: Map<string, number>,
  residual: FlowResidual,
): Map<string, BestPath> {
  const best = new Map<string, BestPath>();
  const done = new Set<string>();
  best.set(startNode, { efficiency: 1, steps: [] });

  const nodeBlocked = (nodeId: string): boolean => {
    const cap = nodeCapById.get(nodeId);
    if (cap === undefined) return false;
    return cap - (residual.nodeUsedMw[nodeId] ?? 0) <= EPS;
  };

  for (;;) {
    let currentId: string | undefined;
    let currentEff = -1;
    for (const [nodeId, path] of best) {
      if (done.has(nodeId)) continue;
      if (
        path.efficiency > currentEff ||
        (path.efficiency === currentEff && (currentId === undefined || nodeId < currentId))
      ) {
        currentId = nodeId;
        currentEff = path.efficiency;
      }
    }
    if (currentId === undefined) break;
    done.add(currentId);
    const current = best.get(currentId);
    if (!current) break;

    for (const segment of segmentsByNode.get(currentId) ?? []) {
      const free = segment.capacityMw - (residual.segmentUsedMw[segment.id] ?? 0);
      if (free <= EPS) continue;
      const nextId = segment.from === currentId ? segment.to : segment.from;
      if (done.has(nextId) || nodeBlocked(nextId)) continue;
      const efficiency = current.efficiency * segment.efficiency;
      if (efficiency <= 0) continue;
      const existing = best.get(nextId);
      if (existing === undefined || efficiency > existing.efficiency) {
        best.set(nextId, {
          efficiency,
          steps: [...current.steps, { segment, nodeId: nextId }],
        });
      }
    }
  }
  return best;
}

/**
 * One flow pass (02 §3.2): repeatedly picks the (source, sink) pair with the
 * lowest delivered-MWh cost — ties broken by higher path efficiency, then
 * source id, then sink id — and pushes as much as the path allows. Capacity
 * usage accumulates in `residual`, shared across the turn's passes.
 */
export function runFlowPass(
  segments: Segment[],
  nodes: NetworkNode[],
  sources: FlowSource[],
  sinks: FlowSink[],
  residual: FlowResidual,
): FlowResult {
  const segmentsByNode = new Map<string, Segment[]>();
  for (const segment of [...segments].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    for (const nodeId of [segment.from, segment.to]) {
      const list = segmentsByNode.get(nodeId) ?? [];
      list.push(segment);
      segmentsByNode.set(nodeId, list);
    }
  }
  const nodeCapById = new Map<string, number>();
  for (const node of nodes) {
    if (node.throughputMw !== undefined) nodeCapById.set(node.id, node.throughputMw);
  }

  const remainingBySource = new Map(sources.map((s) => [s.id, s.availableMw]));
  const remainingBySink = new Map(sinks.map((s) => [s.id, s.demandMw]));
  const result: FlowResult = {
    deliveredMwBySink: Object.fromEntries(sinks.map((s) => [s.id, 0])),
    usedMwBySource: Object.fromEntries(sources.map((s) => [s.id, 0])),
    lossesMw: 0,
  };

  const orderedSources = [...sources].sort((a, b) => (a.id < b.id ? -1 : 1));
  const orderedSinks = [...sinks].sort((a, b) => (a.id < b.id ? -1 : 1));

  for (let push = 0; push < MAX_PUSHES; push++) {
    let bestChoice:
      | {
          source: FlowSource;
          sink: FlowSink;
          path: BestPath;
          cost: number;
        }
      | undefined;

    for (const source of orderedSources) {
      if ((remainingBySource.get(source.id) ?? 0) <= EPS) continue;
      const paths = bestPathsFrom(source.nodeId, segmentsByNode, nodeCapById, residual);
      for (const sink of orderedSinks) {
        if ((remainingBySink.get(sink.id) ?? 0) <= EPS) continue;
        const path = paths.get(sink.nodeId);
        if (!path) continue;
        const cost = source.costPlnPerMwh / path.efficiency;
        if (
          bestChoice === undefined ||
          cost < bestChoice.cost ||
          (cost === bestChoice.cost && path.efficiency > bestChoice.path.efficiency)
        ) {
          bestChoice = { source, sink, path, cost };
        }
      }
    }
    if (!bestChoice) break;

    const { source, sink, path } = bestChoice;
    // Suffix efficiencies: power sent into step i per MW delivered = 1/suffix[i].
    const steps = path.steps;
    const suffix: number[] = new Array<number>(steps.length + 1).fill(1);
    for (let i = steps.length - 1; i >= 0; i--) {
      suffix[i] = (suffix[i + 1] ?? 1) * (steps[i]?.segment.efficiency ?? 1);
    }
    const pathEfficiency = suffix[0] ?? 1;

    let delta = Math.min(
      remainingBySink.get(sink.id) ?? 0,
      (remainingBySource.get(source.id) ?? 0) * pathEfficiency,
    );
    const sourceCap = nodeCapById.get(source.nodeId);
    if (sourceCap !== undefined) {
      delta = Math.min(
        delta,
        (sourceCap - (residual.nodeUsedMw[source.nodeId] ?? 0)) * pathEfficiency,
      );
    }
    steps.forEach((step, i) => {
      const free = step.segment.capacityMw - (residual.segmentUsedMw[step.segment.id] ?? 0);
      delta = Math.min(delta, free * (suffix[i] ?? 1));
      const nodeCap = nodeCapById.get(step.nodeId);
      if (nodeCap !== undefined) {
        const nodeFree = nodeCap - (residual.nodeUsedMw[step.nodeId] ?? 0);
        delta = Math.min(delta, nodeFree * (suffix[i + 1] ?? 1));
      }
    });

    // Feasibility above guarantees every bound is at least EPS × efficiency,
    // so a genuinely blocked pair cannot loop here.
    if (delta <= 1e-9) break;

    steps.forEach((step, i) => {
      residual.segmentUsedMw[step.segment.id] =
        (residual.segmentUsedMw[step.segment.id] ?? 0) + delta / (suffix[i] ?? 1);
      if (nodeCapById.has(step.nodeId)) {
        residual.nodeUsedMw[step.nodeId] =
          (residual.nodeUsedMw[step.nodeId] ?? 0) + delta / (suffix[i + 1] ?? 1);
      }
    });
    if (sourceCap !== undefined) {
      residual.nodeUsedMw[source.nodeId] =
        (residual.nodeUsedMw[source.nodeId] ?? 0) + delta / pathEfficiency;
    }

    const drawn = delta / pathEfficiency;
    remainingBySource.set(source.id, (remainingBySource.get(source.id) ?? 0) - drawn);
    remainingBySink.set(sink.id, (remainingBySink.get(sink.id) ?? 0) - delta);
    result.usedMwBySource[source.id] = (result.usedMwBySource[source.id] ?? 0) + drawn;
    result.deliveredMwBySink[sink.id] = (result.deliveredMwBySink[sink.id] ?? 0) + delta;
    result.lossesMw += drawn - delta;
  }

  return result;
}
