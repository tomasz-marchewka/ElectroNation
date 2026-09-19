// The renderer (ARCHITECTURE.md §11–§13): one WebGL context, one scene graph
// with a root per module, the camera rig, the frame loop on the world clock,
// post-processing and the quality controller. It hands the scene model to the
// registry and never reads the engine — a WorldScene is all it knows.

import * as THREE from "three";
import type { HexRef, WorldScene } from "../../bridge/worldScene";
import { FpsMeter } from "../../perf/fpsMeter";
import { GpuTimer } from "../../perf/gpuTimer";
import { renderStats, type RenderStats } from "../../perf/budget";
import { CameraRig, type CameraPreset, type RigState, type SafeFrame } from "./CameraRig";
import { FrameClock } from "./FrameClock";
import { FLAT_TERRAIN, ModuleRegistry, defaultEnvironment } from "./ModuleRegistry";
import { PostFx } from "./PostFx";
import { QualityController, QUALITY_PROFILES } from "./Quality";
import { worldRng } from "./prng";
import { disposeTextures } from "./textures";
import {
  motionSettings,
  type Diagnostics,
  type EnvironmentProvider,
  type ModuleContext,
  type ModuleStatus,
  type MotionMode,
  type QualityTier,
  type TerrainProvider,
  type WorldModule,
} from "./types";
import { boardSize, hexToWorld, worldToHex, type AxialHex } from "./units";

export type WorldEvent =
  | { type: "scene:ready" }
  | { type: "module:failed"; id: string; error: string }
  | { type: "camera:change" }
  | { type: "perf:tier"; tier: QualityTier }
  | { type: "diagnostic"; id: string; message: string };

export type WorldEventType = WorldEvent["type"];

export interface WorldRendererOptions {
  canvas: HTMLCanvasElement;
  modules: WorldModule[];
  quality: QualityTier | "auto";
  motion: MotionMode;
  /** Pinned animation clock [s]; null runs free. */
  pinnedClock: number | null;
  seed: number;
}

export interface Projected {
  /** CSS pixels within the canvas. */
  x: number;
  y: number;
  /** Distance from the camera [km]. */
  depth: number;
  /** In front of the camera and inside the viewport. */
  visible: boolean;
}

/** Layer ids for raycast selection and selective effects. */
export const LAYERS = { pick: 1, bloom: 2 } as const;

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly clock = new FrameClock();
  readonly quality: QualityController;
  /** Frame intervals (rAF to rAF) — the number a player would call fps. */
  readonly fps = new FpsMeter();
  /** JS time per frame: registry, environment, draw submission. */
  readonly cpu = new FpsMeter();
  /** GPU time per frame when the driver exposes timer queries; null otherwise. */
  readonly gpu: GpuTimer | null;
  private lastFrameAt: number | null = null;
  readonly ready: Promise<void>;
  readonly diagnostics: string[] = [];
  isReady = false;
  /** Frames rendered since start; the capture waits for a few. */
  frames = 0;

  private readonly registry: ModuleRegistry;
  private readonly postFx: PostFx;
  private readonly shared: Omit<ModuleContext, "root">;
  private readonly listeners = new Map<WorldEventType, Set<(event: WorldEvent) => void>>();
  private current: WorldScene | null = null;
  private previous: WorldScene | null = null;
  private frameHandle: number | null = null;
  private width = 1;
  private height = 1;
  private readyResolved = false;
  private resolveReady: () => void = () => {};
  private sceneSetAtLeastOnce = false;
  private disposed = false;

  constructor(options: WorldRendererOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.gpu = GpuTimer.create(this.renderer.getContext() as WebGL2RenderingContext);

    this.quality = new QualityController(options.quality);
    this.clock.pin(options.pinnedClock);
    this.rig = new CameraRig(this.clock, 16 / 9);
    this.rig.onChange(() => this.emit({ type: "camera:change" }));
    this.postFx = new PostFx(this.renderer, this.scene, this.rig.camera);

    const diagnostics: Diagnostics = {
      report: (id, message) => {
        const line = `⚠ moduł ${id} wyłączony — ${message}`;
        if (!this.diagnostics.includes(line)) this.diagnostics.push(line);
        this.emit({ type: "diagnostic", id, message });
      },
    };
    const shared: Omit<ModuleContext, "root"> = {
      scene: this.scene,
      renderer: this.renderer,
      view: this.rig,
      quality: this.quality.tier,
      clock: this.clock,
      motion: motionSettings(options.motion),
      rng: (stream) => worldRng(options.seed, stream),
      terrain: FLAT_TERRAIN,
      environment: defaultEnvironment(),
      diagnostics,
      registerTerrain: (provider: TerrainProvider) => {
        this.shared.terrain = provider;
        this.rig.setTerrain((x, z) => provider.heightAt(x, z));
      },
      registerEnvironment: (provider: EnvironmentProvider) => {
        this.shared.environment = provider;
      },
      layers: LAYERS,
    };
    this.shared = shared;
    this.registry = new ModuleRegistry(shared, this.scene, (id, error) =>
      this.emit({ type: "module:failed", id, error }),
    );
    for (const module of options.modules) this.registry.add(module);

    this.quality.onChange((tier) => {
      this.shared.quality = tier;
      this.applyQuality();
      this.registry.refresh();
      this.emit({ type: "perf:tier", tier });
    });
    this.applyQuality();

    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    void this.registry.init().then(() => {
      if (this.current) this.registry.update(this.current, null);
      this.sceneSetAtLeastOnce = this.current !== null;
    });
  }

  on<T extends WorldEventType>(
    type: T,
    listener: (event: Extract<WorldEvent, { type: T }>) => void,
  ): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as (event: WorldEvent) => void);
    this.listeners.set(type, set);
    return () => {
      set.delete(listener as (event: WorldEvent) => void);
    };
  }

  private emit(event: WorldEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }

  /** A new scene model: the registry diffs it against the previous one. */
  setScene(scene: WorldScene): void {
    const first = this.current === null;
    this.previous = this.current;
    this.current = scene;
    if (first) this.rig.setBoard(scene.board.cols, scene.board.rows);
    this.registry.update(scene, this.previous);
    if (first && this.rig.distanceKm === 400) this.rig.set(this.rig.preset("strategic"));
    this.sceneSetAtLeastOnce = true;
  }

  get sceneModel(): WorldScene | null {
    return this.current;
  }

  /** Hover moves often; only the overlay changes, so modules diff cheaply. */
  setHover(hex: AxialHex | null): void {
    if (!this.current) return;
    const ref: HexRef | null = hex ? { q: hex.q, r: hex.r, key: `${hex.q},${hex.r}` } : null;
    if ((this.current.overlay.hover?.key ?? null) === (ref?.key ?? null)) return;
    this.setScene({ ...this.current, overlay: { ...this.current.overlay, hover: ref } });
  }

  setMotion(mode: MotionMode): void {
    this.shared.motion = motionSettings(mode);
    this.clock.scale = mode === "none" ? 0 : 1;
    this.registry.refresh();
  }

  setQuality(tier: QualityTier): void {
    this.quality.set(tier);
  }

  private applyQuality(): void {
    const profile = QUALITY_PROFILES[this.quality.tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
    this.renderer.shadowMap.enabled = profile.shadows;
    this.postFx.configure(profile, this.width, this.height);
  }

  /** The uncovered part of the viewport, from the HUD's own measurements. */
  setSafeFrame(frame: SafeFrame): void {
    this.rig.setSafeFrame(frame);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, false);
    this.rig.setAspect(this.width / this.height);
    this.postFx.setSize(this.width, this.height);
  }

  camera(preset: CameraPreset, hex?: AxialHex, animate = true): void {
    const at = hex ? hexToWorld(hex) : undefined;
    this.rig.flyTo(this.rig.preset(preset, at), animate && this.shared.motion.transitions);
  }

  flyTo(state: RigState, animate = true): void {
    this.rig.flyTo(state, animate && this.shared.motion.transitions);
  }

  heightAt(x: number, z: number): number {
    return this.shared.terrain.heightAt(x, z);
  }

  /** Ground point under a canvas pixel, refined against the terrain relief. */
  groundAt(px: number, py: number): { x: number; z: number; y: number } | null {
    const ndcX = (px / this.width) * 2 - 1;
    const ndcY = -((py / this.height) * 2 - 1);
    let y = 0;
    let hit: THREE.Vector3 | null = null;
    for (let i = 0; i < 4; i++) {
      hit = this.rig.groundAt(ndcX, ndcY, y);
      if (!hit) return null;
      y = this.shared.terrain.heightAt(hit.x, hit.z);
    }
    return hit ? { x: hit.x, z: hit.z, y } : null;
  }

  /** The hex under a canvas pixel, or null off the board or in the sky. */
  hexAt(px: number, py: number): AxialHex | null {
    const ground = this.groundAt(px, py);
    if (!ground || !this.current) return null;
    const hex = worldToHex(ground);
    const size = boardSize(this.current.board.cols, this.current.board.rows);
    if (ground.x < -size.width || ground.x > size.width * 2) return null;
    const known = this.current.board.hexes.some((h) => h.q === hex.q && h.r === hex.r);
    return known ? hex : null;
  }

  /** Screen position of a hex's ground point plus `liftKm` above it. */
  project(hex: AxialHex, liftKm = 0): Projected {
    const ground = hexToWorld(hex);
    const point = new THREE.Vector3(
      ground.x,
      this.shared.terrain.heightAt(ground.x, ground.z) + liftKm,
      ground.z,
    );
    const depth = point.distanceTo(this.rig.camera.position);
    const ndc = point.project(this.rig.camera);
    const visible = ndc.z < 1 && ndc.x >= -1.05 && ndc.x <= 1.05 && ndc.y >= -1.05 && ndc.y <= 1.05;
    return {
      x: ((ndc.x + 1) / 2) * this.width,
      y: ((1 - ndc.y) / 2) * this.height,
      depth,
      visible,
    };
  }

  get canvasSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  start(): void {
    if (this.frameHandle !== null || this.disposed) return;
    const loop = (now: number) => {
      this.frameHandle = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  /** One frame; public so the capture harness can step a pinned world. */
  frame(now: number): void {
    if (this.disposed) return;
    this.clock.tick(now);
    this.rig.update();
    // The interval between frames is the frame rate; the JS time is the CPU cost.
    if (this.lastFrameAt !== null) {
      const interval = Math.max(0.01, now - this.lastFrameAt);
      this.fps.push(interval);
      this.quality.sample(interval);
    }
    this.lastFrameAt = now;
    const started = performance.now();
    this.gpu?.begin();
    this.registry.frame(this.clock.dt);
    this.applyEnvironment();
    this.renderer.info.reset();
    this.postFx.render();
    this.gpu?.end();
    this.cpu.push(performance.now() - started);
    this.gpu?.poll();
    this.frames += 1;
    if (!this.readyResolved && this.sceneSetAtLeastOnce && this.frames >= 3) {
      this.readyResolved = true;
      this.isReady = true;
      this.resolveReady();
      this.emit({ type: "scene:ready" });
    }
  }

  private applyEnvironment(): void {
    const env = this.shared.environment;
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (env.fogDensity > 0) {
      if (fog && "density" in fog) {
        fog.color.copy(env.fogColor);
        fog.density = env.fogDensity;
      } else {
        this.scene.fog = new THREE.FogExp2(env.fogColor.getHex(), env.fogDensity);
      }
    } else if (this.scene.fog) {
      this.scene.fog = null;
    }
    this.renderer.toneMappingExposure = 0.85 + (1 - env.daylight) * 0.6;
    this.postFx.setDaylight(env.daylight);
  }

  stats(): RenderStats {
    return renderStats(this.renderer, this.scene);
  }

  statuses(): ModuleStatus[] {
    return this.registry.statuses();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.registry.dispose();
    this.postFx.dispose();
    disposeTextures();
    this.renderer.dispose();
  }
}
