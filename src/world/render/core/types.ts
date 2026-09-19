// The module contract (ARCHITECTURE.md §11): what every render module gets
// and what it must provide. Modules import THIS file and the scene types —
// never the engine, never the app, never each other.

import type * as THREE from "three";
import type { WorldScene } from "../../bridge/worldScene";
import type { FrameClock } from "./FrameClock";
import type { Rng } from "./prng";

export type QualityTier = "high" | "medium" | "low";

/** The motion setting of docs/08 §4. */
export type MotionMode = "full" | "reduced" | "none";

export interface MotionSettings {
  mode: MotionMode;
  /** Whether continuous ambience (particles, drift, breathing) may run. */
  ambient: boolean;
  /** Whether state-carrying motion (rotors, plumes) may run. */
  stateful: boolean;
  /** Whether one-shot transitions (turn resolution, camera flights) animate. */
  transitions: boolean;
}

export function motionSettings(mode: MotionMode): MotionSettings {
  return {
    mode,
    ambient: mode === "full",
    stateful: mode !== "none",
    transitions: mode !== "none",
  };
}

/** Registered by the terrain module; a flat default stands in until then. */
export interface TerrainProvider {
  /** Ground height [km] at a world point (relief included). */
  heightAt(x: number, z: number): number;
  /** Surface normal at a world point. */
  normalAt(x: number, z: number): THREE.Vector3;
  /** Height above which the ground is snow-covered this turn [km]. */
  snowlineKm: number;
  /** Sea level [km]. */
  seaLevelKm: number;
}

/** Registered by the sky module; read by anything that needs the light. */
export interface EnvironmentProvider {
  /** Unit vector toward the sun. */
  sunDirection: THREE.Vector3;
  /** Colour and intensity of the sun light after atmosphere. */
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Ambient sky and ground colours. */
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  ambientIntensity: number;
  /** 0 night … 1 day, smoothed. */
  daylight: number;
  /** Fog colour and density the scene runs with. */
  fogColor: THREE.Color;
  fogDensity: number;
  /**
   * Cloud shadow map over the board, registered by the sky module when it has
   * one: a greyscale texture (1 = lit, 0 = fully shadowed) covering
   * `boardKm` from the world origin, drifting by `offset` [km] with the wind.
   * The terrain multiplies its lighting by it.
   */
  cloudShadow?: { texture: THREE.Texture; sizeKm: number; offset: THREE.Vector2; strength: number };
  /** Prefiltered environment map of the current sky for PBR reflections. */
  envMap?: THREE.Texture | null;
}

export interface Diagnostics {
  /** Report a problem in the player's words; the HUD prints it. */
  report(moduleId: string, message: string): void;
}

/** The camera as modules may read it — never move it, the rig owns it. */
export interface CameraView {
  camera: THREE.PerspectiveCamera;
  /** Distance from the camera to the point it looks at [km]. */
  distanceKm: number;
  /** Ground point the camera looks at. */
  target: THREE.Vector3;
}

export interface ModuleContext {
  /** The module's own root; hidden when the module fails. */
  root: THREE.Group;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  view: CameraView;
  quality: QualityTier;
  clock: FrameClock;
  motion: MotionSettings;
  /** Seeded stream: `rng("terrain:relief")`. Same seed → same numbers. */
  rng(stream: string): Rng;
  terrain: TerrainProvider;
  environment: EnvironmentProvider;
  diagnostics: Diagnostics;
  /** Terrain and sky register themselves; the registry hands them to everyone. */
  registerTerrain(provider: TerrainProvider): void;
  registerEnvironment(provider: EnvironmentProvider): void;
  /** Layer ids for raycast selection; the interaction layer picks on `pick`. */
  layers: { pick: number; bloom: number };
}

export interface WorldModule {
  /** Folder name: "terrain", "sky", "grid", … */
  id: string;
  init(ctx: ModuleContext): void | Promise<void>;
  /** The scene changed (a turn resolved, a build, a selection): rebuild what differs. */
  update(scene: WorldScene, previous: WorldScene | null, ctx: ModuleContext): void;
  /** Once per frame: animation only, never geometry rebuilds. */
  frame(dt: number, ctx: ModuleContext): void;
  dispose(): void;
}

export interface ModuleStatus {
  id: string;
  state: "pending" | "ready" | "failed";
  error: string | null;
  /** Milliseconds spent in the last update — the perf pass reads this. */
  lastUpdateMs: number;
  lastFrameMs: number;
}
