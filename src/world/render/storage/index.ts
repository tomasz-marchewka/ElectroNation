// render/storage — BESS yards and pumped storage (docs/08 §2–§4,
// ARCHITECTURE.md §9, §13, §18). Consumes `storages`, `weather.windFromDeg` and
// the seed of the scene and nothing else.
//
// State encoding (docs/08 §3), read from the strategic view without clicking:
//
// | State | Encoding |
// |---|---|
// | state of charge (BESS) | a bar of unit-status lights along the container rows; the lit share equals SOC, the lit run is ≥ 4,5 px at the strategic view |
// | mode | emission colour of the lit units: charging cool cyan-blue, discharging warm white, idle dim neutral |
// | flow magnitude | intensity of the lit units and their halo, `|flowMw| / powerMw` |
// | state of charge (pumped) | the reservoir water level between the empty mark and the crest; the pale drawdown band on the inner face shows how far below full it stands |
// | charging / discharging (pumped) | white foam at the tailrace + faint mist (discharge) / intake ripples + a dark plume (charge), with static twins under `motion.stateful` |
//
// Night: BESS yard floodlights, the powerhouse window band and dam crest lights;
// the far read is the averaged sheen on the structures and the pad, and the
// beacon floor fades with distance — energy-consistent, no bright pin cluster at
// the strategic view. The SOC bar keeps its floor at every distance: it is state.
// Every repeated part is one InstancedMesh; per-site geometry is merged per
// material. Hooks `storage:base:<id>` carry the state for effects (rings, flow
// arrows) — those are wave 3's.
//
// Layouts rebuild only when a storage's identity (id, tech, powerMw,
// capacityMwh, footprint, hex), the seed, the quality tier or the terrain
// provider changes; the turn's state is a refill of the small state pools and a
// few uniform writes, with 1,5 s eases under `ctx.motion.transitions`.

import * as THREE from "three";
import type { WorldScene, WorldStorage } from "../../bridge/worldScene";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, TerrainProvider, WorldModule } from "../core/types";
import {
  basinGeometry,
  containerGeometry,
  crestGeometry,
  crestRoadGeometry,
  embankmentSkirtGeometry,
  fenceGeometry,
  intakeGeometry,
  mastGeometry,
  MAST_H_KM,
  merged,
  outfallGeometry,
  padGeometry,
  penstockGeometry,
  pondGeometry,
  pondRimGeometry,
  portalGeometry,
  powerhouseGeometry,
  skidGeometry,
  spillwayGeometry,
  ventGeometry,
  windowGeometry,
} from "./geometry";
import { storagePlan, type BessPlan, type PumpedPlan, type StoragePlan } from "./layout";
import {
  createBasinMaterial,
  createFoamMaterial,
  createReservoirWater,
  createStorageMaterials,
  createSwirlMaterial,
  discGeometry,
  lampQuadGeometry,
  lampUniforms,
  type BasinUniforms,
  type StorageMaterials,
  type WaterUniforms,
} from "./materials";
import { InstancePool } from "./pool";
import { storageTextures } from "./textures";

const DEG = Math.PI / 180;
/** Detail (vent grilles) is hidden past this view distance [km] × tier detail. */
const DETAIL_LOD_KM = 300;
/** docs/08 §4: the one-shot ease of a state change at a turn resolution. */
const TRANSITION_SECONDS = 1.5;

/** Lamp colours, chosen to stay hue-stable under ACES (render/grid's lesson). */
const CHARGE_COLOR = new THREE.Color(0.18, 0.72, 1.35);
const DISCHARGE_COLOR = new THREE.Color(1.5, 1.24, 0.92);
const IDLE_COLOR = new THREE.Color(0.62, 0.63, 0.66);
const LAMP_OFF = new THREE.Color(0.045, 0.05, 0.055);
/**
 * The SOC bar must read at zero flow: a lit lens never goes fully dark, so a
 * full-but-idle battery still shows a lit run. Flow scales intensity above it.
 */
const LAMP_FLOOR = 0.5;
const BEACON_COLOR = new THREE.Color(1.25, 1.16, 1.0);

type PoolName =
  | "container"
  | "vent"
  | "skid"
  | "portal"
  | "mast"
  | "intake"
  | "powerhouse"
  | "window"
  | "lamp"
  | "lampGlow"
  | "beacon"
  | "yardGlow";

const DETAIL_POOLS: readonly PoolName[] = ["vent"];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function storageSignature(storage: WorldStorage): string {
  return [
    storage.id,
    storage.tech,
    storage.powerMw,
    storage.capacityMwh,
    storage.footprint.toFixed(3),
    storage.hex.key,
  ].join("|");
}

/** A 1,5 s smoothstep ease with an instant mode (motion off / pinned clock). */
class Ease {
  value: number;
  private from: number;
  private to: number;
  private started = 0;
  private active = false;

  constructor(value = 0) {
    this.value = value;
    this.from = value;
    this.to = value;
  }

  set(target: number, now: number, animate: boolean): void {
    if (target === this.to) return;
    this.from = this.value;
    this.to = target;
    if (animate) {
      this.started = now;
      this.active = true;
    } else {
      this.value = target;
      this.active = false;
    }
  }

  /** Advances the ease; returns true when the value moved this frame. */
  sample(now: number): boolean {
    if (!this.active) return false;
    const k = Math.min(1, (now - this.started) / TRANSITION_SECONDS);
    const s = k * k * (3 - 2 * k);
    this.value = this.from + (this.to - this.from) * s;
    if (k >= 1) {
      this.active = false;
      this.value = this.to;
    }
    return true;
  }
}

class ColorEase {
  readonly value = new THREE.Color();
  private from = new THREE.Color();
  private to = new THREE.Color();
  private started = 0;
  private active = false;

  set(target: THREE.Color, now: number, animate: boolean): void {
    if (target.equals(this.to)) return;
    this.from.copy(this.value);
    this.to.copy(target);
    if (animate) {
      this.started = now;
      this.active = true;
    } else {
      this.value.copy(target);
      this.active = false;
    }
  }

  sample(now: number): boolean {
    if (!this.active) return false;
    const k = Math.min(1, (now - this.started) / TRANSITION_SECONDS);
    const s = k * k * (3 - 2 * k);
    this.value.setRGB(
      this.from.r + (this.to.r - this.from.r) * s,
      this.from.g + (this.to.g - this.from.g) * s,
      this.from.b + (this.to.b - this.from.b) * s,
    );
    if (k >= 1) {
      this.active = false;
      this.value.copy(this.to);
    }
    return true;
  }
}

interface StorageRuntime {
  id: string;
  tech: WorldStorage["tech"];
  plan: StoragePlan;
  hook: THREE.Object3D;
  lampStart: number;
  lampCount: number;
  beaconStart: number;
  beaconCount: number;
  yardStart: number;
  yardCount: number;
  windowStart: number;
  windowCount: number;
  soc: Ease;
  flow: Ease;
  color: ColorEase;
  foamStrength: Ease;
  swirlStrength: Ease;
  water: THREE.Mesh | null;
  waterUniforms: WaterUniforms | null;
  basinUniforms: BasinUniforms | null;
  foamUniforms: { uTime: { value: number }; uStrength: { value: number } } | null;
  swirlUniforms: {
    uTime: { value: number };
    uStrength: { value: number };
    uDark: { value: number };
  } | null;
  foamMesh: THREE.Mesh | null;
  swirlMesh: THREE.Mesh | null;
  /** The tailrace surface: darker, rougher, never a mirror at night. */
  tailraceUniforms: WaterUniforms | null;
  /** Radiance gain of the mode (cyan stays cyan, warm white may bloom). */
  colorGain: number;
  /** Seeded phase of the ambient inverter-fan shimmer. */
  shimmerPhase: number;
  /** Last values written, to skip redundant attribute uploads. */
  writtenSoc: number;
  writtenFlow: number;
  writtenColor: number;
  writtenBeacon: number;
  writtenYard: number;
  writtenWindow: number;
}

export function createStorageModule(): WorldModule {
  let ctxRef: ModuleContext | null = null;
  let materials: StorageMaterials | null = null;
  let geometries: Record<PoolName, THREE.BufferGeometry> | null = null;
  let pools: Record<PoolName, InstancePool> | null = null;
  let waterGeometry: THREE.BufferGeometry | null = null;
  let foamGeometry: THREE.BufferGeometry | null = null;
  let swirlGeometry: THREE.BufferGeometry | null = null;
  let runtimes: StorageRuntime[] = [];
  const siteMeshes: THREE.Mesh[] = [];
  const siteGeometries: THREE.BufferGeometry[] = [];
  const siteMaterials: THREE.Material[] = [];
  const hooks: THREE.Object3D[] = [];
  let builtKey: string | null = null;
  let builtEnvironment: string | null = null;
  let builtTerrain: TerrainProvider | null = null;
  let terrainStamp = 0;
  let detailVisible = true;
  let shadowsOn: boolean | null = null;
  let stateKey: string | null = null;
  /** Weather cached from update — frame() has no scene. */
  let windTowardX = 0;
  let windTowardZ = 1;
  let windSpeed = 3;

  const scratch = new THREE.Matrix4();
  const flat = new THREE.Matrix4();

  const ensureResources = (ctx: ModuleContext): void => {
    if (pools && materials && geometries && waterGeometry) return;
    const textures = storageTextures();
    materials = createStorageMaterials(textures);
    geometries = {
      container: containerGeometry(),
      vent: ventGeometry(),
      skid: skidGeometry(),
      portal: portalGeometry(),
      mast: mastGeometry(),
      intake: intakeGeometry(),
      powerhouse: powerhouseGeometry(),
      window: windowGeometry(),
      lamp: lampQuadGeometry(),
      lampGlow: lampQuadGeometry(),
      beacon: lampQuadGeometry(),
      yardGlow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    };
    waterGeometry = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    foamGeometry = discGeometry();
    swirlGeometry = discGeometry();
    const m = materials;
    const pool = (
      name: PoolName,
      material: THREE.Material,
      options: {
        color?: boolean;
        cast?: boolean;
        receive?: boolean;
        glow?: boolean;
        dynamic?: boolean;
      } = {},
    ): InstancePool =>
      new InstancePool(geometries![name], material, ctx.root, {
        name: `storage:${name}`,
        color: options.color ?? false,
        castShadow: options.cast ?? false,
        receiveShadow: options.receive ?? false,
        glow: options.glow ?? false,
        dynamic: options.dynamic ?? false,
      });
    pools = {
      container: pool("container", m.container, { color: true, cast: true }),
      vent: pool("vent", m.vent),
      skid: pool("skid", m.steel, { cast: true, receive: true }),
      portal: pool("portal", m.steel, { cast: true }),
      mast: pool("mast", m.steel, { cast: true }),
      intake: pool("intake", m.concrete, { cast: true, receive: true }),
      powerhouse: pool("powerhouse", m.concrete, { cast: true, receive: true }),
      window: pool("window", m.window, { glow: true, dynamic: true }),
      lamp: pool("lamp", m.lamp, { color: true, dynamic: true }),
      lampGlow: pool("lampGlow", m.lampGlow, { color: true, dynamic: true }),
      beacon: pool("beacon", m.beacon, { color: true, dynamic: true }),
      yardGlow: pool("yardGlow", m.yardGlow, { color: true, dynamic: true }),
    };
  };

  const clearStatic = (): void => {
    if (ctxRef) {
      for (const mesh of siteMeshes) ctxRef.root.remove(mesh);
      for (const hook of hooks) ctxRef.root.remove(hook);
    }
    for (const geometry of siteGeometries) geometry.dispose();
    for (const material of siteMaterials) material.dispose();
    siteMeshes.length = 0;
    siteGeometries.length = 0;
    siteMaterials.length = 0;
    hooks.length = 0;
  };

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    if (!pools || !materials || !geometries || !waterGeometry) return;
    clearStatic();
    const previous = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
    runtimes = [];
    const matrices: Record<PoolName, number[]> = {
      container: [],
      vent: [],
      skid: [],
      portal: [],
      mast: [],
      intake: [],
      powerhouse: [],
      window: [],
      lamp: [],
      lampGlow: [],
      beacon: [],
      yardGlow: [],
    };
    const colors: Partial<Record<PoolName, number[]>> = {
      container: [],
      lamp: [],
      lampGlow: [],
      beacon: [],
      yardGlow: [],
    };
    const windowGlow: number[] = [];
    const m = materials;

    for (const storage of scene.storages) {
      const rng = ctx.rng(`storage:layout:${storage.id}`);
      const plan = storagePlan(storage, ctx.terrain, rng);
      const previousRuntime = previous.get(storage.id);
      const runtime: StorageRuntime = {
        id: storage.id,
        tech: storage.tech,
        plan,
        hook: new THREE.Object3D(),
        lampStart: matrices.lamp.length / 16,
        lampCount: 0,
        beaconStart: matrices.beacon.length / 16,
        beaconCount: 0,
        yardStart: matrices.yardGlow.length / 16,
        yardCount: 0,
        windowStart: matrices.window.length / 16,
        windowCount: 0,
        soc: new Ease(previousRuntime?.soc.value ?? storage.soc),
        flow: new Ease(previousRuntime?.flow.value ?? 0),
        color: new ColorEase(),
        foamStrength: new Ease(previousRuntime?.foamStrength.value ?? 0),
        swirlStrength: new Ease(previousRuntime?.swirlStrength.value ?? 0),
        water: null,
        waterUniforms: null,
        basinUniforms: null,
        foamUniforms: null,
        swirlUniforms: null,
        foamMesh: null,
        swirlMesh: null,
        tailraceUniforms: null,
        colorGain: 1.8,
        shimmerPhase: rng.range(0, Math.PI * 2),
        writtenSoc: -1,
        writtenFlow: -1,
        writtenColor: -1,
        writtenBeacon: -1,
        writtenYard: -1,
        writtenWindow: -1,
      };
      runtime.color.value.copy(IDLE_COLOR);
      runtimes.push(runtime);

      runtime.hook.name = `storage:base:${storage.id}`;
      runtime.hook.position.copy(plan.centre);
      runtime.hook.userData = {
        storageId: storage.id,
        tech: storage.tech,
        mode: storage.mode,
        soc: storage.soc,
        flowMw: storage.flowMw,
        powerMw: storage.powerMw,
        radiusKm: plan.radiusKm,
      };
      ctx.root.add(runtime.hook);
      hooks.push(runtime.hook);

      if (plan.kind === "bess") {
        buildBess(plan, runtime, ctx, matrices, colors, m);
      } else {
        buildPumped(plan, runtime, ctx, matrices, colors, windowGlow, m);
      }
    }

    for (const name of Object.keys(matrices) as PoolName[]) {
      pools[name].fill(matrices[name], colors[name]);
    }
    if (pools.window.mesh) {
      const attribute = pools.window.mesh.geometry.getAttribute("enGlow") as
        THREE.InstancedBufferAttribute | undefined;
      if (attribute) {
        (attribute.array as Float32Array).set(windowGlow);
        attribute.needsUpdate = true;
      }
    }
    stateKey = null;
    shadowsOn = null;
  };

  const buildBess = (
    plan: BessPlan,
    runtime: StorageRuntime,
    ctx: ModuleContext,
    matrices: Record<PoolName, number[]>,
    colors: Partial<Record<PoolName, number[]>>,
    m: StorageMaterials,
  ): void => {
    const rng = ctx.rng(`storage:paint:${plan.id}`);
    for (const site of plan.containers) {
      scratch.makeRotationY(site.yaw).setPosition(site.x, site.y, site.z);
      matrices.container.push(...scratch.elements);
      const tint = rng.range(0.84, 1.0);
      (colors.container as number[]).push(tint, tint * 0.995, tint * 0.985);
      matrices.vent.push(...scratch.elements);
    }
    for (const site of plan.skids) {
      scratch.makeRotationY(site.yaw).setPosition(site.x, site.y, site.z);
      matrices.skid.push(...scratch.elements);
    }
    for (const site of plan.portals) {
      scratch.makeRotationY(site.yaw).setPosition(site.x, site.y, site.z);
      matrices.portal.push(...scratch.elements);
    }
    for (const site of plan.masts) {
      scratch.makeRotationY(site.yaw).setPosition(site.x, site.y, site.z);
      matrices.mast.push(...scratch.elements);
      flat.identity().setPosition(site.x, site.y + MAST_H_KM, site.z);
      matrices.beacon.push(...flat.elements);
      (colors.beacon as number[]).push(0, 0, 0);
      runtime.beaconCount += 1;
    }
    for (const site of plan.lamps) {
      flat.identity().setPosition(site.x, site.y, site.z);
      matrices.lamp.push(...flat.elements);
      matrices.lampGlow.push(...flat.elements);
      (colors.lamp as number[]).push(0, 0, 0);
      (colors.lampGlow as number[]).push(0, 0, 0);
      runtime.lampCount += 1;
    }
    for (const glow of plan.yardGlows) {
      flat.makeScale(glow.size, 1, glow.size).setPosition(glow.x, glow.y, glow.z);
      matrices.yardGlow.push(...flat.elements);
      (colors.yardGlow as number[]).push(0, 0, 0);
      runtime.yardCount += 1;
    }

    // The gravel pad, then the fence and the SOC bar's housing. The bar is its
    // own near-black mesh: it is the dark run the lit share is read against.
    const pad = new THREE.Mesh(
      padGeometry(plan.rect, (x, z) => ctx.terrain.heightAt(x, z)),
      m.gravel,
    );
    pad.name = `storage:pad:${plan.id}`;
    pad.receiveShadow = true;
    ctx.root.add(pad);
    siteMeshes.push(pad);
    siteGeometries.push(pad.geometry);

    const fence = new THREE.Mesh(
      fenceGeometry(plan.rect, (x, z) => ctx.terrain.heightAt(x, z)),
      m.fence,
    );
    fence.name = `storage:fence:${plan.id}`;
    ctx.root.add(fence);
    siteMeshes.push(fence);
    siteGeometries.push(fence.geometry);

    const bar = new THREE.BoxGeometry(plan.bar.length, 0.26, 0.13);
    bar.rotateY(plan.bar.yaw);
    bar.translate(plan.bar.x, plan.bar.y, plan.bar.z);
    const barMesh = new THREE.Mesh(bar, m.bar);
    barMesh.name = `storage:bar:${plan.id}`;
    barMesh.receiveShadow = true;
    ctx.root.add(barMesh);
    siteMeshes.push(barMesh);
    siteGeometries.push(bar);
  };

  const buildPumped = (
    plan: PumpedPlan,
    runtime: StorageRuntime,
    ctx: ModuleContext,
    matrices: Record<PoolName, number[]>,
    colors: Partial<Record<PoolName, number[]>>,
    windowGlow: number[],
    m: StorageMaterials,
  ): void => {
    const heightAt = (x: number, z: number) => ctx.terrain.heightAt(x, z);
    const embankment = new THREE.Mesh(
      merged([
        embankmentSkirtGeometry(plan.spec, heightAt),
        pondRimGeometry(
          plan.tailrace.x,
          plan.tailrace.z,
          plan.tailrace.rx,
          plan.tailrace.rz,
          plan.tailrace.y,
          heightAt,
        ),
      ]),
      m.rockFill,
    );
    embankment.name = `storage:dam:${plan.id}`;
    embankment.receiveShadow = true;
    embankment.castShadow = true;
    ctx.root.add(embankment);
    siteMeshes.push(embankment);
    siteGeometries.push(embankment.geometry);

    const crest = new THREE.Mesh(
      merged([
        crestGeometry(plan.spec),
        spillwayGeometry(plan.spec, heightAt, plan.spillway.angle, plan.spillway.halfWidth),
        outfallGeometry(plan.outfall),
      ]),
      m.concrete,
    );
    crest.name = `storage:crest:${plan.id}`;
    crest.receiveShadow = true;
    crest.castShadow = true;
    ctx.root.add(crest);
    siteMeshes.push(crest);
    siteGeometries.push(crest.geometry);

    const road = new THREE.Mesh(
      crestRoadGeometry(plan.spec, plan.spillway.angle, plan.spillway.halfWidth * 1.8),
      m.road,
    );
    road.name = `storage:road:${plan.id}`;
    road.receiveShadow = true;
    ctx.root.add(road);
    siteMeshes.push(road);
    siteGeometries.push(road.geometry);

    const basin = createBasinMaterial(storageTextures(), m.sheen);
    const basinMesh = new THREE.Mesh(
      basinGeometry(plan.spec, plan.floorRadius, plan.floorY),
      basin.material,
    );
    basinMesh.name = `storage:basin:${plan.id}`;
    basinMesh.receiveShadow = true;
    ctx.root.add(basinMesh);
    siteMeshes.push(basinMesh);
    siteGeometries.push(basinMesh.geometry);
    siteMaterials.push(basin.material);
    runtime.basinUniforms = basin.uniforms;

    const water = createReservoirWater(storageTextures());
    const waterMesh = new THREE.Mesh(waterGeometry as THREE.BufferGeometry, water.material);
    waterMesh.name = `storage:reservoir:${plan.id}`;
    waterMesh.position.set(plan.centre.x, plan.fullY, plan.centre.z);
    waterMesh.receiveShadow = true;
    ctx.root.add(waterMesh);
    siteMeshes.push(waterMesh);
    siteMaterials.push(water.material);
    runtime.water = waterMesh;
    runtime.waterUniforms = water.uniforms;

    const penstock = new THREE.Mesh(penstockGeometry(plan.penstock, 0.09), m.steel);
    penstock.name = `storage:penstock:${plan.id}`;
    penstock.castShadow = true;
    ctx.root.add(penstock);
    siteMeshes.push(penstock);
    siteGeometries.push(penstock.geometry);

    const tailraceWater = createReservoirWater(storageTextures());
    // The tailrace is a working pond, not a lake: darker and less sky-lit.
    tailraceWater.uniforms.uShallow.value.set(0.06, 0.17, 0.19);
    tailraceWater.uniforms.uDeep.value.set(0.01, 0.05, 0.09);
    tailraceWater.material.envMapIntensity = 0.15;
    tailraceWater.material.roughness = 0.45;
    // The tailrace fades out toward its rim: no clipped edge on the ground.
    tailraceWater.uniforms.uEdgeFade.value = 1;
    const tailrace = new THREE.Mesh(
      pondGeometry(
        {
          x: plan.tailrace.x,
          z: plan.tailrace.z,
          hw: plan.tailrace.rx,
          hd: plan.tailrace.rz,
          yaw: plan.tailrace.yaw,
        },
        plan.tailrace.y,
      ),
      tailraceWater.material,
    );
    tailrace.name = `storage:tailrace:${plan.id}`;
    tailrace.receiveShadow = true;
    ctx.root.add(tailrace);
    siteMeshes.push(tailrace);
    siteMaterials.push(tailraceWater.material);
    runtime.tailraceUniforms = tailraceWater.uniforms;

    const foam = createFoamMaterial(storageTextures());
    const foamMesh = new THREE.Mesh(foamGeometry as THREE.BufferGeometry, foam.material);
    foamMesh.name = `storage:foam:${plan.id}`;
    foamMesh.position.set(plan.foam.x, plan.foam.y, plan.foam.z);
    foamMesh.scale.set(0.75, 1, 0.75);
    foamMesh.visible = false;
    ctx.root.add(foamMesh);
    siteMeshes.push(foamMesh);
    siteMaterials.push(foam.material);
    runtime.foamMesh = foamMesh;
    runtime.foamUniforms = foam.uniforms;

    const swirl = createSwirlMaterial();
    const swirlMesh = new THREE.Mesh(swirlGeometry as THREE.BufferGeometry, swirl.material);
    swirlMesh.name = `storage:swirl:${plan.id}`;
    swirlMesh.position.set(plan.swirl.x, plan.swirl.y, plan.swirl.z);
    swirlMesh.scale.set(1.1, 1, 1.1);
    swirlMesh.visible = false;
    ctx.root.add(swirlMesh);
    siteMeshes.push(swirlMesh);
    siteMaterials.push(swirl.material);
    runtime.swirlMesh = swirlMesh;
    runtime.swirlUniforms = swirl.uniforms;

    for (const site of plan.powerhouses) {
      scratch.makeRotationY(site.yaw).setPosition(site.x, site.y, site.z);
      matrices.powerhouse.push(...scratch.elements);
      matrices.window.push(...scratch.elements);
      windowGlow.push(0);
      runtime.windowCount += 1;
    }
    for (const site of plan.intakes) {
      scratch.makeRotationY(site.yaw).setPosition(site.x, site.y, site.z);
      matrices.intake.push(...scratch.elements);
    }
    for (const site of plan.masts) {
      scratch.makeRotationY(site.yaw).setPosition(site.x, site.y, site.z);
      matrices.mast.push(...scratch.elements);
      flat.identity().setPosition(site.x, site.y + MAST_H_KM, site.z);
      matrices.beacon.push(...flat.elements);
      (colors.beacon as number[]).push(0, 0, 0);
      runtime.beaconCount += 1;
    }
    for (const light of plan.crestLights) {
      flat.identity().setPosition(light.x, light.y, light.z);
      matrices.beacon.push(...flat.elements);
      (colors.beacon as number[]).push(0, 0, 0);
      runtime.beaconCount += 1;
    }
    for (const glow of plan.yardGlows) {
      flat.makeScale(glow.size, 1, glow.size).setPosition(glow.x, glow.y, glow.z);
      matrices.yardGlow.push(...flat.elements);
      (colors.yardGlow as number[]).push(0, 0, 0);
      runtime.yardCount += 1;
    }
  };

  const applyState = (scene: WorldScene, ctx: ModuleContext): void => {
    if (!pools) return;
    const byId = new Map(scene.storages.map((storage) => [storage.id, storage]));
    const animate = ctx.motion.transitions && !ctx.clock.pinned && ctx.clock.scale > 0;
    const now = ctx.clock.time;
    for (const runtime of runtimes) {
      const data = byId.get(runtime.id);
      if (!data) continue;
      runtime.soc.set(clamp01(data.soc), now, animate);
      const flowFraction = data.powerMw > 0 ? clamp01(Math.abs(data.flowMw) / data.powerMw) : 0;
      runtime.flow.set(flowFraction, now, animate);
      const modeColor =
        data.mode === "charge"
          ? CHARGE_COLOR
          : data.mode === "discharge"
            ? DISCHARGE_COLOR
            : IDLE_COLOR;
      runtime.color.set(modeColor, now, animate);
      runtime.colorGain = data.mode === "charge" ? 1.5 : data.mode === "discharge" ? 2.4 : 1.9;
      runtime.foamStrength.set(
        data.mode === "discharge" ? 0.35 + 0.65 * flowFraction : 0,
        now,
        animate,
      );
      runtime.swirlStrength.set(
        data.mode === "charge" ? 0.3 + 0.7 * flowFraction : 0,
        now,
        animate,
      );
      runtime.hook.userData = {
        storageId: runtime.id,
        tech: runtime.tech,
        mode: data.mode,
        soc: data.soc,
        flowMw: data.flowMw,
        powerMw: data.powerMw,
        radiusKm: runtime.plan.radiusKm,
      };
    }
  };

  /** One lamp colour per unit: lit share = SOC, colour = mode, brightness = flow. */
  const writeLamps = (runtime: StorageRuntime, shimmer = 0): void => {
    if (!pools) return;
    const soc = clamp01(runtime.soc.value);
    const flow = clamp01(runtime.flow.value);
    const litCount = Math.round(soc * runtime.lampCount);
    const brightness = (LAMP_FLOOR + (1 - LAMP_FLOOR) * flow) * (1 + shimmer);
    for (let i = 0; i < runtime.lampCount; i++) {
      const index = runtime.lampStart + i;
      if (i < litCount) {
        const r = runtime.color.value.r * brightness * runtime.colorGain;
        const g = runtime.color.value.g * brightness * runtime.colorGain;
        const b = runtime.color.value.b * brightness * runtime.colorGain;
        pools.lamp.setColorAt(index, r, g, b);
        pools.lampGlow.setColorAt(index, r, g, b);
      } else {
        pools.lamp.setColorAt(index, LAMP_OFF.r, LAMP_OFF.g, LAMP_OFF.b);
        pools.lampGlow.setColorAt(index, 0, 0, 0);
      }
    }
    pools.lamp.commitColors();
    pools.lampGlow.commitColors();
    runtime.writtenSoc = soc;
    runtime.writtenFlow = flow;
    runtime.writtenColor = runtime.color.value.getHex();
  };

  const applyQuality = (ctx: ModuleContext): void => {
    if (!pools) return;
    const profile = QUALITY_PROFILES[ctx.quality];
    if (shadowsOn === profile.shadows) return;
    shadowsOn = profile.shadows;
    for (const name of ["container", "skid", "portal", "mast", "intake", "powerhouse"] as const) {
      pools[name].setShadows(profile.shadows);
    }
    for (const mesh of siteMeshes) {
      if (
        mesh.name.startsWith("storage:dam") ||
        mesh.name.startsWith("storage:penstock") ||
        mesh.name.startsWith("storage:crest")
      ) {
        mesh.castShadow = profile.shadows;
      }
    }
  };

  const setDetail = (visible: boolean): void => {
    if (!pools || detailVisible === visible) return;
    detailVisible = visible;
    for (const name of DETAIL_POOLS) pools[name].setVisible(visible);
  };

  return {
    id: "storage",

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
      const environment = `${scene.seed}|${ctx.quality}|${terrainStamp}`;
      if (environment !== builtEnvironment) {
        builtEnvironment = environment;
      }
      const key = scene.storages.map(storageSignature).join(";") + `|${environment}`;
      if (key !== builtKey) {
        builtKey = key;
        rebuild(scene, ctx);
      }
      applyQuality(ctx);
      // Water drift follows the turn's wind (the strongest class of the day).
      const windFromDeg = scene.weather.windFromDeg;
      const speed = Math.max(...Object.values(scene.weather.windMs));
      windTowardX = -Math.sin(windFromDeg * DEG);
      windTowardZ = Math.cos(windFromDeg * DEG);
      windSpeed = Math.max(0, speed);
      const state =
        scene.storages
          .map(
            (storage) =>
              `${storage.id}:${storage.mode}:${storage.soc.toFixed(3)}:${storage.flowMw.toFixed(1)}`,
          )
          .join(";") + `|${ctx.motion.mode}`;
      if (state !== stateKey) {
        stateKey = state;
        applyState(scene, ctx);
      }
    },

    frame(dt, ctx) {
      if (!pools || !materials) return;
      const camera = ctx.view.camera;
      const size = ctx.renderer.getDrawingBufferSize(new THREE.Vector2());
      const kmPerPx = (2 * Math.tan((camera.fov / 2) * DEG)) / Math.max(1, size.y);
      for (const material of [materials.lamp, materials.lampGlow, materials.beacon]) {
        lampUniforms(material).uMinKm.value = kmPerPx;
      }
      setDetail(ctx.view.distanceKm <= DETAIL_LOD_KM * QUALITY_PROFILES[ctx.quality].detail);

      const night = smoothstep(0.72, 0.3, ctx.environment.daylight);
      materials.sheen.value = night * 0.085;
      // The far average: beacon fixtures lose their floor with distance, so a
      // yard at 600 km is a modest glow, not a dozen bright pins.
      const farFade = Math.max(0.42, Math.min(1, 1 - (ctx.view.distanceKm - 140) / 320));
      const time = ctx.clock.time;
      const animateWater = ctx.motion.stateful && dt > 0;
      const beaconKey = Math.round(night * 100) / 100;

      for (const runtime of runtimes) {
        runtime.soc.sample(time);
        runtime.flow.sample(time);
        runtime.color.sample(time);
        runtime.foamStrength.sample(time);
        runtime.swirlStrength.sample(time);

        const plan = runtime.plan;
        if (runtime.water && plan.kind === "pumped") {
          const y = plan.emptyY + (plan.fullY - plan.emptyY) * clamp01(runtime.soc.value);
          const radius =
            plan.floorRadius +
            (plan.spec.crestRadiusIn - plan.floorRadius) *
              ((y - plan.floorY) / (plan.spec.crestY + 0.02 - plan.floorY));
          runtime.water.position.y = y;
          runtime.water.scale.set(radius, 1, radius);
          if (runtime.basinUniforms) {
            runtime.basinUniforms.uWaterY.value = y;
            runtime.basinUniforms.uFullY.value = plan.fullY;
          }
          if (runtime.swirlMesh) runtime.swirlMesh.position.y = y + 0.03;
        }

        // The one ambient motion of this layer (docs/08 §4): a slow
        // inverter-fan shimmer on the BESS lamp bar. Nothing else moves.
        const shimmer =
          ctx.motion.ambient && runtime.tech === "battery"
            ? 0.06 * Math.sin(time * 0.9 + runtime.shimmerPhase)
            : 0;
        if (
          shimmer !== 0 ||
          runtime.writtenSoc < 0 ||
          Math.abs(runtime.writtenSoc - clamp01(runtime.soc.value)) > 1e-4 ||
          Math.abs(runtime.writtenFlow - clamp01(runtime.flow.value)) > 1e-4 ||
          runtime.writtenColor !== runtime.color.value.getHex()
        ) {
          writeLamps(runtime, shimmer);
        }

        // Night fixtures: beacons (crest + mast lamps) and the yard pools.
        if (runtime.beaconCount > 0 && runtime.writtenBeacon !== beaconKey) {
          const intensity = night * farFade;
          for (let i = 0; i < runtime.beaconCount; i++) {
            pools.beacon.setColorAt(
              runtime.beaconStart + i,
              BEACON_COLOR.r * intensity,
              BEACON_COLOR.g * intensity,
              BEACON_COLOR.b * intensity,
            );
          }
          pools.beacon.commitColors();
          runtime.writtenBeacon = beaconKey;
        }
        if (runtime.yardCount > 0 && runtime.writtenYard !== beaconKey) {
          const intensity = night * 0.9;
          for (let i = 0; i < runtime.yardCount; i++) {
            pools.yardGlow.setColorAt(
              runtime.yardStart + i,
              intensity,
              intensity * 0.98,
              intensity * 0.92,
            );
          }
          pools.yardGlow.commitColors();
          runtime.writtenYard = beaconKey;
        }
        if (runtime.windowCount > 0) {
          const activity = 0.35 + 0.65 * Math.max(clamp01(runtime.flow.value), 0.3);
          const glow = night * activity;
          const windowKey = Math.round(glow * 100) / 100;
          if (runtime.writtenWindow !== windowKey) {
            for (let i = 0; i < runtime.windowCount; i++) {
              pools.window.setGlowAt(runtime.windowStart + i, glow);
            }
            pools.window.commitGlow();
            runtime.writtenWindow = windowKey;
          }
        }

        // Water and white water: state-carrying motion, static twins when frozen.
        if (runtime.waterUniforms) {
          if (animateWater) runtime.waterUniforms.uTime.value += dt;
          runtime.waterUniforms.uWind.value.set(windTowardX, windTowardZ, windSpeed * 0.12, 0);
          runtime.waterUniforms.uSkyColor.value.copy(ctx.environment.skyColor);
          runtime.waterUniforms.uHasEnv.value = ctx.environment.envMap ? 1 : 0;
          runtime.waterUniforms.uFar.value = ctx.view.distanceKm <= 120 ? 1 : 0;
        }
        if (runtime.tailraceUniforms) {
          if (animateWater) runtime.tailraceUniforms.uTime.value += dt;
          // A working pond is not a mirror: no env map, rougher, dimmer sky.
          runtime.tailraceUniforms.uHasEnv.value = 0;
          runtime.tailraceUniforms.uCalm.value = 0.15;
          runtime.tailraceUniforms.uSkyColor.value
            .copy(ctx.environment.skyColor)
            .multiplyScalar(0.22);
        }
        if (runtime.foamUniforms && runtime.foamMesh) {
          if (animateWater) runtime.foamUniforms.uTime.value += dt;
          runtime.foamUniforms.uStrength.value = runtime.foamStrength.value;
          runtime.foamMesh.visible = runtime.foamStrength.value > 0.02;
        }
        if (runtime.swirlUniforms && runtime.swirlMesh) {
          if (animateWater) runtime.swirlUniforms.uTime.value += dt;
          runtime.swirlUniforms.uStrength.value = runtime.swirlStrength.value;
          runtime.swirlUniforms.uDark.value = 1;
          runtime.swirlMesh.visible = runtime.swirlStrength.value > 0.02;
        }
      }
    },

    dispose() {
      clearStatic();
      if (pools) for (const pool of Object.values(pools)) pool.dispose();
      pools = null;
      if (geometries) for (const geometry of Object.values(geometries)) geometry.dispose();
      geometries = null;
      waterGeometry?.dispose();
      waterGeometry = null;
      foamGeometry?.dispose();
      foamGeometry = null;
      swirlGeometry?.dispose();
      swirlGeometry = null;
      materials?.dispose();
      materials = null;
      runtimes = [];
      builtKey = null;
      builtEnvironment = null;
      builtTerrain = null;
      stateKey = null;
      shadowsOn = null;
      ctxRef = null;
    },
  };
}
