// Pan/zoom arithmetic of the map. One transformation, so the rules are simple:
// the board opens fitted, never zooms past 1:1 and never leaves the frame.

import { describe, expect, test } from "vitest";
import {
  MAX_SCALE,
  clampView,
  fitScale,
  fitView,
  panView,
  zoomView,
} from "../../../src/app/map/view";

// The 24×16 board (02 §8.6), with no label reaching past it.
const WORLD = { x: 0, y: 0, width: 1241, height: 973.5 };
const VIEWPORT = { width: 1060, height: 640 };

describe("starting view: the whole board", () => {
  test("fit is the tighter of the two axes, capped at 1:1", () => {
    expect(fitScale(WORLD, VIEWPORT)).toBeCloseTo(VIEWPORT.height / WORLD.height, 6);
    // A board smaller than the viewport is not blown up.
    expect(fitScale({ x: 0, y: 0, width: 200, height: 100 }, VIEWPORT)).toBe(MAX_SCALE);
  });

  test("the fitted board is centered and fully inside the viewport", () => {
    const view = fitView(WORLD, VIEWPORT);
    expect(view.x).toBeCloseTo((VIEWPORT.width - WORLD.width * view.scale) / 2, 6);
    expect(view.y).toBeCloseTo(0, 6);
    expect(WORLD.width * view.scale).toBeLessThanOrEqual(VIEWPORT.width + 1e-9);
    expect(WORLD.height * view.scale).toBeLessThanOrEqual(VIEWPORT.height + 1e-9);
  });

  test("an unmeasured viewport does not produce a broken scale", () => {
    expect(fitScale(WORLD, { width: 0, height: 0 })).toBe(MAX_SCALE);
  });
});

describe("panning", () => {
  test("a board larger than the viewport may only slide between its edges", () => {
    const zoomed = { scale: 1, x: 0, y: 0 };
    const dragged = panView(zoomed, WORLD, VIEWPORT, { x: 400, y: 400 });
    expect(dragged.x).toBe(0);
    expect(dragged.y).toBe(0);
    const far = panView(zoomed, WORLD, VIEWPORT, { x: -5000, y: -5000 });
    expect(far.x).toBeCloseTo(VIEWPORT.width - WORLD.width, 6);
    expect(far.y).toBeCloseTo(VIEWPORT.height - WORLD.height, 6);
  });

  test("an axis that fits stays centered whatever the drag", () => {
    const fitted = fitView(WORLD, VIEWPORT);
    const dragged = panView(fitted, WORLD, VIEWPORT, { x: 300, y: 300 });
    expect(dragged.x).toBeCloseTo(fitted.x, 6);
    expect(dragged.y).toBeCloseTo(fitted.y, 6);
  });
});

describe("zooming", () => {
  test("clamped between fit and 1:1", () => {
    const fitted = fitView(WORLD, VIEWPORT);
    const out = zoomView(fitted, WORLD, VIEWPORT, 0.25, { x: 500, y: 300 });
    expect(out.scale).toBeCloseTo(fitted.scale, 6);
    let view = fitted;
    for (let step = 0; step < 20; step++) {
      view = zoomView(view, WORLD, VIEWPORT, 2, { x: 500, y: 300 });
    }
    expect(view.scale).toBe(MAX_SCALE);
  });

  test("the world point under the cursor stays under the cursor", () => {
    const fitted = fitView(WORLD, VIEWPORT);
    // Away from the edges, where the frame clamp has nothing to correct.
    const at = { x: 500, y: 300 };
    const before = { x: (at.x - fitted.x) / fitted.scale, y: (at.y - fitted.y) / fitted.scale };
    const zoomed = zoomView(fitted, WORLD, VIEWPORT, 1.5, at);
    const after = { x: (at.x - zoomed.x) / zoomed.scale, y: (at.y - zoomed.y) / zoomed.scale };
    // The x axis is free at this scale; y is still clamped to the frame.
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(zoomed.scale).toBeGreaterThan(fitted.scale);
  });

  test("clamping keeps the board in the frame after a zoom at the edge", () => {
    const zoomed = zoomView(fitView(WORLD, VIEWPORT), WORLD, VIEWPORT, 3, { x: 0, y: 0 });
    const framed = clampView(zoomed, WORLD, VIEWPORT);
    expect(framed).toEqual(zoomed);
    expect(zoomed.x).toBeLessThanOrEqual(0);
    expect(zoomed.x).toBeGreaterThanOrEqual(VIEWPORT.width - WORLD.width * zoomed.scale - 1e-9);
  });
});

describe("labels reaching past the board", () => {
  // An object on the outermost column writes its label past the board's edge:
  // the drawn box starts left of the origin and ends right of the last hex.
  const CONTENT = { x: -66, y: 0, width: WORLD.width + 132, height: WORLD.height + 22 };
  /** Where the viewport's left and right edges sit in world coordinates. */
  const visible = (view: { scale: number; x: number }) => ({
    left: -view.x / view.scale,
    right: (VIEWPORT.width - view.x) / view.scale,
  });

  test("the fitted view shows the overhang, not just the board", () => {
    const view = fitView(CONTENT, VIEWPORT);
    const seen = visible(view);
    expect(seen.left).toBeLessThanOrEqual(CONTENT.x + 1e-9);
    expect(seen.right).toBeGreaterThanOrEqual(CONTENT.x + CONTENT.width - 1e-9);
  });

  test("zoomed in, the overhanging label is still reachable", () => {
    const zoomed = { scale: 1, x: 0, y: 0 };
    // Dragged as far right as the clamp allows: the left overhang comes in.
    const left = panView(zoomed, CONTENT, VIEWPORT, { x: 5000, y: 0 });
    expect(visible(left).left).toBeCloseTo(CONTENT.x, 6);
    // And as far left: the right overhang comes in.
    const right = panView(zoomed, CONTENT, VIEWPORT, { x: -5000, y: 0 });
    expect(visible(right).right).toBeCloseTo(CONTENT.x + CONTENT.width, 6);
  });

  test("an axis that fits is centered on the drawn box, overhang included", () => {
    const narrow = { x: -40, y: 0, width: 200, height: 100 };
    const view = fitView(narrow, VIEWPORT);
    const seen = visible(view);
    expect((seen.left + seen.right) / 2).toBeCloseTo(narrow.x + narrow.width / 2, 6);
  });
});
