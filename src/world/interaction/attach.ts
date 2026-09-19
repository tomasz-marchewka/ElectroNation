// Pointer and keyboard interaction on the world canvas (docs/08 §8): hex
// picking through the renderer, camera control on the rig. Baseline wired by
// the integrator; the interaction module refines it. Nothing here touches the
// engine or the store — the host passes callbacks.

import type { AxialHex } from "../render/core/units";
import type { WorldRenderer } from "../render/core/WorldRenderer";
import type { CameraPreset } from "../render/core/CameraRig";

export interface InteractionHandlers {
  onHexClick: (hex: AxialHex) => void;
  onHexHover: (hex: AxialHex | null) => void;
  /** `F` — fly to the selected hex, if the host has one. */
  selectedHex: () => AxialHex | null;
}

/** Drag distance that turns a click into a pan [px]. */
const CLICK_SLOP = 4;
/** Wheel notch → distance factor. */
const ZOOM_STEP = 1.12;
/** Orbit sensitivity [deg/px]. */
const ORBIT_YAW = 0.35;
const ORBIT_PITCH = 0.25;

const PRESET_KEYS: Record<string, CameraPreset> = {
  "1": "strategic",
  "2": "overview",
  "3": "north",
};

export function attachInteraction(
  renderer: WorldRenderer,
  canvas: HTMLCanvasElement,
  handlers: InteractionHandlers,
): () => void {
  let drag: {
    pointerId: number;
    button: number;
    x: number;
    y: number;
    moved: number;
    ground: { x: number; z: number } | null;
  } | null = null;
  let lastHoverKey: string | null = null;

  const local = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hover = (hex: AxialHex | null) => {
    const key = hex ? `${hex.q},${hex.r}` : null;
    if (key === lastHoverKey) return;
    lastHoverKey = key;
    renderer.setHover(hex);
    handlers.onHexHover(hex);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 2) return;
    const at = local(event);
    drag = {
      pointerId: event.pointerId,
      button: event.button,
      x: at.x,
      y: at.y,
      moved: 0,
      ground: renderer.groundAt(at.x, at.y),
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    const at = local(event);
    if (!drag || drag.pointerId !== event.pointerId) {
      hover(renderer.hexAt(at.x, at.y));
      return;
    }
    if (event.buttons === 0) {
      drag = null;
      return;
    }
    const dx = at.x - drag.x;
    const dy = at.y - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > CLICK_SLOP) canvas.setPointerCapture?.(event.pointerId);
    if (drag.button === 2 || event.ctrlKey) {
      renderer.rig.orbit(-dx * ORBIT_YAW, dy * ORBIT_PITCH);
    } else if (drag.ground) {
      // The ground point grabbed stays under the cursor.
      const now = renderer.groundAt(at.x, at.y);
      if (now) renderer.rig.pan(drag.ground.x - now.x, drag.ground.z - now.z);
    }
    drag.x = at.x;
    drag.y = at.y;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasClick = drag.moved <= CLICK_SLOP && drag.button === 0;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const at = local(event);
    drag = null;
    if (wasClick) {
      const hex = renderer.hexAt(at.x, at.y);
      if (hex) handlers.onHexClick(hex);
    }
  };

  const onPointerLeave = () => {
    hover(null);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const at = local(event);
    const factor = event.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    const anchor = renderer.groundAt(at.x, at.y);
    renderer.rig.zoom(factor, anchor);
  };

  const onContextMenu = (event: Event) => event.preventDefault();

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return;
    }
    const preset = PRESET_KEYS[event.key];
    if (preset) {
      renderer.camera(preset);
      return;
    }
    if (event.key === "f" || event.key === "F") {
      const hex = handlers.selectedHex();
      if (hex) renderer.camera("closeup", hex);
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
  };
}
