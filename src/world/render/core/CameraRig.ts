// The camera rig (docs/08 §8): an orbit around a ground target with hard
// limits — never under the terrain, never off the board, never past the
// strategic distance. Every move is a target state the rig eases toward on
// the frame clock, so a flight is deterministic and a pinned clock lands it
// instantly. Modules read the camera; only the rig moves it.

import * as THREE from "three";
import type { FrameClock } from "./FrameClock";
import type { CameraView } from "./types";
import { boardCenter, boardSize } from "./units";

const DEG = Math.PI / 180;

export interface RigState {
  /** Ground point looked at [km]. */
  target: THREE.Vector3;
  /** Distance camera → target [km]. */
  distance: number;
  /** Elevation above the horizontal [deg]. */
  pitchDeg: number;
  /** Heading of the view direction, clockwise from north [deg]; 0 looks north. */
  yawDeg: number;
}

export type CameraPreset = "strategic" | "overview" | "closeup" | "golden" | "north" | "detail";

/**
 * The part of the viewport the HUD leaves uncovered, as fractions 0..1 from
 * the top-left: presets fit the board into it and centre on it, so the panel
 * and the ribbon never hide the country (docs/08 §7).
 */
export interface SafeFrame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const CAMERA_LIMITS = {
  minDistance: 12,
  maxDistance: 1_200,
  minPitchDeg: 18,
  maxPitchDeg: 85,
  /** How far past the board the target may wander [km]. */
  margin: 40,
  /** Minimum clearance above the terrain [km]. */
  clearance: 1.5,
  /** Flight duration [s] for presets and fly-to. */
  flightSeconds: 0.6,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export class CameraRig implements CameraView {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  distanceKm = 400;
  pitchDeg = 55;
  yawDeg = 0;

  private goal: RigState | null = null;
  private goalStart: RigState | null = null;
  private goalStartedAt = 0;
  private cols = 24;
  private rows = 16;
  private safeFrame: SafeFrame = { x0: 0, y0: 0, x1: 1, y1: 1 };
  private heightAt: (x: number, z: number) => number = () => 0;
  private readonly clock: FrameClock;
  private listeners: (() => void)[] = [];

  constructor(clock: FrameClock, aspect: number) {
    this.clock = clock;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 4_000);
    this.apply();
  }

  /** The board the rig is confined to; presets fit it. */
  setBoard(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }

  setTerrain(heightAt: (x: number, z: number) => number): void {
    this.heightAt = heightAt;
  }

  /** Clamped to a sane minimum so a fully covered viewport still frames something. */
  setSafeFrame(frame: SafeFrame): void {
    const x0 = clamp(frame.x0, 0, 0.6);
    const y0 = clamp(frame.y0, 0, 0.6);
    this.safeFrame = {
      x0,
      y0,
      x1: clamp(frame.x1, x0 + 0.3, 1),
      y1: clamp(frame.y1, y0 + 0.3, 1),
    };
  }

  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  state(): RigState {
    return {
      target: this.target.clone(),
      distance: this.distanceKm,
      pitchDeg: this.pitchDeg,
      yawDeg: this.yawDeg,
    };
  }

  /** Distance at which the whole board fits the safe frame at the given pitch. */
  fitDistance(pitchDeg: number): number {
    const size = boardSize(this.cols, this.rows);
    const halfFov = (this.camera.fov / 2) * DEG;
    const frameW = this.safeFrame.x1 - this.safeFrame.x0;
    const frameH = this.safeFrame.y1 - this.safeFrame.y0;
    const foreshortened = size.depth * Math.sin(pitchDeg * DEG) + 30;
    const byHeight = foreshortened / 2 / (Math.tan(halfFov) * frameH);
    const byWidth = (size.width + 30) / 2 / (Math.tan(halfFov) * this.camera.aspect * frameW);
    return clamp(Math.max(byHeight, byWidth), CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance);
  }

  /**
   * Shifts a state's target so that its original target lands at the centre
   * of the safe frame instead of the centre of the viewport. Evaluated with
   * the camera temporarily placed at the state, then restored.
   */
  private centredInSafeFrame(state: RigState): RigState {
    const frame = this.safeFrame;
    const cx = frame.x0 + frame.x1 - 1;
    const cy = 1 - (frame.y0 + frame.y1);
    if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6) return state;
    const restore = this.state();
    const hadGoal = this.goal;
    const hadStart = this.goalStart;
    this.set(state);
    const centre = this.groundAt(0, 0, state.target.y);
    const safe = this.groundAt(cx, cy, state.target.y);
    this.set(restore);
    this.goal = hadGoal;
    this.goalStart = hadStart;
    if (!centre || !safe) return state;
    return {
      ...state,
      target: new THREE.Vector3(
        state.target.x - (safe.x - centre.x),
        state.target.y,
        state.target.z - (safe.z - centre.z),
      ),
    };
  }

  preset(name: CameraPreset, hex?: { x: number; z: number }): RigState {
    return this.centredInSafeFrame(this.rawPreset(name, hex));
  }

  private rawPreset(name: CameraPreset, hex?: { x: number; z: number }): RigState {
    const centre = boardCenter(this.cols, this.rows);
    const at = hex ?? centre;
    switch (name) {
      case "strategic":
        return {
          target: new THREE.Vector3(centre.x, 0, centre.z),
          distance: this.fitDistance(55),
          pitchDeg: 55,
          yawDeg: 0,
        };
      case "overview":
        return {
          target: new THREE.Vector3(centre.x, 0, centre.z),
          distance: this.fitDistance(78),
          pitchDeg: 78,
          yawDeg: 0,
        };
      case "north":
        return {
          target: new THREE.Vector3(centre.x, 0, centre.z),
          distance: this.fitDistance(50),
          pitchDeg: 50,
          yawDeg: 180,
        };
      case "closeup":
        return {
          target: new THREE.Vector3(at.x, 0, at.z),
          distance: 42,
          pitchDeg: 32,
          yawDeg: -25,
        };
      case "golden":
        return {
          target: new THREE.Vector3(at.x, 0, at.z),
          distance: 110,
          pitchDeg: 22,
          yawDeg: -40,
        };
      case "detail":
        // One structure fills the frame: a pylon, a turbine, a block (docs/08 §3 silhouette).
        return {
          target: new THREE.Vector3(at.x, 0, at.z),
          distance: 18,
          pitchDeg: 20,
          yawDeg: -30,
        };
    }
  }

  /** Eases toward a state over the flight time; instant when transitions are off. */
  flyTo(state: RigState, animate = true): void {
    if (!animate || this.clock.pinned || this.clock.scale === 0) {
      this.set(state);
      return;
    }
    this.goalStart = this.state();
    this.goal = state;
    this.goalStartedAt = this.clock.time;
  }

  set(state: RigState): void {
    this.goal = null;
    this.target.copy(state.target);
    this.distanceKm = state.distance;
    this.pitchDeg = state.pitchDeg;
    this.yawDeg = state.yawDeg;
    this.apply();
  }

  /** Snaps the current view to an explicit orientation (capture override). */
  orient(yawDeg: number | null, pitchDeg: number | null): void {
    this.goal = null;
    if (yawDeg !== null) this.yawDeg = ((yawDeg % 360) + 360) % 360;
    if (pitchDeg !== null) {
      this.pitchDeg = clamp(pitchDeg, CAMERA_LIMITS.minPitchDeg, CAMERA_LIMITS.maxPitchDeg);
    }
    this.apply();
  }

  /** Drags the target on the ground by a world-space delta. */
  pan(dx: number, dz: number): void {
    this.goal = null;
    this.target.x += dx;
    this.target.z += dz;
    this.apply();
  }

  /** Scales the distance around the ground point under the cursor. */
  zoom(factor: number, anchor: { x: number; z: number } | null): void {
    this.goal = null;
    const next = clamp(
      this.distanceKm * factor,
      CAMERA_LIMITS.minDistance,
      CAMERA_LIMITS.maxDistance,
    );
    const ratio = next / this.distanceKm;
    if (anchor) {
      // The anchor stays under the cursor: the target moves toward it as the view tightens.
      this.target.x = anchor.x + (this.target.x - anchor.x) * ratio;
      this.target.z = anchor.z + (this.target.z - anchor.z) * ratio;
    }
    this.distanceKm = next;
    this.apply();
  }

  orbit(dYawDeg: number, dPitchDeg: number): void {
    this.goal = null;
    this.yawDeg = (((this.yawDeg + dYawDeg) % 360) + 360) % 360;
    this.pitchDeg = clamp(
      this.pitchDeg + dPitchDeg,
      CAMERA_LIMITS.minPitchDeg,
      CAMERA_LIMITS.maxPitchDeg,
    );
    this.apply();
  }

  /** Advances a flight in progress; called once per frame by the renderer. */
  update(): void {
    if (!this.goal || !this.goalStart) return;
    const t = clamp((this.clock.time - this.goalStartedAt) / CAMERA_LIMITS.flightSeconds, 0, 1);
    const k = easeOutCubic(t);
    const from = this.goalStart;
    const to = this.goal;
    this.target.lerpVectors(from.target, to.target, k);
    this.distanceKm = from.distance + (to.distance - from.distance) * k;
    this.pitchDeg = from.pitchDeg + (to.pitchDeg - from.pitchDeg) * k;
    // Shortest way round for the heading.
    let dYaw = ((to.yawDeg - from.yawDeg + 540) % 360) - 180;
    if (Number.isNaN(dYaw)) dYaw = 0;
    this.yawDeg = (((from.yawDeg + dYaw * k) % 360) + 360) % 360;
    if (t >= 1) {
      this.goal = null;
      this.goalStart = null;
    }
    this.apply();
  }

  /** Ground-plane point under a normalised device coordinate, or null when it looks at the sky. */
  groundAt(ndcX: number, ndcY: number, y = 0): THREE.Vector3 | null {
    // Raycasts must not use the matrices of the last RENDERED frame: a preset
    // applied while the camera sits elsewhere would frame against stale
    // matrices (interaction found this through centredInSafeFrame).
    this.camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }

  private apply(): void {
    // Clamp the target to the board plus margin; the ground under it sets its height.
    const size = boardSize(this.cols, this.rows);
    const centre = boardCenter(this.cols, this.rows);
    const halfW = size.width / 2 + CAMERA_LIMITS.margin;
    const halfD = size.depth / 2 + CAMERA_LIMITS.margin;
    this.target.x = clamp(this.target.x, centre.x - halfW, centre.x + halfW);
    this.target.z = clamp(this.target.z, centre.z - halfD, centre.z + halfD);
    this.target.y = Math.max(0, this.heightAt(this.target.x, this.target.z));
    this.distanceKm = clamp(this.distanceKm, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance);
    this.pitchDeg = clamp(this.pitchDeg, CAMERA_LIMITS.minPitchDeg, CAMERA_LIMITS.maxPitchDeg);

    const pitch = this.pitchDeg * DEG;
    const yaw = this.yawDeg * DEG;
    // Yaw 0 looks north (−Z): the camera stands south of the target (+Z).
    const flat = this.distanceKm * Math.cos(pitch);
    const position = new THREE.Vector3(
      this.target.x - Math.sin(yaw) * flat,
      this.target.y + this.distanceKm * Math.sin(pitch),
      this.target.z + Math.cos(yaw) * flat,
    );
    const floor = this.heightAt(position.x, position.z) + CAMERA_LIMITS.clearance;
    if (position.y < floor) position.y = floor;
    this.camera.position.copy(position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.near = Math.max(0.2, this.distanceKm / 400);
    this.camera.far = Math.max(3_000, this.distanceKm * 8);
    this.camera.updateProjectionMatrix();
    for (const listener of this.listeners) listener();
  }
}
