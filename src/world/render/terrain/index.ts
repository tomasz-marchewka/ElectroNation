// render/terrain — the physically lit relief model of the country (docs/08 §2,
// ARCHITECTURE.md §5–§6, §18). Consumes the scene's `seed`, `board`, `time`
// and `weather` slices and nothing else; registers the TerrainProvider every
// other module and the camera rig read. One ground mesh with the eight-layer
// splat material, one water surface, two instanced tree levels of detail.
// The field is rebuilt only when the seed, the board or the quality tier
// changes — the weather of a turn is a handful of uniforms.

import * as THREE from "three";
import type { WorldScene } from "../../bridge/worldScene";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, QualityTier, TerrainProvider, WorldModule } from "../core/types";
import { boardCenter } from "../core/units";
import { buildForest, type Forest } from "./forest";
import { buildHeightField, fieldIndices, fieldPositions, type HeightField } from "./heightfield";
import { clamp } from "./noise";
import { iceAmount, snowlineKm, wetness } from "./snowline";
import { createTerrainMaterial, type TerrainUniforms } from "./terrainMaterial";
import { disposeTerrainTextures, terrainTextures, type TerrainTextureSet } from "./terrainTextures";
import { createWater, type Water } from "./water";

/** Vertex spacing of the field per quality tier [km]. */
const CELL_KM: Record<QualityTier, number> = { high: 2, medium: 3, low: 3 };
/** Width of the skirt continuing the relief past the board [km]. */
const SKIRT_KM = 60;
/** Wind speed [m/s] at which the water surface is at its roughest. */
const WIND_FULL_MS = 15;
const DEG = Math.PI / 180;

/** One letter per terrain kind — the board's picture, for the rebuild key. */
const TERRAIN_LETTER: Record<WorldScene["board"]["hexes"][number]["terrain"], string> = {
  plains: ".",
  forest: "f",
  swamp: "s",
  highlands: "h",
  mountains: "m",
  urban: "u",
  lake: "l",
  sea: "~",
};

/** What the field depends on: the seed, the board and the tier's resolution. */
function buildKey(scene: WorldScene, tier: QualityTier): string {
  let picture = "";
  for (const hex of scene.board.hexes) picture += TERRAIN_LETTER[hex.terrain];
  return `${scene.seed}|${scene.board.cols}x${scene.board.rows}|${picture}|${tier}`;
}

export function createTerrainModule(): WorldModule {
  let ctxRef: ModuleContext | null = null;
  let textures: TerrainTextureSet | null = null;
  let field: HeightField | null = null;
  let builtKey: string | null = null;
  let ground: THREE.Mesh | null = null;
  let groundMaterial: THREE.MeshStandardMaterial | null = null;
  let uniforms: TerrainUniforms | null = null;
  let water: Water | null = null;
  let forest: Forest | null = null;
  /** The water's clock, held still while state-carrying motion is off. */
  let waterTime = 0;

  const provider: TerrainProvider = {
    heightAt: (x, z) => (field ? field.heightAt(x, z) : 0),
    normalAt: (x, z) => {
      if (!field) return new THREE.Vector3(0, 1, 0);
      const e = 0.5;
      const dx = (field.heightAt(x + e, z) - field.heightAt(x - e, z)) / (2 * e);
      const dz = (field.heightAt(x, z + e) - field.heightAt(x, z - e)) / (2 * e);
      return new THREE.Vector3(-dx, 1, -dz).normalize();
    },
    snowlineKm: Number.POSITIVE_INFINITY,
    seaLevelKm: 0,
  };

  const clear = (): void => {
    if (ground && ctxRef) ctxRef.root.remove(ground);
    ground?.geometry.dispose();
    groundMaterial?.dispose();
    ground = null;
    groundMaterial = null;
    uniforms = null;
    if (water && ctxRef) ctxRef.root.remove(water.mesh);
    water?.dispose();
    water = null;
    if (forest && ctxRef) ctxRef.root.remove(forest.near, forest.far);
    forest?.dispose();
    forest = null;
    field = null;
  };

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    clear();
    if (!textures) textures = terrainTextures();
    const profile = QUALITY_PROFILES[ctx.quality];
    field = buildHeightField(scene.board, ctx.rng("terrain:relief"), {
      cellKm: CELL_KM[ctx.quality],
      skirtKm: SKIRT_KM,
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(fieldPositions(field), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(field.normals, 3));
    geometry.setAttribute("weightsA", new THREE.BufferAttribute(field.weightsA, 4));
    geometry.setAttribute("weightsB", new THREE.BufferAttribute(field.weightsB, 4));
    geometry.setAttribute("occlusion", new THREE.BufferAttribute(field.occlusion, 1));
    geometry.setIndex(new THREE.BufferAttribute(fieldIndices(field), 1));
    geometry.computeBoundingSphere();
    const built = createTerrainMaterial(textures);
    groundMaterial = built.material;
    uniforms = built.uniforms;
    ground = new THREE.Mesh(geometry, groundMaterial);
    ground.name = "terrain-ground";
    ground.receiveShadow = true;
    ground.castShadow = profile.shadows && ctx.quality === "high";
    ground.frustumCulled = false;
    ctx.root.add(ground);

    water = createWater(field, textures, boardCenter(scene.board.cols, scene.board.rows));
    ctx.root.add(water.mesh);

    forest = buildForest(
      scene.board,
      field,
      ctx.rng("terrain:forest"),
      profile.detail,
      profile.shadows && ctx.quality === "high",
    );
    if (forest) {
      forest.setDistance(ctx.view.distanceKm);
      ctx.root.add(forest.near, forest.far);
    }
  };

  /** The turn's weather as uniforms: snowline, wetness, ice, wind on the water. */
  const applyWeather = (scene: WorldScene): void => {
    const weather = scene.weather;
    const snowline = snowlineKm(weather.snowCover, scene.time.month);
    provider.snowlineKm = snowline;
    forest?.setSnowline(snowline);
    if (uniforms) {
      uniforms.uSnowline.value = snowline;
      uniforms.uWetness.value = wetness(weather.precipitation, weather.fog);
    }
    if (water) {
      // The wind blows FROM windFromDeg (clockwise from north); the water drifts the other way.
      const from = weather.windFromDeg * DEG;
      water.uniforms.uWind.value.set(
        -Math.sin(from),
        Math.cos(from),
        clamp(weather.windMs.open / WIND_FULL_MS, 0, 1),
        0,
      );
      water.uniforms.uIce.value = iceAmount(weather.tempC, weather.snowCover);
    }
  };

  return {
    id: "terrain",

    init(ctx) {
      ctxRef = ctx;
      textures = terrainTextures();
      ctx.registerTerrain(provider);
    },

    update(scene, _previous, ctx) {
      ctxRef = ctx;
      const key = buildKey(scene, ctx.quality);
      if (key !== builtKey) {
        builtKey = key;
        rebuild(scene, ctx);
      }
      applyWeather(scene);
    },

    frame(_dt, ctx) {
      if (water) {
        if (ctx.motion.stateful) waterTime = ctx.clock.time;
        water.uniforms.uTime.value = waterTime;
        water.uniforms.uSkyColor.value.copy(ctx.environment.skyColor);
        water.uniforms.uHasEnv.value = ctx.environment.envMap ? 1 : 0;
      }
      if (uniforms && textures) {
        const cloud = ctx.environment.cloudShadow;
        if (cloud && cloud.strength > 0) {
          uniforms.uCloudMap.value = cloud.texture;
          uniforms.uCloudParams.value.set(
            cloud.sizeKm,
            cloud.offset.x,
            cloud.offset.y,
            cloud.strength,
          );
        } else {
          uniforms.uCloudMap.value = textures.white;
          uniforms.uCloudParams.value.set(1, 0, 0, 0);
        }
      }
      forest?.setDistance(ctx.view.distanceKm);
    },

    dispose() {
      clear();
      disposeTerrainTextures();
      textures = null;
      builtKey = null;
      ctxRef = null;
    },
  };
}
