// Pointer and keyboard interaction on the world canvas (docs/08 §8): hex
// picking against the relief, camera control on the rig — left drag pans the
// grabbed ground point, right drag orbits, the wheel zooms toward the cursor
// with a short ease, a flick carries pan inertia (a hand that paused before
// lifting does not), two fingers pan and pinch (extra fingers never wedge the
// gesture), and the preset keys. The host passes callbacks; nothing here
// touches the engine or the store, and nothing draws: the hover ring belongs
// to the core and the effects module.

import type { CameraPreset } from "../render/core/CameraRig";
import type { AxialHex } from "../render/core/units";
import type { WorldRenderer } from "../render/core/WorldRenderer";
import { CameraControls, pitchLimits } from "./cameraControls";
import { ReliefPicker, type GroundHit } from "./picking";

export interface InteractionHandlers {
  onHexClick: (hex: AxialHex) => void;
  onHexHover: (hex: AxialHex | null) => void;
  /** `F` — fly to the selected hex, if the host has one. */
  selectedHex: () => AxialHex | null;
}

/** Drag distance that turns a click into a pan [px]. */
const CLICK_SLOP = 4;
/** Orbit sensitivity [deg/px]. */
const ORBIT_YAW = 0.35;
const ORBIT_PITCH = 0.25;
/** Ceiling on the fling a single drag may launch [km/s]. */
const FLING_MAX_KM_S = 800;
/** Largest pinch factor a single move may apply, so a finger jump cannot teleport. */
const PINCH_EVENT_MAX = 2;

const PRESET_KEYS: Record<string, CameraPreset> = {
  "1": "strategic",
  "2": "overview",
  "3": "north",
};

interface Point {
  x: number;
  y: number;
}

interface DragState extends Point {
  pointerId: number;
  button: number;
  moved: number;
  ground: GroundHit | null;
  /** Ground-space speed of the pan [km/s], for the fling. */
  vx: number;
  vz: number;
  /** Clock time of the last velocity sample [s]. */
  lastTime: number;
}

interface PinchState {
  ids: [number, number];
  centroid: Point;
  separation: number;
  /** Ground point that must stay under the fingers. */
  ground: GroundHit | null;
}

export function attachInteraction(
  renderer: WorldRenderer,
  canvas: HTMLCanvasElement,
  handlers: InteractionHandlers,
): () => void {
  const picker = new ReliefPicker(renderer);
  const controls = new CameraControls(renderer);
  const pointers = new Map<number, Point>();
  let drag: DragState | null = null;
  let pinch: PinchState | null = null;
  let lastHoverKey: string | null = null;

  const local = (event: PointerEvent | WheelEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hover = (hex: AxialHex | null): void => {
    const key = hex ? `${hex.q},${hex.r}` : null;
    if (key === lastHoverKey) return;
    lastHoverKey = key;
    renderer.setHover(hex);
    handlers.onHexHover(hex);
  };

  /** Pointer capture is best-effort: synthetic pointers in tests are not active. */
  const capture = (pointerId: number, on: boolean): void => {
    try {
      if (on) canvas.setPointerCapture(pointerId);
      else if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    } catch {
      // A pointer that already went up cannot be captured; nothing to fix.
    }
  };

  /**
   * Safe-frame-aware presets. One call is enough since the core fix:
   * `CameraRig.groundAt` updates the camera matrices before its raycast, so
   * `centredInSafeFrame` measures with the candidate state it is framing, not
   * with the last rendered frame (the two-pass workaround from step 1 is gone;
   * verified by the s2 script across F → Home and `2` right after `3`).
   */
  const applyPreset = (preset: CameraPreset, hex?: AxialHex): void => {
    controls.cancel();
    renderer.camera(preset, hex, true);
  };

  // --- camera gestures --------------------------------------------------------

  const startDrag = (pointerId: number, button: number, at: Point): void => {
    drag = {
      pointerId,
      button,
      x: at.x,
      y: at.y,
      moved: 0,
      ground: picker.groundAt(at.x, at.y),
      vx: 0,
      vz: 0,
      lastTime: renderer.clock.time,
    };
  };

  const panDrag = (state: DragState, at: Point): void => {
    if (!state.ground) return;
    const now = picker.groundAt(at.x, at.y);
    if (!now) return;
    const dx = state.ground.x - now.x;
    const dz = state.ground.z - now.z;
    renderer.rig.pan(dx, dz);
    const time = renderer.clock.time;
    const dt = time - state.lastTime;
    if (dt > 1 / 240) {
      // Smooth the sample: a pointer emits several moves per frame.
      const k = 0.4;
      state.vx += (dx / dt - state.vx) * k;
      state.vz += (dz / dt - state.vz) * k;
      const speed = Math.hypot(state.vx, state.vz);
      if (speed > FLING_MAX_KM_S) {
        state.vx *= FLING_MAX_KM_S / speed;
        state.vz *= FLING_MAX_KM_S / speed;
      }
      state.lastTime = time;
    }
  };

  const orbitDrag = (dx: number, dy: number): void => {
    const limits = pitchLimits(renderer.rig.distanceKm);
    const pitch = Math.min(
      limits.max,
      Math.max(limits.min, renderer.rig.pitchDeg + dy * ORBIT_PITCH),
    );
    renderer.rig.orbit(-dx * ORBIT_YAW, pitch - renderer.rig.pitchDeg);
  };

  // --- two-finger pan and pinch ----------------------------------------------

  /**
   * (Re)seeds the gesture from the first two pointers down. Called on the
   * second finger and again when one of a pinch's fingers lifts while others
   * remain, so a three-finger gesture never wedges: the pair is always the two
   * oldest fingers and the ground invariant is re-anchored from the surface.
   */
  const beginPinch = (): void => {
    const entries = [...pointers.entries()];
    if (entries.length < 2) return;
    const [idA, a] = entries[0]!;
    const [idB, b] = entries[1]!;
    const centroid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = {
      ids: [idA, idB],
      centroid,
      separation: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      ground: picker.groundAt(centroid.x, centroid.y),
    };
    drag = null;
    controls.cancel();
    capture(idA, true);
    capture(idB, true);
  };

  const movePinch = (): void => {
    if (!pinch) return;
    const [idA, idB] = pinch.ids;
    const a = pointers.get(idA);
    const b = pointers.get(idB);
    if (!a || !b) return;
    const centroid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const separation = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));

    // Pan: the grabbed ground point follows the centroid.
    const now = picker.groundAt(centroid.x, centroid.y);
    if (pinch.ground && now) {
      renderer.rig.pan(pinch.ground.x - now.x, pinch.ground.z - now.z);
    }
    // Pinch: zoom about that same point by the change in finger spacing.
    const factor = Math.min(
      PINCH_EVENT_MAX,
      Math.max(1 / PINCH_EVENT_MAX, pinch.separation / separation),
    );
    if (pinch.ground) controls.zoomInstant(factor, pinch.ground);
    // Refresh the invariant from the surface so drift cannot accumulate.
    pinch.ground = picker.groundAt(centroid.x, centroid.y);
    pinch.centroid = centroid;
    pinch.separation = separation;
  };

  // --- pointer events ---------------------------------------------------------

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    const at = local(event);
    if (event.pointerType === "touch") {
      const known = pointers.has(event.pointerId);
      pointers.set(event.pointerId, at);
      if (pinch) {
        // A pinch owns the gesture: a third finger only joins the pointer set
        // and can inherit the pair when one of its two fingers lifts.
        if (!known) capture(event.pointerId, true);
        return;
      }
      if (pointers.size >= 2) {
        beginPinch();
        return;
      }
    }
    // One gesture at a time: a second button or a stray pointer never steals a
    // drag in progress (a pinch already owns its own pair above).
    if (pinch || drag) return;
    controls.cancel();
    startDrag(event.pointerId, event.button, at);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const at = local(event);
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, at);
    if (pinch) {
      if (pinch.ids[0] === event.pointerId || pinch.ids[1] === event.pointerId) movePinch();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) {
      hover(picker.hexAt(at.x, at.y));
      return;
    }
    if (event.buttons === 0) {
      drag = null;
      return;
    }
    const dx = at.x - drag.x;
    const dy = at.y - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > CLICK_SLOP) capture(event.pointerId, true);
    if (drag.button === 2 || event.ctrlKey) orbitDrag(dx, dy);
    else panDrag(drag, at);
    drag.x = at.x;
    drag.y = at.y;
  };

  const onPointerUp = (event: PointerEvent, cancelled = false): void => {
    const at = local(event);
    const wasPinching = pinch !== null;
    pointers.delete(event.pointerId);
    if (wasPinching) {
      capture(event.pointerId, false);
      if (cancelled) {
        // The browser took the gesture back: nothing left to continue.
        pinch = null;
        for (const id of pointers.keys()) capture(id, false);
        return;
      }
      if (!pinch!.ids.includes(event.pointerId)) {
        // An extra finger lifted: the pair keeps working untouched.
        return;
      }
      if (pointers.size >= 2) {
        beginPinch();
        return;
      }
      const lifted = pinch!.ids;
      pinch = null;
      if (pointers.size === 1) {
        // One finger stayed down: it keeps panning instead of ending the gesture.
        const [id, point] = [...pointers.entries()][0]!;
        startDrag(id, 0, point);
        // Marked as a pan so lifting it cannot turn the pinch into a click.
        drag!.moved = CLICK_SLOP + 1;
      } else {
        for (const id of lifted) capture(id, false);
      }
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const state = drag;
    const wasClick = !cancelled && state.moved <= CLICK_SLOP && state.button === 0;
    capture(event.pointerId, false);
    drag = null;
    if (wasClick) {
      const hex = picker.hexAt(at.x, at.y);
      if (hex) handlers.onHexClick(hex);
    } else if (state.button === 0 && !cancelled) {
      // A hand that paused before lifting has no momentum left to spend.
      controls.flingPan(state.vx, state.vz, renderer.clock.time - state.lastTime);
    }
  };

  const onPointerCancel = (event: PointerEvent): void => onPointerUp(event, true);

  const onPointerLeave = (): void => {
    hover(null);
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const at = local(event);
    controls.wheelZoom(event.deltaY, event.deltaMode, picker.groundAt(at.x, at.y));
  };

  const onContextMenu = (event: Event): void => event.preventDefault();

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const onCanvas = target === canvas || (target !== null && canvas.contains(target));
    const onBody =
      target === null || target === document.body || target === document.documentElement;
    // The HUD owns its own keys: act only when the canvas or the body has focus.
    if (!onCanvas && !onBody) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const preset = PRESET_KEYS[event.key];
    if (preset || event.key === "Home") {
      event.preventDefault();
      applyPreset(preset ?? "strategic");
      return;
    }
    if (event.key === "f" || event.key === "F") {
      const hex = handlers.selectedHex();
      if (hex) {
        event.preventDefault();
        applyPreset("closeup", hex);
      }
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);

  return () => {
    controls.dispose();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
  };
}
