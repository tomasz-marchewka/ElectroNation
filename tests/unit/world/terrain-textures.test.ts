// The ground texture set (src/world/render/terrain/terrainTextures.ts)
// outlives an unmount followed at once by a mount — React's StrictMode
// remounts every effect in development, and painting the ground again would
// double every boot — and is released once nobody takes it back.

import type * as THREE from "three";
import { describe, expect, test } from "vitest";
import {
  disposeTerrainTextures,
  terrainTextures,
} from "../../../src/world/render/terrain/terrainTextures";

// No WebGL here: the variant bake cannot start and the set falls back to the
// classic tiles, which is all this lifecycle needs.
const renderer = {} as THREE.WebGLRenderer;
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("terrain texture set", () => {
  test("a remount takes the painted set back; a real teardown releases it", async () => {
    const first = terrainTextures(renderer);
    expect(first.variantError).not.toBeNull();
    // StrictMode: the unmount and the mount run in one task.
    disposeTerrainTextures();
    expect(terrainTextures(renderer)).toBe(first);
    await nextTask();
    expect(terrainTextures(renderer)).toBe(first);
    // A real teardown: nobody takes the set back.
    disposeTerrainTextures();
    disposeTerrainTextures();
    await nextTask();
    const fresh = terrainTextures(renderer);
    expect(fresh).not.toBe(first);
    disposeTerrainTextures();
    await nextTask();
  }, 30_000);
});
