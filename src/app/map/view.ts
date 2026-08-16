// Pan and zoom arithmetic of the map, kept pure so it can be tested without a
// DOM. The view is the ONE transformation the renderer puts on its root group
// (CLAUDE.md): world point p renders at `p × scale + (x, y)`.

import type { Point, Size } from "./geometry";

export interface View {
  scale: number;
  x: number;
  y: number;
}

/** 1:1 is as close as the map goes — hexes are drawn at the design's r = 34 px. */
export const MAX_SCALE = 1;

/** How much one wheel notch changes the scale. */
export const ZOOM_STEP = 1.15;

function usable(size: Size): boolean {
  return size.width > 0 && size.height > 0;
}

/**
 * Scale at which the whole board fits the viewport — the starting view (M5:
 * the 24×16 map does not fit 1060×640 at r = 34). Never above 1:1.
 */
export function fitScale(world: Size, viewport: Size): number {
  if (!usable(world) || !usable(viewport)) return MAX_SCALE;
  return Math.min(viewport.width / world.width, viewport.height / world.height, MAX_SCALE);
}

/**
 * Keeps the board inside the viewport: an axis smaller than the viewport is
 * centered, a larger one may only be dragged between its own edges.
 */
export function clampView(view: View, world: Size, viewport: Size): View {
  const clampAxis = (offset: number, extent: number, available: number): number => {
    const painted = extent * view.scale;
    if (painted <= available) return (available - painted) / 2;
    return Math.min(0, Math.max(available - painted, offset));
  };
  return {
    scale: view.scale,
    x: clampAxis(view.x, world.width, viewport.width),
    y: clampAxis(view.y, world.height, viewport.height),
  };
}

/** The whole board, centered — the view the map opens on. */
export function fitView(world: Size, viewport: Size): View {
  const scale = fitScale(world, viewport);
  return clampView({ scale, x: 0, y: 0 }, world, viewport);
}

/** Drags the board by a viewport-space delta. */
export function panView(view: View, world: Size, viewport: Size, by: Point): View {
  return clampView({ scale: view.scale, x: view.x + by.x, y: view.y + by.y }, world, viewport);
}

/**
 * Zooms by `factor` around a viewport point, so the world point under the
 * cursor stays put. Scale is clamped between "everything visible" and 1:1.
 */
export function zoomView(view: View, world: Size, viewport: Size, factor: number, at: Point): View {
  const minScale = fitScale(world, viewport);
  const scale = Math.min(MAX_SCALE, Math.max(minScale, view.scale * factor));
  const ratio = scale / view.scale;
  return clampView(
    {
      scale,
      x: at.x - (at.x - view.x) * ratio,
      y: at.y - (at.y - view.y) * ratio,
    },
    world,
    viewport,
  );
}
