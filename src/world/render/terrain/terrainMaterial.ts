// The ground material (docs/08 §1, ARCHITECTURE.md §18): one physically lit
// MeshStandardMaterial extended through onBeforeCompile — eight ground layers
// blended by the per-vertex weights of the heightfield, rock stealing the
// steep faces, snow above the turn's snowline plus the day's lowland cover
// as a dithered patchwork, a country-wide macro variation against tiling,
// wet ground after rain, and the sky module's cloud shadow over the direct
// light. Lights, shadows, fog and tone mapping stay three's own, so the
// terrain sits under whatever sun the sky module registers.
//
// Cost (ARCHITECTURE.md §13): every layer tap is gated by its weight and
// taken with explicit derivatives (`textureGrad`), so a pixel pays for the
// one or two layers it actually shows — about 4–6 array taps instead of the
// 19 a full blend would take; the per-layer normal maps are skipped
// altogether beyond `uNormalDetail` = 0 (a uniform, set from the camera
// distance and the quality tier), because at strategic distance their tiles
// average to flat anyway. The relief normal of the range is never skipped:
// it carries the crest read of the strategic view.

import * as THREE from "three";
import { LAYER_TILE_KM, RELIEF_TILE_KM, type TerrainTextureSet } from "./terrainTextures";

export interface TerrainUniforms {
  uAlbedo: { value: THREE.DataArrayTexture };
  uNormal: { value: THREE.DataArrayTexture };
  uMacro: { value: THREE.Texture };
  /** Ridged relief normal of the range (tile RELIEF_TILE_KM). */
  uRelief: { value: THREE.Texture };
  uCloudMap: { value: THREE.Texture };
  /** sizeKm, offsetX, offsetZ, strength (0 = no cloud shadow). */
  uCloudParams: { value: THREE.Vector4 };
  uTiles0: { value: THREE.Vector4 };
  uTiles1: { value: THREE.Vector4 };
  /** Altitude [km] above which the ground is white this turn. */
  uSnowline: { value: number };
  /** 0..1 lowland snow cover of the shown day (the bridge's `snowCover`). */
  uSnowCover: { value: number };
  uWetness: { value: number };
  /** 1 = per-layer normal maps on, 0 = skipped (distance / tier). */
  uNormalDetail: { value: number };
  /** 1 = the anti-tiling second copies and the second relief tap (near only). */
  uAltDetail: { value: number };
  /** Highest layer index sampled; above it the mean colour of the layer is used. */
  uTrim: { value: number };
  /** 0 = high sun, 1 = a sun below ~2°: cap the glancing specular. */
  uLowSun: { value: number };
  /** Linear mean albedo (rgb) and mean roughness (a) of every layer. */
  uLayerMean: { value: THREE.Vector4[] };
  uSeabedTint: { value: THREE.Color };
}

const VERTEX_PARS = /* glsl */ `
attribute vec4 weightsA;
attribute vec4 weightsB;
attribute float occlusion;
varying vec4 vEnWeightsA;
varying vec4 vEnWeightsB;
varying vec3 vEnWorldPos;
varying vec3 vEnWorldNormal;
varying float vEnOcclusion;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormal;
uniform sampler2D uMacro;
uniform sampler2D uRelief;
uniform sampler2D uCloudMap;
uniform vec4 uCloudParams;
uniform vec4 uTiles0;
uniform vec4 uTiles1;
uniform float uSnowline;
uniform float uSnowCover;
uniform float uWetness;
uniform float uNormalDetail;
uniform float uAltDetail;
uniform float uTrim;
uniform float uLowSun;
uniform vec4 uLayerMean[8];
uniform vec3 uSeabedTint;
varying vec4 vEnWeightsA;
varying vec4 vEnWeightsB;
varying vec3 vEnWorldPos;
varying vec3 vEnWorldNormal;
varying float vEnOcclusion;

// Weights below this are not worth a tap.
const float EN_TAP_MIN = 0.004;

vec4 enTap( float layer, float tile, vec2 p, vec2 dx, vec2 dy ) {
	return textureGrad( uAlbedo, vec3( p / tile, layer ), dx / tile, dy / tile );
}
vec3 enTapN( float layer, float tile, vec2 p, vec2 dx, vec2 dy ) {
	return textureGrad( uNormal, vec3( p / tile, layer ), dx / tile, dy / tile ).xyz * 2.0 - 1.0;
}
// A rotated, rescaled second copy of a tile; the macro noise picks one copy
// per ~30 km region, so the fields never repeat in step. Linear part for the
// derivatives, offset for the position.
vec2 enAltDir( vec2 v ) {
	return vec2( v.x * 0.829 - v.y * 0.559, v.x * 0.559 + v.y * 0.829 ) * 0.73;
}
vec2 enAlt( vec2 p ) {
	return enAltDir( p ) + vec2( 3.1, 7.7 );
}
// One layer into the running albedo and tangent normal, gated by its weight.
// Layers above the tier's ceiling are not sampled at all: their mean colour
// and roughness carry the biome's hue, which is what the lower tiers need.
void enLayer( inout vec4 surface, inout vec3 tangent, float w, float layer, float tile, vec2 p, vec2 dx, vec2 dy ) {
	if ( w <= EN_TAP_MIN ) return;
	if ( layer > uTrim ) {
		surface += uLayerMean[ int( layer ) ] * w;
		return;
	}
	surface += enTap( layer, tile, p, dx, dy ) * w;
	if ( uNormalDetail > 0.0 ) tangent += enTapN( layer, tile, p, dx, dy ) * w;
}
`;

/** Replaces map_fragment: blends the layers into diffuseColor and prepares roughness and the tangent normal. */
const SPLAT = /* glsl */ `
vec2 enP = vEnWorldPos.xz;
vec2 enDx = dFdx( enP );
vec2 enDy = dFdy( enP );
vec3 enGeoN = normalize( vEnWorldNormal );
vec3 enMacro = texture2D( uMacro, enP / 140.0 ).rgb;
// Country-scale tone drift for the albedo (R) and the wander of the snowline
// (G) are both ~500 km reads: one tap serves both, one fetch less per pixel.
// The fine macro drift above would blotch a snowfield at 1–3 km — label scale.
vec3 enMacroWide = texture2D( uMacro, enP / 580.0 + vec2( 0.13, 0.29 ) ).rgb;
// Fine patch noise (1–2 km) for the lowland snow cover and the dithered snowline.
vec3 enMacroFine = texture2D( uMacro, enP / 24.0 + vec2( 0.71, 0.23 ) ).rgb;

vec4 wA = vEnWeightsA;
vec4 wB = vEnWeightsB;

// The range's own relief, one octave under the mesh (docs/08 §3): a ridged
// normal at 40 km tiles on mountain and highland ground. It shades the
// crests and flanks the sun cannot draw on a 2 km mesh, and it decides where
// the rock shows through the snow — so a snowed range reads as ridges and
// valleys from the strategic view, never as a bank of cloud.
float enRange = clamp( wA.z + 0.45 * wA.w, 0.0, 1.0 );
vec3 enDetailN = enGeoN;
if ( enRange > EN_TAP_MIN ) {
	float enRPick = smoothstep( 0.42, 0.58, enMacro.b );
	vec3 enR = texture2D( uRelief, enP / ${RELIEF_TILE_KM.toFixed(1)} ).xyz * 2.0 - 1.0;
	if ( enRPick > 0.001 && uAltDetail > 0.5 ) {
		vec3 enR2 = texture2D( uRelief, enAlt( enP ) / ${RELIEF_TILE_KM.toFixed(1)} ).xyz * 2.0 - 1.0;
		enR = mix( enR, enR2, enRPick );
	}
	// Tangent frame of the flat ground: +X east, +Y (texture v) south (+Z).
	vec3 enRWorld = normalize( vec3( enR.x, enR.z, enR.y ) );
	enDetailN = normalize( mix( enGeoN, normalize( enGeoN + vec3( enRWorld.x, 0.0, enRWorld.z ) * 1.6 ), enRange ) );
}
float enSlope = 1.0 - clamp( enDetailN.y, 0.0, 1.0 );

// Steep ground is rock, whatever the hex says — except pavement and the seabed.
float enRockSlope = smoothstep( 0.1, 0.4, enSlope + ( enMacro.r - 0.5 ) * 0.1 );
float enSoft = wA.x + wA.y + wA.w + wB.x + wB.z;
wA.x *= 1.0 - enRockSlope;
wA.y *= 1.0 - enRockSlope;
wA.w *= 1.0 - enRockSlope;
wB.x *= 1.0 - enRockSlope;
wB.z *= 1.0 - enRockSlope;
wA.z += enSoft * enRockSlope;

// Snow. Two terms: the ALTITUDE line of the turn (a country-scale wander of
// ±0.4 km plus a fine dither, blended over ±0.5 km) and the LOWLAND COVER of
// the day — a coverage fraction laid down as a patchwork of 1–2 km drifts,
// independent of the relief, so a half-snowed plain is a dithered field and
// not a set of contour lines drawn by the height noise. Steep flanks (from
// ~35°) shed it, so a snowed range keeps dark rock faces between the white.
float enSnowEdge = uSnowline + ( enMacroWide.g - 0.5 ) * 0.8 + ( enMacroFine.r - 0.5 ) * 0.5;
float enAltSnow = smoothstep( enSnowEdge - 0.5, enSnowEdge + 0.5, vEnWorldPos.y );
float enCoverNoise = 0.65 * enMacroFine.g + 0.35 * enMacro.g;
float enCoverSnow = smoothstep( 1.0 - uSnowCover - 0.14, 1.0 - uSnowCover + 0.14, enCoverNoise ) * step( 0.001, uSnowCover );
float enSnow = max( enAltSnow, enCoverSnow ) * ( 1.0 - smoothstep( 0.18, 0.46, enSlope ) );
// Forest floors stay dark under the crowns and the streets get cleared, so the
// biome still reads through a snowed-in country (docs/08 §3).
enSnow *= 1.0 - 0.4 * wA.y - 0.5 * wB.y;
// Wind strips the crests of the range: rock lines along the ridges keep the
// mountains reading as mountains under full snow.
float enCrest = smoothstep( 0.8, 1.0, vEnOcclusion ) * smoothstep( 0.25, 0.6, enMacro.r );
enSnow *= 1.0 - 0.85 * wA.z * enCrest;

vec4 enSurface = vec4( 0.0 );
vec3 enTangentN = vec3( 0.0 );
// Grass in two anti-tiling copies; the pick is 0 or 1 nearly everywhere, so
// only the ~30 km transition bands pay for both. Far out the second copy is
// worth less than its fetch: uAltDetail folds it away entirely.
float enPick = smoothstep( 0.42, 0.58, enMacro.b ) * uAltDetail;
enLayer( enSurface, enTangentN, wA.x * ( 1.0 - enPick ), 0.0, uTiles0.x, enP, enDx, enDy );
enLayer( enSurface, enTangentN, wA.x * enPick, 0.0, uTiles0.x, enAlt( enP ), enAltDir( enDx ), enAltDir( enDy ) );
enLayer( enSurface, enTangentN, wA.y, 1.0, uTiles0.y, enP, enDx, enDy );
enLayer( enSurface, enTangentN, wA.z, 2.0, uTiles0.z, enP, enDx, enDy );
enLayer( enSurface, enTangentN, wA.w, 3.0, uTiles0.w, enP, enDx, enDy );
enLayer( enSurface, enTangentN, wB.x, 4.0, uTiles1.x, enP, enDx, enDy );
enLayer( enSurface, enTangentN, wB.y, 5.0, uTiles1.y, enP, enDx, enDy );
// Beach and seabed share the sand tile; the seabed is the same sand, tinted.
if ( wB.z + wB.w > EN_TAP_MIN ) {
	if ( uTrim > 5.5 ) {
		vec4 enSand = enTap( 6.0, uTiles1.z, enP, enDx, enDy );
		enSurface += enSand * wB.z + enSand * vec4( uSeabedTint, 1.0 ) * wB.w;
		if ( uNormalDetail > 0.0 ) enTangentN += enTapN( 6.0, uTiles1.z, enP, enDx, enDy ) * ( wB.z + wB.w );
	} else {
		enSurface += uLayerMean[ 6 ] * wB.z + uLayerMean[ 6 ] * vec4( uSeabedTint, 1.0 ) * wB.w;
	}
}
if ( enSnow > EN_TAP_MIN ) {
	vec4 enSnowTile = uTrim > 6.5
		? enTap( 7.0, uTiles1.w, enP, enDx, enDy )
		: uLayerMean[ 7 ];
	enSurface = mix( enSurface, enSnowTile, enSnow );
	if ( uNormalDetail > 0.0 && uTrim > 6.5 ) enTangentN = mix( enTangentN, enTapN( 7.0, uTiles1.w, enP, enDx, enDy ), enSnow );
}
enTangentN = normalize( enTangentN * uNormalDetail + vec3( 0.0, 0.0, 1.0 - uNormalDetail + 1e-3 ) );

// Country-wide variation against tiling, then the weather.
vec3 enAlbedo = enSurface.rgb * ( 0.86 + 0.28 * enMacroWide.r );
enAlbedo = mix( enAlbedo, enAlbedo * vec3( 1.08, 1.0, 0.9 ), ( enMacroWide.b - 0.5 ) * 0.6 * ( 1.0 - enSnow ) );
enAlbedo *= 1.0 - 0.3 * uWetness * ( 1.0 - enSnow );
diffuseColor.rgb *= enAlbedo;
float enRoughness = enSurface.a * ( 1.0 - 0.35 * uWetness * ( 1.0 - enSnow ) );
`;

const ROUGHNESS = /* glsl */ `
// A grazing view of the land under a low sun is where a rough surface turns
// into a mirror: raise the roughness toward 1 with the angle, weighted by how
// low the sun is (uLowSun), so the sweep becomes warm relief light instead of
// a wet sheet. Noon keeps the crisp specular on snow and water.
float enGrazing = 1.0 - clamp( dot( normalize( vViewPosition ), normalize( vNormal ) ), 0.0, 1.0 );
float roughnessFactor = mix( enRoughness, 1.0, uLowSun * smoothstep( 0.45, 0.9, enGrazing ) );
`;

/** Replaces normal_fragment_maps: perturbs the relief normal with the blended layer normal. */
const NORMAL = /* glsl */ `
{
	vec3 enT = normalize( cross( enDetailN, vec3( 0.0, 0.0, 1.0 ) ) );
	vec3 enB = cross( enT, enDetailN );
	vec3 enWorldN = normalize( enT * enTangentN.x + enB * enTangentN.y + enDetailN * enTangentN.z );
	normal = normalize( ( viewMatrix * vec4( enWorldN, 0.0 ) ).xyz );
}
`;

/** Replaces aomap_fragment: the relief's own sky visibility shades the indirect light. */
const OCCLUSION = /* glsl */ `
reflectedLight.indirectDiffuse *= vEnOcclusion;
`;

/**
 * After the lights: the cloud shadow of the sky module darkens the direct
 * light only, and a low sun's glancing specular on the land is capped — a
 * sunset must read as warm light on the relief, not as a wet sheet.
 */
const CLOUD_SHADOW = /* glsl */ `
{
	float enCloud = 1.0;
	if ( uCloudParams.w > 0.0 ) {
		vec2 enCloudUv = ( enP + uCloudParams.yz ) / uCloudParams.x;
		enCloud = mix( 1.0, texture2D( uCloudMap, enCloudUv ).r, uCloudParams.w );
	}
	reflectedLight.directDiffuse *= enCloud;
	// A low sun is capped hard: direct specular at grazing incidence is what
	// whitened the land at sunrise/sunset (sky change request 3). Snow keeps a
	// little more sparkle; everything else drops to a fifth.
	reflectedLight.directSpecular *= enCloud
		* mix( 0.35, 1.0, enSnow )
		* mix( 1.0, mix( 0.12, 0.3, enSnow ), uLowSun );
}
`;

export function createTerrainMaterial(textures: TerrainTextureSet): {
  material: THREE.MeshStandardMaterial;
  uniforms: TerrainUniforms;
} {
  const uniforms: TerrainUniforms = {
    uAlbedo: { value: textures.albedo },
    uNormal: { value: textures.normal },
    uMacro: { value: textures.macro },
    uRelief: { value: textures.relief },
    uCloudMap: { value: textures.white },
    uCloudParams: { value: new THREE.Vector4(1, 0, 0, 0) },
    uTiles0: {
      value: new THREE.Vector4(
        LAYER_TILE_KM[0]!,
        LAYER_TILE_KM[1]!,
        LAYER_TILE_KM[2]!,
        LAYER_TILE_KM[3]!,
      ),
    },
    uTiles1: {
      value: new THREE.Vector4(
        LAYER_TILE_KM[4]!,
        LAYER_TILE_KM[5]!,
        LAYER_TILE_KM[6]!,
        LAYER_TILE_KM[7]!,
      ),
    },
    uSnowline: { value: 5 },
    uSnowCover: { value: 0 },
    uWetness: { value: 0 },
    uNormalDetail: { value: 1 },
    uAltDetail: { value: 1 },
    uTrim: { value: 7.5 },
    uLowSun: { value: 0 },
    uLayerMean: { value: textures.layerMean.map((mean) => mean.clone()) },
    uSeabedTint: { value: new THREE.Color().setRGB(0.55, 0.6, 0.55, THREE.SRGBColorSpace) },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  material.name = "terrain-ground";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>\nvEnWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvEnWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvEnWeightsA = weightsA;\nvEnWeightsB = weightsB;\nvEnOcclusion = occlusion;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace("#include <map_fragment>", SPLAT)
      .replace("#include <roughnessmap_fragment>", ROUGHNESS)
      .replace("#include <normal_fragment_maps>", NORMAL)
      .replace("#include <aomap_fragment>", OCCLUSION)
      .replace(
        "#include <lights_fragment_begin>",
        `#include <lights_fragment_begin>\n${CLOUD_SHADOW}`,
      );
  };
  material.customProgramCacheKey = () => "en-terrain-ground";
  return { material, uniforms };
}
