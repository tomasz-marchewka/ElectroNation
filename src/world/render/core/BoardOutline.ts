// The board's hex outlines: one LineSegments of every hex edge, drawn faintly
// over the terrain. A core module — it is the picking reference, the debug
// view of the layout, and the one guarantee that a world with every other
// module missing still shows where the hexes are.

import * as THREE from "three";
import type { WorldScene } from "../../bridge/worldScene";
import type { ModuleContext, WorldModule } from "./types";
import { HEX_RADIUS_KM, hexCorners } from "./units";

const LIFT_KM = 0.05;

export function createBoardOutlineModule(): WorldModule {
  let lines: THREE.LineSegments | null = null;
  let waterLines: THREE.LineSegments | null = null;
  let ctxRef: ModuleContext | null = null;
  let builtFor: string | null = null;

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    for (const old of [lines, waterLines]) {
      if (!old) continue;
      ctx.root.remove(old);
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }
    const positions: number[] = [];
    const waterPositions: number[] = [];
    for (const hex of scene.board.hexes) {
      // Water reads as water, not as a gridded plate: its outline is fainter.
      const target = hex.terrain === "sea" || hex.terrain === "lake" ? waterPositions : positions;
      const corners = hexCorners({ x: hex.x, z: hex.z }, HEX_RADIUS_KM * 0.985);
      for (let i = 0; i < 6; i++) {
        const a = corners[i]!;
        const b = corners[(i + 1) % 6]!;
        target.push(
          a.x,
          ctx.terrain.heightAt(a.x, a.z) + LIFT_KM,
          a.z,
          b.x,
          ctx.terrain.heightAt(b.x, b.z) + LIFT_KM,
          b.z,
        );
      }
    }
    const build = (data: number[], opacity: number, name: string): THREE.LineSegments => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
      const material = new THREE.LineBasicMaterial({
        color: 0x9fb3c6,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const segments = new THREE.LineSegments(geometry, material);
      segments.name = name;
      segments.renderOrder = 5;
      return segments;
    };
    lines = build(positions, 0.16, "board-outline");
    ctx.root.add(lines);
    waterLines = build(waterPositions, 0.05, "board-outline-water");
    ctx.root.add(waterLines);
  };

  return {
    id: "board",
    init(ctx) {
      ctxRef = ctx;
    },
    update(scene, previous, ctx) {
      const key = `${scene.board.cols}x${scene.board.rows}:${ctx.terrain.snowlineKm}`;
      if (builtFor === key && previous !== null) return;
      builtFor = key;
      rebuild(scene, ctx);
    },
    frame() {},
    dispose() {
      for (const old of [lines, waterLines]) {
        if (!old || !ctxRef) continue;
        ctxRef.root.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
      }
      lines = null;
      waterLines = null;
    },
  };
}
