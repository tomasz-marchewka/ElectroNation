// The performance budget of the brief (ARCHITECTURE.md §13), as numbers a
// capture log can be checked against. Estimation, not measurement, for GPU
// memory: WebGL exposes no allocation counter, so the scene graph is walked
// and every unique geometry buffer and texture is sized.

import * as THREE from "three";

export const BUDGET = {
  fps: 60,
  /**
   * GPU time per frame the development machine may spend so that a mid-range
   * laptop GPU still makes 60 fps. ASSUMPTION, documented in docs/STATUS.json:
   * the Apple M3 Pro is taken as ~2.5× a mid-range laptop GPU, so 16,7 ms of
   * budget there is ~6,7 ms here. Re-measure on a mid-range machine when one
   * is at hand; the projection is reported as a projection.
   */
  gpuMsOnDevMachine: 16.7 / 2.5,
  devGpuFactor: 2.5,
  drawCalls: 800,
  triangles: 3_000_000,
  gpuBytes: 400 * 1024 * 1024,
  transferBytes: 40 * 1024 * 1024,
  firstInteractiveMs: 4_000,
} as const;

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  programs: number;
  geometries: number;
  textures: number;
  gpuBytesEstimate: number;
}

export interface BudgetVerdict {
  ok: boolean;
  failures: string[];
}

function geometryBytes(geometry: THREE.BufferGeometry): number {
  let bytes = 0;
  for (const attribute of Object.values(geometry.attributes)) {
    const array = (attribute as THREE.BufferAttribute).array;
    bytes += array.byteLength;
  }
  if (geometry.index) bytes += geometry.index.array.byteLength;
  return bytes;
}

function textureBytes(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  // RGBA8 plus a full mip chain (×4/3).
  return Math.round(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
}

/** Walks the scene once and sizes every unique buffer and texture. */
export function estimateGpuBytes(scene: THREE.Object3D): number {
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  let bytes = 0;
  for (const geometry of geometries) bytes += geometryBytes(geometry);
  for (const texture of textures) bytes += textureBytes(texture);
  return bytes;
}

export function renderStats(renderer: THREE.WebGLRenderer, scene: THREE.Object3D): RenderStats {
  const info = renderer.info;
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    programs: info.programs?.length ?? 0,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    gpuBytesEstimate: estimateGpuBytes(scene),
  };
}

/** Checks a measured frame against the budget; fps is skipped when `software` rendering is flagged. */
export function budgetVerdict(
  stats: RenderStats,
  fps: number | null,
  software: boolean,
  gpuMs: number | null = null,
): BudgetVerdict {
  const failures: string[] = [];
  if (gpuMs !== null && !software && gpuMs > BUDGET.gpuMsOnDevMachine) {
    failures.push(
      `gpu ${gpuMs.toFixed(2)} ms/frame > ${BUDGET.gpuMsOnDevMachine.toFixed(1)} ms (projected ${(1000 / (gpuMs * BUDGET.devGpuFactor)).toFixed(0)} fps on a mid-range GPU)`,
    );
  }
  if (stats.drawCalls > BUDGET.drawCalls)
    failures.push(`draw calls ${stats.drawCalls} > ${BUDGET.drawCalls}`);
  if (stats.triangles > BUDGET.triangles)
    failures.push(`triangles ${stats.triangles} > ${BUDGET.triangles}`);
  if (stats.gpuBytesEstimate > BUDGET.gpuBytes) {
    failures.push(`gpu bytes ${stats.gpuBytesEstimate} > ${BUDGET.gpuBytes}`);
  }
  if (fps !== null && !software && fps < BUDGET.fps)
    failures.push(`fps ${fps.toFixed(1)} < ${BUDGET.fps}`);
  return { ok: failures.length === 0, failures };
}
