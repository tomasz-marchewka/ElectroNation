// render/cities — settlements scaled by households, lit by delivered power
// (docs/08 §3, §5; ARCHITECTURE.md §7, §9, §18). Consumes the `cities`, `time`
// and `sun` slices and nothing else; stands its blocks on `ctx.terrain` and
// reads the night from `ctx.environment`. One InstancedMesh per building
// archetype, one for every street lamp of the country, one for the halos:
// a dozen draw calls for ten cities. The layout is rebuilt only when a city's
// identity changes (seed, hex, class, connection, quality); a turn that
// changes `lit` rewrites one float per instance and eases it over 1,5 s.
//
// State encoding (docs/08 §3): lit = delivered / demand. A short city keeps
// that share of its windows and lamps and dims the rest, at the exact hex the
// flow starved; an unconnected city has no light at all and greyer, sparser
// masses. The red ground ring is the effects module's — it finds an Object3D
// named `cities:base:<cityId>` at every city's centre with the numbers in
// `userData`.

import * as THREE from "three";
import type { WorldCity, WorldScene } from "../../bridge/worldScene";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, WorldModule } from "../core/types";
import { hexToWorld } from "../core/units";
import { ARCHETYPE_IDS, buildArchetypes, type ArchetypeId } from "./archetypes";
import { layoutCity, type CityLayout } from "./layout";
import { buildLightAtlas, buildLightQuilt, type LightAtlas, type LightQuilt } from "./lightmap";
import {
  createBuildingMaterial,
  createCityUniforms,
  createHaloMaterial,
  createLampMaterial,
  type BuildingMaterial,
  type LampMaterial,
} from "./materials";

/** docs/08 §4: the one cinematic moment. */
const TRANSITION_SECONDS = 1.5;
/** Halo diameter as a multiple of the footprint radius. */
const HALO_SPAN = 2.4;
/** Height of the halo's centre over the ground as a share of the footprint radius. */
const HALO_LIFT = 0.3;
/**
 * Beyond this camera distance the blocks stop casting shadows [km]: on the high
 * tier (2048 map) a tower still throws a few texels at the strategic view — the
 * grain of a city at golden hour — on the smaller maps it is only noise.
 */
const SHADOW_CAST_KM: Record<string, number> = { high: 500, medium: 160, low: 0 };
/** Houses are sub-pixel beyond this on the lower tiers [km]; the high tier keeps them. */
const HOUSE_LOD_KM = 300;
const DEG = Math.PI / 180;

interface Range {
  start: number;
  count: number;
}

interface CityEntry {
  city: WorldCity;
  layout: CityLayout;
  ranges: Partial<Record<ArchetypeId, Range>>;
  lamps: Range;
  halo: number;
  base: THREE.Object3D;
  /** The lit share shown, its transition source and target. */
  litShown: number;
  litFrom: number;
  litTarget: number;
  transitionStart: number;
  transitioning: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Share of a served city's windows lit by hour of day (block midpoints of
 * docs/08 §5): the evening peak has most homes lit, the small hours a fifth.
 */
function windowShareAt(hour: number): number {
  const table: [number, number][] = [
    [1.5, 0.2],
    [4.5, 0.18],
    [7.5, 0.42],
    [10.5, 0.5],
    [13.5, 0.5],
    [16.5, 0.6],
    [19.5, 0.72],
    [22.5, 0.5],
  ];
  let best = table[0]!;
  for (const row of table) if (Math.abs(row[0] - hour) < Math.abs(best[0] - hour)) best = row;
  return best[1];
}

/** What the layout depends on; anything else is a per-instance refill. */
function buildKey(scene: WorldScene, quality: string): string {
  const cities = scene.cities
    .map(
      (city) =>
        `${city.id}:${city.hex.key}:${city.sizeClass}:${city.scale.toFixed(4)}:${city.connected ? 1 : 0}`,
    )
    .join(";");
  return `${scene.seed}|${scene.board.cols}x${scene.board.rows}|${quality}|${cities}`;
}

export function createCitiesModule(): WorldModule {
  const uniforms = createCityUniforms();
  let ctxRef: ModuleContext | null = null;
  let geometries: Record<ArchetypeId, THREE.BufferGeometry> | null = null;
  let buildingMaterial: BuildingMaterial | null = null;
  let lampMaterial: LampMaterial | null = null;
  let haloMaterial: LampMaterial | null = null;
  let lampGeometry: THREE.PlaneGeometry | null = null;
  let haloGeometry: THREE.PlaneGeometry | null = null;
  let meshes: Partial<Record<ArchetypeId, THREE.InstancedMesh>> = {};
  let lampMesh: THREE.InstancedMesh | null = null;
  let haloMesh: THREE.InstancedMesh | null = null;
  let atlas: LightAtlas | null = null;
  let quilt: LightQuilt | null = null;
  let entries: CityEntry[] = [];
  let builtKey: string | null = null;
  /** The scene's own daylight, for a world without a sky module. */
  let sceneDaylight = 1;
  let ambientTime = 0;

  const clear = (): void => {
    if (!ctxRef) return;
    for (const mesh of Object.values(meshes)) {
      ctxRef.root.remove(mesh);
      mesh.dispose();
    }
    meshes = {};
    if (lampMesh) {
      ctxRef.root.remove(lampMesh);
      lampMesh.dispose();
      lampMesh = null;
    }
    if (haloMesh) {
      ctxRef.root.remove(haloMesh);
      haloMesh.dispose();
      haloMesh = null;
    }
    if (quilt) {
      ctxRef.root.remove(quilt.mesh);
      quilt.dispose();
      quilt = null;
    }
    atlas?.dispose();
    atlas = null;
    for (const entry of entries) ctxRef.root.remove(entry.base);
    entries = [];
  };

  /** Writes the lit share of one city into its instances (windows, lamps, halo). */
  const applyLit = (entry: CityEntry, lit: number): void => {
    entry.litShown = lit;
    for (const id of ARCHETYPE_IDS) {
      const range = entry.ranges[id];
      const mesh = meshes[id];
      if (!range || !mesh) continue;
      const state = mesh.geometry.getAttribute("enState") as THREE.InstancedBufferAttribute;
      const array = state.array as Float32Array;
      for (let i = 0; i < range.count; i++) array[(range.start + i) * 4] = lit;
      state.addUpdateRange(range.start * 4, range.count * 4);
      state.needsUpdate = true;
    }
    if (lampMesh?.instanceColor && entry.lamps.count > 0) {
      const colors = lampMesh.instanceColor.array as Float32Array;
      // Steeper than linear, like the windows: the eye reads light on a log scale.
      const keep = Math.pow(lit, 1.6);
      const dim = 0.3 + 0.7 * lit;
      for (let i = 0; i < entry.lamps.count; i++) {
        const lamp = entry.layout.lamps[i]!;
        const on = lamp.hash < keep ? dim : 0;
        const at = (entry.lamps.start + i) * 3;
        colors[at] = lamp.color[0] * on;
        colors[at + 1] = lamp.color[1] * on;
        colors[at + 2] = lamp.color[2] * on;
      }
      lampMesh.instanceColor.addUpdateRange(entry.lamps.start * 3, entry.lamps.count * 3);
      lampMesh.instanceColor.needsUpdate = true;
    }
    if (haloMesh?.instanceColor && entry.halo >= 0) {
      const glow = entry.layout.glow;
      const k = Math.pow(lit, 1.6);
      haloMesh.instanceColor.setXYZ(entry.halo, glow[0] * k, glow[1] * k, glow[2] * k);
      haloMesh.instanceColor.needsUpdate = true;
    }
    quilt?.setLit(entry.halo, lit);
    const data = entry.base.userData as Record<string, unknown>;
    data.lit = lit;
  };

  const rebuild = (scene: WorldScene, ctx: ModuleContext): void => {
    clear();
    if (!geometries || !buildingMaterial || !lampMaterial || !haloMaterial) return;
    if (!lampGeometry) {
      lampGeometry = new THREE.PlaneGeometry(1, 1);
      lampGeometry.rotateX(-Math.PI / 2);
    }
    if (!haloGeometry) {
      // Left in its xy plane: the material billboards it toward the camera.
      haloGeometry = new THREE.PlaneGeometry(1, 1);
    }
    const profile = QUALITY_PROFILES[ctx.quality];
    const layouts = scene.cities.map((city) =>
      layoutCity(city, hexToWorld(city.hex), ctx.rng(`cities:${city.id}`), ctx.terrain, {
        detail: profile.detail,
      }),
    );

    // Instance counts per archetype, then one mesh each.
    const counts: Record<ArchetypeId, number> = {
      slab: 0,
      tower: 0,
      perimeter: 0,
      house: 0,
      hall: 0,
      landmark: 0,
    };
    let lampCount = 0;
    for (const layout of layouts) {
      for (const building of layout.buildings) counts[building.archetype] += 1;
      lampCount += layout.lamps.length;
    }
    const cursors: Record<ArchetypeId, number> = { ...counts };
    for (const id of ARCHETYPE_IDS) {
      cursors[id] = 0;
      if (counts[id] === 0) continue;
      const geometry = geometries[id];
      geometry.setAttribute(
        "enState",
        new THREE.InstancedBufferAttribute(new Float32Array(counts[id] * 4), 4),
      );
      const mesh = new THREE.InstancedMesh(geometry, buildingMaterial.material, counts[id]);
      mesh.name = `cities:${id}`;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(counts[id] * 3), 3);
      mesh.castShadow = profile.shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      ctx.root.add(mesh);
      meshes[id] = mesh;
    }
    if (lampCount > 0) {
      lampMesh = new THREE.InstancedMesh(lampGeometry, lampMaterial.material, lampCount);
      lampMesh.name = "cities:lamps";
      lampMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(lampCount * 3),
        3,
      );
      lampMesh.frustumCulled = false;
      lampMesh.renderOrder = 10;
      ctx.root.add(lampMesh);
    }
    haloMesh = new THREE.InstancedMesh(haloGeometry, haloMaterial.material, layouts.length);
    haloMesh.name = "cities:halos";
    haloMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(layouts.length * 3),
      3,
    );
    haloMesh.frustumCulled = false;
    haloMesh.renderOrder = 9;
    ctx.root.add(haloMesh);
    // The night seen from far: one atlas, one quilt, one draw call.
    atlas = buildLightAtlas(layouts);
    quilt = buildLightQuilt(layouts, atlas, ctx.terrain, uniforms.uLampFade);
    ctx.root.add(quilt.mesh);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let lampCursor = 0;
    entries = layouts.map((layout, index) => {
      const city = scene.cities[index]!;
      const ranges: Partial<Record<ArchetypeId, Range>> = {};
      const starts: Record<ArchetypeId, number> = { ...cursors };
      for (const building of layout.buildings) {
        const id = building.archetype;
        const mesh = meshes[id]!;
        const at = cursors[id];
        cursors[id] += 1;
        position.set(building.x, building.y, building.z);
        quaternion.setFromAxisAngle(up, building.rotation);
        scale.set(building.w, building.h, building.d);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(at, matrix);
        mesh.instanceColor!.setXYZ(at, building.tint[0], building.tint[1], building.tint[2]);
        const state = mesh.geometry.getAttribute("enState") as THREE.InstancedBufferAttribute;
        state.setXYZW(at, city.lit, building.seed, building.roof, building.style);
      }
      for (const id of ARCHETYPE_IDS) {
        const count = cursors[id] - starts[id];
        if (count > 0) ranges[id] = { start: starts[id], count };
      }
      const lamps: Range = { start: lampCursor, count: layout.lamps.length };
      for (const lamp of layout.lamps) {
        position.set(lamp.x, lamp.y, lamp.z);
        quaternion.identity();
        scale.set(lamp.size, 1, lamp.size);
        matrix.compose(position, quaternion, scale);
        lampMesh!.setMatrixAt(lampCursor, matrix);
        lampCursor += 1;
      }
      const span = layout.radiusKm * HALO_SPAN;
      position.set(layout.centre.x, layout.centre.y + layout.radiusKm * HALO_LIFT, layout.centre.z);
      quaternion.identity();
      scale.set(span, span * 0.55, 1);
      matrix.compose(position, quaternion, scale);
      haloMesh!.setMatrixAt(index, matrix);

      // The hook the effects module rings: the city's ground centre and numbers.
      const base = new THREE.Object3D();
      base.name = `cities:base:${city.id}`;
      base.position.set(layout.centre.x, layout.centre.y, layout.centre.z);
      base.userData = {
        cityId: city.id,
        radiusKm: layout.radiusKm,
        connected: city.connected,
        blackout: city.blackout,
        ensMw: city.ensMw,
        lit: city.lit,
      };
      ctx.root.add(base);

      return {
        city,
        layout,
        ranges,
        lamps,
        halo: index,
        base,
        litShown: city.lit,
        litFrom: city.lit,
        litTarget: city.lit,
        transitionStart: 0,
        transitioning: false,
      };
    });
    for (const mesh of Object.values(meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      (mesh.geometry.getAttribute("enState") as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    if (lampMesh) lampMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;
    for (const entry of entries) applyLit(entry, entry.city.lit);
  };

  /** The night factor from the sky when it is there, else from the scene's sun. */
  const nightOf = (ctx: ModuleContext): number => {
    const daylight = "envMap" in ctx.environment ? ctx.environment.daylight : sceneDaylight;
    return 1 - smoothstep(0.08, 0.55, daylight);
  };

  return {
    id: "cities",

    init(ctx) {
      ctxRef = ctx;
      geometries = buildArchetypes();
      buildingMaterial = createBuildingMaterial(uniforms);
      lampMaterial = createLampMaterial(uniforms);
      haloMaterial = createHaloMaterial();
    },

    update(scene, previous, ctx) {
      ctxRef = ctx;
      sceneDaylight = scene.sun.daylight;
      uniforms.uWindowShare.value = windowShareAt(scene.time.hour);
      const key = buildKey(scene, ctx.quality);
      if (key !== builtKey) {
        builtKey = key;
        rebuild(scene, ctx);
        return;
      }
      const animate =
        previous !== null && ctx.motion.transitions && !ctx.clock.pinned && ctx.clock.scale > 0;
      scene.cities.forEach((city, index) => {
        const entry = entries[index];
        if (!entry) return;
        entry.city = city;
        const data = entry.base.userData as Record<string, unknown>;
        data.blackout = city.blackout;
        data.ensMw = city.ensMw;
        if (Math.abs(city.lit - entry.litTarget) < 1e-6) return;
        entry.litTarget = city.lit;
        if (animate) {
          entry.litFrom = entry.litShown;
          entry.transitionStart = ctx.clock.time;
          entry.transitioning = true;
        } else {
          entry.transitioning = false;
          applyLit(entry, city.lit);
        }
      });
    },

    frame(_dt, ctx) {
      const night = nightOf(ctx);
      uniforms.uNight.value = night;
      if (ctx.motion.ambient) ambientTime = ctx.clock.time;
      uniforms.uTime.value = ambientTime;
      const camera = ctx.view.camera;
      const height = Math.max(1, ctx.renderer.domElement.height);
      uniforms.uPxKm.value = (2 * Math.tan((camera.fov * DEG) / 2)) / height;
      uniforms.uSnowlineKm.value = ctx.terrain.snowlineKm;
      if (lampMaterial) lampMaterial.material.opacity = 0.6 * night;
      if (haloMaterial) haloMaterial.material.opacity = 0.085 * night;
      const castShadows =
        QUALITY_PROFILES[ctx.quality].shadows &&
        ctx.view.distanceKm < (SHADOW_CAST_KM[ctx.quality] ?? 0);
      for (const mesh of Object.values(meshes)) mesh.castShadow = castShadows;
      const lightsOn = night > 0.002;
      const distance = ctx.view.distanceKm;
      const fade = uniforms.uLampFade.value;
      if (lampMesh) lampMesh.visible = lightsOn && distance < fade.y + 20;
      if (haloMesh) haloMesh.visible = lightsOn;
      if (quilt) {
        quilt.uniforms.uNight.value = night;
        quilt.mesh.visible = lightsOn && distance > fade.x - 20;
      }
      // Level of detail: a 0,2 km house is sub-pixel past 300 km on the lower tiers.
      const house = meshes.house;
      if (house) house.visible = ctx.quality === "high" || distance < HOUSE_LOD_KM;
      for (const entry of entries) {
        if (!entry.transitioning) continue;
        const k = smoothstep(0, 1, (ctx.clock.time - entry.transitionStart) / TRANSITION_SECONDS);
        applyLit(entry, entry.litFrom + (entry.litTarget - entry.litFrom) * k);
        if (k >= 1) entry.transitioning = false;
      }
    },

    dispose() {
      clear();
      if (geometries) for (const geometry of Object.values(geometries)) geometry.dispose();
      geometries = null;
      buildingMaterial?.dispose();
      buildingMaterial = null;
      lampMaterial?.dispose();
      lampMaterial = null;
      haloMaterial?.dispose();
      haloMaterial = null;
      lampGeometry?.dispose();
      lampGeometry = null;
      haloGeometry?.dispose();
      haloGeometry = null;
      builtKey = null;
      ctxRef = null;
    },
  };
}
