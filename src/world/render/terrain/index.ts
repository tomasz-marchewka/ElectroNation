// render/terrain — the physically lit relief model of the country (docs/08 §2,
// ARCHITECTURE.md §5–§6, §18). Consumes the scene's `seed`, `board`, `time`
// and `weather` slices and nothing else; registers the TerrainProvider every
// other module and the camera rig read. One ground mesh with the eight-layer
// splat material, one water surface, instanced trees in two levels of detail.
// Every hex has its own look (looks.ts) — a character of its biome with its
// own ground variant (variants.ts, painted on the GPU at init), its tone and
// its own ground transform — drawn from the scene seed, and the looks of
// neighbouring hexes meet in soft, wandering borders (blend.ts). The field is
// rebuilt only when the seed, the board or the quality tier changes — the
// weather of a turn is a handful of uniforms.

import * as THREE from "three";
import type { WorldScene } from "../../bridge/worldScene";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, QualityTier, TerrainProvider, WorldModule } from "../core/types";
import { boardCenter } from "../core/units";
import { blendNoise, disposeBlendNoise } from "./blend";
import { buildForest, type Forest } from "./forest";
import { buildHeightField, fieldIndices, fieldPositions, type HeightField } from "./heightfield";
import { clamp } from "./noise";
import { boardLooks } from "./looks";
import { iceAmount, snowlineKm, wetness } from "./snowline";
import { createLookTexture, createTerrainMaterial, type TerrainUniforms } from "./terrainMaterial";
import { disposeTerrainTextures, terrainTextures, type TerrainTextureSet } from "./terrainTextures";
import { createWater, type Water } from "./water";

/** Width of the skirt continuing the relief past the board [km]. */
const SKIRT_KM = 60;
/** Wind speed [m/s] at which the water surface is at its roughest. */
const WIND_FULL_MS = 15;
const DEG = Math.PI / 180;

/**
 * Per-tier ground detail (ARCHITECTURE.md §13 — the tiers must be real), read
 * from the one knobs table in `core/Quality.ts`: the camera distance [km]
 * under which the per-layer normal maps and the second relief tap still pay
 * for themselves, the highest layer index sampled (above it the layer's mean
 * colour is folded in), and the ground texture anisotropy.
 */
interface GroundDetail {
  normal: number;
  alt: number;
  trim: number;
  aniso: number;
}

function detailFor(tier: QualityTier): GroundDetail {
  const profile = QUALITY_PROFILES[tier];
  return {
    normal: profile.terrainNormalKm,
    alt: profile.terrainAltKm,
    trim: profile.terrainSamples,
    aniso: profile.anisotropy,
  };
}
/** Water: full wave/foam detail below this distance [km], gone above it. */
const WATER_NEAR_KM = 60;
const WATER_FAR_KM = 200;
/** Open-water wind [m/s] where the sea starts to break into white horses and is full at 20. */
const STORM_FROM_MS = 12;
const STORM_FULL_MS = 20;

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
  let lookTexture: THREE.DataTexture | null = null;
  let uniforms: TerrainUniforms | null = null;
  let water: Water | null = null;
  let forest: Forest | null = null;
  /** The water's clock, held still while state-carrying motion is off. */
  let waterTime = 0;
  /** The tier + anisotropy band the textures last paid for. */
  let anisoBand = "";

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
    lookTexture?.dispose();
    ground = null;
    groundMaterial = null;
    lookTexture = null;
    uniforms = null;
    if (water && ctxRef) ctxRef.root.remove(water.mesh);
    water?.dispose();
    water = null;
    if (forest && ctxRef) ctxRef.root.remove(forest.group);
    forest?.dispose();
    forest = null;
    field = null;
  };

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    clear();
    if (!textures) throw new Error("terrain: textures not painted before the first scene");
    const profile = QUALITY_PROFILES[ctx.quality];
    const looks = boardLooks(scene.board, ctx.rng("terrain:looks"));
    const noise = blendNoise();
    field = buildHeightField(scene.board, ctx.rng("terrain:relief"), {
      cellKm: profile.terrainCellKm,
      skirtKm: SKIRT_KM,
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(fieldPositions(field), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(field.normals, 3));
    geometry.setAttribute("cover", new THREE.BufferAttribute(field.cover, 4));
    geometry.setIndex(new THREE.BufferAttribute(fieldIndices(field), 1));
    geometry.computeBoundingSphere();
    lookTexture = createLookTexture(looks.grid);
    const built = createTerrainMaterial(textures, looks.grid, lookTexture, noise.texture);
    groundMaterial = built.material;
    uniforms = built.uniforms;
    uniforms.uTrim.value = detailFor(ctx.quality).trim;
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
      looks.byKey,
      noise,
    );
    if (forest) {
      forest.setDistance(ctx.view.distanceKm);
      ctx.root.add(forest.group);
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
      // Below ~8° the sun's glancing specular on the land is capped (the
      // roughness ramp and the specular ceiling read this).
      uniforms.uLowSun.value = 1 - THREE.MathUtils.smoothstep(scene.sun.altitudeDeg, 2, 8);
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
      water.uniforms.uStorm.value = clamp(
        (weather.windMs.open - STORM_FROM_MS) / (STORM_FULL_MS - STORM_FROM_MS),
        0,
        1,
      );
    }
  };

  return {
    id: "terrain",

    init(ctx) {
      ctxRef = ctx;
      ctx.registerTerrain(provider);
      textures = terrainTextures(ctx.renderer);
      // Not a module failure (the HUD line would say "disabled"): the ground
      // is whole, it only loses the variants' variety.
      if (textures.variantError) {
        console.warn(
          `terrain: ground variants fell back to the classic tiles — ${textures.variantError}`,
        );
      }
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
      // Distance is the other quality knob: at the strategic view the per-layer
      // normals and the second relief tap are sub-pixel, so the tier's near
      // distances switch them off and the ground textures drop anisotropy.
      const detail = detailFor(ctx.quality);
      const near = detail.normal > 0 && ctx.view.distanceKm < detail.normal;
      const alternate = detail.alt > 0 && ctx.view.distanceKm < detail.alt;
      const anisoBandNow = `${ctx.quality}|${near ? detail.aniso : 1}`;
      if (textures && anisoBandNow !== anisoBand) {
        anisoBand = anisoBandNow;
        const aniso = near ? detail.aniso : 1;
        for (const map of [
          textures.albedo,
          textures.normal,
          textures.waves,
          textures.relief,
          textures.macro,
        ]) {
          if (map.anisotropy !== aniso) {
            map.anisotropy = aniso;
            map.needsUpdate = true;
          }
        }
      }
      if (uniforms) {
        uniforms.uNormalDetail.value = near ? 1 : 0;
        uniforms.uAltDetail.value = alternate ? 1 : 0;
      }
      if (water) {
        water.uniforms.uFar.value =
          1 - THREE.MathUtils.smoothstep(ctx.view.distanceKm, WATER_NEAR_KM, WATER_FAR_KM);
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
      // The lower tiers keep trees visible for a shorter reach (a tree is a
      // handful of pixels there), so their share of instances stays real.
      const profile = QUALITY_PROFILES[ctx.quality];
      forest?.setDistance(ctx.view.distanceKm / Math.max(0.3, profile.detail));
    },

    dispose() {
      clear();
      disposeTerrainTextures();
      disposeBlendNoise();
      textures = null;
      builtKey = null;
      ctxRef = null;
    },
  };
}
