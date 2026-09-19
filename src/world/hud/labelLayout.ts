// Placement of the world-anchored labels (docs/08 §7): screen boxes in,
// screen boxes out. No DOM, no Three — the rules live here on their own so
// they can be reasoned about and tested without a renderer.
//
// Two classes of label. ALERTS (overload, shortfall, route) are never culled:
// they are placed first, pushed out of the HUD's surfaces and off each other,
// and tied to their object with a leader. Everything else takes the first free
// slot around its anchor — below, lower, beside, above — and yields to a higher
// priority or to a HUD surface; a label that had to leave its natural slot
// gets a leader too, so the text still reads as belonging to its object.
// Placed boxes are hard for leaders as well: a slot whose leader would cut
// across another label's text loses to a slot whose leader stays clear, and a
// label marked `led` (an object the dispatcher needs) is never dropped for
// lack of room — it is searched outward from its anchor and led back.
//
// Two classes of surface. HARD occluders are the shell (top bar, panel,
// ribbon, report): an object under them is out of the picture and keeps its
// name to itself. SOFT occluders are the world strips (weather, legend,
// diagnostics): translucent, over the board's corners — a label under one is
// pushed out from under it and led back to its object.

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelInput {
  key: string;
  /** Anchor on screen [px]: the object's ground point (below) or its top (above). */
  x: number;
  y: number;
  /** Vertical extent of the object's footprint on screen [px] — how far a "below" label steps down. */
  footprintPx: number;
  /** Box size at the size tier the label will be drawn in [px]. */
  width: number;
  height: number;
  priority: number;
  placement: "below" | "above";
  /** Never culled, always led. */
  alert: boolean;
  /** Anchor in front of the camera and inside the viewport. */
  visible: boolean;
  /**
   * Not dropped for lack of room: when every slot is taken the box is searched
   * outward from the anchor and led back. Names of objects the dispatcher
   * needs (plants, farms, storages, sites) — a muted city may still yield.
   */
  led?: boolean;
}

export interface Leader {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface LabelPlacement {
  key: string;
  visible: boolean;
  /** Centre of the box [px]. */
  x: number;
  y: number;
  /** Slot taken: 0 is the natural one; alerts pushed off it count from 1. */
  slot: number;
  /** Line from the box edge to the anchor; null when the box sits at its anchor. */
  leader: Leader | null;
}

export interface LayoutOptions {
  viewport: { width: number; height: number };
  /** The shell: labels never sit under it, objects under it keep quiet. */
  hard: readonly Rect[];
  /** The world strips: labels are pushed out from under them. */
  soft: readonly Rect[];
}

/** Air between two boxes [px]. */
const GAP = 3;
/** Keep-out from the viewport edges [px]. */
const MARGIN = 4;
/** Air between an "above" box and its anchor [px]. */
const ABOVE_GAP = 7;
/** Smallest and largest step a "below" label takes down from its anchor [px]. */
const BELOW_MIN = 9;
const BELOW_MAX = 48;
/** Sideways air between a beside-slot and the anchor [px]. */
const SIDE_GAP = 9;
/** Alerts pushed off every slot stack upward this many times before they overlap. */
const ALERT_NUDGES = 6;
/** A box moved farther than this from its slot gets a leader [px]. */
const LEADER_MIN_SHIFT = 2;
/** Outward search for a led label: rings this far apart, this many of them [px]. */
const RING_STEP = 16;
const RING_COUNT = 6;
/** Directions tried on every ring (evenly spaced, the first pointing down). */
const RING_DIRECTIONS = 12;

interface Slot {
  dx: number;
  dy: number;
}

interface Move {
  dx: number;
  dy: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function boxAt(x: number, y: number, width: number, height: number): Rect {
  return { x0: x - width / 2, y0: y - height / 2, x1: x + width / 2, y1: y + height / 2 };
}

function centre(box: Rect): { x: number; y: number } {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
}

function shifted(box: Rect, dx: number, dy: number): Rect {
  return { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy };
}

function intersects(a: Rect, b: Rect, pad: number): boolean {
  return a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function insideViewport(box: Rect, viewport: LayoutOptions["viewport"]): boolean {
  return (
    box.x0 >= MARGIN &&
    box.y0 >= MARGIN &&
    box.x1 <= viewport.width - MARGIN &&
    box.y1 <= viewport.height - MARGIN
  );
}

/** Offsets of the box centre from the anchor, in the order they are tried. */
function slotsFor(label: LabelInput): Slot[] {
  const { width, height } = label;
  const step = height + GAP;
  const side = width / 2 + SIDE_GAP;
  if (label.placement === "above") {
    const up = ABOVE_GAP + height / 2;
    return [
      { dx: 0, dy: -up },
      { dx: side, dy: -up * 0.6 },
      { dx: -side, dy: -up * 0.6 },
      { dx: 0, dy: -(up + step) },
      { dx: side, dy: -(up + step) },
      { dx: -side, dy: -(up + step) },
      { dx: 0, dy: -(up + 2 * step) },
    ];
  }
  const down = clamp(label.footprintPx, BELOW_MIN, BELOW_MAX) + height / 2;
  return [
    { dx: 0, dy: down },
    { dx: 0, dy: down + step },
    { dx: side, dy: down * 0.5 },
    { dx: -side, dy: down * 0.5 },
    { dx: 0, dy: -(ABOVE_GAP + height / 2) },
    { dx: side * 0.7, dy: down + step },
    { dx: -side * 0.7, dy: down + step },
    { dx: 0, dy: down + 2 * step },
  ];
}

/** The four displacements that take a box clear of one occluder: left, right, up, down. */
function escapes(box: Rect, occluder: Rect): Move[] {
  return [
    { dx: occluder.x0 - GAP - box.x1, dy: 0 },
    { dx: occluder.x1 + GAP - box.x0, dy: 0 },
    { dx: 0, dy: occluder.y0 - GAP - box.y1 },
    { dx: 0, dy: occluder.y1 + GAP - box.y0 },
  ];
}

function overlapping(box: Rect, occluders: readonly Rect[]): Rect[] {
  return occluders.filter((occluder) => intersects(box, occluder, GAP));
}

/**
 * Moves a box the shortest way out of every occluder it overlaps. Two
 * surfaces can meet (the panel and the report strip share a corner), so the
 * shortest way out of one may land in the other: escapes are searched one
 * and two moves deep and the shortest total that clears every surface wins.
 * When nothing clears, the box stays where it was — the caller decides
 * whether that is a hidden name or an alert that must still be shown.
 */
function pushOut(box: Rect, occluders: readonly Rect[], viewport: LayoutOptions["viewport"]): Rect {
  const blocking = overlapping(box, occluders);
  if (blocking.length === 0) return box;
  const clear: { box: Rect; cost: number }[] = [];
  const consider = (candidate: Rect, cost: number): boolean => {
    if (!insideViewport(candidate, viewport)) return false;
    if (overlapping(candidate, occluders).length > 0) return false;
    clear.push({ box: candidate, cost });
    return true;
  };
  for (const first of blocking) {
    for (const move of escapes(box, first)) {
      const once = shifted(box, move.dx, move.dy);
      const cost = Math.hypot(move.dx, move.dy);
      if (!insideViewport(once, viewport) || consider(once, cost)) continue;
      for (const second of overlapping(once, occluders)) {
        for (const again of escapes(once, second)) {
          consider(shifted(once, again.dx, again.dy), cost + Math.hypot(again.dx, again.dy));
        }
      }
    }
  }
  let best: { box: Rect; cost: number } | null = null;
  for (const candidate of clear) if (best === null || candidate.cost < best.cost) best = candidate;
  return best ? best.box : box;
}

function clampToViewport(box: Rect, viewport: LayoutOptions["viewport"]): Rect {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const x0 = clamp(box.x0, MARGIN, Math.max(MARGIN, viewport.width - MARGIN - width));
  const y0 = clamp(box.y0, MARGIN, Math.max(MARGIN, viewport.height - MARGIN - height));
  return { x0, y0, x1: x0 + width, y1: y0 + height };
}

/** Leader from the box edge nearest the anchor to the anchor itself. */
function leaderFor(box: Rect, anchorX: number, anchorY: number): Leader {
  const cx = (box.x0 + box.x1) / 2;
  if (box.y1 <= anchorY) return { fromX: cx, fromY: box.y1, toX: anchorX, toY: anchorY };
  if (box.y0 >= anchorY) return { fromX: cx, fromY: box.y0, toX: anchorX, toY: anchorY };
  const fromX = anchorX < cx ? box.x0 : box.x1;
  return { fromX, fromY: (box.y0 + box.y1) / 2, toX: anchorX, toY: anchorY };
}

function collides(box: Rect, placed: readonly Rect[]): boolean {
  return placed.some((other) => intersects(box, other, GAP));
}

/** Liang–Barsky: does the segment from (x0,y0) to (x1,y1) pass through the rect? */
function segmentCrosses(x0: number, y0: number, x1: number, y1: number, rect: Rect): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tMin = 0;
  let tMax = 1;
  const edges: [number, number][] = [
    [-dx, x0 - rect.x0],
    [dx, rect.x1 - x0],
    [-dy, y0 - rect.y0],
    [dy, rect.y1 - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) tMin = Math.max(tMin, t);
    else tMax = Math.min(tMax, t);
    if (tMin > tMax) return false;
  }
  return true;
}

/**
 * A leader drawn across another label's text is worse than a longer leader —
 * whether it is this box's leader over a placed box, or a placed label's
 * leader that this box would sit on.
 */
function leaderCrosses(
  box: Rect,
  label: LabelInput,
  placed: readonly Rect[],
  leaders: readonly Leader[],
): boolean {
  const lead = leaderFor(box, label.x, label.y);
  return (
    placed.some((other) => segmentCrosses(lead.fromX, lead.fromY, lead.toX, lead.toY, other)) ||
    leaders.some((other) => segmentCrosses(other.fromX, other.fromY, other.toX, other.toY, box))
  );
}

/** Ring offsets around the anchor, nearest ring first, downward first on each ring. */
function ringSlots(label: LabelInput): Slot[] {
  const slots: Slot[] = [];
  const base = Math.max(label.height, clamp(label.footprintPx, BELOW_MIN, BELOW_MAX));
  for (let ring = 1; ring <= RING_COUNT; ring++) {
    const radius = base + ring * RING_STEP;
    for (let i = 0; i < RING_DIRECTIONS; i++) {
      const angle = Math.PI / 2 + (i * 2 * Math.PI) / RING_DIRECTIONS;
      slots.push({
        dx: Math.cos(angle) * (radius + label.width / 2),
        dy: Math.sin(angle) * (radius + label.height / 2),
      });
    }
  }
  return slots;
}

function hidden(key: string): LabelPlacement {
  return { key, visible: false, x: 0, y: 0, slot: 0, leader: null };
}

function placement(label: LabelInput, box: Rect, slot: number, natural: Rect): LabelPlacement {
  const at = centre(box);
  const home = centre(natural);
  const moved = slot > 0 || Math.hypot(at.x - home.x, at.y - home.y) > LEADER_MIN_SHIFT;
  return {
    key: label.key,
    visible: true,
    x: at.x,
    y: at.y,
    slot,
    leader: moved || label.alert ? leaderFor(box, label.x, label.y) : null,
  };
}

/**
 * Lays out every label. Input order does not matter: alerts go first, then the
 * rest by priority (ties by key), so the result is a pure function of the
 * inputs — the same frame on any machine.
 */
export function layoutLabels(
  labels: readonly LabelInput[],
  options: LayoutOptions,
): LabelPlacement[] {
  const { viewport, hard, soft } = options;
  const occluders = [...hard, ...soft];
  const order = [...labels].sort(
    (a, b) =>
      Number(b.alert) - Number(a.alert) || b.priority - a.priority || (a.key < b.key ? -1 : 1),
  );
  const placed: Rect[] = [];
  const leaders: Leader[] = [];
  const out: LabelPlacement[] = [];

  for (const label of order) {
    if (!label.visible) {
      out.push(hidden(label.key));
      continue;
    }
    const slots = slotsFor(label);
    const first = slots[0] ?? { dx: 0, dy: 0 };
    const natural = boxAt(label.x + first.dx, label.y + first.dy, label.width, label.height);
    const candidate = (slot: Slot): Rect =>
      pushOut(
        clampToViewport(
          boxAt(label.x + slot.dx, label.y + slot.dy, label.width, label.height),
          viewport,
        ),
        occluders,
        viewport,
      );

    // A box is free when it stands clear of the crowd and the shell; it is
    // clean when its leader also stays off every other label's text. The
    // first clean box wins, the first free one is kept as a fallback.
    const search = (tried: readonly Rect[], offset: number): { box: Rect; slot: number } | null => {
      let fallback: { box: Rect; slot: number } | null = null;
      for (let i = 0; i < tried.length; i++) {
        const box = tried[i]!;
        if (!insideViewport(box, viewport)) continue;
        if (collides(box, occluders) || collides(box, placed)) continue;
        if (!leaderCrosses(box, label, placed, leaders)) return { box, slot: offset + i };
        if (fallback === null) fallback = { box, slot: offset + i };
      }
      return fallback;
    };

    if (label.alert) {
      // The slots, then a stack upward over the crowd, then the rings outward,
      // searched as one list: a clean box anywhere beats a free one nearer.
      // An alert is never dropped.
      const base = candidate(first);
      const nudged: Rect[] = [];
      for (let nudge = 1; nudge <= ALERT_NUDGES; nudge++) {
        nudged.push(
          pushOut(
            clampToViewport(shifted(base, 0, -(label.height + GAP) * nudge), viewport),
            occluders,
            viewport,
          ),
        );
      }
      const taken = search(
        [...slots.map(candidate), ...nudged, ...ringSlots(label).map(candidate)],
        0,
      );
      const box = taken ? taken.box : base;
      const slot = taken
        ? taken.slot
        : slots.length + ALERT_NUDGES + 1 + RING_COUNT * RING_DIRECTIONS;
      placed.push(box);
      const result = placement(label, box, slot, natural);
      if (result.leader) leaders.push(result.leader);
      out.push(result);
      continue;
    }

    // An object under the shell keeps its label to itself: a name floating
    // next to the panel would read as belonging to whatever stands beside it.
    if (hard.some((occluder) => contains(occluder, label.x, label.y))) {
      out.push(hidden(label.key));
      continue;
    }
    // A led label yields no slot to the crowd: its rings outward join the
    // search, and it is tied back with a leader.
    const taken = search(
      label.led
        ? [...slots.map(candidate), ...ringSlots(label).map(candidate)]
        : slots.map(candidate),
      0,
    );
    if (!taken) {
      out.push(hidden(label.key));
      continue;
    }
    placed.push(taken.box);
    const result = placement(label, taken.box, taken.slot, natural);
    if (result.leader) leaders.push(result.leader);
    out.push(result);
  }
  return out;
}
