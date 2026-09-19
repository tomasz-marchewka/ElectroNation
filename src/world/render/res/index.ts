// render/res — wind farms (onshore, offshore) and PV arrays (docs/08 §2–§4,
// ARCHITECTURE.md §8–§9, §18). Consumes `farms`, `weather.windFromDeg`, `sun`
// and the seed of the scene and nothing else. Every repeated part is one
// InstancedMesh (towers, nacelles, running rotors, feathered rotors, rotor
// discs, aviation glows, pedestals, monopile foundations, substations,
// platforms, PV tables, PV frames, inverter stations); the fence and the
// gravel pad of the PV farms are merged static meshes.
//
// State encoding (docs/08 §3): a spinning farm turns at rotorSpeed × rated
// rpm under state-carrying motion and shows a faint rotor disc as its static
// twin; a still farm parks every rotor in the same "Y"; a feathered farm
// (storm) shows edge-on blades, parked; an off farm is parked with its
// nacelle lights out. Every nacelle yaws into scene.weather.windFromDeg.
// Curtailment rings and disabled markers are effects' — this module leaves an
// Object3D `res:base:<farmId>` at every farm centre for them.
//
// Layouts are rebuilt only when a farm's identity (id, tech, capacity,
// enabled, offshore, units, footprint, hex), the seed, the quality tier or
// the terrain provider changes; the turn's state (rotor, wind, lights) is a
// refill of the small state pools.

import * as THREE from "three";
import type { RotorState, WorldFarm, WorldScene } from "../../bridge/worldScene";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, TerrainProvider, WorldModule } from "../core/types";
import { hexToWorld } from "../core/units";
import {
  createDiscMaterial,
  createGlowMaterial,
  glowGeometry,
  type DiscUniforms,
  type GlowUniforms,
} from "./lights";
import {
  farmRadiusKm,
  pvLayout,
  turbineSites,
  PV_SEGMENT_KM,
  type GroundOffset,
  type PvLayout,
  type TurbineSite,
} from "./layout";
import {
  createResMaterials,
  createScreenUniforms,
  type ResMaterials,
  type ScreenUniforms,
} from "./materials";
import { InstancePool } from "./pool";
import {
  fenceGeometry,
  inverterGeometry,
  padGeometry,
  pvFrameGeometry,
  pvTableGeometry,
} from "./pv";
import {
  FEATHERED_ANGLE,
  HUB_HEIGHT_KM,
  HUB_OFFSET_KM,
  LIGHT_OFFSET,
  PARKED_ANGLE,
  RATED_ROTOR_RAD_S,
  TP_TOP_KM,
  discGeometry,
  foundationGeometry,
  merged,
  nacelleGeometry,
  pedestalGeometry,
  platformGeometry,
  rotorGeometry,
  substationGeometry,
  towerGeometry,
  towerHeight,
} from "./turbine";

const DEG = Math.PI / 180;
/**
 * Detail (pedestals, frames, fence, inverters) is hidden past this view
 * distance [km] at the high tier; the tier's `detail` share scales it down.
 */
const DETAIL_LOD_KM = 300;
/** docs/08 §4: the one-shot ease of a rotor speed change at a turn resolution. */
const TRANSITION_SECONDS = 1.5;
/** Night marking: red, synchronised per farm, ~1 flash per second. */
const BLINK_HZ = 1;
const BLINK_DUTY = 0.45;
/**
 * Glow of a blinking light in its dim phase: the fixture's steady low-
 * intensity lamp. A frozen frame caught between flashes still shows every
 * lit farm — the static twin the motion policy demands (docs/08 §4).
 */
const BLINK_OFF = 0.45;
/** Screen-size floor of towers and blades [px] — radius / half thickness. */
const MIN_STRUCTURE_PX = 0.55;
/** A spinning rotor never crawls: the share of rated speed at cut-in. */
const MIN_SPINNING_SPEED = 0.15;
/** Rotor disc density (instanceColor.r of the disc shader) at cut-in and at rated speed. */
const DISC_MIN = 0.3;
const DISC_MAX = 0.75;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

interface TurbineRuntime {
  farm: FarmRuntime;
  /** Hub centre in world space (tower axis at hub height). */
  hub: THREE.Vector3;
  yawError: number;
  phase: number;
  speedFactor: number;
  /** T(hub) · R_y(yaw) · T(0, 0, HUB_OFFSET) — the rotor frame before the spin. */
  rotorFrame: THREE.Matrix4;
  angle: number;
  /** Index in the running-rotor pool (spinning / still / off) or the feathered pool. */
  rotorIndex: number;
  /** Index in the glow pool. */
  lightIndex: number;
}

interface FarmRuntime {
  id: string;
  tech: WorldFarm["tech"];
  rotor: RotorState;
  enabled: boolean;
  targetSpeed: number;
  shownSpeed: number;
  fromSpeed: number;
  transitionStart: number;
  transitioning: boolean;
  blinkPhase: number;
  turbines: TurbineRuntime[];
  /** Last light intensity written for this farm, to skip redundant uploads. */
  lightWritten: number;
  /** Rotor phases seeded since the last rebuild — a farm never starts in lockstep. */
  seeded: boolean;
}

interface FarmLayout {
  signature: string;
  tech: WorldFarm["tech"];
  offshore: boolean;
  centre: THREE.Vector3;
  radius: number;
  /** Turbine sites with the foot height (ground, or sea level offshore). */
  sites: (TurbineSite & { footY: number })[];
  pv: PvLayout | null;
}

type PoolName =
  | "tower"
  | "pedestal"
  | "foundation"
  | "nacelle"
  | "rotor"
  | "rotorFeathered"
  | "disc"
  | "glow"
  | "substation"
  | "platform"
  | "pvTable"
  | "pvFrame"
  | "inverter";

const DETAIL_POOLS: readonly PoolName[] = ["pedestal", "pvFrame", "inverter"];

function farmSignature(farm: WorldFarm): string {
  return [
    farm.id,
    farm.tech,
    farm.capacityMw,
    farm.enabled ? 1 : 0,
    farm.offshore ? 1 : 0,
    farm.units,
    farm.footprint.toFixed(3),
    farm.hex.key,
  ].join("|");
}

export function createResModule(): WorldModule {
  let ctxRef: ModuleContext | null = null;
  let screen: ScreenUniforms | null = null;
  let materials: ResMaterials | null = null;
  let glow: { material: THREE.ShaderMaterial; uniforms: GlowUniforms } | null = null;
  let disc: { material: THREE.ShaderMaterial; uniforms: DiscUniforms } | null = null;
  let geometries: Record<PoolName, THREE.BufferGeometry> | null = null;
  let pools: Record<PoolName, InstancePool> | null = null;
  let fence: THREE.Mesh | null = null;
  let pad: THREE.Mesh | null = null;
  const hooks: THREE.Object3D[] = [];
  const layouts = new Map<string, FarmLayout>();
  let farms: FarmRuntime[] = [];
  let builtKey: string | null = null;
  let builtEnvironment: string | null = null;
  let builtTerrain: TerrainProvider | null = null;
  let terrainStamp = 0;
  let detailVisible = true;
  let shadowsOn: boolean | null = null;
  let stateKey: string | null = null;

  const scratch = new THREE.Matrix4();
  const spin = new THREE.Matrix4();
  const point = new THREE.Vector3();

  const ensureResources = (ctx: ModuleContext): void => {
    if (pools && materials && geometries && glow && disc) return;
    screen = createScreenUniforms();
    materials = createResMaterials(screen);
    glow = createGlowMaterial();
    disc = createDiscMaterial();
    geometries = {
      tower: towerGeometry(1),
      pedestal: pedestalGeometry(),
      foundation: foundationGeometry(),
      nacelle: nacelleGeometry(),
      rotor: rotorGeometry(false),
      rotorFeathered: rotorGeometry(true),
      disc: discGeometry(),
      glow: glowGeometry(),
      substation: substationGeometry(),
      platform: platformGeometry(),
      pvTable: pvTableGeometry(),
      pvFrame: pvFrameGeometry(),
      inverter: inverterGeometry(),
    };
    const m = materials;
    const pool = (
      name: PoolName,
      material: THREE.Material,
      options: { color?: boolean; cast?: boolean; receive?: boolean; dynamic?: boolean } = {},
    ): InstancePool =>
      new InstancePool(geometries![name], material, ctx.root, {
        name: `res:${name}`,
        color: options.color ?? false,
        castShadow: options.cast ?? true,
        receiveShadow: options.receive ?? false,
        dynamic: options.dynamic ?? false,
      });
    pools = {
      tower: pool("tower", m.tower),
      pedestal: pool("pedestal", m.foundation, { cast: false, receive: true }),
      foundation: pool("foundation", m.foundation),
      nacelle: pool("nacelle", m.steel),
      rotor: pool("rotor", m.blade, { dynamic: true }),
      rotorFeathered: pool("rotorFeathered", m.blade),
      disc: pool("disc", disc.material, { color: true, cast: false }),
      glow: pool("glow", glow.material, { color: true, cast: false, dynamic: true }),
      substation: pool("substation", m.steel, { receive: true }),
      platform: pool("platform", m.steel),
      pvTable: pool("pvTable", m.glass, { receive: true }),
      pvFrame: pool("pvFrame", m.steel, { cast: false }),
      inverter: pool("inverter", m.steel, { receive: true }),
    };
  };

  const clearStatic = (): void => {
    if (ctxRef) {
      if (fence) ctxRef.root.remove(fence);
      if (pad) ctxRef.root.remove(pad);
      for (const hook of hooks) ctxRef.root.remove(hook);
    }
    fence?.geometry.dispose();
    pad?.geometry.dispose();
    fence = null;
    pad = null;
    hooks.length = 0;
  };

  /** The farm's layout — cached by its signature until the terrain or the tier changes. */
  const layoutFor = (farm: WorldFarm, ctx: ModuleContext): FarmLayout => {
    const signature = farmSignature(farm);
    const cached = layouts.get(signature);
    if (cached) return cached;
    const ground = hexToWorld(farm.hex);
    const terrain = ctx.terrain;
    const seaLevel = terrain.seaLevelKm;
    const centreY = farm.offshore ? seaLevel : terrain.heightAt(ground.x, ground.z);
    const centre = new THREE.Vector3(ground.x, centreY, ground.z);
    const radius = farmRadiusKm(farm.footprint);
    const layout: FarmLayout = {
      signature,
      tech: farm.tech,
      offshore: farm.offshore,
      centre,
      radius,
      sites: [],
      pv: null,
    };
    if (farm.tech === "wind") {
      const rng = ctx.rng(`res:layout:${farm.id}`);
      const admissible = farm.offshore
        ? (offset: GroundOffset) =>
            terrain.heightAt(ground.x + offset.x, ground.z + offset.z) < seaLevel - 0.15
        : () => true;
      layout.sites = turbineSites(farm.units, radius, rng, admissible).map((site) => ({
        ...site,
        footY: farm.offshore ? seaLevel : terrain.heightAt(ground.x + site.x, ground.z + site.z),
      }));
    } else {
      layout.pv = pvLayout(farm.units, radius);
    }
    layouts.set(signature, layout);
    return layout;
  };

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    if (!pools || !materials) return;
    clearStatic();
    const previousFarms = new Map(farms.map((farm) => [farm.id, farm]));
    farms = [];
    const matrices: Record<PoolName, number[]> = {
      tower: [],
      pedestal: [],
      foundation: [],
      nacelle: [],
      rotor: [],
      rotorFeathered: [],
      disc: [],
      glow: [],
      substation: [],
      platform: [],
      pvTable: [],
      pvFrame: [],
      inverter: [],
    };
    const fences: THREE.BufferGeometry[] = [];
    const pads: THREE.BufferGeometry[] = [];
    const heightAt = (x: number, z: number) => ctx.terrain.heightAt(x, z);
    const blinkRng = ctx.rng("res:lights");

    for (const farm of scene.farms) {
      const layout = layoutFor(farm, ctx);
      const centre = layout.centre;
      const previous = previousFarms.get(farm.id);
      const runtime: FarmRuntime = {
        id: farm.id,
        tech: farm.tech,
        rotor: farm.rotor,
        enabled: farm.enabled,
        targetSpeed: previous?.targetSpeed ?? 0,
        shownSpeed: previous?.shownSpeed ?? 0,
        fromSpeed: 0,
        transitionStart: 0,
        transitioning: false,
        blinkPhase: blinkRng.next(),
        turbines: [],
        lightWritten: -1,
        seeded: false,
      };
      farms.push(runtime);

      // The hook effects draws the curtailment ring / disabled marker around.
      const hook = new THREE.Object3D();
      hook.name = `res:base:${farm.id}`;
      hook.position.copy(centre);
      hook.userData = {
        farmId: farm.id,
        tech: farm.tech,
        offshore: farm.offshore,
        radiusKm: layout.radius,
      };
      ctx.root.add(hook);
      hooks.push(hook);

      if (farm.tech === "wind") {
        const towerScale = towerHeight(farm.offshore ? TP_TOP_KM : 0);
        for (const site of layout.sites) {
          const x = centre.x + site.x;
          const z = centre.z + site.z;
          const towerBase = site.footY + (farm.offshore ? TP_TOP_KM : 0);
          scratch.makeScale(1, towerScale, 1).setPosition(x, towerBase, z);
          matrices.tower.push(...scratch.elements);
          scratch.identity().setPosition(x, site.footY, z);
          if (farm.offshore) matrices.foundation.push(...scratch.elements);
          else matrices.pedestal.push(...scratch.elements);
          runtime.turbines.push({
            farm: runtime,
            hub: new THREE.Vector3(x, site.footY + HUB_HEIGHT_KM, z),
            yawError: site.yawError,
            phase: site.phase,
            speedFactor: site.speedFactor,
            rotorFrame: new THREE.Matrix4(),
            angle: PARKED_ANGLE,
            rotorIndex: -1,
            lightIndex: -1,
          });
        }
        scratch.identity().setPosition(centre.x, centre.y, centre.z);
        if (farm.offshore) matrices.platform.push(...scratch.elements);
        else matrices.substation.push(...scratch.elements);
      } else if (layout.pv) {
        const pv = layout.pv;
        for (const segment of pv.segments) {
          const x = centre.x + segment.x;
          const z = centre.z + segment.z;
          const y = heightAt(x, z);
          const left = heightAt(x - PV_SEGMENT_KM / 2, z);
          const right = heightAt(x + PV_SEGMENT_KM / 2, z);
          scratch.makeRotationZ(Math.atan2(right - left, PV_SEGMENT_KM)).setPosition(x, y, z);
          matrices.pvTable.push(...scratch.elements);
          matrices.pvFrame.push(...scratch.elements);
        }
        for (const inverter of pv.inverters) {
          const x = centre.x + inverter.x;
          const z = centre.z + inverter.z;
          scratch.identity().setPosition(x, heightAt(x, z), z);
          matrices.inverter.push(...scratch.elements);
        }
        scratch.identity().setPosition(centre.x, centre.y, centre.z);
        matrices.substation.push(...scratch.elements);
        fences.push(fenceGeometry(centre, pv.fence, heightAt));
        pads.push(padGeometry(centre, pv.fence, heightAt));
      }
    }

    for (const name of Object.keys(matrices) as PoolName[]) {
      // State pools are filled by applyState; the rest stand still until the next rebuild.
      if (name === "nacelle" || name === "rotor" || name === "rotorFeathered") continue;
      if (name === "disc" || name === "glow") continue;
      pools[name].fill(matrices[name]);
    }
    if (fences.length > 0) {
      fence = new THREE.Mesh(merged(fences), materials.fence);
      fence.name = "res:fence";
      fence.frustumCulled = false;
      ctx.root.add(fence);
    }
    if (pads.length > 0) {
      pad = new THREE.Mesh(merged(pads), materials.pad);
      pad.name = "res:pv-pad";
      pad.receiveShadow = true;
      pad.frustumCulled = false;
      ctx.root.add(pad);
    }
    stateKey = null;
  };

  /** The turn's state into the nacelle, rotor, disc and glow pools. */
  const applyState = (scene: WorldScene, ctx: ModuleContext): void => {
    if (!pools) return;
    const byId = new Map(scene.farms.map((farm) => [farm.id, farm]));
    const yawBase = Math.PI - scene.weather.windFromDeg * DEG;
    const animate = ctx.motion.transitions && !ctx.clock.pinned && ctx.clock.scale > 0;
    const nacelles: number[] = [];
    const running: number[] = [];
    const feathered: number[] = [];
    const discs: number[] = [];
    const discColors: number[] = [];
    const glows: number[] = [];
    const glowColors: number[] = [];
    for (const farm of farms) {
      const data = byId.get(farm.id);
      if (!data || farm.tech !== "wind") continue;
      const wasSpinning = farm.seeded && farm.rotor === "spinning";
      farm.rotor = data.rotor;
      farm.enabled = data.enabled;
      farm.lightWritten = -1;
      farm.seeded = true;
      const targetSpeed =
        data.rotor === "spinning"
          ? MIN_SPINNING_SPEED + (1 - MIN_SPINNING_SPEED) * data.rotorSpeed
          : 0;
      if (targetSpeed !== farm.targetSpeed) {
        farm.targetSpeed = targetSpeed;
        if (animate && data.rotor === "spinning") {
          farm.fromSpeed = farm.shownSpeed;
          farm.transitionStart = ctx.clock.time;
          farm.transitioning = true;
        } else {
          farm.shownSpeed = targetSpeed;
          farm.transitioning = false;
        }
      }
      const discStrength = DISC_MIN + (DISC_MAX - DISC_MIN) * targetSpeed;
      for (const turbine of farm.turbines) {
        const yaw = yawBase + turbine.yawError;
        scratch.makeRotationY(yaw).setPosition(turbine.hub);
        nacelles.push(...scratch.elements);
        turbine.rotorFrame.copy(scratch).multiply(spin.makeTranslation(0, 0, HUB_OFFSET_KM));
        if (data.rotor === "spinning") {
          if (!wasSpinning) turbine.angle = turbine.phase * Math.PI * 2;
          discs.push(...scratch.elements);
          discColors.push(discStrength, discStrength, discStrength);
        } else {
          turbine.angle = data.rotor === "feathered" ? FEATHERED_ANGLE : PARKED_ANGLE;
        }
        spin.makeRotationZ(-turbine.angle);
        scratch.copy(turbine.rotorFrame).multiply(spin);
        if (data.rotor === "feathered") {
          turbine.rotorIndex = feathered.length / 16;
          feathered.push(...scratch.elements);
        } else {
          turbine.rotorIndex = running.length / 16;
          running.push(...scratch.elements);
        }
        point.set(LIGHT_OFFSET.x, LIGHT_OFFSET.y, LIGHT_OFFSET.z);
        point.applyMatrix4(scratch.makeRotationY(yaw).setPosition(turbine.hub));
        turbine.lightIndex = glows.length / 16;
        scratch.identity().setPosition(point);
        glows.push(...scratch.elements);
        glowColors.push(0, 0, 0);
      }
    }
    pools.nacelle.fill(nacelles);
    pools.rotor.fill(running);
    pools.rotorFeathered.fill(feathered);
    pools.disc.fill(discs, discColors);
    pools.glow.fill(glows, glowColors);
  };

  const applyQuality = (ctx: ModuleContext): void => {
    if (!pools) return;
    const profile = QUALITY_PROFILES[ctx.quality];
    if (shadowsOn !== profile.shadows) {
      shadowsOn = profile.shadows;
      for (const name of ["tower", "nacelle", "rotor", "rotorFeathered", "foundation"] as const) {
        pools[name].setShadows(profile.shadows);
      }
      for (const name of ["substation", "platform", "pvTable", "inverter"] as const) {
        pools[name].setShadows(profile.shadows && ctx.quality === "high");
      }
    }
  };

  const setDetail = (visible: boolean): void => {
    if (!pools || detailVisible === visible) return;
    detailVisible = visible;
    for (const name of DETAIL_POOLS) pools[name].setVisible(visible);
    if (fence) fence.visible = visible;
  };

  return {
    id: "res",

    init(ctx) {
      ctxRef = ctx;
      ensureResources(ctx);
    },

    update(scene, _previous, ctx) {
      ctxRef = ctx;
      ensureResources(ctx);
      if (ctx.terrain !== builtTerrain) {
        builtTerrain = ctx.terrain;
        terrainStamp += 1;
      }
      // Layouts depend on the seed, the tier (terrain resolution) and the terrain provider.
      const environment = `${scene.seed}|${ctx.quality}|${terrainStamp}`;
      if (environment !== builtEnvironment) {
        builtEnvironment = environment;
        layouts.clear();
      }
      const key = scene.farms.map(farmSignature).join(";") + `|${environment}`;
      if (key !== builtKey) {
        builtKey = key;
        rebuild(scene, ctx);
      }
      applyQuality(ctx);
      // The PV ground is snowed over where the terrain says the ground is:
      // the mean over the farms' centre heights against the turn's snowline.
      if (materials) {
        let snow = 0;
        let count = 0;
        for (const farm of scene.farms) {
          if (farm.tech !== "pv") continue;
          const ground = hexToWorld(farm.hex);
          const height = ctx.terrain.heightAt(ground.x, ground.z);
          snow += smoothstep(-0.2, 0.2, height - ctx.terrain.snowlineKm);
          count += 1;
        }
        materials.padSnow.value = count > 0 ? snow / count : 0;
      }
      const state =
        scene.farms
          .map((farm) => `${farm.id}:${farm.rotor}:${farm.rotorSpeed.toFixed(3)}:${farm.enabled}`)
          .join(";") + `|${scene.weather.windFromDeg}|${ctx.motion.mode}`;
      if (state !== stateKey) {
        stateKey = state;
        applyState(scene, ctx);
      }
    },

    frame(dt, ctx) {
      if (!pools || !screen || !glow || !disc) return;
      const camera = ctx.view.camera;
      const size = ctx.renderer.getDrawingBufferSize(new THREE.Vector2());
      const kmPerPx = (2 * Math.tan((camera.fov / 2) * DEG)) / Math.max(1, size.y);
      screen.uMinKm.value = MIN_STRUCTURE_PX * kmPerPx;
      glow.uniforms.uMinKm.value = kmPerPx;
      setDetail(ctx.view.distanceKm <= DETAIL_LOD_KM * QUALITY_PROFILES[ctx.quality].detail);

      const time = ctx.clock.time;
      const daylight = ctx.environment.daylight;
      const night = smoothstep(0.7, 0.3, daylight);
      // The swept disc is lit like the blades it stands for: white by day, a
      // dim grey against the night sky, never a light source.
      disc.uniforms.uColor.value.setRGB(
        0.3 + 0.62 * daylight,
        0.31 + 0.62 * daylight,
        0.34 + 0.6 * daylight,
      );
      let rotorsDirty = false;
      let lightsDirty = false;
      for (const farm of farms) {
        if (farm.tech !== "wind") continue;
        if (farm.transitioning) {
          const k = smoothstep(0, 1, (time - farm.transitionStart) / TRANSITION_SECONDS);
          farm.shownSpeed = farm.fromSpeed + (farm.targetSpeed - farm.fromSpeed) * k;
          if (k >= 1) farm.transitioning = false;
        }
        if (farm.rotor === "spinning" && ctx.motion.stateful && dt > 0) {
          const omega = farm.shownSpeed * RATED_ROTOR_RAD_S;
          for (const turbine of farm.turbines) {
            turbine.angle += omega * turbine.speedFactor * dt;
            spin.makeRotationZ(-turbine.angle);
            scratch.copy(turbine.rotorFrame).multiply(spin);
            pools.rotor.setMatrixAt(turbine.rotorIndex, scratch);
          }
          rotorsDirty = true;
        }
        const blink = ctx.motion.ambient
          ? fract(time * BLINK_HZ + farm.blinkPhase) < BLINK_DUTY
            ? 1
            : BLINK_OFF
          : 1;
        const intensity = farm.enabled ? night * blink : 0;
        if (intensity !== farm.lightWritten) {
          farm.lightWritten = intensity;
          for (const turbine of farm.turbines) {
            pools.glow.setColorAt(turbine.lightIndex, intensity, intensity, intensity);
          }
          lightsDirty = true;
        }
      }
      if (rotorsDirty) pools.rotor.commitMatrices();
      if (lightsDirty) pools.glow.commitColors();
    },

    dispose() {
      clearStatic();
      if (pools) for (const pool of Object.values(pools)) pool.dispose();
      pools = null;
      if (geometries) for (const geometry of Object.values(geometries)) geometry.dispose();
      geometries = null;
      materials?.dispose();
      materials = null;
      glow?.material.dispose();
      glow = null;
      disc?.material.dispose();
      disc = null;
      screen = null;
      layouts.clear();
      farms = [];
      builtKey = null;
      builtEnvironment = null;
      stateKey = null;
      builtTerrain = null;
      shadowsOn = null;
      ctxRef = null;
    },
  };
}
