// Mounts the renderer on a canvas and keeps it fed (ARCHITECTURE.md §3):
// scene models in, hex events out. The component owns the renderer's
// lifetime — creation, resize, interaction, the capture API — and nothing
// else: every number on screen comes from the scene it is handed.

import { useEffect, useRef, useState } from "react";
import type { WorldScene } from "./bridge/worldScene";
import { installCaptureApi } from "./capture/api";
import type { CaptureParams } from "./capture/params";
import { WorldLabels } from "./hud/WorldLabels";
import { useWorldSettings } from "./hud/settingsStore";
import { attachInteraction } from "./interaction/attach";
import { worldModules } from "./modules";
import type { QualityTier } from "./render/core/types";
import type { AxialHex } from "./render/core/units";
import { WorldRenderer } from "./render/core/WorldRenderer";
import type { ShowcaseFrame } from "./showcase/registry";

export interface WorldViewProps {
  scene: WorldScene;
  selectedHex: AxialHex | null;
  onHexClick: (hex: AxialHex) => void;
  onHexHover?: (hex: AxialHex | null) => void;
  /** Store action for the capture API's `resolve()`. */
  onResolve: () => void;
  params: CaptureParams;
  /** Module ids to load; the whole roster when omitted (showcase mode narrows it). */
  moduleIds?: readonly string[];
  /** Whether the capture/debug API is exposed on window. */
  exposeApi: boolean;
  /** Frames of the active showcase, handed to the capture API. */
  showcaseFrames?: readonly ShowcaseFrame[];
  /** Reports renderer diagnostics and the active tier upward. */
  onStatus?: (status: { diagnostics: string[]; tier: QualityTier; ready: boolean }) => void;
}

/**
 * The part of the map region the HUD leaves uncovered, as fractions: the
 * panel docks right, the ribbon and the report strip sit at the bottom, the
 * top bar on top. Measured from the DOM so presets frame the country between
 * them (docs/08 §7).
 */
function measureSafeFrame(host: HTMLElement): { x0: number; y0: number; x1: number; y1: number } {
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  const box = (selector: string) =>
    document.querySelector(selector)?.getBoundingClientRect() ?? null;
  const top = box(".en-topbar");
  const panel = box(".en-panel");
  const timeline = box(".en-timeline");
  const report = box(".en-report");
  const y0 = top ? (top.bottom - rect.top) / rect.height : 0;
  const x1 = panel ? (panel.left - rect.left) / rect.width : 1;
  const bottoms = [timeline, report].filter((b): b is DOMRect => b !== null).map((b) => b.top);
  const y1 = bottoms.length > 0 ? (Math.min(...bottoms) - rect.top) / rect.height : 1;
  return { x0: 0, y0, x1, y1 };
}

/** True when a WebGL2 context can be created — the fallback decision. */
export function webglAvailable(): boolean {
  if (typeof window === "undefined" || typeof WebGL2RenderingContext === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function WorldView({
  scene,
  selectedHex,
  onHexClick,
  onHexHover,
  onResolve,
  params,
  moduleIds,
  exposeApi,
  showcaseFrames,
  onStatus,
}: WorldViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const [renderer, setRenderer] = useState<WorldRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const motion = useWorldSettings((store) => store.motion);
  const quality = useWorldSettings((store) => store.quality);

  const latest = useRef({
    onHexClick,
    onHexHover,
    onResolve,
    selectedHex,
    onStatus,
    showcaseFrames,
  });
  latest.current = { onHexClick, onHexHover, onResolve, selectedHex, onStatus, showcaseFrames };
  const moduleKey = (moduleIds ?? []).join(",");

  // One renderer per mount. Module set, seed and clock pin are creation-time.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let world: WorldRenderer;
    try {
      world = new WorldRenderer({
        canvas,
        modules: worldModules(moduleIds),
        quality: params.quality ?? useWorldSettings.getState().quality,
        motion: params.motion ?? useWorldSettings.getState().motion,
        pinnedClock: params.clock,
        seed: scene.seed,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    rendererRef.current = world;
    setRenderer(world);
    const report = () =>
      latest.current.onStatus?.({
        diagnostics: [...world.diagnostics],
        tier: world.quality.tier,
        ready: world.isReady,
      });
    world.on("scene:ready", () => {
      setReady(true);
      host.dataset.sceneReady = "true";
      if (window.__en) window.__en.ready = true;
      report();
    });
    world.on("module:failed", report);
    world.on("perf:tier", report);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      world.resize(rect.width, rect.height);
      world.setSafeFrame(params.hud ? measureSafeFrame(host) : { x0: 0, y0: 0, x1: 1, y1: 1 });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    // The HUD lays out after the canvas; one more measure once it stands.
    const settle = window.setTimeout(resize, 0);

    const detach = attachInteraction(world, canvas, {
      onHexClick: (hex) => latest.current.onHexClick(hex),
      onHexHover: (hex) => latest.current.onHexHover?.(hex),
      selectedHex: () => latest.current.selectedHex,
    });
    if (exposeApi) {
      installCaptureApi(world, {
        select: (hex) => latest.current.onHexClick(hex),
        resolve: () => latest.current.onResolve(),
        showcaseFrames: () => [...(latest.current.showcaseFrames ?? [])],
      });
    }
    world.setScene(scene);
    if (params.camera) {
      const focus = params.focus
        ? { q: params.focus.col, r: params.focus.row - Math.floor(params.focus.col / 2) }
        : undefined;
      world.camera(params.camera, focus, false);
    }
    world.start();
    report();

    return () => {
      window.clearTimeout(settle);
      detach();
      observer.disconnect();
      world.dispose();
      rendererRef.current = null;
      setRenderer(null);
      setReady(false);
      delete host.dataset.sceneReady;
      if (window.__en) delete window.__en;
    };
    // The scene is pushed by the effect below; only creation-time inputs belong here.
  }, [moduleKey, params.clock, params.quality, params.motion, params.camera, exposeApi]);

  useEffect(() => {
    rendererRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    rendererRef.current?.setMotion(params.motion ?? motion);
  }, [motion, params.motion]);

  useEffect(() => {
    const world = rendererRef.current;
    if (!world) return;
    const tier: QualityTier | "auto" = params.quality ?? quality;
    if (tier !== "auto") world.setQuality(tier);
  }, [quality, params.quality]);

  return (
    <div className="en-world" ref={hostRef} data-world-ready={ready ? "true" : "false"}>
      <canvas className="en-world__canvas" ref={canvasRef} tabIndex={0} aria-label="Mapa kraju" />
      {error && <div className="en-world__fallback">⚠ renderer 3D nie wystartował — {error}</div>}
      {params.hud && <WorldLabels renderer={renderer} scene={scene} />}
    </div>
  );
}
