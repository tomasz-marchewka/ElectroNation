// Flow direction on the segments of the last report — a HEURISTIC, and
// labelled as one everywhere it is used (WorldSegment.direction, docs/STATUS.json
// blockedEngineRequests). The report says how much flowed on a segment, never
// which way: `usedMw` is unsigned. Power leaves producing nodes and arrives at
// consuming ones, so over the loaded segments alone the hop distance from the
// nearest producer orders most segments unambiguously; a segment between two
// nodes at the same distance stays 0 (unknown) rather than guessed.

import type { TurnReport } from "../../engine";
import { IDLE_FLOW_MW } from "../../app/map/sceneModel";

export type FlowDirection = 1 | -1 | 0;

/** Nodes that fed the flow this turn: every source the flow actually drew from. */
export function producingNodes(report: TurnReport): Set<string> {
  const nodes = new Set<string>();
  for (const source of report.sources) {
    if (source.usedMw > IDLE_FLOW_MW) nodes.add(source.sourceId);
  }
  return nodes;
}

/**
 * Direction per segment id: +1 from `fromNodeId` to `toNodeId`, −1 the other
 * way, 0 idle or undecidable.
 */
export function segmentDirections(report: TurnReport): Map<string, FlowDirection> {
  const producers = producingNodes(report);
  const loaded = report.segments.filter((segment) => segment.usedMw > IDLE_FLOW_MW);
  const adjacency = new Map<string, string[]>();
  for (const segment of loaded) {
    adjacency.set(segment.fromNodeId, [
      ...(adjacency.get(segment.fromNodeId) ?? []),
      segment.toNodeId,
    ]);
    adjacency.set(segment.toNodeId, [
      ...(adjacency.get(segment.toNodeId) ?? []),
      segment.fromNodeId,
    ]);
  }

  // Multi-source BFS in id order, so the answer is replay-stable.
  const distance = new Map<string, number>();
  const queue: string[] = [...producers].filter((id) => adjacency.has(id)).sort();
  for (const id of queue) distance.set(id, 0);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const next = distance.get(current)! + 1;
    for (const neighbour of [...(adjacency.get(current) ?? [])].sort()) {
      if (distance.has(neighbour)) continue;
      distance.set(neighbour, next);
      queue.push(neighbour);
    }
  }

  const directions = new Map<string, FlowDirection>();
  for (const segment of report.segments) {
    if (!(segment.usedMw > IDLE_FLOW_MW)) {
      directions.set(segment.segmentId, 0);
      continue;
    }
    const from = distance.get(segment.fromNodeId);
    const to = distance.get(segment.toNodeId);
    if (from === undefined || to === undefined || from === to) {
      directions.set(segment.segmentId, 0);
    } else {
      directions.set(segment.segmentId, from < to ? 1 : -1);
    }
  }
  return directions;
}
