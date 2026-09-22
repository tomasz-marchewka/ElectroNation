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

/** Window pitch along a hall wall [km] — a 17 m gable bay × 20. Few and tall. */
const WINDOW_PITCH_KM = 0.34;

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
      let k = 0.52 + (grain - 0.5) * 0.26 - Math.max(0, stain - 0.5) * 0.42;
      // Panel seams every 0,1 km, a rougher pour line every 0,5 km.
      const seam = (v * 10) % 1;
      if (seam < 0.035) k *= 0.7;
      if ((v * 2) % 1 < 0.02) k *= 0.78;
      // Rain streaks run down from the pour lines.
      k -= Math.max(0, f.stain!.at(u * 12, v * 1.2) - 0.62) * 0.5;
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
      let k = 0.6 + (chalk - 0.5) * 0.24 + (rib - 0.5) * 0.12;
      // Sheet seams every 0,25 km along v.
      if ((v * 4) % 1 < 0.02) k *= 0.7;
      const run = Math.max(0, rust - 0.55) * Math.min(1, v * 3);
      return [k - run * 0.3, k - run * 0.5, k - run * 0.6];
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
      const k = 0.36 + (tone - 0.5) * 0.44 - Math.max(0, soot - 0.45) * 0.34;
      return [k * 1.0, k * 0.5, k * 0.38];
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
      let k = 0.4 + (grain - 0.5) * 0.18 + (patch - 0.5) * 0.2;
      // Slab seams every 0,25 km.
      if ((u * 4) % 1 < 0.02 || (v * 4) % 1 < 0.02) k *= 0.7;
      // Gravel verge where the patch field is high, oil where it is low.
      const gravel = Math.max(0, patch - 0.6) * 3;
      k *= 1 - Math.max(0, 0.42 - patch) * 1.1;
      const r = k + gravel * 0.18;
      return [r, k + gravel * 0.15, k * 0.97 + gravel * 0.1];
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
      const lump = f.lump!.at(u * 9, v * 9);
      const k = 0.02 + Math.pow(lump, 3) * 0.13;
      return [k, k * 0.98, k * 0.96];
    },
  });
}

function coalNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "plants:coal-normal",
    128,
    (u, v, f) => f.lump!.at(u * 9, v * 9),
    { lump: { lattice: 9, octaves: 3 } },
    2.4,
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
      const k = 0.5 + (grain - 0.5) * 0.24;
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

/**
 * The site halo: a tight dome of scattered light, brightest just over the pad
 * so it reads as light pooling in the yard and not as a disc painted on the
 * ground. The falloff is dead by r = 0.7 of the quad and the window closes at
 * 0.72, so the billboard can never show its edge as a bright rectangle — the
 * mistake of the first pass, which cut a soft square over the site.
 */
function haloTexture(): THREE.DataTexture {
  return proceduralTexture({
    name: "plants:halo",
    size: 128,
    fields: { grain: { lattice: 5, octaves: 2 } },
    pixel(u, v, f) {
      const r = Math.hypot(u - 0.5, (v - 0.46) * 1.15) * 2;
      const grain = f.grain!.at(u * 5, v * 5);
      // A broad soft dome that stays visible across most of its quad — the
      // screen floor in the vertex shader is what keeps the site legible, so
      // the texture must not shrink the glow back into a dot.
      const window = 1 - smoothstep(0.78, 1.0, r);
      const value = Math.exp(-2.0 * r * r) * (0.9 + 0.2 * grain) * window;
      return [value, value, value];
    },
    colorSpace: THREE.NoColorSpace,
  });
}

/** Smoothstep, since GLSL's is not reachable from a JS pixel callback. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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

/**
 * Snow on up-facing surfaces above the snowline; glass in the window band. The
 * band is tall and sits high on the wall; the panes are few and separated by
 * dark piers, so a hall reads as bays with windows, not as one glowing strip.
 * Beyond a few pixels per pane the model falls back to a dim average — never
 * to a lit slab, which is what drowned the strategic read.
 */
const STRUCTURE_COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
float enSnow = 0.0;
#ifdef EN_SNOW
enSnow = smoothstep( uSnowlineKm - 0.3, uSnowlineKm + 0.3, vEnWorldY ) * smoothstep( 0.55, 0.85, vEnUp );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.80, 0.83, 0.88 ), enSnow * 0.92 );
#endif
// Grime climbs the walls from the yard, the top edge wears bright where the
// rain runs off. Both are keyed to the part's own height (aWall), so the same
// material reads differently on a boiler house and on a fence post.
float enWallish = 1.0 - smoothstep( 0.45, 0.8, abs( vEnUp ) );
float enGrime = ( 1.0 - smoothstep( 0.0, 0.32, vEnWall ) ) * enWallish * ( 1.0 - enSnow );
diffuseColor.rgb *= 1.0 - enGrime * 0.3;
diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.86, 0.88, 0.84 ), enGrime * 0.5 );
float enWear = smoothstep( 0.94, 1.0, vEnWall ) * enWallish * ( 1.0 - enSnow );
diffuseColor.rgb *= 1.0 + enWear * 0.12;
float enWin = 0.0;
float enFar = 0.0;
if ( vEnEmit > 0.5 && vEnEmit < 1.5 ) {
  float band = smoothstep( 0.40, 0.46, vEnWall ) * ( 1.0 - smoothstep( 0.84, 0.90, vEnWall ) );
  vec2 fw = fwidth( vEnUv );
  float cellPx = ${WINDOW_PITCH_KM.toFixed(3)} / max( fw.x, 1e-5 );
  enFar = 1.0 - smoothstep( 3.0, 8.0, cellPx );
  float cell = fract( vEnUv.x / ${WINDOW_PITCH_KM.toFixed(3)} );
  float pane = smoothstep( 0.28, 0.34, cell ) * ( 1.0 - smoothstep( 0.66, 0.72, cell ) );
  enWin = band * mix( pane, 0.5, enFar );
  // Near-black glass, so an unlit pane is a hole in the wall and a lit one is
  // the only light on it — the contrast the first pass was missing.
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.045, 0.06, 0.085 ), enWin );
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
 * any hour; a per-block occupancy makes each block's hall read on its own —
 * a block at 40 % load keeps fewer panes lit than one at full output. The
 * furnace louvres of a boiler house follow the load; the roof monitor is a
 * dim strip; the coal yard is floodlit (a sheen on the piles, lamps on the
 * conveyor); lamp heads light at night; a gas unit's exhaust cap and the ACC
 * fan deck carry the heat of the load.
 */
const STRUCTURE_EMISSIVE_FRAGMENT = /* glsl */ `
{
  vec3 enE = vec3( 0.0 );
  float enOn = vEnState.x;
  float enWarm = vEnState.y;
  float enLoad = vEnState.z;
  // Every surface catches a little skyglow at night. Without it a dark plant
  // is a ring of floodlights with no mass between them; with it the domes,
  // halls and towers keep their silhouettes after dusk. Faint by construction.
  enE += vec3( 0.40, 0.46, 0.55 ) * smoothstep( 0.15, 0.85, vEnUp ) * uNight * 0.10;
  enE += vec3( 0.34, 0.39, 0.48 ) * smoothstep( 0.45, 1.0, vEnWall ) * uNight * 0.09;
  if ( vEnEmit > 0.5 && vEnEmit < 1.5 ) {
    float id = floor( vEnUv.x / ${WINDOW_PITCH_KM.toFixed(3)} );
    // Occupancy is the block's own: its seed sets the share of panes it runs
    // lit, its load raises it. Two blocks of one plant differ by construction.
    float seedK = enHash( vec2( vEnState.w, 3.7 ) );
    float occ = mix( 0.28, 0.95, clamp( 0.55 * seedK + 0.45 * enLoad, 0.0, 1.0 ) );
    float lit = enOn * step( enHash( vec2( id, vEnState.w ) ), occ );
    float litWarm = step( enHash( vec2( id, vEnState.w + 11.0 ) ), 0.3 + 0.5 * enWarm );
    vec3 warm = vec3( 1.0, 0.78, 0.5 );
    vec3 orange = vec3( 1.0, 0.32, 0.03 );
    // The far average carries less energy than the panes it stands for, so a hall
    // never reads as one solid yellow slab from the strategic distance.
    float farDim = mix( 1.0, 0.4, enFar );
    // The band follows the block's output: a hall at half load is a dimmer,
    // sparser band than one at full — the load-scaled mass at night.
    float bandEnergy = 0.55 + 0.45 * clamp( enLoad, 0.0, 1.0 );
    enE += enWin * farDim * ( warm * 1.6 * bandEnergy * uNight * lit + orange * 1.6 * enWarm * litWarm );
  } else if ( vEnEmit > 1.5 && vEnEmit < 2.5 ) {
    float band = smoothstep( 0.14, 0.2, vEnWall ) * ( 1.0 - smoothstep( 0.44, 0.5, vEnWall ) );
    float louvre = 0.45 + 0.55 * smoothstep( 0.3, 0.5, fract( vEnWall * 28.0 ) );
    vec3 fire = vec3( 1.0, 0.34, 0.05 );
    // A furnace seen through louvres is a glow, not a lamp bank: keep it well
    // under the window band so the halls hold the closeup read.
    enE += band * louvre * fire * ( 0.7 * enLoad * ( 0.3 + 0.7 * uNight ) + 1.6 * enWarm );
  } else if ( vEnEmit > 2.5 && vEnEmit < 3.5 ) {
    enE += vec3( 1.0, 0.94, 0.82 ) * 4.5 * uNight;
  } else if ( vEnEmit > 3.5 && vEnEmit < 4.5 ) {
    // The hot end of a gas unit: an exhaust glow proportional to the load.
    enE += vec3( 1.0, 0.44, 0.14 ) * enLoad * ( 0.3 + 0.7 * uNight ) * 2.0;
  } else if ( vEnEmit > 4.5 && vEnEmit < 5.5 ) {
    // Roof monitor: a dim continuous clerestory strip, its vents hashed.
    float vent = 0.65 + 0.35 * enHash( vec2( floor( vEnUv.x / 0.11 ), vEnState.w ) );
    enE += vec3( 1.0, 0.78, 0.52 ) * vent * 0.5 * ( 0.35 + 0.65 * uNight ) * ( 0.3 + 0.7 * enOn );
  } else if ( vEnEmit > 5.5 && vEnEmit < 6.5 ) {
    // Floodlit coal: only the up-facing face of a lump catches the yard lamps.
    // The sides and the base stay near-black — the first pass lit the whole
    // pile and the stockpiles read as snow under the floodlights.
    float sheen = smoothstep( 0.45, 0.95, vEnUp );
    float lumps = 0.55 + 0.6 * enHash( vec2( floor( vEnUv.x * 4.0 ), floor( vEnUv.y * 4.0 ) ) );
    enE += vec3( 0.30, 0.29, 0.26 ) * sheen * lumps * uNight * ( 0.25 + 0.75 * enOn ) * 0.55;
  } else if ( vEnEmit > 6.5 && vEnEmit < 7.5 ) {
    // Yard lamps on the conveyor gallery: discrete dashes along its length.
    float bay = floor( vEnUv.x / 0.24 );
    float lamp = step( 0.42, fract( vEnUv.x / 0.24 ) ) * ( 0.6 + 0.4 * enHash( vec2( bay, 5.0 ) ) );
    enE += vec3( 1.0, 0.86, 0.62 ) * lamp * 2.1 * uNight * ( 0.35 + 0.65 * enOn );
  } else if ( vEnEmit > 7.5 ) {
    // ACC fan deck: cool-white cells glowing from below, with the load. The
    // CCGT's night signature — an OCGT has no air-cooled condenser.
    float cell = enHash( vec2( floor( vEnUv.x * 8.0 ), floor( vEnUv.y * 8.0 ) ) );
    enE += vec3( 0.7, 0.79, 0.92 ) * ( 0.3 + 0.7 * cell ) * ( 0.2 + 0.8 * uNight )
      * ( 0.2 + 0.8 * enLoad ) * 1.3;
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
    color: [0.44, 0.48, 0.52],
    map: steelAlbedo,
    normalMap: steelNormal,
    normalScale: 0.7,
    roughness: 0.55,
    metalness: 0.35,
    repeatKm: 0.5,
    snow: true,
  },
  steelPale: {
    color: [0.72, 0.75, 0.78],
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
  /** One warm dome per plant — the strategic night read. */
  site: THREE.ShaderMaterial;
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
 * thins. `enPlume` = (phase, kind 0 smoke / 1 vapour / 2 wisp / 3 heat,
 * strength 0..1, seed). Strength — the block's load — sets opacity, size and
 * the length of the plume (puffs past the tail are gone), so a block at 40 %
 * shows a short thin plume and a block at 100 % a long dense one. The kinds
 * are tuned apart (docs/08 §3): coal smoke is dark grey-brown and dense,
 * cooling-tower vapour white and thin, the gas units' heat is a thin shimmer
 * that only glows at night, its brightness the load.
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
  bool smoke = vKind < 0.5;
  bool vapour = vKind > 0.5 && vKind < 1.5;
  bool wisp = vKind > 1.5 && vKind < 2.5;
  bool heat = vKind > 2.5;
  // Buoyant rise levelling off — slow enough that neighbouring puffs overlap
  // into one body; vapour climbs high, a heat shimmer fastest and thinnest.
  float riseKm = base * ( heat ? 7.5 : vapour ? 4.2 : wisp ? 2.5 : 5.5 );
  float rise = riseKm * ( 1.0 - exp( -2.0 * t ) );
  vec3 drift = uWind * ( t * uLife );
  float a = seed * 6.2831853;
  vec3 wobble = vec3( cos( a + t * 5.0 ), 0.3 * sin( a * 1.7 + t * 4.0 ), sin( a + t * 4.5 ) )
    * base * ( 0.15 + 0.6 * t ) * ( 0.5 + 0.8 * uGust );
  vec3 p = origin + vec3( 0.0, rise, 0.0 ) + drift + wobble;
  // A soot column spreads a little wider than vapour and a heat shimmer grows
  // fastest — overlapping puffs, never a chain of separate balls.
  float grow = heat ? ( 2.2 + 6.2 * t ) : ( vapour ? 0.8 : 0.9 ) + ( vapour ? 3.2 : 3.4 ) * t;
  float size = base * grow * ( heat ? 0.5 + 0.3 * strength : 0.55 + 0.45 * strength );
  float dist = distance( cameraPosition, p );
  // A plume is a map signal too: a 750 MW coal block must read at 500 km by
  // day, so soot keeps a much wider screen floor than vapour or a shimmer.
  float minPx = heat ? 2.0 : vapour ? 2.5 : wisp ? 3.0 : 8.0;
  float minSize = uPxKm * dist * minPx;
  float grown = max( 1.0, minSize / max( size, 1e-4 ) );
  size = max( size, minSize );
  float tail = heat ? 0.2 + 0.45 * strength : 0.28 + 0.72 * strength;
  float life = smoothstep( 0.0, 0.05, t ) * pow( max( 0.0, 1.0 - t / tail ), 1.25 );
  // A grown smoke puff stands for a column and keeps its opacity; a grown heat
  // shimmer thins away instead.
  vAlpha = strength * life / pow( grown, heat ? 0.7 : smoke ? 0.3 : 0.6 );
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
  bool wisp = vKind > 1.5 && vKind < 2.5;
  bool heat = vKind > 2.5;
  vec3 albedo = heat
    ? mix( vec3( 0.62, 0.55, 0.5 ), vec3( 0.5, 0.5, 0.52 ), vT )
    : vapour
      ? vec3( 0.97, 0.98, 1.0 )
      : wisp
        ? vec3( 0.74, 0.74, 0.76 )
        : mix( vec3( 0.05, 0.045, 0.04 ), vec3( 0.12, 0.11, 0.1 ), vT );
  // A puff is a sphere seen flat: a pseudo-normal lights it from the sun's side.
  vec2 c = vUv - 0.5;
  vec3 n = normalize( vec3( c.x * 0.6, c.y * 0.6, sqrt( max( 0.05, 0.25 - dot( c, c ) ) ) ) );
  float ndl = max( 0.0, dot( n, uSunView ) );
  // Mostly flat-lit (a cloud, not a ball), a little brighter toward the sun.
  vec3 light = uSkyColor * uAmbient * ( 0.8 + 0.2 * n.y ) + uSunColor * uSunIntensity * ( 0.45 + 0.55 * ndl ) * 0.55;
  // A heat shimmer reads by its glow, not by the sky it thins into.
  vec3 col = albedo * light * ( heat ? 0.35 : 1.0 );
  // Floodlit from below near the mouth at night; vapour catches it best, but a
  // coal plume is a body of soot and must not vanish into the dark sky.
  col += vec3( 1.0, 0.72, 0.42 ) * uNight * pow( 1.0 - vT, 2.0 )
    * ( vapour ? 0.62 : heat ? 0.3 : wisp ? 0.4 : 0.78 );
  // The sky over a lit plant is never black: soot catches that glow along its
  // whole length, which is what keeps a night plume readable at map distance.
  col += vec3( 0.34, 0.32, 0.31 ) * uNight * ( wisp ? 0.25 : heat ? 0.12 : vapour ? 0.2 : 0.5 );
  // A gas unit's exhaust: a low, even amber gradient along the whole column
  // with a hot mouth — a per-puff spike at each birth read as a chain of beads.
  float mouth = 0.3 + 0.7 * pow( 1.0 - vT, 1.5 );
  col += vec3( 1.0, 0.52, 0.22 ) * uNight * mouth * ( heat ? 1.05 : 0.0 );
  float alpha = m * vAlpha * ( heat ? mix( 0.04, 0.12, uNight ) : vapour ? 0.5 : wisp ? 0.3 : 0.95 );
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
 * `enGlow.z` grows the dot per state — a starting block's warm-up glow is
 * larger than a running one's. Obstruction lights (red, night, blinking under
 * ambient motion) and the block-state glows share it. Grown dots pay for
 * their size in brightness.
 */
const GLOW_VERTEX = /* glsl */ `
attribute vec3 enGlow;
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
  float have = length( instanceMatrix[ 0 ].xyz ) * enGlow.z;
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

/**
 * The site halo: one camera-facing dome per plant over its pad, warm with the
 * output at night, amber while the plant is starting or dumping. The static
 * twin of a state, never blinked: with the clock pinned the halo still shows.
 * `enSite` lifts the night gate where a state must be legible by day (a dump
 * nobody took must not wait for dusk).
 */
const SITE_VERTEX = /* glsl */ `
attribute float enSite;
uniform float uPxKm;
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
  // At map distance a plant is a handful of pixels, so the dome is grown to a
  // screen-space floor — and the floor follows the site's own size, so a 2,4 GW
  // nuclear site reads wider than a 150 MW peaker (EJ Bałtyk vs TG Kamionka).
  // The alpha stays low (uPeak), which is what keeps a grown dome from washing
  // the map the way the first pass did.
  float floorPx = clamp( 42.0 + 4.2 * have, 60.0, 92.0 );
  float want = uPxKm * dist * floorPx;
  float size = max( have, want );
  mvPosition.xy += position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  // A halo is a map-distance signal: close up the lit windows and pools carry
  // the read. The gate opens late (past ~60 km) and fully past 150 km, so a
  // closeup of one plant never sits under a dome of its own light.
  float near = smoothstep( 60.0, 150.0, dist );
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #else
  vColor = vec3( 1.0 );
  #endif
  vOn = near * mix( uNight, 1.0, enSite );
}
`;

const SITE_FRAGMENT = /* glsl */ `
uniform sampler2D uHalo;
uniform float uPeak;
varying vec2 vUv;
varying vec3 vColor;
varying float vOn;
void main() {
  float m = texture2D( uHalo, vUv ).r;
  // The peak alpha of the dome, whatever the state: a strategic signal, never
  // a screen of light. The per-instance colour keeps its relative brightness.
  // Additive blending multiplies the source by its own alpha, so the alpha
  // written here is 1: the strength is already in the colour.
  float a = m * vOn * uPeak;
  gl_FragColor = vec4( vColor * a, 1.0 );
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

/** Floodlight pool on the yard: a ground quad grown to at least two pixels, warm-white or cool, night only. */
const FLOOD_VERTEX = /* glsl */ `
attribute vec2 enPhase;
uniform float uPxKm;
varying vec2 vUv;
varying float vAtten;
varying float vCool;
void main() {
  vUv = uv;
  vec3 origin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  float have = length( instanceMatrix[ 0 ].xyz );
  float dist = distance( cameraPosition, origin );
  float want = uPxKm * dist * 2.0;
  float grow = max( 1.0, want / max( have, 1e-4 ) );
  vec3 transformed = position;
  transformed.xz *= grow;
  vAtten = ( 0.7 + 0.3 * enPhase.x ) / pow( grow, 1.2 );
  vCool = enPhase.y;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( transformed, 1.0 );
}
`;

const FLOOD_FRAGMENT = /* glsl */ `
uniform sampler2D uDot;
uniform float uNight;
varying vec2 vUv;
varying float vAtten;
varying float vCool;
void main() {
  float m = texture2D( uDot, vUv ).r;
  // Yard lamps are sodium-warm; the pools at a containment or tower foot are
  // cool white, so a nuclear site reads as concrete under work lights.
  vec3 tint = mix( vec3( 1.0, 0.82, 0.55 ), vec3( 0.72, 0.83, 1.0 ), vCool );
  gl_FragColor = vec4( tint * 1.1 * vAtten, m * uNight );
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
    minPx: 4,
    gain: 1.0,
    name: "plants-block-glow",
  });

  const site = new THREE.ShaderMaterial({
    uniforms: {
      uHalo: { value: haloTexture() },
      uPxKm: uniforms.uPxKm,
      uNight: uniforms.uNight,
      // The dome's peak alpha: bright enough to carry the state at 500 km,
      // low enough that a grown billboard never washes the map.
      uPeak: { value: 0.12 },
    },
    vertexShader: SITE_VERTEX,
    fragmentShader: SITE_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  site.name = "plants-site-halo";

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
    site,
    flood,
    dispose() {
      for (const material of Object.values(structures)) material.dispose();
      plume.dispose();
      aviation.dispose();
      glow.dispose();
      site.dispose();
      flood.dispose();
    },
  };
}
