// World geometry (ARCHITECTURE.md §5): 1 unit = 1 km, +Y up, north = −Z,
// east = +X. Flat-top hexes in the engine's odd-q offset layout with a pitch of
// 25 km between neighbouring centres (01 §3.1). Nobody else converts between
// hexes and world coordinates — every module and the interaction layer come
// here, so a single formula decides where a hex is.

/** Distance between the centres of two neighbouring hexes [km]. */
export const HEX_PITCH_KM = 25;

/** Circumradius of a flat-top hex with that pitch [km]. */
export const HEX_RADIUS_KM = HEX_PITCH_KM / Math.sqrt(3);

/** Column step (1.5 × R) and row step (the pitch) [km]. */
export const COLUMN_STEP_KM = 1.5 * HEX_RADIUS_KM;
export const ROW_STEP_KM = HEX_PITCH_KM;

export interface GroundPoint {
  x: number;
  z: number;
}

export interface OffsetHex {
  col: number;
  row: number;
}

export interface AxialHex {
  q: number;
  r: number;
}

/** Axial → offset (odd-q), the engine's own convention (src/engine/map.ts). */
export function axialToOffset(hex: AxialHex): OffsetHex {
  return { col: hex.q, row: hex.r + Math.floor(hex.q / 2) };
}

export function offsetToAxial(offset: OffsetHex): AxialHex {
  return { q: offset.col, r: offset.row - Math.floor(offset.col / 2) };
}

/** Ground-plane centre of a hex addressed in offset coordinates. */
export function hexCenter(col: number, row: number): GroundPoint {
  return {
    x: COLUMN_STEP_KM * col,
    z: ROW_STEP_KM * row + (col % 2 !== 0 ? ROW_STEP_KM / 2 : 0),
  };
}

/** Ground-plane centre of a hex addressed the way the engine addresses it. */
export function hexToWorld(hex: AxialHex): GroundPoint {
  const { col, row } = axialToOffset(hex);
  return hexCenter(col, row);
}

/** Size of a board of cols × rows hexes [km], edge to edge. */
export function boardSize(cols: number, rows: number): { width: number; depth: number } {
  return {
    width: COLUMN_STEP_KM * Math.max(0, cols - 1) + 2 * HEX_RADIUS_KM,
    depth: ROW_STEP_KM * Math.max(0, rows - 1) + ROW_STEP_KM + (cols > 1 ? ROW_STEP_KM / 2 : 0),
  };
}

/** Centre of the board [km] — what the strategic camera looks at. */
export function boardCenter(cols: number, rows: number): GroundPoint {
  const size = boardSize(cols, rows);
  return { x: size.width / 2 - HEX_RADIUS_KM, z: size.depth / 2 - ROW_STEP_KM / 2 };
}

function cubeRound(x: number, y: number, z: number): { q: number; r: number } {
  let rx = Math.round(x);
  const ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  // The axis with the largest rounding error is recomputed from the other two;
  // only q and r are returned, so a corrected y needs no assignment.
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (!(dy > dz)) rz = -rx - ry;
  return { q: rx, r: rz };
}

/**
 * Nearest hex to a ground-plane point — the inverse of {@link hexToWorld}.
 * Flat-top axial: x = 1.5·R·q, z = √3·R·(r + q/2).
 */
export function worldToHex(point: GroundPoint): AxialHex {
  const q = point.x / COLUMN_STEP_KM;
  const r = point.z / ROW_STEP_KM - q / 2;
  return cubeRound(q, -q - r, r);
}

/** Corners of a flat-top hex around its centre, clockwise from due east. */
export function hexCorners(center: GroundPoint, radius = HEX_RADIUS_KM): GroundPoint[] {
  const corners: GroundPoint[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    corners.push({
      x: center.x + radius * Math.cos(angle),
      z: center.z + radius * Math.sin(angle),
    });
  }
  return corners;
}

/** Perpendicular offset [km] of lane `index` of `count` sharing one corridor. */
export function laneOffsetKm(index: number, count: number, spacingKm = 1.8, maxFanKm = 12): number {
  if (count <= 1) return 0;
  const spacing = Math.min(spacingKm, maxFanKm / (count - 1));
  return (index - (count - 1) / 2) * spacing;
}

/** Steps between two hexes on the grid — the axial distance (01 §3.1). */
export function hexDistance(a: AxialHex, b: AxialHex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}
