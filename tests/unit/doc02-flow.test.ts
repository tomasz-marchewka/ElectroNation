import { describe, expect, test } from "vitest";
import {
  buildSegments,
  emptyResidual,
  runFlowPass,
  type FlowSink,
  type FlowSource,
  type NetworkLine,
  type NetworkNode,
} from "../../src/engine";

// Spec tests for docs/02 §2–§3 via the acceptance list in 02 §9.

function hexRow(count: number): { q: number; r: number }[] {
  return Array.from({ length: count }, (_, q) => ({ q, r: 0 }));
}

describe("doc 02 §9.3: losses on an 8-hex MV route", () => {
  // 8 hex steps = 200 km at 2%/100 km → efficiency 0.96 (01 §4.2 example).
  const nodes: NetworkNode[] = [
    { id: "plant", hex: { q: 0, r: 0 } },
    { id: "city", hex: { q: 8, r: 0 } },
  ];
  const lines: NetworkLine[] = [{ id: "l1", type: "mv", path: hexRow(9) }];
  const segments = buildSegments(nodes, lines);

  test("segment efficiency is 0.96", () => {
    expect(segments).toHaveLength(1);
    expect(segments[0]?.efficiency).toBeCloseTo(0.96, 12);
  });

  test("delivering 300 MW requires sending 312.5 MW", () => {
    const sources: FlowSource[] = [
      { id: "plant", nodeId: "plant", availableMw: 400, costPlnPerMwh: 350 },
    ];
    const sinks: FlowSink[] = [{ id: "city", nodeId: "city", demandMw: 300 }];
    const result = runFlowPass(segments, nodes, sources, sinks, emptyResidual());
    expect(result.deliveredMwBySink["city"]).toBeCloseTo(300, 6);
    expect(result.usedMwBySource["plant"]).toBeCloseTo(312.5, 6);
    expect(result.lossesMw).toBeCloseTo(12.5, 6);
  });
});

describe("doc 02 §9.2: merit order at the same distance", () => {
  const nodes: NetworkNode[] = [
    { id: "coal", hex: { q: 0, r: 0 } },
    { id: "city", hex: { q: 1, r: 0 } },
    { id: "ocgt", hex: { q: 2, r: 0 } },
  ];
  const lines: NetworkLine[] = [
    {
      id: "l1",
      type: "mv",
      path: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
    },
    {
      id: "l2",
      type: "mv",
      path: [
        { q: 2, r: 0 },
        { q: 1, r: 0 },
      ],
    },
  ];
  const segments = buildSegments(nodes, lines);

  test("cheap source is drained before the expensive one", () => {
    const sources: FlowSource[] = [
      { id: "ocgt", nodeId: "ocgt", availableMw: 200, costPlnPerMwh: 600 },
      { id: "coal", nodeId: "coal", availableMw: 100, costPlnPerMwh: 250 },
    ];
    const sinks: FlowSink[] = [{ id: "city", nodeId: "city", demandMw: 150 }];
    const result = runFlowPass(segments, nodes, sources, sinks, emptyResidual());
    expect(result.usedMwBySource["coal"]).toBeCloseTo(100, 6);
    // The remainder (after coal's line losses) comes from the peaker.
    expect(result.usedMwBySource["ocgt"]).toBeGreaterThan(0);
    expect(result.deliveredMwBySink["city"]).toBeCloseTo(150, 6);
  });
});

describe("doc 02 §9.4–9.5: nearest city first, tap in passing", () => {
  // One LV line from the plant THROUGH cityNear (tap) to cityFar.
  const nodes: NetworkNode[] = [
    { id: "plant", hex: { q: 0, r: 0 } },
    { id: "cityNear", hex: { q: 2, r: 0 } },
    { id: "cityFar", hex: { q: 5, r: 0 } },
  ];
  const lines: NetworkLine[] = [{ id: "l1", type: "lv", path: hexRow(6) }];
  const segments = buildSegments(nodes, lines);

  test("the passing line taps the mid-route city into two segments", () => {
    expect(segments.map((s) => [s.from, s.to])).toStrictEqual([
      ["plant", "cityNear"],
      ["cityNear", "cityFar"],
    ]);
  });

  test("with a short pool, the near city is whole and the far one eats the deficit", () => {
    const sources: FlowSource[] = [
      { id: "plant", nodeId: "plant", availableMw: 100, costPlnPerMwh: 250 },
    ];
    const sinks: FlowSink[] = [
      { id: "cityNear", nodeId: "cityNear", demandMw: 80 },
      { id: "cityFar", nodeId: "cityFar", demandMw: 80 },
    ];
    const result = runFlowPass(segments, nodes, sources, sinks, emptyResidual());
    expect(result.deliveredMwBySink["cityNear"]).toBeCloseTo(80, 6);
    // Remaining pool after serving near city: ~18.37 MW at the source, minus
    // losses over the full 5-hex LV route — far city is visibly short.
    const far = result.deliveredMwBySink["cityFar"] ?? 0;
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(20);
    expect(result.usedMwBySource["plant"]).toBeCloseTo(100, 6);
  });
});

describe("doc 02 §9.6: thick lines, thin node", () => {
  // Two 500 MW corridors meet in a 250 MW node. Since 0.21 a junction station
  // carries no throughput at all — a border point is the only capped node
  // left (01 §5.7), and this is the flow layer's rule for every one of them.
  const nodes: NetworkNode[] = [
    { id: "plant", hex: { q: 0, r: 0 } },
    { id: "border", hex: { q: 1, r: 0 }, throughputMw: 250 },
    { id: "city", hex: { q: 2, r: 0 } },
  ];
  const lines: NetworkLine[] = [
    {
      id: "l1",
      type: "mv",
      path: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
    },
    {
      id: "l2",
      type: "mv",
      path: [
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ],
    },
  ];
  const segments = buildSegments(nodes, lines);

  test("node throughput caps the corridor", () => {
    const sources: FlowSource[] = [
      { id: "plant", nodeId: "plant", availableMw: 500, costPlnPerMwh: 250 },
    ];
    const sinks: FlowSink[] = [{ id: "city", nodeId: "city", demandMw: 400 }];
    const result = runFlowPass(segments, nodes, sources, sinks, emptyResidual());
    const delivered = result.deliveredMwBySink["city"] ?? 0;
    // ≤ 250 MW enters the node; the last 25 km of MV losses follow.
    expect(delivered).toBeLessThanOrEqual(250);
    expect(delivered).toBeCloseTo(250 * (1 - 0.02 * 0.25), 6);
  });
});

describe("doc 02 §9.1: flow determinism vs input order", () => {
  const nodes: NetworkNode[] = [
    { id: "a", hex: { q: 0, r: 0 } },
    { id: "b", hex: { q: 2, r: 0 } },
    { id: "cityX", hex: { q: 1, r: 0 } },
    { id: "cityY", hex: { q: 3, r: 0 } },
  ];
  const lines: NetworkLine[] = [{ id: "l1", type: "lv", path: hexRow(4) }];

  test("shuffled sources/sinks produce the identical result", () => {
    const sources: FlowSource[] = [
      { id: "a", nodeId: "a", availableMw: 90, costPlnPerMwh: 250 },
      { id: "b", nodeId: "b", availableMw: 90, costPlnPerMwh: 250 },
    ];
    const sinks: FlowSink[] = [
      { id: "cityX", nodeId: "cityX", demandMw: 100 },
      { id: "cityY", nodeId: "cityY", demandMw: 100 },
    ];
    const segments = buildSegments(nodes, lines);
    const forward = runFlowPass(segments, nodes, sources, sinks, emptyResidual());
    const shuffled = runFlowPass(
      segments,
      nodes,
      [...sources].reverse(),
      [...sinks].reverse(),
      emptyResidual(),
    );
    expect(shuffled).toStrictEqual(forward);
  });
});
