// Camera feel for the pointer (docs/08 §8): wheel zoom toward the ground point
// under the cursor with a short clock-driven ease, pan inertia with a short
// decay, and a pitch band that tightens with distance so the far view never
// degenerates into a horizon sliver or a flat postcard. Every state is a target
// the rig is eased toward on `renderer.clock.time`; a pinned clock (capture) or
// motion `none` makes every move instant, so two captures stay identical.
//
// The zoom anchor is solved on the real perspective projection (a few Newton
// passes against a scratch camera posed exactly like the rig), not on the
// ground-plane linearisation that leaves a few pixels of drift per notch — the
// point under the cursor stays under the cursor from strategic to detail range.

import * as THREE from "three";
import { CAMERA_LIMITS } from "../render/core/CameraRig";
import { boardCenter, boardSize } from "../render/core/units";
import type { WorldRenderer } from "../render/core/WorldRenderer";
import type { GroundHit } from "./picking";

/** One wheel notch (deltaY of 100) → distance factor. */
const ZOOM_STEP = 1.12;
/** Largest factor a single event may apply — a trackpad flick must not teleport. */
const ZOOM_EVENT_MAX = 1.4;
/** Time constant of the zoom ease [s]: short, the wheel keeps the lead. */
const ZOOM_TAU = 0.07;
/** Time constant of the pan fling [s]. */
const FLING_TAU = 0.3;
/** Fling speed below which inertia stops [km/s]. */
const FLING_MIN_KM_S = 0.8;
/** A grab that moved less than this never starts a fling. */
const FLING_START_KM_S = 4;
/** A hand that paused before lifting has no momentum: speed decays with this τ [s]. */
const FLING_IDLE_TAU = 0.09;
/** Newton passes of the anchor solve; three settle below 0,1 px. */
const ANCHOR_ITERATIONS = 3;
/** Finite-difference step of the anchor solve, as a fraction of the distance. */
const ANCHOR_STEP_FRACTION = 0.01;
/** Distance band over which the pitch limits tighten [km]. */
const BAND_FROM_KM = 60;
const BAND_TO_KM = 900;
/** Pitch range with the camera next to the ground [deg]: flat and top-down both free. */
const PITCH_NEAR = { min: 18, max: 85 };
/** Pitch range at the far end: never a horizon sliver, never a flat postcard. */
const PITCH_FAR = { min: 40, max: 72 };

const DEG = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Pitch limits [deg] at a camera distance — the farther out, the narrower. */
export function pitchLimits(distanceKm: number): { min: number; max: number } {
  const t = smoothstep(BAND_FROM_KM, BAND_TO_KM, distanceKm);
  return {
    min: PITCH_NEAR.min + (PITCH_FAR.min - PITCH_NEAR.min) * t,
    max: PITCH_NEAR.max + (PITCH_FAR.max - PITCH_NEAR.max) * t,
  };
}

interface ZoomGoal {
  distance: number;
  tx: number;
  tz: number;
  pitchDeg: number;
}

export class CameraControls {
  private goal: ZoomGoal | null = null;
  private fling: { vx: number; vz: number } | null = null;
  private handle: number | null = null;
  private lastTime = 0;
  private readonly scratch = new THREE.Vector3();
  /** Scratch camera posed like the rig, used only to solve the zoom anchor. */
  private readonly probe = new THREE.PerspectiveCamera();
  private readonly anchorPoint = new THREE.Vector3();
  private readonly ndcBase = new THREE.Vector3();
  private readonly ndcHere = new THREE.Vector3();
  private readonly ndcPlus = new THREE.Vector3();

  constructor(private readonly renderer: WorldRenderer) {}

  get active(): boolean {
    return this.goal !== null || this.fling !== null;
  }

  /** Wheel: zoom toward the cursor, eased unless the clock says instant. */
  wheelZoom(deltaY: number, deltaMode: number, anchor: GroundHit | null): void {
    // Line-mode deltas (Firefox mice) are ~16 px per line; pixels are the norm.
    const pixels = deltaMode === 1 ? deltaY * 16 : deltaY;
    const factor = clamp(
      Math.pow(1 / ZOOM_STEP, -pixels / 100),
      1 / ZOOM_EVENT_MAX,
      ZOOM_EVENT_MAX,
    );
    this.zoomTo(factor, anchor);
  }

  /** Pinch/native gesture: the same anchor math, applied immediately. */
  zoomInstant(factor: number, anchor: GroundHit | null): void {
    this.zoomTo(factor, anchor, true);
  }

  private zoomTo(factor: number, anchor: GroundHit | null, instant = false): void {
    const rig = this.renderer.rig;
    const base =
      this.goal ??
      ({
        distance: rig.distanceKm,
        tx: rig.target.x,
        tz: rig.target.z,
        pitchDeg: rig.pitchDeg,
      } satisfies ZoomGoal);
    const distance = clamp(
      base.distance * factor,
      CAMERA_LIMITS.minDistance,
      CAMERA_LIMITS.maxDistance,
    );
    const ratio = distance / base.distance;
    const limits = pitchLimits(distance);
    const pitchDeg = clamp(base.pitchDeg, limits.min, limits.max);
    let tx = base.tx;
    let tz = base.tz;
    if (anchor) {
      // Ground-plane guess first (cheap and already close), then Newton on the
      // real projection so the cursor keeps its ground point exactly.
      tx = anchor.x + (tx - anchor.x) * ratio;
      tz = anchor.z + (tz - anchor.z) * ratio;
      const solved = this.solveAnchor(base, anchor, distance, pitchDeg, rig.yawDeg, tx, tz);
      tx = solved.x;
      tz = solved.z;
    }
    const clamped = this.clampTarget(tx, tz);
    this.goal = { distance, tx: clamped.x, tz: clamped.z, pitchDeg };
    if (instant || !this.transitionsOn()) {
      this.applyGoal();
      this.goal = null;
      return;
    }
    this.start();
  }

  /**
   * Target that keeps `anchor` at the screen point it occupies in the base
   * state, at the goal's distance/pitch. Mirrors `CameraRig.apply`'s pose on a
   * scratch camera (the live rig must not be moved to measure), then runs a
   * two-variable Newton on the projection residual: the same screen point
   * against the same ground point has one solution and the linear guess seeds
   * it. Falls back to the guess when the Jacobian degenerates (grazing views).
   */
  private solveAnchor(
    base: ZoomGoal,
    anchor: GroundHit,
    distance: number,
    pitchDeg: number,
    yawDeg: number,
    tx: number,
    tz: number,
  ): { x: number; z: number } {
    const live = this.renderer.rig.camera;
    this.probe.fov = live.fov;
    this.probe.aspect = live.aspect;
    this.probe.updateProjectionMatrix();
    this.anchorPoint.set(anchor.x, anchor.y, anchor.z);
    this.poseProbe(base.tx, base.tz, base.distance, base.pitchDeg, yawDeg);
    this.ndcBase.copy(this.anchorPoint).project(this.probe);
    const step = Math.max(0.5, distance * ANCHOR_STEP_FRACTION);
    for (let i = 0; i < ANCHOR_ITERATIONS; i++) {
      this.poseProbe(tx, tz, distance, pitchDeg, yawDeg);
      this.ndcHere.copy(this.anchorPoint).project(this.probe);
      const ex = this.ndcHere.x - this.ndcBase.x;
      const ey = this.ndcHere.y - this.ndcBase.y;
      if (Math.abs(ex) < 1e-7 && Math.abs(ey) < 1e-7) break;
      this.poseProbe(tx + step, tz, distance, pitchDeg, yawDeg);
      this.ndcPlus.copy(this.anchorPoint).project(this.probe);
      const j11 = (this.ndcPlus.x - this.ndcHere.x) / step;
      const j21 = (this.ndcPlus.y - this.ndcHere.y) / step;
      this.poseProbe(tx, tz + step, distance, pitchDeg, yawDeg);
      this.ndcPlus.copy(this.anchorPoint).project(this.probe);
      const j12 = (this.ndcPlus.x - this.ndcHere.x) / step;
      const j22 = (this.ndcPlus.y - this.ndcHere.y) / step;
      const det = j11 * j22 - j12 * j21;
      if (!Number.isFinite(det) || Math.abs(det) < 1e-9) break;
      tx -= (j22 * ex - j12 * ey) / det;
      tz -= (-j21 * ex + j11 * ey) / det;
      const clamped = this.clampTarget(tx, tz);
      tx = clamped.x;
      tz = clamped.z;
    }
    return { x: tx, z: tz };
  }

  /** Pose the scratch camera exactly as `CameraRig.apply` would for a target. */
  private poseProbe(
    tx: number,
    tz: number,
    distance: number,
    pitchDeg: number,
    yawDeg: number,
  ): void {
    const heightAt = (x: number, z: number): number => this.renderer.heightAt(x, z);
    const ty = Math.max(0, heightAt(tx, tz));
    const pitch = pitchDeg * DEG;
    const yaw = yawDeg * DEG;
    const flat = distance * Math.cos(pitch);
    const px = tx - Math.sin(yaw) * flat;
    const pz = tz + Math.cos(yaw) * flat;
    let py = ty + distance * Math.sin(pitch);
    const floor = heightAt(px, pz) + CAMERA_LIMITS.clearance;
    if (py < floor) py = floor;
    this.probe.position.set(px, py, pz);
    this.probe.up.set(0, 1, 0);
    this.probe.lookAt(tx, ty, tz);
    this.probe.updateMatrixWorld();
  }

  /**
   * Starts pan inertia after a drag; speeds are ground-space [km/s].
   * `idleSeconds` is the time since the last movement sample: a hand that
   * stopped before lifting has no momentum, so the fling fades out with it.
   */
  flingPan(vx: number, vz: number, idleSeconds = 0): void {
    if (!this.transitionsOn()) return;
    const damp = idleSeconds > 0 ? Math.exp(-idleSeconds / FLING_IDLE_TAU) : 1;
    const speed = Math.hypot(vx, vz) * damp;
    if (speed < FLING_START_KM_S) return;
    this.fling = { vx: vx * damp, vz: vz * damp };
    this.start();
  }

  /** Stops easing and inertia — a grab or a preset takes over. */
  cancel(): void {
    this.goal = null;
    this.fling = null;
    if (this.handle !== null) {
      cancelAnimationFrame(this.handle);
      this.handle = null;
    }
  }

  dispose(): void {
    this.cancel();
  }

  private transitionsOn(): boolean {
    const clock = this.renderer.clock;
    return !clock.pinned && clock.scale !== 0;
  }

  private start(): void {
    if (this.handle !== null) return;
    this.lastTime = this.renderer.clock.time;
    this.handle = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.handle = null;
    if (!this.active) return;
    const clock = this.renderer.clock;
    const dt = clock.time - this.lastTime;
    this.lastTime = clock.time;
    if (!this.transitionsOn()) {
      // Motion off or a pinned capture clock: land instantly.
      this.settle();
    } else if (dt > 0) {
      // Our rAF callback can beat the renderer's clock tick to the frame; a
      // zero dt is not an error, just a frame that has not advanced the world.
      const step = Math.min(dt, 0.25);
      this.easeZoom(step);
      this.easeFling(step);
    }
    if (this.active) this.handle = requestAnimationFrame(this.tick);
  };

  /** Snaps whatever is left to its target — the pinned-clock path. */
  private settle(): void {
    if (this.goal) {
      this.applyGoal();
      this.goal = null;
    }
    this.fling = null;
  }

  private easeZoom(step: number): void {
    const goal = this.goal;
    if (!goal) return;
    const rig = this.renderer.rig;
    const k = 1 - Math.exp(-step / ZOOM_TAU);
    const distance = rig.distanceKm + (goal.distance - rig.distanceKm) * k;
    const tx = rig.target.x + (goal.tx - rig.target.x) * k;
    const tz = rig.target.z + (goal.tz - rig.target.z) * k;
    const pitchDeg = rig.pitchDeg + (goal.pitchDeg - rig.pitchDeg) * k;
    const done =
      Math.abs(goal.distance - distance) < 0.01 &&
      Math.hypot(goal.tx - tx, goal.tz - tz) < 0.02 &&
      Math.abs(goal.pitchDeg - pitchDeg) < 0.01;
    this.writeRig(
      done ? goal.distance : distance,
      done ? goal.tx : tx,
      done ? goal.tz : tz,
      done ? goal.pitchDeg : pitchDeg,
    );
    if (done) this.goal = null;
  }

  private easeFling(step: number): void {
    const fling = this.fling;
    if (!fling) return;
    const rig = this.renderer.rig;
    const beforeX = rig.target.x;
    const beforeZ = rig.target.z;
    rig.pan(fling.vx * step, fling.vz * step);
    const moved = Math.hypot(rig.target.x - beforeX, rig.target.z - beforeZ);
    const wanted = Math.hypot(fling.vx, fling.vz) * step;
    const decay = Math.exp(-step / FLING_TAU);
    fling.vx *= decay;
    fling.vz *= decay;
    // Board edge or a clamped target: inertia has nothing left to spend.
    if (
      Math.hypot(fling.vx, fling.vz) < FLING_MIN_KM_S ||
      (wanted > 1e-3 && moved < wanted * 0.5)
    ) {
      this.fling = null;
    }
  }

  private applyGoal(): void {
    const goal = this.goal;
    if (!goal) return;
    this.writeRig(goal.distance, goal.tx, goal.tz, goal.pitchDeg);
  }

  private writeRig(distance: number, tx: number, tz: number, pitchDeg: number): void {
    const rig = this.renderer.rig;
    // The goal target was clamped to the rig's own bounds, so set() cannot
    // fight the ease; the scratch vector keeps the frame allocation-free.
    this.scratch.set(tx, 0, tz);
    rig.set({
      target: this.scratch,
      distance,
      pitchDeg,
      yawDeg: rig.yawDeg,
    });
  }

  private clampTarget(x: number, z: number): { x: number; z: number } {
    const board = this.renderer.sceneModel?.board;
    if (!board) return { x, z };
    const size = boardSize(board.cols, board.rows);
    const centre = boardCenter(board.cols, board.rows);
    const halfW = size.width / 2 + CAMERA_LIMITS.margin;
    const halfD = size.depth / 2 + CAMERA_LIMITS.margin;
    return {
      x: clamp(x, centre.x - halfW, centre.x + halfW),
      z: clamp(z, centre.z - halfD, centre.z + halfD),
    };
  }
}
