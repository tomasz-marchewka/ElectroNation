// Sea and lakes (docs/08 §4, §6): one surface at sea level reaching the
// horizon, drawn wherever the relief dips below it. The colour follows the
// depth read from the heightfield (teal shallows to navy), the shoreline gets
// a soft transparent edge and wind-blown foam, two scrolling wave layers
// perturb the normal with the speed and heading of the turn's wind — frozen
// under the motion setting BRAK — and a hard frost turns the lakes to ice
// and rims the sea with it. Sun glitter and sky reflections are three's own
// PBR, with a Fresnel sky term standing in until the sky registers an
// environment map.

import * as THREE from "three";
import type { HeightField } from "./heightfield";
import type { TerrainTextureSet } from "./terrainTextures";

export interface WaterUniforms {
  uHeightMap: { value: THREE.DataTexture };
  /** x0, z0 and the reciprocal size of the height map's footprint [km]. */
  uHeightRect: { value: THREE.Vector4 };
  uWaves: { value: THREE.Texture };
  uFoam: { value: THREE.Texture };
  uTime: { value: number };
  /** Wind direction the water drifts TOWARD (x, z) and the wind strength 0..1. */
  uWind: { value: THREE.Vector4 };
  uIce: { value: number };
  uSkyColor: { value: THREE.Color };
  uHasEnv: { value: number };
  /** 1 close up … 0 at the strategic distance: gates the second wave and foam. */
  uFar: { value: number };
  /** 0 calm … 1 storm (the open-water wind of the turn, from 12 m/s up). */
  uStorm: { value: number };
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vEnWorldPos;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uHeightMap;
uniform vec4 uHeightRect;
uniform sampler2D uWaves;
uniform sampler2D uFoam;
uniform float uTime;
uniform vec4 uWind;
uniform float uIce;
uniform vec3 uSkyColor;
uniform float uHasEnv;
uniform float uFar;
uniform float uStorm;
varying vec3 vEnWorldPos;
`;

/** Replaces map_fragment: depth tint, shore edge, foam and ice. */
const SURFACE = /* glsl */ `
vec2 enP = vEnWorldPos.xz;
vec2 enHuv = ( enP - uHeightRect.xy ) * uHeightRect.zw;
bool enInside = enHuv.x >= 0.0 && enHuv.x <= 1.0 && enHuv.y >= 0.0 && enHuv.y <= 1.0;
vec2 enGround = texture2D( uHeightMap, clamp( enHuv, 0.0, 1.0 ) ).rg;
float enBed = enInside ? enGround.r : -0.6;
float enLake = enInside ? enGround.g : 0.0;
float enDepth = max( 0.0, -enBed );
float enDeep = smoothstep( 0.0, 0.45, enDepth );
// Shallow teal to a saturated deep blue: the sea must stay sea under the
// haze of a strategic view, not a grey plate.
vec3 enWater = mix( vec3( 0.14, 0.46, 0.48 ), vec3( 0.03, 0.14, 0.32 ), enDeep );
enWater = mix( enWater, vec3( 0.07, 0.22, 0.24 ), enLake * 0.5 * ( 1.0 - enDeep ) );
// Everything the surface paints is gated to where the bed is UNDER it: foam
// and ice must never appear on the land the plane passes beneath.
float enUnder = smoothstep( 0.0, 0.004, enDepth );
float enIceMask = enUnder * uIce * max( enLake, 1.0 - smoothstep( 0.08, 0.3, enDepth ) );
// The shore foam band is a closeup detail: far out a couple of texels are a
// pixel, so the tap is skipped entirely past ~200 km.
float enFoam = 0.0;
if ( uFar > 0.02 ) {
	float enFoamNoise = texture2D( uFoam, enP / 9.0 + uWind.xy * uTime * 0.004 ).r;
	enFoam = enUnder * ( 1.0 - smoothstep( 0.006, 0.035, enDepth ) ) * smoothstep( 0.35, 0.75, enFoamNoise );
}
// White horses in a storm (docs/08 §4): the crests grow with the open-water
// wind and break the surface into white — a wind-roughened sea, not a mirror.
float enCrest = 0.0;
if ( uStorm > 0.02 && uFar > 0.05 ) {
	float enCrestNoise = texture2D( uFoam, enP / 3.2 - uWind.xy * uTime * 0.01 ).b;
	enCrest = enUnder * uStorm * smoothstep( 0.52, 0.86, enCrestNoise ) * ( 1.0 - enIceMask );
}
enFoam = max( enFoam, enCrest * 0.85 );
float enAlpha = max( smoothstep( 0.0, 0.06, enDepth ), max( enFoam, enCrest ) );
enWater = mix( enWater, vec3( 0.8, 0.86, 0.9 ), enIceMask );
enAlpha = mix( enAlpha, 1.0, enIceMask );
enFoam *= 1.0 - enIceMask;
diffuseColor.rgb = mix( enWater, vec3( 0.9, 0.93, 0.95 ), enFoam );
diffuseColor.a = enAlpha;
// Rough but not glassy in a storm; ice is glassier than open water.
float enRoughness = mix( mix( 0.14, 0.6, enFoam ), 0.62, uStorm );
enRoughness = mix( enRoughness, 0.5, enIceMask );
`;

const ROUGHNESS = /* glsl */ `
float roughnessFactor = enRoughness;
`;

/** Replaces normal_fragment_maps: two wave layers scrolling with the wind. */
const NORMAL = /* glsl */ `
{
	float enMotion = 1.0 - uIce;
	vec2 enDir = uWind.xy;
	vec2 enPerp = vec2( -enDir.y, enDir.x );
	float enSpeed = 0.35 + 0.65 * uWind.z;
	vec2 enUv1 = enP / 7.0 + enDir * uTime * 0.012 * enSpeed * enMotion;
	// The fine chop (2,4 km) is the second tap and the first thing to go with
	// distance: at the strategic view it is sub-pixel shimmer, not relief.
	float enAmp = ( 0.35 + 0.65 * uWind.z ) * ( 1.0 - 0.85 * enIceMask ) * ( 1.0 + 0.9 * uStorm );
	vec3 enWaves = texture2D( uWaves, enUv1 ).xyz * 2.0 - 1.0;
	if ( uFar > 0.66 ) {
		vec2 enUv2 = enP / 2.4 + ( enDir * 0.5 + enPerp ) * uTime * 0.02 * enSpeed * enMotion;
		enWaves.xy += ( texture2D( uWaves, enUv2 ).xy * 2.0 - 1.0 ) * 0.7;
	}
	vec3 enTn = normalize( vec3( enWaves.xy * enAmp, 1.0 ) );
	vec3 enWorldN = normalize( vec3( enTn.x, enTn.z, enTn.y ) );
	normal = normalize( ( viewMatrix * vec4( enWorldN, 0.0 ) ).xyz );
}
`;

/** After the lights: a Fresnel sky reflection until an environment map exists. */
const SKY_REFLECTION = /* glsl */ `
if ( uHasEnv < 0.5 ) {
	float enCos = clamp( dot( normal, geometryViewDir ), 0.0, 1.0 );
	float enFresnel = 0.03 + 0.97 * pow( 1.0 - enCos, 5.0 );
	reflectedLight.indirectSpecular += enFresnel * uSkyColor * ( 1.0 - enIceMask * 0.7 );
}
`;

/** RG half-float texture of the inner grid: R ground height [km], G lakeness. */
function heightTexture(field: HeightField): { texture: THREE.DataTexture; rect: THREE.Vector4 } {
  const { inner, nx } = field;
  const data = new Uint16Array(inner.nx * inner.nz * 2);
  for (let iz = 0; iz < inner.nz; iz++) {
    for (let ix = 0; ix < inner.nx; ix++) {
      const source = (inner.iz0 + iz) * nx + inner.ix0 + ix;
      const target = (iz * inner.nx + ix) * 2;
      data[target] = THREE.DataUtils.toHalfFloat(field.heights[source]!);
      data[target + 1] = THREE.DataUtils.toHalfFloat(field.lakeness[source]!);
    }
  }
  const texture = new THREE.DataTexture(
    data,
    inner.nx,
    inner.nz,
    THREE.RGFormat,
    THREE.HalfFloatType,
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  // Texel centres sit on the grid vertices: shift by half a cell, scale by the footprint.
  const rect = new THREE.Vector4(
    inner.x0 - inner.cell / 2,
    inner.z0 - inner.cell / 2,
    1 / (inner.cell * inner.nx),
    1 / (inner.cell * inner.nz),
  );
  return { texture, rect };
}

export interface Water {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  uniforms: WaterUniforms;
  dispose(): void;
}

/** Extent of the surface past the board [km] — it must reach the horizon in every preset. */
const WATER_EXTENT_KM = 9000;

export function createWater(
  field: HeightField,
  textures: TerrainTextureSet,
  centre: { x: number; z: number },
): Water {
  const { texture, rect } = heightTexture(field);
  const uniforms: WaterUniforms = {
    uHeightMap: { value: texture },
    uHeightRect: { value: rect },
    uWaves: { value: textures.waves },
    uFoam: { value: textures.macro },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector4(0, 1, 0.3, 0) },
    uIce: { value: 0 },
    uSkyColor: { value: new THREE.Color(0.55, 0.7, 0.95) },
    uHasEnv: { value: 0 },
    uFar: { value: 1 },
    uStorm: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.14,
    metalness: 0,
    transparent: true,
    depthWrite: false,
  });
  material.name = "terrain-water";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvEnWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace("#include <map_fragment>", SURFACE)
      .replace("#include <roughnessmap_fragment>", ROUGHNESS)
      .replace("#include <normal_fragment_maps>", NORMAL)
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>\n${SKY_REFLECTION}`,
      );
  };
  material.customProgramCacheKey = () => "en-terrain-water";

  const geometry = new THREE.PlaneGeometry(WATER_EXTENT_KM, WATER_EXTENT_KM, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain-water";
  mesh.position.set(centre.x, 0, centre.z);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    material,
    uniforms,
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
