// Picking against the relief, not a flat plane (docs/08 §8, ARCHITECTURE.md §15):
// a click on a mountain hex must select that hex. The renderer's own `hexAt`
// refines a ground-plane hit with four fixed-point steps, which drifts on steep
// slopes; this picker marches the terrain module's heightfield along the camera
// ray in two resolutions and bisects the first crossing, so the point it returns
// lies on the surface that is drawn. It reads only the renderer's public surface
// (`rig.camera`, `heightAt`, `sceneModel`) and never draws anything.

import * as THREE from "three";
import type { WorldScene } from "../bridge/worldScene";
import type { WorldRenderer } from "../render/core/WorldRenderer";
import { worldToHex, type AxialHex } from "../render/core/units";

/** Coarse step of the march [km] — over the ~5–13 km relief features. */
const COARSE_STEP_KM = 16;
/** Fine step inside the bracket [km] — under the relief wavelength. */
const FINE_STEP_KM = 4;
/** How far along the ray the march follows it [km] — past the skirt and beyond. */
const MARCH_MAX_KM = 2_560;
/** Bisection passes after a crossing: 4 km / 2¹⁴ ≈ 25 cm. */
const BISECTIONS = 14;

export interface GroundHit {
  x: number;
  y: number;
  z: number;
  /** Distance from the camera along the ray [km]. */
  distance: number;
}

export class ReliefPicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private board: WorldScene["board"] | null = null;
  private known = new Set<string>();

  constructor(private readonly renderer: WorldRenderer) {}

  /**
   * Ground point under a canvas pixel (CSS pixels within the canvas), or null
   * when the ray leaves the relief without meeting it.
   */
  groundAt(px: number, py: number): GroundHit | null {
    const { width, height } = this.renderer.canvasSize;
    if (width <= 0 || height <= 0) return null;
    const camera = this.renderer.rig.camera;
    // The rig applied the last move already; keep the ray in step with it even
    // when a pointer event lands between two frames.
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(
      this.ndc.set((px / width) * 2 - 1, -((py / height) * 2 - 1)),
      camera,
    );
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    // Height of the terrain under the ray at distance t along it [km].
    const heightAt = (t: number): number =>
      this.renderer.heightAt(origin.x + direction.x * t, origin.z + direction.z * t);
    const gap = (t: number): number => origin.y + direction.y * t - heightAt(t);

    if (gap(0) <= 0) return { x: origin.x, y: origin.y, z: origin.z, distance: 0 };

    // Coarse pass: bracket the first sample that is below the surface, then
    // re-march the bracket finely — a narrow crest between two coarse samples
    // is caught by the fine pass before the bisection takes over.
    let bracketStart = -1;
    let bracketEnd = -1;
    for (let t = COARSE_STEP_KM; t <= MARCH_MAX_KM; t += COARSE_STEP_KM) {
      if (gap(t) <= 0) {
        bracketStart = Math.max(0, t - COARSE_STEP_KM);
        bracketEnd = t;
        break;
      }
    }
    if (bracketStart < 0) return null;
    let low = bracketStart;
    for (let t = bracketStart + FINE_STEP_KM; t < bracketEnd; t += FINE_STEP_KM) {
      if (gap(t) <= 0) {
        bracketEnd = t;
        break;
      }
      low = t;
    }
    let high = bracketEnd;
    for (let i = 0; i < BISECTIONS; i++) {
      const mid = (low + high) / 2;
      if (gap(mid) > 0) low = mid;
      else high = mid;
    }
    const t = (low + high) / 2;
    return {
      x: origin.x + direction.x * t,
      y: origin.y + direction.y * t,
      z: origin.z + direction.z * t,
      distance: t,
    };
  }

  /** The board hex under a canvas pixel, or null off the board or in the sky. */
  hexAt(px: number, py: number): AxialHex | null {
    const hit = this.groundAt(px, py);
    return hit ? this.hexAtPoint(hit) : null;
  }

  /** The board hex containing a ground point, or null off the board. */
  hexAtPoint(point: { x: number; z: number }): AxialHex | null {
    const board = this.renderer.sceneModel?.board;
    if (!board) return null;
    if (board !== this.board) {
      // The board object survives the hover-only scene copies, so this cache is
      // rebuilt once per world, not once per hover.
      this.board = board;
      this.known = new Set(board.hexes.map((hex) => hex.key));
    }
    const hex = worldToHex(point);
    return this.known.has(`${hex.q},${hex.r}`) ? hex : null;
  }
}
