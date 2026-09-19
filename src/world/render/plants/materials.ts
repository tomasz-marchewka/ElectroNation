// Materials of the plants layer (ARCHITECTURE.md §14: everything procedural).
// Seven PBR surfaces — concrete, painted corrugated steel (two tints), brick,
// coal, yard asphalt, the stack's banded concrete — each with a seeded albedo
// and a normal map, sharing ONE fragment hook that turns the geometry's
// `aEmit` / `aWall` attributes and the per-instance `enState` into the state
// encoding of docs/08 §3: hall window bands that glow warm when the block is
// online (× night), orange when it is warming up (growing with `warmup`,
// visible by day), the furnace louvres of a boiler house glowing with the
// load, lamp heads on the masts at night, a faint exhaust heat on the gas
// units. Roofs above the snowline take snow. The plume and light materials
// are ShaderMaterials: camera-facing soft puffs moved by the wind on the
// frame clock, red obstruction lights that blink only under ambient motion,
// and floodlight pools that never fall under two pixels.

import * as THREE from "three";
import { normalMapFromHeight, proceduralTexture } from "../core/textures";
import type { MaterialKind } from "./geometry";

/** Window pitch along a hall wall [km] — a 7 m bay × 20. */
const WINDOW_PITCH_KM = 0.14;

export interface PlantUniforms {
  /** 0 by day … 1 at night. */
  uNight: { value: number };
  /** Roofs above this height take snow [km]. */
  uSnowlineKm: { value: number };
  /** km of world per pixel at 1 km of camera distance. */
  uPxKm: { value: number };
  /** Seconds, advancing only under ambient motion (blinking). */
  uAmbientTime: { value: number };
  /** Seconds, advancing only under stateful motion (plumes). */
  uPlumeTime: { value: number };
  /** 1 while obstruction lights may blink. */
  uBlink: { value: number };
  /** Wind drift of the plumes [km/s] in world xz. */
  uWind: { value: THREE.Vector3 };
  /** 0..1 gustiness of the regime — wobble of the puffs. */
  uGust: { value: number };
  /** Sun direction in VIEW space, its colour and strength, the sky ambient. */
  uSunView: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSunIntensity: { value: number };
  uSkyColor: { value: THREE.Color };
  uAmbient: { value: number };
}

export function createPlantUniforms(): PlantUniforms {
  return {
    uNight: { value: 0 },
    uSnowlineKm: { value: Number.POSITIVE_INFINITY },
    uPxKm: { value: 0.001 },
    uAmbientTime: { value: 0 },
    uPlumeTime: { value: 0 },
    uBlink: { value: 0 },
    uWind: { value: new THREE.Vector3(0.05, 0, 0) },
    uGust: { value: 0.2 },
    uSunView: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunIntensity: { value: 1 },
    uSkyColor: { value: new THREE.Color(0.5, 0.6, 0.8) },
    uAmbient: { value: 0.5 },
  };
}

// --- textures -----------------------------------------------------------------

/** Cast concrete: form-panel seams, pitting, rain stains. 1 repeat = 1 km. */
function concreteAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:concrete",
    size: 256,
    fields: { grain: { lattice: 24, octaves: 4 }, stain: { lattice: 6, octaves: 3 } },
    pixel(u, v, f) {
      const grain = f.grain!.at(u * 24, v * 24);
      const stain = f.stain!.at(u * 6, v * 2.5);
      let k = 0.58 + (grain - 0.5) * 0.14 - Math.max(0, stain - 0.55) * 0.3;
      // Panel seams every 0,1 km, a rougher pour line every 0,5 km.
      const seam = (v * 10) % 1;
      if (seam < 0.035) k *= 0.8;
      if ((v * 2) % 1 < 0.02) k *= 0.85;
      return [k, k * 0.99, k * 0.96];
    },
  });
}

function concreteNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "plants:concrete-normal",
    256,
    (u, v, f) => {
      const seam = Math.abs(((v * 10) % 1) - 0.02);
      const groove = seam < 0.02 ? -0.5 : 0;
      return groove + 0.2 * (f.pit!.at(u * 32, v * 32) - 0.5);
    },
    { pit: { lattice: 32, octaves: 3 } },
    1.6,
  );
}

/** Painted corrugated cladding: ribs along u, chalking and rust runs. */
function steelAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:steel",
    size: 256,
    fields: { chalk: { lattice: 8, octaves: 3 }, rust: { lattice: 20, octaves: 3 } },
    pixel(u, v, f) {
      const chalk = f.chalk!.at(u * 8, v * 8);
      const rust = f.rust!.at(u * 20, v * 1.5);
      const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 40);
      let k = 0.72 + (chalk - 0.5) * 0.12 + (rib - 0.5) * 0.06;
      // Sheet seams every 0,25 km along v.
      if ((v * 4) % 1 < 0.02) k *= 0.85;
      const run = Math.max(0, rust - 0.62) * Math.min(1, v * 3);
      return [k - run * 0.25, k - run * 0.45, k - run * 0.55];
    },
  });
}

function steelNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "plants:steel-normal",
    256,
    (u, v) => {
      const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 40);
      const seam = (v * 4) % 1 < 0.02 ? -0.6 : 0;
      return rib * 0.35 + seam;
    },
    {},
    2.2,
  );
}

/** Brick: courses of a warm red with mortar, sooted toward the ground. */
function brickAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:brick",
    size: 256,
    fields: { tone: { lattice: 32, octaves: 3 }, soot: { lattice: 5, octaves: 3 } },
    pixel(u, v, f) {
      const courses = 40;
      const row = Math.floor(v * courses);
      const offset = row % 2 === 0 ? 0 : 0.5;
      const cv = (v * courses) % 1;
      const cu = (u * courses * 0.5 + offset) % 1;
      const mortar = cv < 0.12 || cu < 0.08;
      const tone = f.tone!.at(u * 32 + row * 0.37, v * 32);
      const soot = f.soot!.at(u * 5, v * 5);
      if (mortar) {
        const m = 0.55 + (tone - 0.5) * 0.1;
        return [m, m * 0.97, m * 0.92];
      }
      const k = 0.42 + (tone - 0.5) * 0.3 - Math.max(0, soot - 0.5) * 0.25;
      return [k * 1.0, k * 0.52, k * 0.4];
    },
  });
}

function brickNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "plants:brick-normal",
    256,
    (u, v) => {
      const courses = 40;
      const row = Math.floor(v * courses);
      const offset = row % 2 === 0 ? 0 : 0.5;
      const cv = (v * courses) % 1;
      const cu = (u * courses * 0.5 + offset) % 1;
      return cv < 0.12 || cu < 0.08 ? -0.6 : 0;
    },
    {},
    1.4,
  );
}

/** Yard: aged asphalt and concrete slabs with oil stains and gravel verges. */
function yardAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:yard",
    size: 256,
    fields: { grain: { lattice: 32, octaves: 4 }, patch: { lattice: 4, octaves: 3 } },
    pixel(u, v, f) {
      const grain = f.grain!.at(u * 32, v * 32);
      const patch = f.patch!.at(u * 4, v * 4);
      // sRGB values: aged asphalt ≈ 0,42, concrete slabs ≈ 0,5, gravel ≈ 0,58.
      let k = 0.44 + (grain - 0.5) * 0.1 + (patch - 0.5) * 0.14;
      // Slab seams every 0,25 km.
      if ((u * 4) % 1 < 0.02 || (v * 4) % 1 < 0.02) k *= 0.8;
      // Gravel verge where the patch field is high.
      const gravel = Math.max(0, patch - 0.62) * 3;
      const r = k + gravel * 0.14;
      return [r, k + gravel * 0.12, k * 0.97 + gravel * 0.08];
    },
  });
}

/** Coal: near-black lumps with the odd glint. */
function coalAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:coal",
    size: 128,
    fields: { lump: { lattice: 24, octaves: 4 } },
    pixel(u, v, f) {
      const lump = f.lump!.at(u * 24, v * 24);
      const k = 0.03 + Math.pow(lump, 3) * 0.16;
      return [k, k * 0.98, k * 0.96];
    },
  });
}

function coalNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "plants:coal-normal",
    128,
    (u, v, f) => f.lump!.at(u * 24, v * 24),
    { lump: { lattice: 24, octaves: 4 } },
    3,
  );
}

/**
 * The stack: v runs 0..1 over the height (geometry.ts, vNormalized) — concrete
 * with the red-and-white obstruction bands over the top fifth, soot at the
 * lip and rust streaks running down from the platforms.
 */
function stackAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:stack",
    size: 256,
    fields: { grain: { lattice: 16, octaves: 3 }, streak: { lattice: 24, octaves: 3 } },
    pixel(u, v, f) {
      const grain = f.grain!.at(u * 16, v * 16);
      const streak = f.streak!.at(u * 24, v * 2);
      const k = 0.6 + (grain - 0.5) * 0.12;
      const run = Math.max(0, streak - 0.6) * 0.5;
      let r = k - run * 0.2;
      let g = k - run * 0.4;
      let b = k - run * 0.5;
      if (v > 0.8) {
        const band = Math.floor((v - 0.8) / 0.04) % 2 === 0;
        if (band) {
          r = 0.75 + (grain - 0.5) * 0.1;
          g = 0.12;
          b = 0.08;
        } else {
          r = g = b = 0.88 + (grain - 0.5) * 0.1;
        }
      }
      // Soot at the lip.
      const soot = Math.max(0, v - 0.96) * 12;
      r *= 1 - soot * 0.6;
      g *= 1 - soot * 0.65;
      b *= 1 - soot * 0.7;
      return [r, g, b];
    },
  });
}

function stackNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "plants:stack-normal",
    256,
    (u, v, f) => {
      const ring = (v * 25) % 1 < 0.03 ? -0.5 : 0;
      return ring + 0.15 * (f.grain!.at(u * 16, v * 16) - 0.5);
    },
    { grain: { lattice: 16, octaves: 3 } },
    1.4,
  );
}

/** A soft puff: a gaussian broken up by noise into a cauliflower edge. */
function puffTexture(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:puff",
    size: 64,
    fields: { lump: { lattice: 6, octaves: 3 } },
    pixel(u, v, f) {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const lump = f.lump!.at(u * 6, v * 6);
      const edge = 0.8 + 0.4 * (lump - 0.5);
      // A gaussian core with a noisy, soft rim — never a hard-edged ball.
      const value = Math.exp(-3.2 * (r / edge) * (r / edge)) * (0.75 + 0.5 * lump);
      const k = Math.min(1, value * Math.max(0, 1 - r * r));
      return [k, k, k];
    },
    colorSpace: THREE.NoColorSpace,
  });
}

/** A round light pool. */
function dotTexture(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:dot",
    size: 64,
    pixel(u, v) {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const value = Math.pow(Math.max(0, 1 - r), 1.7);
      return [value, value, value];
    },
    colorSpace: THREE.NoColorSpace,
  });
}

// --- structure material ---------------------------------------------------------

const STRUCTURE_VERTEX_PARS = /* glsl */ `
attribute float aEmit;
attribute float aWall;
attribute vec4 enState;
varying float vEnEmit;
varying float vEnWall;
varying vec4 vEnState;
varying vec2 vEnUv;
varying float vEnWorldY;
varying float vEnUp;
`;

const STRUCTURE_VERTEX = /* glsl */ `
#include <begin_vertex>
vEnEmit = aEmit;
vEnWall = aWall;
vEnState = enState;
vEnUv = uv;
{
  #ifdef USE_INSTANCING
  mat4 enModel = modelMatrix * instanceMatrix;
  #else
  mat4 enModel = modelMatrix;
  #endif
  vEnWorldY = ( enModel * vec4( transformed, 1.0 ) ).y;
  vEnUp = normalize( mat3( enModel ) * objectNormal ).y;
}
`;

const STRUCTURE_FRAGMENT_PARS = /* glsl */ `
uniform float uNight;
uniform float uSnowlineKm;
varying float vEnEmit;
varying float vEnWall;
varying vec4 vEnState;
varying vec2 vEnUv;
varying float vEnWorldY;
varying float vEnUp;
float enHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
`;

/** Snow on up-facing surfaces above the snowline; glass in the window band. */
const STRUCTURE_COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
float enSnow = 0.0;
#ifdef EN_SNOW
enSnow = smoothstep( uSnowlineKm - 0.3, uSnowlineKm + 0.3, vEnWorldY ) * smoothstep( 0.55, 0.85, vEnUp );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.80, 0.83, 0.88 ), enSnow * 0.92 );
#endif
float enWin = 0.0;
float cellPx = 1e4;
if ( vEnEmit > 0.5 && vEnEmit < 1.5 ) {
  float band = smoothstep( 0.50, 0.54, vEnWall ) * ( 1.0 - smoothstep( 0.80, 0.84, vEnWall ) );
  vec2 fw = fwidth( vEnUv );
  cellPx = ${WINDOW_PITCH_KM.toFixed(3)} / max( fw.x, 1e-5 );
  float far = 1.0 - smoothstep( 2.0, 6.0, cellPx );
  float cell = fract( vEnUv.x / ${WINDOW_PITCH_KM.toFixed(3)} );
  float pane = smoothstep( 0.16, 0.22, cell ) * ( 1.0 - smoothstep( 0.82, 0.88, cell ) );
  enWin = band * mix( pane, 0.66, far );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.14, 0.18, 0.24 ), enWin );
}
`;

const STRUCTURE_ROUGHNESS_FRAGMENT = /* glsl */ `
float roughnessFactor = roughness;
roughnessFactor = mix( roughnessFactor, 0.32, enWin );
roughnessFactor = mix( roughnessFactor, 0.74, enSnow );
`;

/**
 * The state encoding (docs/08 §3). enState = (online 0..1, warm-up 0..1,
 * load 0..1, seed). Windows: warm × night when online, orange × warm-up at
 * any hour; the furnace louvres of a boiler house follow the load; lamp
 * heads light at night; a gas unit's exhaust cap carries a faint heat glow.
 */
const STRUCTURE_EMISSIVE_FRAGMENT = /* glsl */ `
{
  vec3 enE = vec3( 0.0 );
  float enOn = vEnState.x;
  float enWarm = vEnState.y;
  float enLoad = vEnState.z;
  if ( vEnEmit > 0.5 && vEnEmit < 1.5 ) {
    float id = floor( vEnUv.x / ${WINDOW_PITCH_KM.toFixed(3)} );
    float h = enHash( vec2( id, vEnState.w ) );
    float keep = step( h, 0.25 + 0.7 * enOn );
    vec3 warm = vec3( 1.0, 0.78, 0.5 );
    vec3 orange = vec3( 1.0, 0.32, 0.03 );
    // The far average carries less energy than the panes it stands for, so a hall
    // never reads as one solid yellow slab from the closeup distance.
    float farCut = mix( 1.0, 0.55, 1.0 - smoothstep( 2.0, 6.0, cellPx ) );
    enE += enWin * farCut * ( warm * 1.6 * uNight * enOn * keep + orange * 2.0 * enWarm );
  } else if ( vEnEmit > 1.5 && vEnEmit < 2.5 ) {
    float band = smoothstep( 0.14, 0.2, vEnWall ) * ( 1.0 - smoothstep( 0.44, 0.5, vEnWall ) );
    float louvre = 0.45 + 0.55 * smoothstep( 0.3, 0.5, fract( vEnWall * 28.0 ) );
    vec3 fire = vec3( 1.0, 0.34, 0.05 );
    enE += band * louvre * fire * ( 1.4 * enLoad * ( 0.3 + 0.7 * uNight ) + 2.0 * enWarm );
  } else if ( vEnEmit > 2.5 && vEnEmit < 3.5 ) {
    enE += vec3( 1.0, 0.94, 0.82 ) * 4.5 * uNight;
  } else if ( vEnEmit > 3.5 ) {
    enE += vec3( 1.0, 0.45, 0.15 ) * enLoad * ( 0.2 + 0.8 * uNight ) * 0.8;
  }
  totalEmissiveRadiance = enE;
}
`;

interface SurfaceSpec {
  color: [number, number, number];
  map: () => THREE.DataTexture;
  normalMap: (() => THREE.DataTexture) | null;
  normalScale: number;
  roughness: number;
  metalness: number;
  /** World km per texture repeat. */
  repeatKm: number;
  snow: boolean;
}

const SURFACES: Record<MaterialKind, SurfaceSpec> = {
  concrete: {
    color: [1, 1, 1],
    map: concreteAlbedo,
    normalMap: concreteNormal,
    normalScale: 0.6,
    roughness: 0.86,
    metalness: 0,
    repeatKm: 1,
    snow: true,
  },
  steel: {
    color: [0.62, 0.66, 0.7],
    map: steelAlbedo,
    normalMap: steelNormal,
    normalScale: 0.7,
    roughness: 0.55,
    metalness: 0.35,
    repeatKm: 0.5,
    snow: true,
  },
  steelPale: {
    color: [0.86, 0.88, 0.9],
    map: steelAlbedo,
    normalMap: steelNormal,
    normalScale: 0.7,
    roughness: 0.5,
    metalness: 0.3,
    repeatKm: 0.5,
    snow: true,
  },
  brick: {
    color: [1, 1, 1],
    map: brickAlbedo,
    normalMap: brickNormal,
    normalScale: 0.8,
    roughness: 0.9,
    metalness: 0,
    repeatKm: 0.8,
    snow: true,
  },
  yard: {
    color: [1, 1, 1],
    map: yardAlbedo,
    normalMap: null,
    normalScale: 0,
    roughness: 0.94,
    metalness: 0,
    repeatKm: 1,
    snow: true,
  },
  coal: {
    color: [1, 1, 1],
    map: coalAlbedo,
    normalMap: coalNormal,
    normalScale: 1,
    roughness: 0.55,
    metalness: 0.1,
    repeatKm: 0.4,
    snow: false,
  },
  stack: {
    color: [1, 1, 1],
    map: stackAlbedo,
    normalMap: stackNormal,
    normalScale: 0.5,
    roughness: 0.8,
    metalness: 0,
    repeatKm: 1,
    snow: false,
  },
};

export interface PlantMaterials {
  structures: Record<MaterialKind, THREE.MeshStandardMaterial>;
  plume: THREE.ShaderMaterial;
  /** Red obstruction lights on stacks and towers. */
  aviation: THREE.ShaderMaterial;
  /** The per-block state glows. */
  glow: THREE.ShaderMaterial;
  flood: THREE.ShaderMaterial;
  dispose(): void;
}

function createGlowMaterial(
  uniforms: PlantUniforms,
  options: { blink: boolean; minPx: number; gain: number; name: string },
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDot: { value: dotTexture() },
      uPxKm: uniforms.uPxKm,
      uAmbientTime: uniforms.uAmbientTime,
      uBlink: options.blink ? uniforms.uBlink : { value: 0 },
      uMinPx: { value: options.minPx },
      uNight: uniforms.uNight,
      uGain: { value: options.gain },
    },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  material.name = options.name;
  return material;
}

function createStructureMaterial(
  kind: MaterialKind,
  uniforms: PlantUniforms,
): THREE.MeshStandardMaterial {
  const spec = SURFACES[kind];
  const map = spec.map();
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap: spec.normalMap ? spec.normalMap() : null,
    normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
    color: new THREE.Color().setRGB(
      spec.color[0],
      spec.color[1],
      spec.color[2],
      THREE.SRGBColorSpace,
    ),
    vertexColors: true,
    roughness: spec.roughness,
    metalness: spec.metalness,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 1,
  });
  // UVs are kilometres (geometry.ts): the repeat sets the texture's world scale.
  // The stack's v is normalised over its height; only u repeats there.
  const repeat = 1 / spec.repeatKm;
  material.map!.repeat.set(repeat, kind === "stack" ? 1 : repeat);
  if (material.normalMap) material.normalMap.repeat.set(repeat, kind === "stack" ? 1 : repeat);
  material.name = `plants-${kind}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uNight: uniforms.uNight, uSnowlineKm: uniforms.uSnowlineKm });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${STRUCTURE_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", STRUCTURE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${spec.snow ? "#define EN_SNOW\n" : ""}${STRUCTURE_FRAGMENT_PARS}`,
      )
      .replace("#include <color_fragment>", STRUCTURE_COLOR_FRAGMENT)
      .replace("#include <roughnessmap_fragment>", STRUCTURE_ROUGHNESS_FRAGMENT)
      .replace("#include <emissivemap_fragment>", STRUCTURE_EMISSIVE_FRAGMENT);
  };
  material.customProgramCacheKey = () => `en-plants-structure-${spec.snow ? "snow" : "bare"}`;
  return material;
}

// --- plumes ---------------------------------------------------------------------

/**
 * A puff's life is one cycle of its phase on the plume clock: it leaves the
 * mouth, rises (fast, then levelling), drifts with the wind, grows and
 * thins. `enPlume` = (phase, kind 0 smoke / 1 vapour / 2 wisp, strength
 * 0..1, seed). Strength — the block's load — sets opacity, size and the
 * length of the plume (puffs past the tail are gone), so a block at 40 %
 * shows a short thin plume and a block at 100 % a long dense one.
 */
const PLUME_VERTEX = /* glsl */ `
attribute vec4 enPlume;
uniform float uPlumeTime;
uniform float uLife;
uniform vec3 uWind;
uniform float uGust;
uniform float uPxKm;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vT;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vKind = enPlume.y;
  float strength = enPlume.z;
  float seed = enPlume.w;
  vec3 origin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  float base = length( instanceMatrix[ 0 ].xyz );
  float t = fract( enPlume.x + uPlumeTime / uLife );
  vT = t;
  bool vapour = vKind > 0.5 && vKind < 1.5;
  bool wisp = vKind > 1.5;
  // Buoyant rise levelling off — slow enough that neighbouring puffs overlap
  // into one body; vapour climbs highest, a wisp barely lifts.
  float riseKm = base * ( vapour ? 4.2 : wisp ? 2.5 : 5.5 );
  float rise = riseKm * ( 1.0 - exp( -2.0 * t ) );
  vec3 drift = uWind * ( t * uLife );
  float a = seed * 6.2831853;
  vec3 wobble = vec3( cos( a + t * 5.0 ), 0.3 * sin( a * 1.7 + t * 4.0 ), sin( a + t * 4.5 ) )
    * base * ( 0.2 + 1.1 * t ) * ( 0.5 + 0.8 * uGust );
  vec3 p = origin + vec3( 0.0, rise, 0.0 ) + drift + wobble;
  float grow = ( vapour ? 0.8 : 0.6 ) + ( vapour ? 3.2 : 2.6 ) * t;
  float size = base * grow * ( 0.55 + 0.45 * strength );
  float dist = distance( cameraPosition, p );
  float minSize = uPxKm * dist * 2.5;
  float grown = max( 1.0, minSize / max( size, 1e-4 ) );
  size = max( size, minSize );
  float tail = 0.28 + 0.72 * strength;
  float life = smoothstep( 0.0, 0.05, t ) * pow( max( 0.0, 1.0 - t / tail ), 1.25 );
  vAlpha = strength * life / pow( grown, 0.6 );
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  mvPosition.xy += position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const PLUME_FRAGMENT = /* glsl */ `
uniform sampler2D uPuff;
uniform vec3 uSunView;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uSkyColor;
uniform float uAmbient;
uniform float uNight;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vT;
#include <fog_pars_fragment>
void main() {
  float m = texture2D( uPuff, vUv ).r;
  bool vapour = vKind > 0.5 && vKind < 1.5;
  bool wisp = vKind > 1.5;
  vec3 albedo = vapour ? vec3( 0.95, 0.96, 0.98 ) : wisp ? vec3( 0.78, 0.78, 0.8 ) : mix( vec3( 0.36, 0.31, 0.27 ), vec3( 0.5, 0.48, 0.46 ), vT );
  // A puff is a sphere seen flat: a pseudo-normal lights it from the sun's side.
  vec2 c = vUv - 0.5;
  vec3 n = normalize( vec3( c.x * 0.6, c.y * 0.6, sqrt( max( 0.05, 0.25 - dot( c, c ) ) ) ) );
  float ndl = max( 0.0, dot( n, uSunView ) );
  // Mostly flat-lit (a cloud, not a ball), a little brighter toward the sun.
  vec3 light = uSkyColor * uAmbient * ( 0.8 + 0.2 * n.y ) + uSunColor * uSunIntensity * ( 0.45 + 0.55 * ndl ) * 0.55;
  vec3 col = albedo * light;
  // Floodlit from below near the mouth at night.
  col += vec3( 1.0, 0.72, 0.42 ) * uNight * pow( 1.0 - vT, 2.0 ) * ( vapour ? 0.35 : 0.5 );
  float alpha = m * vAlpha * ( vapour ? 0.72 : wisp ? 0.3 : 0.82 );
  gl_FragColor = vec4( col, alpha );
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// --- lights ---------------------------------------------------------------------

/**
 * A glow: a camera-facing dot that never falls under `uMinPx` pixels, coloured
 * per instance, faded out by day unless `enGlow.y` says it shows at any hour.
 * Obstruction lights (red, night, blinking under ambient motion) and the
 * block-state glows (orange × warm-up at any hour, warm × night when online)
 * share it. Grown dots pay for their size in brightness.
 */
const GLOW_VERTEX = /* glsl */ `
attribute vec2 enGlow;
uniform float uPxKm;
uniform float uAmbientTime;
uniform float uBlink;
uniform float uMinPx;
uniform float uNight;
varying vec2 vUv;
varying vec3 vColor;
varying float vOn;
void main() {
  vUv = uv;
  vec3 origin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  float have = length( instanceMatrix[ 0 ].xyz );
  vec4 mvPosition = viewMatrix * vec4( origin, 1.0 );
  float dist = length( mvPosition.xyz );
  float want = uPxKm * dist * uMinPx;
  float size = max( have, want );
  mvPosition.xy += position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  float wave = sin( 6.2831853 * ( uAmbientTime / 2.0 + enGlow.x ) );
  float blink = uBlink > 0.5 ? 0.12 + 0.88 * smoothstep( 0.1, 0.45, wave ) : 1.0;
  float visible = mix( uNight, 1.0, enGlow.y );
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #else
  vColor = vec3( 1.0 );
  #endif
  vOn = blink * visible / pow( max( 1.0, want / max( have, 1e-4 ) ), 0.5 );
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform sampler2D uDot;
uniform float uGain;
varying vec2 vUv;
varying vec3 vColor;
varying float vOn;
void main() {
  float m = texture2D( uDot, vUv ).r;
  gl_FragColor = vec4( vColor * uGain * vOn, m * vOn );
  #include <colorspace_fragment>
}
`;

/** Floodlight pool on the yard: a ground quad grown to at least two pixels, warm-white, night only. */
const FLOOD_VERTEX = /* glsl */ `
attribute float enPhase;
uniform float uPxKm;
varying vec2 vUv;
varying float vAtten;
void main() {
  vUv = uv;
  vec3 origin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  float have = length( instanceMatrix[ 0 ].xyz );
  float dist = distance( cameraPosition, origin );
  float want = uPxKm * dist * 2.0;
  float grow = max( 1.0, want / max( have, 1e-4 ) );
  vec3 transformed = position;
  transformed.xz *= grow;
  vAtten = ( 0.7 + 0.3 * enPhase ) / pow( grow, 1.2 );
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( transformed, 1.0 );
}
`;

const FLOOD_FRAGMENT = /* glsl */ `
uniform sampler2D uDot;
uniform float uNight;
varying vec2 vUv;
varying float vAtten;
void main() {
  float m = texture2D( uDot, vUv ).r;
  gl_FragColor = vec4( vec3( 1.0, 0.82, 0.55 ) * 1.1 * vAtten, m * uNight );
  #include <colorspace_fragment>
}
`;

export function createPlantMaterials(uniforms: PlantUniforms): PlantMaterials {
  const structures = Object.fromEntries(
    (Object.keys(SURFACES) as MaterialKind[]).map((kind) => [
      kind,
      createStructureMaterial(kind, uniforms),
    ]),
  ) as Record<MaterialKind, THREE.MeshStandardMaterial>;

  const plume = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uPuff: { value: puffTexture() },
      uLife: { value: 42 },
      uPlumeTime: uniforms.uPlumeTime,
      uWind: uniforms.uWind,
      uGust: uniforms.uGust,
      uPxKm: uniforms.uPxKm,
      uSunView: uniforms.uSunView,
      uSunColor: uniforms.uSunColor,
      uSunIntensity: uniforms.uSunIntensity,
      uSkyColor: uniforms.uSkyColor,
      uAmbient: uniforms.uAmbient,
      uNight: uniforms.uNight,
    },
    vertexShader: PLUME_VERTEX,
    fragmentShader: PLUME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  plume.name = "plants-plume";

  const aviation = createGlowMaterial(uniforms, {
    blink: true,
    minPx: 3,
    gain: 2.4,
    name: "plants-aviation",
  });
  const glow = createGlowMaterial(uniforms, {
    blink: false,
    minPx: 4.5,
    gain: 1.0,
    name: "plants-block-glow",
  });

  const flood = new THREE.ShaderMaterial({
    uniforms: {
      uDot: { value: dotTexture() },
      uPxKm: uniforms.uPxKm,
      uNight: uniforms.uNight,
    },
    vertexShader: FLOOD_VERTEX,
    fragmentShader: FLOOD_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  flood.name = "plants-flood";

  return {
    structures,
    plume,
    aviation,
    glow,
    flood,
    dispose() {
      for (const material of Object.values(structures)) material.dispose();
      plume.dispose();
      aviation.dispose();
      glow.dispose();
      flood.dispose();
    },
  };
}
