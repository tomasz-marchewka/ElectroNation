// Module registry with failure isolation (ARCHITECTURE.md §11): every module
// call is wrapped, a module that throws is disabled and its root hidden, and
// the rest of the world keeps running. The registry also owns the two shared
// providers (terrain, environment) with flat defaults, so a module can run
// before — or without — the modules that normally register them.

import * as THREE from "three";
import type { WorldScene } from "../../bridge/worldScene";
import type {
  Diagnostics,
  EnvironmentProvider,
  ModuleContext,
  ModuleStatus,
  TerrainProvider,
  WorldModule,
} from "./types";

export const FLAT_TERRAIN: TerrainProvider = {
  heightAt: () => 0,
  normalAt: () => new THREE.Vector3(0, 1, 0),
  snowlineKm: Number.POSITIVE_INFINITY,
  seaLevelKm: 0,
};

export function defaultEnvironment(): EnvironmentProvider {
  return {
    sunDirection: new THREE.Vector3(0.3, 0.8, 0.5).normalize(),
    sunColor: new THREE.Color(1, 0.98, 0.94),
    sunIntensity: 2.5,
    skyColor: new THREE.Color(0.55, 0.7, 0.95),
    groundColor: new THREE.Color(0.25, 0.28, 0.22),
    ambientIntensity: 0.5,
    daylight: 1,
    fogColor: new THREE.Color(0.7, 0.78, 0.9),
    fogDensity: 0,
  };
}

type Shared = Omit<ModuleContext, "root">;

export class ModuleRegistry {
  private readonly modules: { module: WorldModule; ctx: ModuleContext; status: ModuleStatus }[] =
    [];
  private lastScene: WorldScene | null = null;
  private readonly onFailed: (id: string, error: string) => void;
  private readonly diagnostics: Diagnostics;

  constructor(
    private readonly shared: Shared,
    private readonly parent: THREE.Object3D,
    onFailed: (id: string, error: string) => void,
  ) {
    this.onFailed = onFailed;
    this.diagnostics = shared.diagnostics;
  }

  /** Terrain and sky first: the others read their providers (ARCHITECTURE §11). */
  add(module: WorldModule): void {
    const root = new THREE.Group();
    root.name = `module:${module.id}`;
    this.parent.add(root);
    const ctx: ModuleContext = { ...this.shared, root };
    this.modules.push({
      module,
      ctx,
      status: { id: module.id, state: "pending", error: null, lastUpdateMs: 0, lastFrameMs: 0 },
    });
  }

  /** Providers registered later reach every module through the shared object. */
  private refreshContexts(): void {
    for (const entry of this.modules) {
      entry.ctx.terrain = this.shared.terrain;
      entry.ctx.environment = this.shared.environment;
      entry.ctx.quality = this.shared.quality;
      entry.ctx.motion = this.shared.motion;
    }
  }

  async init(): Promise<void> {
    for (const entry of this.modules) {
      this.refreshContexts();
      try {
        await entry.module.init(entry.ctx);
        entry.status.state = "ready";
      } catch (error) {
        this.fail(entry, error);
      }
    }
    this.refreshContexts();
    // Modules initialised before a provider showed up are updated once more.
    if (this.lastScene) this.update(this.lastScene, null);
  }

  update(scene: WorldScene, previous: WorldScene | null): void {
    this.lastScene = scene;
    this.refreshContexts();
    for (const entry of this.modules) {
      if (entry.status.state !== "ready") continue;
      const started = performance.now();
      try {
        entry.module.update(scene, previous, entry.ctx);
      } catch (error) {
        this.fail(entry, error);
      }
      entry.status.lastUpdateMs = performance.now() - started;
    }
  }

  frame(dt: number): void {
    for (const entry of this.modules) {
      if (entry.status.state !== "ready") continue;
      const started = performance.now();
      try {
        entry.module.frame(dt, entry.ctx);
      } catch (error) {
        this.fail(entry, error);
      }
      entry.status.lastFrameMs = performance.now() - started;
    }
  }

  /** Re-applies quality and motion to every module through a fresh update. */
  refresh(): void {
    if (this.lastScene) this.update(this.lastScene, this.lastScene);
  }

  private fail(entry: (typeof this.modules)[number], error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    entry.status.state = "failed";
    entry.status.error = message;
    entry.ctx.root.visible = false;
    this.diagnostics.report(entry.module.id, message);
    this.onFailed(entry.module.id, message);
  }

  statuses(): ModuleStatus[] {
    return this.modules.map((entry) => ({ ...entry.status }));
  }

  dispose(): void {
    for (const entry of this.modules) {
      try {
        entry.module.dispose();
      } catch {
        // Disposal errors are not worth a diagnosis; the page is going away.
      }
      this.parent.remove(entry.ctx.root);
    }
    this.modules.length = 0;
  }
}
