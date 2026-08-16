// Map geometry in SVG pixels, ported from the design handoff
// (design-system/components/map/routing.js + HexMap.jsx): flat-top hexes of
// r = 34 px laid out in odd-q offset columns, every odd column half a step
// lower. The values below are the design system's and stay untouched.
//
// Addressing is the engine's: the game speaks axial (q, r) (01 §3.1), the
// layout speaks offset (col, row), and `axialToOffset` in src/engine/map.ts is
// the ONLY place that converts between them — hence the import instead of a
// second copy of the formula here.

import { axialToOffset, type HexCoord, type MapSize, type OffsetCoord } from "../../engine";

export const HEX_R = 34;
export const STEP_X = 51;
export const STEP_Y = 59;
export const HEX_PATH = "M-34 0 L-17 -29.5 L17 -29.5 L34 0 L17 29.5 L-17 29.5 Z";

/** Perpendicular gap between parallel tracks sharing one corridor [px]. */
export const CORRIDOR_SPACING = 9;

/**
 * Widest fan a corridor may spread across. 01 §3.3 allows 9 lines of one type
 * through a hex, which at the handoff's 9 px would need 72 px inside a hex
 * 59 px wide — HexMap.prompt.md flags exactly this. Up to 6 tracks (45 px) the
 * handoff's spacing is used unchanged; a seventh and beyond shrink it to fit.
 */
export const MAX_CORRIDOR_FAN = 45;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Center of a hex addressed in offset coordinates (handoff `hexCenter`). */
export function hexCenter(col: number, row: number): Point {
  return { x: HEX_R + STEP_X * col, y: (col % 2 ? STEP_Y : STEP_Y / 2) + STEP_Y * row };
}

/** Center of a hex addressed the way the engine addresses it (axial). */
export function hexCenterOf(hex: HexCoord): Point {
  const { col, row } = axialToOffset(hex);
  return hexCenter(col, row);
}

/**
 * Pixel bounds of the whole board. Odd columns hang half a step lower, so on a
 * map with more than one column the bottom edge belongs to an odd column.
 */
export function worldSize(map: MapSize): Size {
  const lastCol = Math.max(0, map.cols - 1);
  const lastRow = Math.max(0, map.rows - 1);
  const deepestCol = map.cols > 1 ? 1 : 0;
  return {
    width: hexCenter(lastCol, 0).x + HEX_R,
    height: hexCenter(deepestCol, lastRow).y + STEP_Y / 2,
  };
}

/** Sub-pixel precision of routed points — the handoff rounds to 0.1 px. */
function round01(value: number): number {
  return Math.round(value * 10) / 10;
}

function offsetKey(offset: OffsetCoord): string {
  return `${offset.col},${offset.row}`;
}

/** Undirected key of the corridor between two neighboring hexes. */
function corridorKey(a: OffsetCoord, b: OffsetCoord): string {
  const first = offsetKey(a);
  const second = offsetKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

export interface RoutableLine {
  id: string;
  /** Explicit hex chain of the line (02 §2) — never guessed by interpolation. */
  path: readonly HexCoord[];
}

export interface RoutedLine {
  id: string;
  /** One point per hex of the line's path, already offset within its corridor. */
  points: Point[];
}

/**
 * Turns hex chains into polylines through hex centers, spreading lines that
 * share a corridor into parallel tracks (handoff `routeLines`). The engine
 * gives the route explicitly, so no `hexLine` interpolation is involved: a
 * line's own path is drawn, hex by hex.
 */
export function routeLines(lines: readonly RoutableLine[]): RoutedLine[] {
  const paths = lines.map((line) => line.path.map(axialToOffset));

  // Which lines share each corridor, in the order they were handed in.
  const corridors = new Map<string, number[]>();
  paths.forEach((path, lineIndex) => {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (!a || !b) continue;
      const key = corridorKey(a, b);
      const users = corridors.get(key);
      if (users) users.push(lineIndex);
      else corridors.set(key, [lineIndex]);
    }
  });

  return paths.map((path, lineIndex) => {
    // Perpendicular shift of this line inside every corridor it runs through.
    const shifts: Point[] = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (!a || !b) continue;
      const users = corridors.get(corridorKey(a, b)) ?? [lineIndex];
      const spacing =
        users.length > 1 ? Math.min(CORRIDOR_SPACING, MAX_CORRIDOR_FAN / (users.length - 1)) : 0;
      const offset = (users.indexOf(lineIndex) - (users.length - 1) / 2) * spacing;
      // Direction is taken along the corridor's own orientation (lower key
      // first), so every line in it is shifted to a consistent side.
      const forward = offsetKey(a) < offsetKey(b);
      const from = hexCenter(forward ? a.col : b.col, forward ? a.row : b.row);
      const to = hexCenter(forward ? b.col : a.col, forward ? b.row : a.row);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      shifts.push({ x: (-dy / length) * offset, y: (dx / length) * offset });
    }

    const points = path.map((hex, i) => {
      const center = hexCenter(hex.col, hex.row);
      const before = shifts[i - 1];
      const after = shifts[i];
      // Ends follow their only corridor; a turn averages the two it joins.
      const shift =
        before && after
          ? { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 }
          : (before ?? after ?? { x: 0, y: 0 });
      return { x: round01(center.x + shift.x), y: round01(center.y + shift.y) };
    });

    return { id: lines[lineIndex]?.id ?? "", points };
  });
}
