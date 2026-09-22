// render/sky — the sun, the atmosphere and the weather of the country
// (docs/08 §5–§6, ARCHITECTURE.md §7–§8, §18). Consumes `time`, `sun` and
// `weather` of the scene and nothing else; registers the EnvironmentProvider
// the core and every other module read (sun, ambient, fog, cloud shadow,
// environment map). A turn resolution eases the sky from the previous hour
// to the new one over 1,5 s on the frame clock (docs/08 §4); with the clock
// pinned or transitions off it snaps. The environment map and the cloud
// shadow texture are regenerated when the sky settles — never per frame.

import * as THREE from "three";
import type { WorldScene } from "../../bridge/worldScene";
import { FLAT_TERRAIN } from "../core/ModuleRegistry";
import { QUALITY_PROFILES } from "../core/Quality";
import type { EnvironmentProvider, ModuleContext, QualityTier, WorldModule } from "../core/types";
import { boardCenter } from "../core/units";
import { CLOUD_PERIOD_KM, CloudLayers } from "./Clouds";
import { LightRig } from "./LightRig";
import { Precipitation } from "./Precipitation";
import { ShowcaseStage } from "./ShowcaseStage";
import { SkyDome } from "./SkyDome";
import {
  blendState,
  copyState,
  deriveLighting,
  emptyLighting,
  emptyState,
  stateKey,
  targetState,
  type SkyState,
} from "./skyState";

/** docs/08 §4: the one cinematic moment. */
const TRANSITION_SECONDS = 1.5;
/** A near camera reads a haze with this reach [km]; below it the fog never gets denser. */
const FOG_NEAR_REFERENCE_KM = 120;
/** Past this view distance the camera is strategic: the fog wash stops growing. */
const STRATEGIC_VIEW_KM = 320;
/**
 * Cap of the fog reached at the view's far edge at strategic distance. The far
 * edge of the board sits at ~1,35× the camera distance, so a wash of 0,24
 * there leaves the far board ≥ 70 % of its albedo contrast (terrain's request);
 * closeup and golden keep the regime's full haze.
 */
const STRATEGIC_WASH_CAP = 0.24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * FogExp2 density from the regime's wash at the far edge of the current view:
 * the fog high is dense at closeup (visibility ~40 km) and still legible at
 * strategic distance, because the density follows the view (docs/08 §3).
 */
function fogDensityFor(state: SkyState, distanceKm: number): number {
  const want = clamp(state.look.wash * (0.5 + 0.8 * state.fog) + 0.1 * state.haze, 0.04, 0.85);
  const strategic = smoothstep(160, STRATEGIC_VIEW_KM, distanceKm);
  const wash = Math.min(want, want + (STRATEGIC_WASH_CAP - want) * strategic);
  const reference = Math.max(FOG_NEAR_REFERENCE_KM, distanceKm * 1.2);
  return Math.sqrt(-Math.log(1 - wash)) / reference;
}

export function createSkyModule(): WorldModule {
  const provider: EnvironmentProvider = {
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(1, 1, 1),
    sunIntensity: 0,
    skyColor: new THREE.Color(0.5, 0.6, 0.8),
    groundColor: new THREE.Color(0.2, 0.2, 0.18),
    ambientIntensity: 1,
    daylight: 1,
    fogColor: new THREE.Color(0.7, 0.75, 0.8),
    fogDensity: 0,
    envMap: null,
  };
  /** The one offset object the terrain reads every frame. */
  const shadowOffset = new THREE.Vector2();
  const shown = emptyState();
  const target = emptyState();
  const from = emptyState();
  const lighting = emptyLighting();

  let ctxRef: ModuleContext | null = null;
  let dome: SkyDome | null = null;
  let clouds: CloudLayers | null = null;
  let rain: Precipitation | null = null;
  let rig: LightRig | null = null;
  let stage: ShowcaseStage | null = null;
  let stageKey: string | null = null;
  let configuredTier: QualityTier | null = null;
  let lastKey: string | null = null;
  let boardKey: string | null = null;
  let transitioning = false;
  let transitionStart = 0;
  let lightingDirty = true;
  let finalizePending = false;

  const configure = (ctx: ModuleContext): void => {
    if (configuredTier === ctx.quality) return;
    configuredTier = ctx.quality;
    const profile = QUALITY_PROFILES[ctx.quality];
    rig?.configure(profile);
    dome?.configure(profile.stars);
    clouds?.configure(profile.cloudLayers === 2 ? 2 : 1, ctx.quality !== "low");
    rain?.configure(profile.particles);
    finalizePending = true;
  };

  /** The stage stands in for the terrain in the sky showcase only. */
  const ensureStage = (scene: WorldScene, ctx: ModuleContext): void => {
    const wanted = scene.overlay.showcase === "sky" && ctx.terrain === FLAT_TERRAIN;
    const key = wanted ? `${scene.board.cols}x${scene.board.rows}` : null;
    if (key === stageKey) return;
    stage?.dispose();
    stage = null;
    stageKey = key;
    if (!wanted) return;
    stage = new ShowcaseStage(scene.board, ctx.rng("sky:stage"));
    ctx.root.add(stage.group);
  };

  /** Derives the light from the shown state and pushes it everywhere. */
  const applyShown = (ctx: ModuleContext): void => {
    deriveLighting(shown, lighting);
    rig?.apply(lighting);
    dome?.apply(shown, lighting, clamp(0.12 + 0.88 * shown.fog, 0, 1));
    provider.sunDirection.copy(shown.sunDir);
    provider.sunColor.copy(lighting.sunColor);
    provider.sunIntensity = lighting.sunIntensity;
    provider.skyColor.copy(lighting.skyColor);
    provider.groundColor.copy(lighting.groundColor);
    provider.ambientIntensity = lighting.ambientIntensity;
    provider.daylight = shown.daylight;
    provider.fogColor.copy(lighting.fogColor);
    if (provider.cloudShadow) provider.cloudShadow.strength = lighting.cloudShadowStrength;
    rain?.setWeather(
      shown.precipitationKind,
      shown.precipitation,
      shown.tempC,
      shown.regime,
      shown.windMs,
      shown.windFromDeg,
    );
    ctx.scene.environmentIntensity = 0.6 * (0.5 + 0.5 * shown.daylight);
    lightingDirty = false;
  };

  /** The sky settled: the environment map and the cloud shadow follow it. */
  const finalize = (ctx: ModuleContext): void => {
    finalizePending = false;
    if (!dome || !clouds || !ctxRef) return;
    clouds.apply(shown, lighting, provider.fogDensity, ctx.view.distanceKm);
    clouds.renderShadow(ctx.renderer);
    const envMap = dome.generateEnvironment(ctx.renderer, QUALITY_PROFILES[ctx.quality].envMapSize);
    provider.envMap = envMap;
    ctx.scene.environment = envMap;
  };

  return {
    id: "sky",

    init(ctx) {
      ctxRef = ctx;
      rig = new LightRig(ctx.root);
      dome = new SkyDome(ctx.rng("sky:stars"), QUALITY_PROFILES[ctx.quality].stars);
      ctx.root.add(dome.mesh);
      clouds = new CloudLayers();
      ctx.root.add(clouds.group);
      provider.cloudShadow = {
        texture: clouds.shadowTexture,
        sizeKm: CLOUD_PERIOD_KM,
        offset: shadowOffset,
        strength: 0,
      };
      rain = new Precipitation(ctx.rng("sky:precipitation"));
      ctx.root.add(rain.points);
      configure(ctx);
      ctx.registerEnvironment(provider);
    },

    update(scene, previous, ctx) {
      configure(ctx);
      ensureStage(scene, ctx);
      const board = `${scene.board.cols}x${scene.board.rows}`;
      if (board !== boardKey) {
        boardKey = board;
        const centre = boardCenter(scene.board.cols, scene.board.rows);
        clouds?.setBoard(centre.x, centre.z);
      }
      const key = stateKey(scene);
      if (key === lastKey) {
        if (finalizePending) {
          applyShown(ctx);
          finalize(ctx);
        }
        return;
      }
      targetState(scene, target);
      const animate =
        lastKey !== null &&
        previous !== null &&
        ctx.motion.transitions &&
        !ctx.clock.pinned &&
        ctx.clock.scale > 0;
      lastKey = key;
      if (animate) {
        copyState(shown, from);
        transitioning = true;
        transitionStart = ctx.clock.time;
        lightingDirty = true;
        return;
      }
      transitioning = false;
      copyState(target, shown);
      provider.fogDensity = fogDensityFor(shown, ctx.view.distanceKm);
      applyShown(ctx);
      finalize(ctx);
    },

    frame(dt, ctx) {
      if (!dome || !clouds || !rig || !rain) return;
      if (transitioning) {
        const k = smoothstep(0, 1, (ctx.clock.time - transitionStart) / TRANSITION_SECONDS);
        blendState(from, target, k, shown);
        lightingDirty = true;
        if (k >= 1) {
          transitioning = false;
          finalizePending = true;
        }
      }
      provider.fogDensity = fogDensityFor(shown, ctx.view.distanceKm);
      if (lightingDirty) applyShown(ctx);
      if (finalizePending) finalize(ctx);
      if (ctx.motion.ambient) clouds.advance(dt, shown);
      clouds.apply(shown, lighting, provider.fogDensity, ctx.view.distanceKm);
      clouds.shadowOffset(lighting.sunLightDir, shadowOffset);
      rig.follow(ctx.view, lighting.sunLightDir, shown.moonDir);
      const pixelRatio = ctx.renderer.getPixelRatio();
      dome.frame(ctx.view.camera, pixelRatio);
      rain.frame(
        ctx.motion.ambient,
        ctx.clock.time,
        shown.daylight,
        ctx.view,
        lighting.fogColor,
        pixelRatio,
      );
      stage?.apply(provider);
    },

    dispose() {
      stage?.dispose();
      stage = null;
      rain?.dispose();
      rain = null;
      clouds?.dispose();
      clouds = null;
      dome?.dispose();
      dome = null;
      rig?.dispose();
      rig = null;
      if (ctxRef && ctxRef.scene.environment === provider.envMap) ctxRef.scene.environment = null;
      provider.envMap = null;
      delete provider.cloudShadow;
      ctxRef = null;
    },
  };
}
