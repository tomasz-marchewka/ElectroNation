// Materials of the settlements (ARCHITECTURE.md §14: everything procedural).
// One PBR material for every building archetype: plaster and concrete grain
// from a seeded texture, window cells computed in WORLD units from the
// instance's own size (a window stays 70 × 60 m whatever the block's scale),
// roofs toned per instance, and the night emission of docs/08 §3 — each
// window is a deterministic integer hash of its cell and the building's
// seed, so `lit` switches a proportional share of them off and dims the rest.
// A city that is 63 % served shows roughly 63 % of its windows, dimmer.
// Street lights and the sodium/LED halo are additive quads with a minimum
// on-screen size, so the night signature of a city survives the strategic
// distance where a 120 m lamp pool is a fraction of a pixel.

import * as THREE from "three";
import { proceduralTexture } from "../core/textures";

/** Window pitch [km] along a facade and per floor — real 3,5 × 3 m × 20. */
export const WINDOW_PITCH_KM = 0.07;
export const FLOOR_PITCH_KM = 0.06;
/** Window cells the wall texture tiles over. */
const WALL_TILE_CELLS = 8;
/** Roof texture repeat [km]. */
const ROOF_TILE_KM = 1.2;

export interface CityUniforms {
  /** 0 by day … 1 at night (smoothed by the sky's transition). */
  uNight: { value: number };
  /** Seconds, advancing only under ambient motion — the window wander. */
  uTime: { value: number };
  /** HDR radiance of a lit window. */
  uEmissive: { value: number };
  /** Share of windows lit at this hour of a fully served city (0..1). */
  uWindowShare: { value: number };
  /** km of world per pixel at 1 km of camera distance. */
  uPxKm: { value: number };
  /** Roofs above this height [km] are snow-covered (ctx.terrain.snowlineKm). */
  uSnowlineKm: { value: number };
  /**
   * Camera distance band [km] over which the lamp pools hand the night over to
   * the light quilt (lightmap.ts): pools fade out, the quilt fades in.
   */
  uLampFade: { value: THREE.Vector2 };
}

export function createCityUniforms(): CityUniforms {
  return {
    uNight: { value: 0 },
    uTime: { value: 0 },
    uEmissive: { value: 1.6 },
    uWindowShare: { value: 0.6 },
    uPxKm: { value: 0.001 },
    uSnowlineKm: { value: Number.POSITIVE_INFINITY },
    uLampFade: { value: new THREE.Vector2(110, 230) },
  };
}

// --- textures -----------------------------------------------------------------

/** Plaster grain with a slab line per floor and faint rain streaks. */
function wallTexture(): THREE.DataTexture {
  return proceduralTexture({
    name: "cities:wall",
    size: 256,
    fields: {
      grain: { lattice: 16, octaves: 4 },
      streak: { lattice: 24, octaves: 2 },
    },
    pixel(u, v, f) {
      const grain = f.grain!.at(u * 16, v * 16);
      const streak = f.streak!.at(u * 24, v * 2);
      let value = 0.86 + (grain - 0.5) * 0.18 - Math.max(0, streak - 0.6) * 0.25;
      const floor = (v * WALL_TILE_CELLS) % 1;
      if (floor < 0.05) value *= 0.82;
      return [value, value * 0.995, value * 0.98];
    },
  });
}

/** Roof membrane: gravel grain with seams between the sheets. */
function roofTexture(): THREE.DataTexture {
  return proceduralTexture({
    name: "cities:roof",
    size: 256,
    fields: { grain: { lattice: 32, octaves: 4 }, patch: { lattice: 4, octaves: 2 } },
    pixel(u, v, f) {
      const grain = f.grain!.at(u * 32, v * 32);
      const patch = f.patch!.at(u * 4, v * 4);
      let value = 0.72 + (grain - 0.5) * 0.4 + (patch - 0.5) * 0.25;
      const seam = (u * 4) % 1;
      if (seam < 0.04) value *= 0.7;
      return [value, value, value];
    },
    colorSpace: THREE.NoColorSpace,
  });
}

/** A soft round lamp pool: 1 at the centre, 0 at the rim. */
function dotTexture(): THREE.DataTexture {
  return proceduralTexture({
    name: "cities:dot",
    size: 64,
    pixel(u, v) {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const value = Math.pow(Math.max(0, 1 - r), 1.6);
      return [value, value, value];
    },
    colorSpace: THREE.NoColorSpace,
  });
}

/** The city halo: a wide, slow falloff. */
function haloTexture(): THREE.DataTexture {
  return proceduralTexture({
    name: "cities:halo",
    size: 128,
    pixel(u, v) {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      // A gaussian clipped at the rim: bright over the core, gone before the quad's edge.
      const k = 3.2;
      const value = Math.max(0, (Math.exp(-k * r * r) - Math.exp(-k)) / (1 - Math.exp(-k)));
      return [value, value, value];
    },
    colorSpace: THREE.NoColorSpace,
  });
}

// --- building material --------------------------------------------------------

const HASH_GLSL = /* glsl */ `
uint enHash( uvec2 p, uint seed ) {
  uint h = p.x * 0x9E3779B1u ^ p.y * 0x85EBCA77u ^ seed * 0xC2B2AE3Du;
  h ^= h >> 15u; h *= 0x2C1B3C6Du; h ^= h >> 12u; h *= 0x297A2D39u; h ^= h >> 15u;
  return h;
}
float enRand( uvec2 p, uint seed ) { return float( enHash( p, seed ) & 0xFFFFFFu ) / 16777216.0; }
`;

const BUILDING_VERTEX_PARS = /* glsl */ `
attribute float enRegion;
attribute vec4 enState;
varying float vEnRegion;
varying vec4 vEnState;
varying vec2 vEnWin;
varying float vEnDist;
varying float vEnWorldY;
varying float vEnUpKm;
varying float vEnUnitY;
`;

const BUILDING_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  #ifdef USE_INSTANCING
  vec3 enScale = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
  vec3 enOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #else
  vec3 enScale = vec3( 1.0 );
  vec3 enOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #endif
  vec3 enSize = position * enScale;
  vEnRegion = enRegion;
  vEnState = enState;
  vEnDist = distance( cameraPosition, enOrigin );
  vEnUpKm = enSize.y;
  vEnUnitY = position.y;
  #ifdef USE_INSTANCING
  vEnWorldY = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).y;
  #else
  vEnWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
  #endif
  if ( enRegion > 0.5 ) {
    vEnWin = enSize.xz / ${ROOF_TILE_KM.toFixed(3)};
  } else {
    float enAlong = abs( normal.x ) > 0.5 ? enSize.z * sign( normal.x ) : enSize.x * -sign( normal.z );
    vEnWin = vec2( ( enAlong + 0.5 * ( abs( normal.x ) > 0.5 ? enScale.z : enScale.x ) ) / ${WINDOW_PITCH_KM.toFixed(3)}, enSize.y / ${FLOOR_PITCH_KM.toFixed(3)} );
  }
}
`;

const BUILDING_FRAGMENT_PARS = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform float uEmissive;
uniform float uWindowShare;
uniform float uSnowlineKm;
uniform sampler2D uRoofMap;
varying float vEnRegion;
varying vec4 vEnState;
varying vec2 vEnWin;
varying float vEnDist;
varying float vEnWorldY;
varying float vEnUpKm;
varying float vEnUnitY;
${HASH_GLSL}
// Gravel, terracotta, membrane, bitumen, green — aerial photography of Polish
// cities: flat roofs are dark, halls pale, the suburbs rust-red.
vec3 enRoofTone( float kind ) {
  if ( kind < 0.5 ) return vec3( 0.34, 0.335, 0.32 );
  if ( kind < 1.5 ) return vec3( 0.56, 0.23, 0.12 );
  if ( kind < 2.5 ) return vec3( 0.58, 0.58, 0.56 );
  if ( kind < 3.5 ) return vec3( 0.14, 0.135, 0.13 );
  return vec3( 0.30, 0.33, 0.16 );
}
float enWindowMask( vec2 f, float style, vec2 aa ) {
  vec2 lo = style < 0.5 ? vec2( 0.24, 0.30 ) : vec2( 0.06, 0.12 );
  vec2 hi = style < 0.5 ? vec2( 0.76, 0.86 ) : vec2( 0.94, 0.92 );
  vec2 inside = smoothstep( lo - aa, lo + aa, f ) * ( 1.0 - smoothstep( hi - aa, hi + aa, f ) );
  float m = inside.x * inside.y;
  if ( style > 0.5 ) m *= smoothstep( 0.03, 0.03 + aa.x, abs( f.x - 0.5 ) );
  return m;
}
`;

/** Diffuse: wall grain × instance tint, glass in the window cells, toned roofs, green courtyards. */
const BUILDING_MAP_FRAGMENT = /* glsl */ `
vec2 enCell = floor( vEnWin );
vec2 enFrac = fract( vEnWin );
vec2 enFw = fwidth( vEnWin );
vec2 enAa = enFw * 0.75;
// Once a window cell spans under a few pixels the analytic mask is noise; the
// facade fades to its average (same energy, no sparkle) — at 42 km a cell is ~2 px.
float enCellPx = 1.0 / max( max( enFw.x, enFw.y ), 1e-4 );
float enFar = 1.0 - smoothstep( 1.5, 4.0, enCellPx );
// Baked occlusion: the street canyon darkens the lower floors and the
// courtyard floor — the cheapest thing that stops a block reading as paper.
float enAo = mix( 0.58, 1.0, smoothstep( 0.0, 0.5, vEnUnitY ) );
float enMask = 0.0;
float enStyle = vEnState.w;
float enArea = enStyle < 0.5 ? 0.29 : 0.7;
float enSnow = smoothstep( uSnowlineKm - 0.25, uSnowlineKm + 0.25, vEnWorldY );
if ( vEnRegion < 0.5 ) {
  vec3 grain = texture2D( map, vEnWin / ${WALL_TILE_CELLS.toFixed(1)} ).rgb;
  enMask = mix( enWindowMask( enFrac, enStyle, enAa ), enArea, enFar );
  vec3 wall = vColor.rgb * grain;
  vec3 glass = enStyle < 0.5 ? vec3( 0.30, 0.33, 0.38 ) : vec3( 0.20, 0.25, 0.32 );
  diffuseColor.rgb *= mix( wall, glass, enMask ) * enAo;
} else {
  float grain = texture2D( uRoofMap, vEnWin ).r;
  vec3 tone = vEnRegion > 1.5 ? vec3( 0.19, 0.27, 0.10 ) : enRoofTone( vEnState.z );
  // Snow settles on every roof and courtyard above the snowline.
  tone = mix( tone * ( 0.6 + 0.55 * grain ), vec3( 0.82, 0.84, 0.88 ) * ( 0.9 + 0.15 * grain ), enSnow * 0.92 );
  diffuseColor.rgb *= tone;
}
`;

const BUILDING_ROUGHNESS_FRAGMENT = /* glsl */ `
float roughnessFactor = vEnRegion < 0.5 ? mix( 0.88, 0.38, enMask ) : mix( vEnRegion > 1.5 ? 0.92 : 0.96, 0.7, enSnow );
`;

/**
 * Night emission: a window is on when its hash is below the share kept lit,
 * its radiance dims with the served share too; beyond ~100 km the cells are
 * sub-pixel and the analytic mask would sparkle, so the facade fades to its
 * average emission (the same energy, no noise).
 */
const BUILDING_EMISSIVE_FRAGMENT = /* glsl */ `
if ( vEnRegion < 0.5 && uNight > 0.001 ) {
  float lit = vEnState.x;
  uint seed = uint( vEnState.y );
  uvec2 cell = uvec2( ivec2( enCell ) + ivec2( 4096 ) );
  float h = enRand( cell, seed );
  float wander = enRand( cell, seed + 7u );
  // A few windows change their mind every ~12 s under ambient motion.
  float phase = floor( uTime / 12.0 + wander * 4.0 );
  float h2 = enRand( cell + uvec2( 17u, 0u ), seed + uint( phase ) );
  float pick = wander < 0.04 ? h2 : h;
  // A short city keeps a steeper-than-linear share: the eye reads light on a log scale.
  // Offices empty out after hours; homes vary building by building.
  float occupancy = enStyle > 0.5 ? 0.45 : 0.55 + 0.45 * enRand( uvec2( 3u, 5u ), seed + 11u );
  float keep = uWindowShare * occupancy * pow( lit, 1.6 );
  float on = step( pick, keep );
  float brightness = 0.55 + 0.6 * enRand( cell, seed + 3u );
  float warm = enRand( cell, seed + 5u );
  vec3 tint = warm < 0.72 ? vec3( 1.0, 0.76, 0.46 ) : vec3( 0.72, 0.84, 1.0 );
  float near = enWindowMask( enFrac, enStyle, enAa ) * on * brightness;
  float far = enArea * keep * 0.7;
  float e = mix( near, far, enFar ) * uNight * ( 0.3 + 0.7 * lit );
  totalEmissiveRadiance = uEmissive * e * mix( tint, vec3( 1.0, 0.8, 0.55 ), enFar * 0.5 );
  // Street light climbing the lower floors: the sodium spill that makes a lit
  // city read as lit even where no window is on.
  float spill = ( 1.0 - smoothstep( 0.0, 0.12, vEnUpKm ) ) * ( enStyle > 0.5 ? 0.035 : 0.07 ) * lit * uNight;
  totalEmissiveRadiance += vec3( 1.0, 0.58, 0.26 ) * spill;
} else if ( uNight > 0.001 ) {
  // Sky glow on the roofs: gravel, and above all snow, pick up the sodium of
  // the streets below — a lit city's roofs turn amber, a dark city's stay moon-blue.
  float roofGlow = 0.045 * vEnState.x * uNight * ( 1.0 + 0.8 * enSnow );
  totalEmissiveRadiance = vec3( 1.0, 0.62, 0.3 ) * roofGlow;
} else {
  totalEmissiveRadiance = vec3( 0.0 );
}
`;

export interface BuildingMaterial {
  material: THREE.MeshStandardMaterial;
  uniforms: CityUniforms;
  dispose(): void;
}

export function createBuildingMaterial(uniforms: CityUniforms): BuildingMaterial {
  const wall = wallTexture();
  const roof = roofTexture();
  const material = new THREE.MeshStandardMaterial({
    map: wall,
    roughness: 1,
    metalness: 0,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 1,
  });
  const roofUniform = { value: roof };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uRoofMap: roofUniform });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BUILDING_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", BUILDING_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${BUILDING_FRAGMENT_PARS}`)
      .replace("#include <map_fragment>", BUILDING_MAP_FRAGMENT)
      .replace("#include <color_fragment>", "")
      .replace("#include <roughnessmap_fragment>", BUILDING_ROUGHNESS_FRAGMENT)
      .replace("#include <emissivemap_fragment>", BUILDING_EMISSIVE_FRAGMENT);
  };
  material.customProgramCacheKey = () => "en-cities-building";
  return {
    material,
    uniforms,
    dispose() {
      material.dispose();
    },
  };
}

// --- lamps and halo -----------------------------------------------------------

const LAMP_VERTEX_PARS = /* glsl */ `
uniform float uPxKm;
uniform vec2 uLampFade;
varying float vEnAtten;
`;

/** A lamp pool grows to at least two pixels and pays for it in brightness. */
const LAMP_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  #ifdef USE_INSTANCING
  float enHave = length( instanceMatrix[ 0 ].xyz );
  vec3 enOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #else
  float enHave = 1.0;
  vec3 enOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #endif
  float enDist = distance( cameraPosition, enOrigin );
  float enWant = uPxKm * enDist * 1.6;
  float enGrow = max( 1.0, enWant / max( enHave, 1e-4 ) );
  transformed.xz *= enGrow;
  // Nearly energy-conserving: a thousand grown pools must not saturate the blob;
  // beyond the fade band the light quilt carries the city instead of the pools.
  vEnAtten = ( 1.0 - smoothstep( uLampFade.x, uLampFade.y, enDist ) ) / pow( enGrow, 1.3 );
}
`;

const LAMP_FRAGMENT_PARS = /* glsl */ `
varying float vEnAtten;
`;

const LAMP_COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= vEnAtten;
`;

export interface LampMaterial {
  material: THREE.MeshBasicMaterial;
  dispose(): void;
}

export function createLampMaterial(uniforms: CityUniforms): LampMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: dotTexture(),
    color: new THREE.Color(1, 1, 1),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  material.toneMapped = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uPxKm: uniforms.uPxKm, uLampFade: uniforms.uLampFade });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${LAMP_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", LAMP_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${LAMP_FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", LAMP_COLOR_FRAGMENT);
  };
  material.customProgramCacheKey = () => "en-cities-lamp";
  return {
    material,
    dispose() {
      material.dispose();
    },
  };
}

/**
 * The halo quad faces the camera whatever the pitch, so the glow reads as a
 * dome of scattered light over the city and not as a disc painted on the
 * ground. Depth is ignored: a glow is never cut by the blocks under it.
 */
const HALO_PROJECT_VERTEX = /* glsl */ `
vec4 mvPosition = vec4( 0.0, 0.0, 0.0, 1.0 );
vec2 enSpan = vec2( 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
enSpan = vec2( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ) );
#endif
mvPosition = modelViewMatrix * mvPosition;
mvPosition.xy += position.xy * enSpan;
gl_Position = projectionMatrix * mvPosition;
`;

export function createHaloMaterial(): LampMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: haloTexture(),
    color: new THREE.Color(1, 1, 1),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      HALO_PROJECT_VERTEX,
    );
  };
  material.customProgramCacheKey = () => "en-cities-halo";
  return {
    material,
    dispose() {
      material.dispose();
    },
  };
}
