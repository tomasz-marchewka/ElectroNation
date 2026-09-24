// `window.__en` — the capture and debug surface (ARCHITECTURE.md §15). Only
// installed in capture mode or a dev build; the harness and the e2e specs
// drive the world through it, so they never depend on DOM internals.

import type { WorldScene } from "../bridge/worldScene";
import type { RenderStats } from "../perf/budget";
import { budgetVerdict, type BudgetVerdict } from "../perf/budget";
import type { CameraPreset } from "../render/core/CameraRig";
import { glRendererName as glName, isSoftwareRenderer } from "../render/core/gl";
import type { ModuleStatus } from "../render/core/types";
import type { AxialHex } from "../render/core/units";
import type { WorldRenderer } from "../render/core/WorldRenderer";
import type { ShowcaseFrame } from "../showcase/registry";

export interface CaptureInfo {
  stats: RenderStats;
  /** Frame rate from rAF intervals — capped by the display's refresh. */
  fps: number;
  worstFrameMs: number;
  /** JS time per frame [ms]. */
  cpuMs: number;
  /** GPU time per frame [ms] from timer queries; null when unsupported. */
  gpuMs: number | null;
  gpuWorstMs: number | null;
  /** 60 fps on a mid-range laptop GPU, projected from gpuMs (BUDGET.devGpuFactor). */
  projectedMidRangeFps: number | null;
  frames: number;
  tier: string;
  /** Whether the GL renderer string names a software rasteriser. */
  software: boolean;
  glRenderer: string;
  budget: BudgetVerdict;
  modules: ModuleStatus[];
  diagnostics: string[];
}

export interface CaptureApi {
  ready: boolean;
  version: number;
  scene(): WorldScene | null;
  info(): CaptureInfo;
  /** Average fps over the next `frames` rendered frames. */
  fps(frames: number): Promise<number>;
  project(q: number, r: number): { x: number; y: number; visible: boolean; depth: number };
  hexAt(x: number, y: number): AxialHex | null;
  select(q: number, r: number): void;
  hover(q: number, r: number): void;
  camera(preset: CameraPreset, q?: number, r?: number): void;
  /** Resolves the pending turn — the app's own store action. */
  resolve(): void;
  /** Steps one frame with the pinned clock advanced by `dt` seconds. */
  step(dt: number): void;
  diagnostics(): string[];
  statuses(): ModuleStatus[];
  /** Frames of the active showcase (?showcase=), for the harness to walk. */
  showcaseFrames(): ShowcaseFrame[];
}

export interface CaptureHooks {
  select(hex: AxialHex): void;
  resolve(): void;
  showcaseFrames?: () => ShowcaseFrame[];
}

declare global {
  interface Window {
    __en?: CaptureApi;
  }
}

export function glRendererName(renderer: WorldRenderer): string {
  return glName(renderer.renderer.getContext());
}

export { isSoftwareRenderer };

export function installCaptureApi(renderer: WorldRenderer, hooks: CaptureHooks): CaptureApi {
  const api: CaptureApi = {
    ready: false,
    version: 1,
    scene: () => renderer.sceneModel,
    info: () => {
      const stats = renderer.stats();
      const glRenderer = glRendererName(renderer);
      const software = isSoftwareRenderer(glRenderer);
      const fps = renderer.fps.fps(120);
      const gpuMs = renderer.gpu?.averageMs(120) ?? null;
      return {
        stats,
        fps,
        worstFrameMs: renderer.fps.worstMs(120),
        cpuMs: renderer.cpu.fps(120) > 0 ? 1000 / renderer.cpu.fps(120) : 0,
        gpuMs,
        gpuWorstMs: renderer.gpu?.worstMs(120) ?? null,
        projectedMidRangeFps: gpuMs !== null && gpuMs > 0 ? 1000 / (gpuMs * 2.5) : null,
        frames: renderer.frames,
        tier: renderer.quality.tier,
        software,
        glRenderer,
        budget: budgetVerdict(
          stats,
          renderer.fps.count >= 30 ? fps : null,
          software,
          software ? null : gpuMs,
        ),
        modules: renderer.statuses(),
        diagnostics: [...renderer.diagnostics],
      };
    },
    fps: (frames) =>
      new Promise((resolve) => {
        const start = renderer.frames;
        renderer.fps.reset();
        renderer.cpu.reset();
        renderer.gpu?.reset();
        const poll = () => {
          if (renderer.frames - start >= frames) resolve(renderer.fps.fps(frames));
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }),
    project: (q, r) => renderer.project({ q, r }),
    hexAt: (x, y) => renderer.hexAt(x, y),
    select: (q, r) => hooks.select({ q, r }),
    hover: (q, r) => renderer.setHover({ q, r }),
    camera: (preset, q, r) =>
      renderer.camera(preset, q !== undefined && r !== undefined ? { q, r } : undefined, false),
    resolve: () => hooks.resolve(),
    step: (dt) => {
      if (renderer.clock.pinned) renderer.clock.pin(renderer.clock.time + dt);
      renderer.frame(performance.now());
    },
    diagnostics: () => [...renderer.diagnostics],
    statuses: () => renderer.statuses(),
    showcaseFrames: () => hooks.showcaseFrames?.() ?? [],
  };
  window.__en = api;
  return api;
}
