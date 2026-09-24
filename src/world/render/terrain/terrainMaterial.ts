// The ground material (docs/08 §1, ARCHITECTURE.md §18): one physically lit
// MeshStandardMaterial extended through onBeforeCompile. Every pixel blends
// the ground of the three hexes around it (blend.ts): each hex in its own
// variant (variants.ts), tile transform and character tone (looks.ts), with
// soft, wandering borders that interlock on the ground's own features; rock
// takes the steep faces, a town's pavement, the beach and the seabed come in
// with the vertex; snow above the turn's snowline plus the day's lowland
// cover as a dithered patchwork, a country-wide macro variation, wet ground
// after rain, and the sky module's cloud shadow over the direct light.
// Lights, shadows, fog and tone mapping stay three's own, so the terrain sits
// under whatever sun the sky module registers.
//
// Cost (ARCHITECTURE.md §13): every tap is gated by its weight and taken with
// explicit derivatives (`textureGrad`), so a pixel inside a hex pays for one
// ground tap, a border band for two, a corner for three; the per-layer normal
// maps are skipped altogether beyond `uNormalDetail` = 0 (a uniform, set from
// the camera distance and the quality tier), because at strategic distance
// their tiles average to flat anyway. The relief normal of the range is never
// skipped: it carries the crest read of the strategic view. The blend costs
// the lattice cell, one tap of the blend noise and a `texelFetch` of each
// hex's ground from a grid of a few thousand texels; a hex that weighs in
// adds its tile map (folded on the CPU — no trigonometry) and its tone.

import * as THREE from "three";
import { BLEND_GLSL } from "./blend";
import { LOOK_TEXELS, type LookGrid } from "./looks";
import { RELIEF_TILE_KM, type TerrainTextureSet } from "./terrainTextures";
import { SLICE_COUNT, SLICE_TILE_KM } from "./variants";

export interface TerrainUniforms {
  uAlbedo: { value: THREE.DataArrayTexture };
  uNormal: { value: THREE.DataArrayTexture };
  uMacro: { value: THREE.Texture };
  /** Ridged relief normal of the range (tile RELIEF_TILE_KM). */
  uRelief: { value: THREE.Texture };
  uCloudMap: { value: THREE.Texture };
  /** sizeKm, offsetX, offsetZ, strength (0 = no cloud shadow). */
  uCloudParams: { value: THREE.Vector4 };
  /** World size of one tile of every slice [km] (variants.ts SLICE_TILE_KM). */
  uSliceTile: { value: number[] };
  /** Altitude [km] above which the ground is white this turn. */
  uSnowline: { value: number };
  /** 0..1 lowland snow cover of the shown day (the bridge's `snowCover`). */
  uSnowCover: { value: number };
  uWetness: { value: number };
  /** 1 = per-layer normal maps on, 0 = skipped (distance / tier). */
  uNormalDetail: { value: number };
  /** 1 = the second, rotated relief tap against its tiling (near only). */
  uAltDetail: { value: number };
  /** Highest layer index sampled; above it the mean colour of the slice is used. */
  uTrim: { value: number };
  /** 0 = high sun, 1 = a sun below ~2°: cap the glancing specular. */
  uLowSun: { value: number };
  /** Linear mean albedo (rgb) and mean roughness (a) of every slice. */
  uLayerMean: { value: THREE.Vector4[] };
  uSeabedTint: { value: THREE.Color };
  /** The look grid (looks.ts LookGrid): tile map, ground and tone of every hex. */
  uHexLook: { value: THREE.DataTexture };
  /** Look grid: pad (virtual hexes per side), width, height. */
  uHexGrid: { value: THREE.Vector3 };
  /** The blend noise (blend.ts): one channel per hex colour. */
  uBlendNoise: { value: THREE.Texture };
}

const VERTEX_PARS = /* glsl */ `
attribute vec4 cover;
varying vec4 vEnCover;
varying vec3 vEnWorldPos;
varying vec3 vEnWorldNormal;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormal;
uniform sampler2D uMacro;
uniform sampler2D uRelief;
uniform sampler2D uCloudMap;
uniform vec4 uCloudParams;
uniform float uSliceTile[ ${SLICE_COUNT} ];
uniform float uSnowline;
uniform float uSnowCover;
uniform float uWetness;
uniform float uNormalDetail;
uniform float uAltDetail;
uniform float uTrim;
uniform float uLowSun;
uniform vec4 uLayerMean[ ${SLICE_COUNT} ];
uniform vec3 uSeabedTint;
uniform sampler2D uHexLook;
uniform vec3 uHexGrid;
uniform sampler2D uBlendNoise;
varying vec4 vEnCover;
varying vec3 vEnWorldPos;
varying vec3 vEnWorldNormal;

// Weights below this are not worth a tap.
const float EN_TAP_MIN = 0.004;
const vec3 EN_LUMA = vec3( 0.2126, 0.7152, 0.0722 );

// The first texel of a hex in the look grid (looks.ts), from its axial
// address; off the board the virtual ring carries on, past it the edge holds.
ivec2 enCell( vec2 axial ) {
	vec2 offset = vec2( axial.x, axial.y + floor( axial.x * 0.5 ) ) + uHexGrid.x;
	return ivec2( clamp( offset, vec2( 0.0 ), uHexGrid.yz - 1.0 ) ) * ivec2( ${LOOK_TEXELS}, 1 );
}
// The corners of a ground point's cell in the lattice of hex centres — the
// three hexes around it — its barycentric coordinates in that cell, and the
// cell's colour, which says which noise channel each corner reads.
vec3 enHexCorners( vec2 p, out ivec2 cellA, out ivec2 cellB, out ivec2 cellC, out float colour ) {
	float q = p.x / ${BLEND_GLSL.columnStep};
	vec2 axial = vec2( q, p.y / ${BLEND_GLSL.rowStep} - 0.5 * q );
	vec2 base = floor( axial );
	vec2 f = axial - base;
	bool upper = f.x + f.y > 1.0;
	cellA = enCell( upper ? base + 1.0 : base );
	cellB = enCell( base + vec2( 1.0, 0.0 ) );
	cellC = enCell( base + vec2( 0.0, 1.0 ) );
	colour = mod( base.x - base.y + 0.5, 3.0 );
	return upper ? vec3( f.x + f.y - 1.0, 1.0 - f.y, 1.0 - f.x ) : vec3( 1.0 - f.x - f.y, f.x, f.y );
}
// The lead of the highest of three weights over the next one.
float enLead( vec3 v, out float top ) {
	top = max( v.x, max( v.y, v.z ) );
	return top - max( min( v.x, v.y ), min( max( v.x, v.y ), v.z ) );
}
// Their blend weights — the arithmetic of blend.ts hexBlend: the barycentric
// weights pushed by each hex's channel of the slow noise and frayed by the
// fine one as hard as the hex's ground frays; water (fray < 0) never takes
// part; then a narrow band around the border, a pixel and a half at least.
// Neither noise moves a weight by more than its amplitude, so where one hex
// leads by more than twice that the weights are settled without the tap —
// deep inside a hex, and for the fine one anywhere fields meet but near the
// border itself. gap: how far the point is from the nearest border, in
// pushed weight (BLEND_PER_KM); exact only where it is small.
vec3 enHexWeights( vec2 p, vec3 bary, float colour, vec3 fray, float pixelKm, out float gap ) {
	vec3 land = step( 0.0, fray );
	float width = max( ${BLEND_GLSL.width}, pixelKm * 1.5 * ${BLEND_GLSL.perKm} );
	float frayLead = 2.0 * ${BLEND_GLSL.fray} * max( fray.x, max( fray.y, fray.z ) );
	vec3 pushed = mix( vec3( ${BLEND_GLSL.noGround} ), bary, land );
	float top;
	gap = enLead( pushed, top );
	if ( gap < 2.0 * ${BLEND_GLSL.wander} + frayLead + width ) {
		vec3 coarse = textureLod( uBlendNoise, p / ${BLEND_GLSL.tile}, 0.0 ).rgb;
		coarse = colour > 2.0 ? coarse.brg : ( colour > 1.0 ? coarse.gbr : coarse );
		pushed += ${BLEND_GLSL.wander} * ( 2.0 * coarse - 1.0 ) * land;
		gap = enLead( pushed, top );
		if ( gap < frayLead + width ) {
			vec2 pf = vec2( ${BLEND_GLSL.fineCos} * p.x - ${BLEND_GLSL.fineSin} * p.y, ${BLEND_GLSL.fineSin} * p.x + ${BLEND_GLSL.fineCos} * p.y );
			vec3 fine = textureLod( uBlendNoise, pf / ${BLEND_GLSL.fineTile}, 0.0 ).rgb;
			fine = colour > 2.0 ? fine.brg : ( colour > 1.0 ? fine.gbr : fine );
			pushed += ${BLEND_GLSL.fray} * max( fray, 0.0 ) * ( 2.0 * fine - 1.0 ) * land;
			gap = enLead( pushed, top );
		}
	}
	vec3 t = clamp( ( pushed - top ) / width + 1.0, 0.0, 1.0 );
	vec3 w = t * t * ( 3.0 - 2.0 * t ) * land;
	float sum = w.x + w.y + w.z;
	return sum > 0.0 ? w / sum : vec3( 0.0 );
}
// A hex's share of the ground layers: grass, canopy, rock, moor; wet.
void enShare( inout vec4 shares, inout float wet, float layer, float w ) {
	shares += w * vec4( equal( vec4( layer ), vec4( 0.0, 1.0, 2.0, 3.0 ) ) );
	wet += w * float( layer == 4.0 );
}
// The tone of a hex's character.
vec3 enGrade( vec3 c, vec4 look ) {
	c *= look.rgb;
	float luma = dot( c, EN_LUMA );
	return max( mix( vec3( luma ), c, look.a ), 0.0 );
}

vec4 enTap( float layer, float tile, vec2 p, vec2 dx, vec2 dy ) {
	return textureGrad( uAlbedo, vec3( p / tile, layer ), dx / tile, dy / tile );
}
vec3 enTapN( float layer, float tile, vec2 p, vec2 dx, vec2 dy ) {
	return textureGrad( uNormal, vec3( p / tile, layer ), dx / tile, dy / tile ).xyz * 2.0 - 1.0;
}
// A rotated, rescaled second copy of the relief tile; the macro noise picks
// one copy per ~30 km region. Linear part for the derivatives, offset for the
// position.
vec2 enAltDir( vec2 v ) {
	return vec2( v.x * 0.829 - v.y * 0.559, v.x * 0.559 + v.y * 0.829 ) * 0.73;
}
vec2 enAlt( vec2 p ) {
	return enAltDir( p ) + vec2( 3.1, 7.7 );
}

// One hex's own ground where it weighs in (w, its blend weight), added to the
// running tone at that weight and to the running albedo and tangent normal
// at that weight of the land's share (own): its variant in its own tile
// frame (the derivatives go through the same linear map, so the mips never
// jump), rock on the steep faces in the same frame. A layer above the tier's
// ceiling is not sampled: the slice's mean colour and roughness carry the
// biome's and the variant's hue, which is what the lower tiers need.
void enGround( inout vec4 surface, inout vec3 tangent, inout vec4 tone, ivec2 cell, vec4 ground, float w, float own, vec2 p, vec2 dx, vec2 dy, float rockSlope ) {
	if ( w <= 0.0 ) return;
	vec4 map = texelFetch( uHexLook, cell, 0 );
	tone += texelFetch( uHexLook, cell + ivec2( 2, 0 ), 0 ) * w;
	w *= own;
	mat2 spin = mat2( map.x, map.y, -map.y, map.x );
	vec2 hp = spin * p + map.zw;
	vec2 hdx = spin * dx;
	vec2 hdy = spin * dy;
	int s = int( ground.x + 0.5 );
	vec4 albedo = uLayerMean[ s ];
	vec3 normal = vec3( 0.0 );
	if ( ground.z <= uTrim ) {
		float tile = uSliceTile[ s ];
		albedo = enTap( ground.x, tile, hp, hdx, hdy );
		if ( uNormalDetail > 0.0 ) normal = enTapN( ground.x, tile, hp, hdx, hdy );
	}
	float rock = ground.z == 2.0 ? 0.0 : rockSlope;
	if ( rock > EN_TAP_MIN ) {
		int k = int( ground.y + 0.5 );
		float tile = uSliceTile[ k ];
		albedo = mix( albedo, enTap( ground.y, tile, hp, hdx, hdy ), rock );
		if ( uNormalDetail > 0.0 ) normal = mix( normal, enTapN( ground.y, tile, hp, hdx, hdy ), rock );
	}
	surface += albedo * w;
	// The bumps turn back from the tile frame to the ground's (the transpose of
	// the spin, its scale divided out), so the sun lights every hex's furrows
	// from the same side.
	normal.xy = normal.xy * spin * inversesqrt( dot( map.xy, map.xy ) );
	tangent += normal * w;
}
`;

/** Replaces map_fragment: blends the ground into diffuseColor and prepares roughness and the tangent normal. */
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

// The three hexes around the point, their ground (slice, rock slice, layer,
// fray — looks.ts) and their weights (blend.ts). Water hexes have no ground
// of their own and drop out; the land ones share the rest.
ivec2 enCellA, enCellB, enCellC;
float enColour;
vec3 enBary = enHexCorners( enP, enCellA, enCellB, enCellC, enColour );
vec4 enGA = texelFetch( uHexLook, enCellA + ivec2( 1, 0 ), 0 );
vec4 enGB = texelFetch( uHexLook, enCellB + ivec2( 1, 0 ), 0 );
vec4 enGC = texelFetch( uHexLook, enCellC + ivec2( 1, 0 ), 0 );
float enPixelKm = max( length( enDx ), length( enDy ) );
float enGap;
vec3 enW = enHexWeights( enP, enBary, enColour, vec3( enGA.w, enGB.w, enGC.w ), enPixelKm, enGap );
float enLandW = enW.x + enW.y + enW.z;

// What the relief and the water lay over the ground come with the vertex: a
// town's pavement, the beach, the seabed. The land left is the hexes' own —
// its layer shares weigh the relief, the steep faces and the snow.
float enLand = max( 1.0 - vEnCover.x - vEnCover.y - vEnCover.z, 0.0 );
vec4 wA = vec4( 0.0 );
float enWet = 0.0;
enShare( wA, enWet, enGA.z, enW.x );
enShare( wA, enWet, enGB.z, enW.y );
enShare( wA, enWet, enGC.z, enW.z );
wA *= enLand;
vec4 wB = vec4( enWet * enLand, vEnCover.xyz );

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
float enSteepBeach = wB.z * enRockSlope;
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
float enCrest = smoothstep( 0.8, 1.0, vEnCover.w ) * smoothstep( 0.25, 0.6, enMacro.r );
enSnow *= 1.0 - 0.85 * wA.z * enCrest;

// The hexes' own ground, each at its weight; a steep beach is the land's rock.
float enOwn = enLand + enSteepBeach;
vec4 enSurface = vec4( 0.0 );
vec3 enTangentN = vec3( 0.0 );
vec4 enTone = vec4( 0.0 );
enGround( enSurface, enTangentN, enTone, enCellA, enGA, enW.x, enOwn, enP, enDx, enDy, enRockSlope );
enGround( enSurface, enTangentN, enTone, enCellB, enGB, enW.y, enOwn, enP, enDx, enDy, enRockSlope );
enGround( enSurface, enTangentN, enTone, enCellC, enGC, enW.z, enOwn, enP, enDx, enDy, enRockSlope );
if ( enLandW <= 1e-4 ) {
	enSurface = uLayerMean[ 0 ] * enOwn;
	enTone = vec4( 1.0 );
}
// A town's pavement, in world space: continuous from one town hex to the next.
if ( wB.y > EN_TAP_MIN ) {
	if ( uTrim > 4.5 ) {
		enSurface += enTap( 5.0, uSliceTile[ 5 ], enP, enDx, enDy ) * wB.y;
		if ( uNormalDetail > 0.0 ) enTangentN += enTapN( 5.0, uSliceTile[ 5 ], enP, enDx, enDy ) * wB.y;
	} else {
		enSurface += uLayerMean[ 5 ] * wB.y;
	}
}
// The characters' tone; beach, seabed and snow keep their own. A slow swell of
// ±5 % over 4–5 km blobs (world space, so out of step with every hex's tile)
// keeps a hex's own tile from reading as a repeat inside it.
enSurface.rgb = enGrade( enSurface.rgb, enTone ) * ( 0.92 + 0.16 * enMacroFine.b );
// Where two field systems meet, a farm track runs along the bent border: the
// fields of one hex end on a road, not on a cut. ~120 m wide, faded out once
// it is narrower than a pixel, so the strategic view never shimmers with it.
{
	float enBorderKm = enGap / ${BLEND_GLSL.perKm};
	float enTrack = ( 1.0 - smoothstep( 0.06 - enPixelKm * 0.5, 0.06 + enPixelKm * 0.5, enBorderKm ) )
		* smoothstep( 0.85, 0.98, wA.x / max( enLand, 1e-4 ) )
		* clamp( 0.12 / max( enPixelKm, 1e-4 ) - 0.5, 0.0, 1.0 );
	enSurface = mix( enSurface, vec4( 0.26, 0.24, 0.17, 0.9 ), enTrack * 0.8 );
}
// Beach and seabed share the sand tile; the seabed is the same sand, tinted.
if ( wB.z + wB.w > EN_TAP_MIN ) {
	if ( uTrim > 5.5 ) {
		vec4 enSand = enTap( 6.0, uSliceTile[ 6 ], enP, enDx, enDy );
		enSurface += enSand * wB.z + enSand * vec4( uSeabedTint, 1.0 ) * wB.w;
		if ( uNormalDetail > 0.0 ) enTangentN += enTapN( 6.0, uSliceTile[ 6 ], enP, enDx, enDy ) * ( wB.z + wB.w );
	} else {
		enSurface += uLayerMean[ 6 ] * wB.z + uLayerMean[ 6 ] * vec4( uSeabedTint, 1.0 ) * wB.w;
	}
}
if ( enSnow > EN_TAP_MIN ) {
	vec4 enSnowTile = uTrim > 6.5
		? enTap( 7.0, uSliceTile[ 7 ], enP, enDx, enDy )
		: uLayerMean[ 7 ];
	enSurface = mix( enSurface, enSnowTile, enSnow );
	if ( uNormalDetail > 0.0 && uTrim > 6.5 ) enTangentN = mix( enTangentN, enTapN( 7.0, uSliceTile[ 7 ], enP, enDx, enDy ), enSnow );
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
reflectedLight.indirectDiffuse *= vEnCover.w;
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

/** The look grid as a float texture the shader fetches texel by texel. */
export function createLookTexture(grid: LookGrid): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    grid.data,
    grid.width * LOOK_TEXELS,
    grid.height,
    THREE.RGBAFormat,
  );
  texture.type = THREE.FloatType;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createTerrainMaterial(
  textures: TerrainTextureSet,
  grid: LookGrid,
  lookTexture: THREE.DataTexture,
  blendNoise: THREE.Texture,
): {
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
    uSliceTile: { value: [...SLICE_TILE_KM] },
    uSnowline: { value: 5 },
    uSnowCover: { value: 0 },
    uWetness: { value: 0 },
    uNormalDetail: { value: 1 },
    uAltDetail: { value: 1 },
    uTrim: { value: 7.5 },
    uLowSun: { value: 0 },
    uLayerMean: { value: textures.layerMean.map((mean) => mean.clone()) },
    uSeabedTint: { value: new THREE.Color().setRGB(0.55, 0.6, 0.55, THREE.SRGBColorSpace) },
    uHexLook: { value: lookTexture },
    uHexGrid: { value: new THREE.Vector3(grid.pad, grid.width, grid.height) },
    uBlendNoise: { value: blendNoise },
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
        `#include <begin_vertex>\nvEnWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvEnCover = cover;`,
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
