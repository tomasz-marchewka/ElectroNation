// The ground variants (variants.ts), painted on the GPU once per page: each
// painter is a tileable procedural surface in GLSL — periodic value noise and
// periodic cells, strip directions on the integer lattice — rendered into a
// small target and read back into the same byte arrays the CPU painters fill
// (terrainTextures.ts). Two passes per variant: the sRGB albedo with the
// roughness in alpha, then the height packed in 16 bits, from which the CPU
// derives the tangent normals exactly as it does for the classic layers.
//
// One program for every painter (a uniform picks one): the driver compiles it
// while the CPU paints the classic layers. Split into a program per painter it
// compiled no faster cold (~1.7 s on an M3 Pro, once per shader version — the
// driver caches it) and linked slower warm.
//
// Fixed seeds, like every texture of the world: the same pixels in every
// session on the same GPU. Nothing here depends on the game.

import * as THREE from "three";
import { VARIANTS } from "./variants";

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;

uniform int uPainter;
uniform int uPass;
uniform float uSize;
varying vec2 vUv;

// --- noise: integer hash, periodic value noise and cells ---------------------

uint enHash( uvec3 v ) {
	v = v * 1664525u + 1013904223u;
	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	v ^= v >> 16u;
	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	return v.x ^ v.y ^ v.z;
}

// Uniform in [0, 1) for a lattice point (non-negative) and a seed.
float enRnd( ivec2 c, uint s ) {
	return float( enHash( uvec3( uvec2( c ), s ) ) >> 8u ) * ( 1.0 / 16777216.0 );
}

// Value noise over a lattice that repeats every period cells; p >= 0.
float enValue( vec2 p, ivec2 period, uint s ) {
	vec2 i = floor( p );
	vec2 f = p - i;
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	ivec2 c0 = ivec2( i ) % period;
	ivec2 c1 = ( ivec2( i ) + 1 ) % period;
	float a = enRnd( c0, s );
	float b = enRnd( ivec2( c1.x, c0.y ), s );
	float c = enRnd( ivec2( c0.x, c1.y ), s );
	float d = enRnd( c1, s );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

// Fractal sum over the tile, [0, 1]; the lattice doubles per octave, so it tiles.
float enFbm( vec2 uv, ivec2 lattice, int octaves, uint s ) {
	uv = fract( uv );
	float sum = 0.0;
	float amp = 1.0;
	float total = 0.0;
	ivec2 period = lattice;
	for ( int o = 0; o < 6; o++ ) {
		if ( o >= octaves ) break;
		sum += enValue( uv * vec2( period ), period, s + uint( o ) * 7919u ) * amp;
		total += amp;
		amp *= 0.5;
		period *= 2;
	}
	return sum / total;
}
float enFbm( vec2 uv, int lattice, int octaves, uint s ) {
	return enFbm( uv, ivec2( lattice ), octaves, s );
}

// Triangle wave, 0..1, period 1.
float enTri( float x ) {
	return abs( fract( x ) * 2.0 - 1.0 );
}

// Jittered cells repeating over the tile: the nearest two and their distances
// in cell units — fields, plots, crowns.
struct EnCell {
	ivec2 id;
	ivec2 id2;
	float d1;
	float d2;
};
EnCell enCells( vec2 uv, ivec2 n, float jitter, uint s ) {
	vec2 p = fract( uv ) * vec2( n );
	ivec2 c = ivec2( floor( p ) );
	EnCell r;
	r.id = ivec2( 0 );
	r.id2 = ivec2( 0 );
	r.d1 = 1e9;
	r.d2 = 1e9;
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			ivec2 g = c + ivec2( i, j );
			ivec2 w = ( g + n ) % n;
			vec2 o = 0.5 + ( vec2( enRnd( w, s ), enRnd( w, s + 1u ) ) - 0.5 ) * jitter;
			float d = length( p - ( vec2( g ) + o ) );
			if ( d < r.d1 ) {
				r.d2 = r.d1;
				r.id2 = r.id;
				r.d1 = d;
				r.id = w;
			} else if ( d < r.d2 ) {
				r.d2 = d;
				r.id2 = w;
			}
		}
	}
	return r;
}

// 1 on the border between two cells, over halfWidth pixels either side.
float enEdge( EnCell c, float cellsAcross, float halfWidthPx ) {
	float px = ( c.d2 - c.d1 ) * 0.5 * uSize / cellsAcross;
	return 1.0 - smoothstep( halfWidthPx - 0.6, halfWidthPx + 0.6, px );
}

// A draw per border, the same from both sides.
float enBorderRnd( EnCell c, uint s ) {
	int a = c.id.x * 257 + c.id.y;
	int b = c.id2.x * 257 + c.id2.y;
	return enRnd( ivec2( min( a, b ), max( a, b ) ), s );
}

// Round crowns scattered on a jittered grid of n × n: coverage and dome height.
vec2 enDots( vec2 uv, int n, float chance, float radius, uint s ) {
	vec2 p = fract( uv ) * float( n );
	ivec2 c = ivec2( floor( p ) );
	float cover = 0.0;
	float dome = 0.0;
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			ivec2 g = c + ivec2( i, j );
			ivec2 w = ( g + n ) % n;
			if ( enRnd( w, s ) > chance ) continue;
			vec2 o = 0.1 + 0.8 * vec2( enRnd( w, s + 1u ), enRnd( w, s + 2u ) );
			float r = radius * ( 0.7 + 0.6 * enRnd( w, s + 3u ) );
			float d = length( p - ( vec2( g ) + o ) ) / r;
			float k = 1.0 - smoothstep( 0.8, 1.0, d );
			cover = max( cover, k );
			dome = max( dome, k * sqrt( max( 0.0, 1.0 - d * d ) ) );
		}
	}
	return vec2( cover, dome );
}

// Rectangular sections (forest compartments, burn strips, peat cuts): the
// section and the distance to its edge in pixels.
vec3 enSections( vec2 uv, ivec2 n ) {
	vec2 p = fract( uv ) * vec2( n );
	vec2 f = fract( p );
	vec2 edgePx = min( f, 1.0 - f ) * uSize / vec2( n );
	return vec3( floor( p ), min( edgePx.x, edgePx.y ) );
}

struct EnSample {
	vec3 rgb;
	float rough;
	float height;
};

// Bands over the tile whose borders wander by up to ±jitter/2 of a band:
// border i sits at ( i + jitter · ( rnd − 0.5 ) ) / n, keyed by i mod n, so the
// bands tile. Returns the band (wrapped) and its borders (may pass 0 or 1).
float enBorderPos( int i, int n, float jitter, uint s ) {
	int w = ( i % n + n ) % n;
	return ( float( i ) + jitter * ( enRnd( ivec2( w, 7 ), s ) - 0.5 ) ) / float( n );
}
vec3 enBand( float x, int n, float jitter, uint s ) {
	int i = int( floor( x * float( n ) ) );
	if ( x < enBorderPos( i, n, jitter, s ) ) i -= 1;
	else if ( x >= enBorderPos( i + 1, n, jitter, s ) ) i += 1;
	return vec3( float( ( i % n + n ) % n ), enBorderPos( i, n, jitter, s ), enBorderPos( i + 1, n, jitter, s ) );
}

// Natural edges: hedgerow crowns and farm tracks.
const vec3 HEDGE_DARK = vec3( 0.10, 0.18, 0.06 );
const vec3 HEDGE_LIT = vec3( 0.17, 0.26, 0.09 );
const vec3 TRACK = vec3( 0.57, 0.54, 0.44 );

// --- plains -------------------------------------------------------------------

const vec3 CROPS[ 8 ] = vec3[ 8 ](
	vec3( 0.35, 0.52, 0.17 ),
	vec3( 0.70, 0.61, 0.28 ),
	vec3( 0.63, 0.57, 0.33 ),
	vec3( 0.42, 0.33, 0.20 ),
	vec3( 0.31, 0.48, 0.15 ),
	vec3( 0.52, 0.54, 0.23 ),
	vec3( 0.72, 0.67, 0.31 ),
	vec3( 0.44, 0.55, 0.21 )
);
// Strip directions on the integer lattice, so the strips tile.
const ivec2 STRIP_DIRS[ 5 ] = ivec2[ 5 ]( ivec2( 1, 0 ), ivec2( 0, 1 ), ivec2( 1, 1 ), ivec2( 1, -1 ), ivec2( 2, 1 ) );

// Szachownica: blocks of long narrow strips, each farm's strips its own crop.
EnSample enStrips( vec2 uv ) {
	vec2 warp = vec2( enFbm( uv, 4, 2, 11u ), enFbm( uv + 0.37, 4, 2, 12u ) ) - 0.5;
	EnCell block = enCells( uv + warp * 0.05, ivec2( 5, 5 ), 0.85, 13u );
	float r0 = enRnd( block.id, 14u );
	float r1 = enRnd( block.id, 15u );
	int dirIndex = r0 < 0.5 ? 0 : ( r0 < 0.92 ? 1 : 2 + int( r1 * 2.99 ) );
	ivec2 dir = STRIP_DIRS[ dirIndex ];
	vec2 across = vec2( float( -dir.y ), float( dir.x ) );
	float k = float( 56 + 24 * int( enRnd( block.id, 16u ) * 2.99 ) );
	float s = dot( uv, across ) * k;
	float strip = floor( s );
	float f = s - strip;
	float owner = floor( mod( strip, k ) / ( 1.0 + floor( r1 * 2.5 ) ) );
	float pick = enRnd( ivec2( int( owner ), block.id.x * 31 + block.id.y ), 17u );
	vec3 rgb = CROPS[ int( pick * 7.99 ) ];
	bool meadow = r1 > 0.88;
	if ( meadow ) rgb = mix( vec3( 0.31, 0.5, 0.16 ), vec3( 0.42, 0.55, 0.21 ), pick );
	float grain = enFbm( uv, 64, 2, 18u );
	float drill = enTri( dot( uv, vec2( dir ) ) * 150.0 );
	rgb *= ( 0.92 + 0.14 * grain ) * ( meadow ? 1.0 : 0.97 + 0.05 * drill );
	// Balks: a faint grass line between neighbouring strips.
	float widthPx = uSize / ( k * length( across ) );
	float balk = meadow ? 0.0 : 1.0 - smoothstep( 0.1, 0.7, min( f, 1.0 - f ) * widthPx );
	rgb = mix( rgb, vec3( 0.36, 0.46, 0.2 ), balk * 0.3 );
	// Block borders: a hedge on some, a track on the rest.
	float lump = enFbm( uv, 40, 2, 19u );
	float hedge = step( 0.62, enBorderRnd( block, 20u ) );
	float border = enEdge( block, 5.0, mix( 0.7, 1.1 + 0.8 * lump, hedge ) );
	rgb = mix( rgb, mix( TRACK, mix( HEDGE_DARK, HEDGE_LIT, lump ), hedge ), border * 0.85 );
	float height = 0.35 + 0.1 * grain + 0.04 * drill + 0.08 * balk + border * mix( -0.1, 0.5, hedge );
	return EnSample( rgb, 0.92, height );
}

const vec3 LARGE_CROPS[ 7 ] = vec3[ 7 ](
	vec3( 0.70, 0.61, 0.30 ),
	vec3( 0.74, 0.70, 0.31 ),
	vec3( 0.66, 0.62, 0.41 ),
	vec3( 0.42, 0.55, 0.19 ),
	vec3( 0.36, 0.50, 0.16 ),
	vec3( 0.52, 0.43, 0.29 ),
	vec3( 0.62, 0.57, 0.39 )
);

// Łany: large rectangular fields of one crop each, tramlines, gravel farm
// tracks, a tree line along the odd one.
EnSample enLarge( vec2 uv ) {
	vec3 row = enBand( uv.y, 5, 0.7, 21u );
	int r = int( row.x );
	int nCols = 2 + int( enRnd( ivec2( r, 1 ), 22u ) * 3.0 );
	vec3 col = enBand( uv.x, nCols, 0.8, 23u + uint( r ) * 13u );
	ivec2 id = ivec2( int( col.x ), r );
	float r0 = enRnd( id, 24u );
	vec3 rgb = LARGE_CROPS[ int( r0 * 6.99 ) ];
	// Drill rows and tramlines run along the field's long side.
	bool wide = ( col.z - col.y ) > ( row.z - row.y );
	float across = wide ? uv.y : uv.x;
	float rows = enTri( across * 220.0 );
	float tram = 1.0 - smoothstep( 0.0, 0.07, enTri( across * 30.0 ) );
	float patchy = enFbm( uv, 6, 3, 26u );
	float grain = enFbm( uv, 80, 2, 27u );
	rgb *= ( 0.88 + 0.2 * patchy ) * ( 0.95 + 0.07 * grain ) * ( 0.97 + 0.05 * rows );
	rgb = mix( rgb, rgb * 0.84, tram * 0.35 );
	// Tracks along the field edges; a tree line along some of them.
	float dRow = min( uv.y - row.y, row.z - uv.y );
	float dCol = min( uv.x - col.y, col.z - uv.x );
	float edgePx = min( dRow, dCol ) * uSize;
	float track = 1.0 - smoothstep( 0.5, 1.5, edgePx );
	float key = dRow < dCol
		? enRnd( ivec2( r + ( uv.y - row.y < row.z - uv.y ? 0 : 1 ), 3 ), 28u )
		: enRnd( ivec2( int( col.x ) + ( uv.x - col.y < col.z - uv.x ? 0 : 1 ), r ), 29u );
	float lump = enFbm( uv, 48, 2, 30u );
	float trees = ( 1.0 - smoothstep( 1.0, 2.4 + 1.2 * lump, edgePx ) ) * step( 0.8, key );
	rgb = mix( rgb, TRACK, track * 0.9 );
	rgb = mix( rgb, mix( HEDGE_DARK, HEDGE_LIT, lump ), trees );
	float height = 0.4 + 0.05 * rows + 0.08 * grain - 0.1 * track + 0.55 * trees;
	return EnSample( rgb, 0.9 - 0.05 * track, height );
}

const vec3 MEADOWS[ 6 ] = vec3[ 6 ](
	vec3( 0.30, 0.49, 0.15 ),
	vec3( 0.36, 0.54, 0.19 ),
	vec3( 0.43, 0.56, 0.23 ),
	vec3( 0.27, 0.44, 0.14 ),
	vec3( 0.50, 0.54, 0.27 ),
	vec3( 0.33, 0.47, 0.19 )
);

// Łąki i pastwiska: green plots, mown swaths, tree lines, field trees, ponds.
EnSample enMeadow( vec2 uv ) {
	vec2 warp = vec2( enFbm( uv, 5, 2, 31u ), enFbm( uv + 0.43, 5, 2, 32u ) ) - 0.5;
	EnCell plot = enCells( uv + warp * 0.05, ivec2( 6, 7 ), 0.9, 33u );
	vec3 rgb = MEADOWS[ int( enRnd( plot.id, 34u ) * 5.99 ) ];
	float grain = enFbm( uv, 56, 3, 35u );
	float blotch = enFbm( uv, 9, 2, 36u );
	rgb *= ( 0.92 + 0.16 * grain ) * ( 0.92 + 0.16 * blotch );
	float mown = step( 0.6, enRnd( plot.id, 37u ) );
	float swath = enTri( ( enRnd( plot.id, 38u ) < 0.5 ? uv.x : uv.y ) * 90.0 );
	rgb *= 1.0 + mown * ( swath - 0.5 ) * 0.1;
	float lump = enFbm( uv, 40, 2, 39u );
	float hedge = enEdge( plot, 6.0, 0.7 + 1.6 * lump ) * step( 0.6, enBorderRnd( plot, 40u ) );
	vec2 tree = enDots( uv, 48, 0.06, 0.24, 41u );
	float trees = max( hedge, tree.x );
	rgb = mix( rgb, mix( HEDGE_DARK, HEDGE_LIT, lump ), trees * 0.9 );
	float pond = smoothstep( 0.79, 0.82, enFbm( uv + 0.8, 11, 2, 42u ) ) * ( 1.0 - trees );
	rgb = mix( rgb, vec3( 0.12, 0.22, 0.23 ), pond );
	float height = 0.3 + 0.12 * grain + 0.55 * max( hedge * ( 0.6 + 0.4 * lump ), tree.y ) - 0.3 * pond;
	return EnSample( rgb, mix( 0.92, 0.3, pond ), height );
}

// Zadrzewienia śródpolne: small mixed fields in a net of hedgerows.
EnSample enBocage( vec2 uv ) {
	vec2 warp = vec2( enFbm( uv, 6, 2, 45u ), enFbm( uv + 0.51, 6, 2, 46u ) ) - 0.5;
	EnCell field = enCells( uv + warp * 0.04, ivec2( 9, 9 ), 0.9, 47u );
	vec3 rgb = CROPS[ int( enRnd( field.id, 48u ) * 7.99 ) ];
	float grain = enFbm( uv, 64, 2, 49u );
	rgb *= 0.92 + 0.16 * grain;
	float lump = enFbm( uv, 48, 2, 50u );
	float hedge = enEdge( field, 9.0, 0.8 + 1.2 * lump ) * step( 0.15, enBorderRnd( field, 52u ) );
	vec2 tree = enDots( uv, 36, 0.1, 0.3, 51u );
	float trees = max( hedge, tree.x );
	rgb = mix( rgb, mix( HEDGE_DARK, HEDGE_LIT, lump ), trees * 0.9 );
	float height = 0.3 + 0.1 * grain + 0.6 * max( hedge * ( 0.5 + 0.5 * lump ), tree.y );
	return EnSample( rgb, 0.92, height );
}

// --- forest -------------------------------------------------------------------

// Forest compartments: straight lines across the whole tile, jittered apart —
// the shared grid of the conifer and the young stands.
vec4 enCompartment( vec2 uv, uint s ) {
	vec3 col = enBand( uv.x, 7, 0.5, s );
	vec3 row = enBand( uv.y, 13, 0.5, s + 1u );
	float edgePx = min( min( uv.x - col.y, col.z - uv.x ), min( uv.y - row.y, row.z - uv.y ) ) * uSize;
	return vec4( col.x, row.x, edgePx, 0.0 );
}

// Bór: spruce and pine in compartments of one age each, cut by forest lines.
EnSample enConifer( vec2 uv ) {
	vec4 sec = enCompartment( uv, 60u );
	float age = enRnd( ivec2( sec.xy ), 61u );
	float fine = enFbm( uv, 72, 3, 62u );
	float clump = enFbm( uv, 20, 3, 63u );
	float crown = smoothstep( 0.35, 0.75, mix( clump, fine, 0.55 ) );
	vec3 rgb = mix( vec3( 0.035, 0.085, 0.06 ), vec3( 0.085, 0.18, 0.1 ), crown );
	rgb *= mix( 0.85, 1.2, age );
	rgb = mix( rgb, rgb * vec3( 1.15, 1.2, 0.9 ), step( 0.88, age ) * 0.6 );
	float line = 1.0 - smoothstep( 0.4, 1.2, sec.z );
	rgb = mix( rgb, vec3( 0.2, 0.23, 0.15 ), line * 0.6 );
	float height = mix( 0.3 + 0.6 * crown * mix( 0.75, 1.0, age ), 0.1, line * 0.8 );
	return EnSample( rgb, 0.95, height );
}

// Las liściasty: big rounded crowns in clumps, the odd yellowing one, dark gaps.
EnSample enBroadleaf( vec2 uv ) {
	vec2 warp = vec2( enFbm( uv, 8, 2, 71u ), enFbm( uv + 0.29, 8, 2, 72u ) ) - 0.5;
	EnCell crown = enCells( uv + warp * 0.012, ivec2( 36 ), 0.9, 73u );
	float dome = 1.0 - smoothstep( 0.15, 0.75, crown.d1 );
	float gap = 1.0 - smoothstep( 0.02, 0.12, crown.d2 - crown.d1 );
	float r = enRnd( crown.id, 74u );
	float big = enFbm( uv, 5, 3, 75u );
	vec3 rgb = mix( vec3( 0.09, 0.2, 0.06 ), vec3( 0.18, 0.31, 0.09 ), mix( r, big, 0.5 ) );
	rgb = mix( rgb, vec3( 0.24, 0.29, 0.09 ), step( 0.94, r ) * 0.6 );
	rgb *= ( 0.78 + 0.4 * dome ) * ( 0.85 + 0.3 * big );
	rgb = mix( rgb, vec3( 0.025, 0.05, 0.025 ), gap * 0.55 );
	float height = 0.25 + 0.6 * dome * ( 1.0 - gap * 0.5 ) + 0.15 * big;
	return EnSample( rgb, 0.93, height );
}

// Zręby i młodniki: mostly standing forest, compartments clear-cut, planted
// in rows or grown into thickets here and there.
EnSample enYoung( vec2 uv ) {
	vec4 sec = enCompartment( uv, 80u );
	ivec2 id = ivec2( sec.xy );
	float kind = enRnd( id, 81u );
	float fine = enFbm( uv, 72, 3, 82u );
	vec3 rgb;
	float height;
	if ( kind < 0.1 ) {
		rgb = mix( vec3( 0.35, 0.31, 0.21 ), vec3( 0.42, 0.37, 0.26 ), fine );
		float regrowth = smoothstep( 0.45, 0.75, enFbm( uv, 40, 2, 83u ) );
		rgb = mix( rgb, vec3( 0.28, 0.35, 0.15 ), regrowth * 0.6 );
		height = 0.1 + 0.15 * fine;
	} else if ( kind < 0.22 ) {
		float rows = smoothstep( 0.35, 0.75, enTri( ( ( id.x + id.y ) % 2 == 0 ? uv.x : uv.y ) * 128.0 ) );
		rgb = mix( vec3( 0.27, 0.29, 0.18 ), vec3( 0.14, 0.27, 0.09 ), rows * ( 0.7 + 0.3 * fine ) );
		height = 0.15 + 0.3 * rows;
	} else if ( kind < 0.42 ) {
		rgb = mix( vec3( 0.07, 0.16, 0.055 ), vec3( 0.14, 0.26, 0.08 ), fine );
		height = 0.35 + 0.3 * fine;
	} else {
		float crown = smoothstep( 0.35, 0.75, fine );
		rgb = mix( vec3( 0.04, 0.095, 0.06 ), vec3( 0.1, 0.2, 0.1 ), crown );
		height = 0.4 + 0.5 * crown;
	}
	float line = 1.0 - smoothstep( 0.4, 1.2, sec.z );
	rgb = mix( rgb, vec3( 0.22, 0.24, 0.16 ), line * 0.6 );
	height = mix( height, 0.1, line * 0.8 );
	return EnSample( rgb, 0.93, height );
}

// --- mountains ----------------------------------------------------------------

// Wapień: pale karst rock, cracks, grass in the hollows, faint bedding.
EnSample enLimestone( vec2 uv ) {
	float base = enFbm( uv, 6, 4, 91u );
	float grain = enFbm( uv, 48, 3, 92u );
	float crack = 1.0 - smoothstep( 0.0, 0.016, abs( enFbm( uv, 12, 3, 93u ) - 0.5 ) );
	float bedding = smoothstep( 0.0, 0.1, fract( uv.y * 10.0 + base * 1.3 ) );
	vec3 rgb = mix( vec3( 0.54, 0.52, 0.48 ), vec3( 0.66, 0.64, 0.58 ), base );
	rgb *= ( 0.86 + 0.24 * grain ) * ( 0.9 + 0.1 * bedding );
	float grass = smoothstep( 0.6, 0.68, enFbm( uv + 0.5, 9, 3, 94u ) );
	rgb = mix( rgb, vec3( 0.42, 0.45, 0.27 ), grass * 0.7 );
	rgb = mix( rgb, vec3( 0.33, 0.33, 0.31 ), crack * 0.6 );
	float height = clamp( 0.25 + 0.45 * base + 0.2 * grain + 0.15 * bedding - 0.35 * crack, 0.0, 1.0 );
	return EnSample( rgb, 0.88, height );
}

// Łupek: dark foliated schist, rust stains, lichen.
EnSample enSchist( vec2 uv ) {
	float base = enFbm( uv, 7, 3, 101u );
	float grain = enFbm( uv, 56, 3, 102u );
	float warp = enFbm( uv, 5, 2, 103u );
	float foliation = enTri( ( uv.x + uv.y ) * 36.0 + warp * 3.0 );
	vec3 rgb = mix( vec3( 0.26, 0.25, 0.25 ), vec3( 0.36, 0.33, 0.31 ), base );
	rgb *= ( 0.84 + 0.28 * grain ) * ( 0.9 + 0.12 * foliation );
	float rust = smoothstep( 0.62, 0.72, enFbm( uv + 0.3, 10, 3, 104u ) );
	rgb = mix( rgb, vec3( 0.41, 0.3, 0.21 ), rust * 0.55 );
	float lichen = smoothstep( 0.8, 0.86, enFbm( uv, 80, 2, 105u ) );
	rgb = mix( rgb, vec3( 0.52, 0.53, 0.47 ), lichen * 0.45 );
	float height = clamp( 0.3 + 0.35 * base + 0.2 * grain + 0.15 * foliation, 0.0, 1.0 );
	return EnSample( rgb, 0.9, height );
}

// --- highlands ----------------------------------------------------------------

// Wrzosowisko wypalane: heather burnt in long strips in rotation, each strip
// at its own age; grass paths.
EnSample enHeather( vec2 uv ) {
	vec2 warp = vec2( enFbm( uv, 6, 2, 111u ), enFbm( uv + 0.4, 6, 2, 112u ) ) - 0.5;
	vec2 w = uv + warp * 0.025;
	vec3 row = enBand( fract( w.y ), 16, 0.6, 113u );
	int r = int( row.x );
	vec3 seg = enBand( fract( w.x ), 4 + int( enRnd( ivec2( r, 2 ), 114u ) * 4.0 ), 0.8, 115u + uint( r ) * 7u );
	float age = enRnd( ivec2( int( seg.x ), r ), 116u );
	float fine = enFbm( uv, 56, 3, 117u );
	float blotch = enFbm( uv, 8, 3, 118u );
	vec3 mature = mix( vec3( 0.34, 0.25, 0.24 ), vec3( 0.43, 0.31, 0.3 ), blotch );
	vec3 young = mix( vec3( 0.37, 0.35, 0.22 ), vec3( 0.43, 0.39, 0.24 ), blotch );
	vec3 rgb = age < 0.1 ? mix( vec3( 0.2, 0.17, 0.14 ), vec3( 0.27, 0.25, 0.18 ), fine ) : ( age < 0.4 ? mix( young, mature, ( age - 0.1 ) / 0.3 ) : mature );
	rgb *= 0.88 + 0.24 * fine;
	float path = 1.0 - smoothstep( 0.0, 0.016, abs( enFbm( uv, 5, 3, 119u ) - 0.5 ) );
	rgb = mix( rgb, vec3( 0.44, 0.46, 0.23 ), path * 0.7 );
	float height = 0.35 + 0.35 * fine + 0.2 * blotch - 0.2 * path - 0.1 * step( age, 0.1 );
	return EnSample( rgb, 0.94, height );
}

// Hala: upland pasture in dry-stone walls, rushes in the hollows, boulders.
EnSample enPasture( vec2 uv ) {
	vec2 warp = vec2( enFbm( uv, 5, 2, 121u ), enFbm( uv + 0.2, 5, 2, 122u ) ) - 0.5;
	EnCell plot = enCells( uv + warp * 0.04, ivec2( 5, 6 ), 0.8, 123u );
	float grain = enFbm( uv, 48, 3, 124u );
	float blotch = enFbm( uv, 7, 3, 125u );
	vec3 rgb = mix( vec3( 0.43, 0.47, 0.23 ), vec3( 0.54, 0.54, 0.3 ), blotch );
	rgb *= mix( 0.93, 1.07, enRnd( plot.id, 126u ) ) * ( 0.9 + 0.2 * grain );
	float rush = smoothstep( 0.62, 0.7, enFbm( uv + 0.7, 14, 3, 127u ) );
	rgb = mix( rgb, vec3( 0.3, 0.36, 0.17 ), rush * 0.6 );
	float wall = enEdge( plot, 5.0, 0.8 );
	rgb = mix( rgb, vec3( 0.56, 0.55, 0.51 ), wall * 0.8 );
	vec2 stone = enDots( uv, 60, 0.1, 0.26, 128u );
	rgb = mix( rgb, vec3( 0.54, 0.53, 0.5 ) * ( 0.82 + 0.3 * stone.y ), stone.x * 0.9 );
	float height = 0.35 + 0.25 * grain + 0.1 * blotch + 0.45 * wall + 0.4 * stone.y;
	return EnSample( rgb, 0.93, height );
}

// Rumowisko: stone fields among brown heath, faceted blocks.
EnSample enScree( vec2 uv ) {
	float stones = smoothstep( 0.48, 0.56, enFbm( uv, 6, 4, 131u ) );
	float grain = enFbm( uv, 96, 2, 132u );
	EnCell block = enCells( uv, ivec2( 36 ), 0.9, 133u );
	float facet = 1.0 - smoothstep( 0.1, 0.7, block.d1 );
	vec3 heath = mix( vec3( 0.38, 0.32, 0.2 ), vec3( 0.46, 0.39, 0.24 ), enFbm( uv, 10, 3, 134u ) );
	vec3 rock = mix( vec3( 0.43, 0.42, 0.4 ), vec3( 0.55, 0.54, 0.51 ), enRnd( block.id, 135u ) ) * ( 0.82 + 0.28 * facet );
	vec3 rgb = mix( heath * ( 0.9 + 0.2 * grain ), rock * ( 0.9 + 0.2 * grain ), stones );
	float height = mix( 0.3 + 0.3 * grain, 0.4 + 0.5 * facet, stones );
	return EnSample( rgb, mix( 0.94, 0.86, stones ), height );
}

// --- swamp --------------------------------------------------------------------

// Trzcinowisko: reed beds leaning with the wind, meandering channels, open water.
EnSample enReeds( vec2 uv ) {
	float streak = enFbm( uv, ivec2( 24, 160 ), 2, 141u );
	float blotch = enFbm( uv, 6, 3, 142u );
	vec3 rgb = mix( vec3( 0.45, 0.44, 0.27 ), vec3( 0.56, 0.52, 0.33 ), blotch );
	rgb *= 0.84 + 0.3 * streak;
	float channel = 1.0 - smoothstep( 0.004, 0.01, abs( enFbm( uv, 5, 3, 143u ) - 0.5 ) );
	float pool = smoothstep( 0.7, 0.74, enFbm( uv + 0.5, 9, 3, 144u ) );
	float water = max( channel, pool );
	rgb = mix( rgb, vec3( 0.08, 0.15, 0.16 ), water );
	float height = mix( 0.45 + 0.4 * streak, 0.0, water );
	return EnSample( rgb, mix( 0.92, 0.2, water ), height );
}

// Torfowisko osuszone: peat meadow in long drainage ditches, dark peat cuts.
EnSample enPeat( vec2 uv ) {
	float blotch = enFbm( uv, 8, 3, 151u );
	float grain = enFbm( uv, 64, 2, 152u );
	vec3 rgb = mix( vec3( 0.31, 0.27, 0.17 ), vec3( 0.34, 0.41, 0.17 ), smoothstep( 0.35, 0.65, blotch ) );
	rgb *= 0.9 + 0.2 * grain;
	vec3 row = enBand( uv.y, 11, 0.6, 153u );
	int r = int( row.x );
	vec3 seg = enBand( uv.x, 5 + int( enRnd( ivec2( r, 4 ), 154u ) * 4.0 ), 0.8, 155u + uint( r ) * 5u );
	float dRow = min( uv.y - row.y, row.z - uv.y ) * uSize;
	float dSeg = min( uv.x - seg.y, seg.z - uv.x ) * uSize;
	float cut = step( 0.86, enRnd( ivec2( int( seg.x ), r ), 156u ) ) * smoothstep( 0.8, 2.5, min( dRow, dSeg ) );
	rgb = mix( rgb, vec3( 0.19, 0.15, 0.1 ), cut * 0.8 );
	vec3 cross = enBand( uv.x, 3, 0.6, 157u );
	float dCross = min( uv.x - cross.y, cross.z - uv.x ) * uSize;
	float ditch = 1.0 - smoothstep( 0.4, 1.2, min( dRow, dCross ) );
	rgb = mix( rgb, vec3( 0.1, 0.15, 0.13 ), ditch * 0.85 );
	float height = 0.4 + 0.2 * grain + 0.1 * blotch - 0.3 * cut - 0.35 * ditch;
	return EnSample( rgb, mix( 0.93, 0.35, ditch ), height );
}

EnSample enPaint( vec2 uv ) {
	uv = fract( uv );
	if ( uPainter == 0 ) return enStrips( uv );
	if ( uPainter == 1 ) return enLarge( uv );
	if ( uPainter == 2 ) return enMeadow( uv );
	if ( uPainter == 3 ) return enBocage( uv );
	if ( uPainter == 4 ) return enConifer( uv );
	if ( uPainter == 5 ) return enBroadleaf( uv );
	if ( uPainter == 6 ) return enYoung( uv );
	if ( uPainter == 7 ) return enLimestone( uv );
	if ( uPainter == 8 ) return enSchist( uv );
	if ( uPainter == 9 ) return enHeather( uv );
	if ( uPainter == 10 ) return enPasture( uv );
	if ( uPainter == 11 ) return enScree( uv );
	if ( uPainter == 12 ) return enReeds( uv );
	return enPeat( uv );
}

void main() {
	EnSample s = enPaint( vUv );
	if ( uPass == 0 ) {
		gl_FragColor = vec4( clamp( s.rgb, 0.0, 1.0 ), clamp( s.rough, 0.0, 1.0 ) );
	} else {
		// Height in 16 bits over red (high byte) and green (low byte).
		float h = floor( clamp( s.height, 0.0, 1.0 ) * 65535.0 + 0.5 );
		float high = floor( h / 256.0 );
		gl_FragColor = vec4( high / 255.0, ( h - high * 256.0 ) / 255.0, 0.0, 1.0 );
	}
}
`;

export interface BakedVariant {
  /** sRGB albedo, roughness in alpha: size × size × 4 bytes, rows bottom-up (v = 0 first). */
  albedo: Uint8Array;
  /** Height 0..1 per pixel, same layout. */
  height: Float32Array;
}

export interface VariantBake {
  /**
   * Paints every variant (VARIANTS order) and reads it back, then releases
   * the GPU resources. Throws when the painter does not compile — the caller
   * falls back to the classic tiles.
   */
  finish(): BakedVariant[];
}

/**
 * Starts the GPU bake of the variants at size × size: the painter program
 * is handed to the driver at once, so with KHR_parallel_shader_compile it
 * compiles while the CPU paints the classic layers, and `finish` finds it
 * ready. `finish` is synchronous on purpose: the whole paint happens in one
 * task, so a renderer torn down meanwhile (a remount) never sees it half done.
 */
export function startVariantBake(renderer: THREE.WebGLRenderer, size: number): VariantBake {
  const target = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  const material = new THREE.ShaderMaterial({
    name: "terrain-variant-painter",
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uPainter: { value: 0 },
      uPass: { value: 0 },
      uSize: { value: size },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const dispose = (): void => {
    quad.geometry.dispose();
    material.dispose();
    target.dispose();
  };
  if (!renderer.getContext().isContextLost()) renderer.compile(scene, camera);

  return {
    finish() {
      const previousTarget = renderer.getRenderTarget();
      const previousXr = renderer.xr.enabled;
      const previousAutoClear = renderer.autoClear;
      try {
        if (renderer.getContext().isContextLost()) throw new Error("variant painter: context lost");
        renderer.xr.enabled = false;
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        const pixels = new Uint8Array(size * size * 4);
        const baked: BakedVariant[] = [];
        for (const variant of VARIANTS) {
          material.uniforms.uPainter!.value = variant.painter;
          material.uniforms.uPass!.value = 0;
          renderer.render(scene, camera);
          if (baked.length === 0) {
            // The first draw links the program; a painter that fails to
            // compile is reported here (three logs the shader log itself).
            const program = (
              renderer.properties.get(material) as {
                currentProgram?: { diagnostics?: { runnable: boolean } };
              }
            ).currentProgram;
            if (program?.diagnostics && !program.diagnostics.runnable) {
              throw new Error("variant painter: the shader does not compile");
            }
          }
          renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
          const albedo = pixels.slice();
          material.uniforms.uPass!.value = 1;
          renderer.render(scene, camera);
          renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
          const height = new Float32Array(size * size);
          for (let i = 0; i < height.length; i++) {
            height[i] = (pixels[i * 4]! * 256 + pixels[i * 4 + 1]!) / 65535;
          }
          baked.push({ albedo, height });
        }
        return baked;
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.xr.enabled = previousXr;
        renderer.autoClear = previousAutoClear;
        dispose();
      }
    },
  };
}
