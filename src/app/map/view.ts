// Pan and zoom arithmetic of the map, kept pure so it can be tested without a
// DOM. The view is the ONE transformation the renderer puts on its root group
// (CLAUDE.md): world point p renders at `p × scale + (x, y)`.
//
// What is fitted and clamped is the DRAWN extent (`drawnBounds`), not the board
// alone: labels hang past the board's edges, and a box that starts left of or
// above the origin has to stay reachable, hence bounds rather than a size.

import type { Bounds, Point, Size } from "./geometry";

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
 * Scale at which everything drawn fits the viewport — the starting view (M5:
 * the 24×16 map does not fit 1060×640 at r = 34). Never above 1:1.
 */
export function fitScale(content: Bounds, viewport: Size): number {
  if (!usable(content) || !usable(viewport)) return MAX_SCALE;
  return Math.min(viewport.width / content.width, viewport.height / content.height, MAX_SCALE);
}

/**
 * Keeps what is drawn inside the viewport: an axis smaller than the viewport is
 * centered, a larger one may only be dragged between its own edges.
 */
export function clampView(view: View, content: Bounds, viewport: Size): View {
  const clampAxis = (offset: number, origin: number, extent: number, available: number): number => {
    const painted = extent * view.scale;
    // The content starts at `origin`, so every limit shifts with it. Written as
    // `0 - start` rather than `-start`, which would hand a "-0" to the renderer.
    const start = origin * view.scale;
    const nearEdge = 0 - start;
    const farEdge = available - painted - start;
    if (painted <= available) return (available - painted) / 2 - start;
    return Math.min(nearEdge, Math.max(farEdge, offset));
  };
  return {
    scale: view.scale,
    x: clampAxis(view.x, content.x, content.width, viewport.width),
    y: clampAxis(view.y, content.y, content.height, viewport.height),
  };
}

/** Everything drawn, centered — the view the map opens on. */
export function fitView(content: Bounds, viewport: Size): View {
  const scale = fitScale(content, viewport);
  return clampView({ scale, x: 0, y: 0 }, content, viewport);
}

/** Drags the board by a viewport-space delta. */
export function panView(view: View, content: Bounds, viewport: Size, by: Point): View {
  return clampView({ scale: view.scale, x: view.x + by.x, y: view.y + by.y }, content, viewport);
}

/**
 * Zooms by `factor` around a viewport point, so the world point under the
 * cursor stays put. Scale is clamped between "everything visible" and 1:1.
 */
export function zoomView(
  view: View,
  content: Bounds,
  viewport: Size,
  factor: number,
  at: Point,
): View {
  const minScale = fitScale(content, viewport);
  const scale = Math.min(MAX_SCALE, Math.max(minScale, view.scale * factor));
  const ratio = scale / view.scale;
  return clampView(
    {
      scale,
      x: at.x - (at.x - view.x) * ratio,
      y: at.y - (at.y - view.y) * ratio,
    },
    content,
    viewport,
  );
}
