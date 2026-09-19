// Aviation obstruction lights (docs/08 §3: an off farm has its nacelle lights
// out). One instanced camera-facing glow per turbine — an additive radial
// falloff, never smaller than a few pixels so the red cluster reads from the
// strategic view at night, never larger than a lamp up close. Intensity per
// instance through instanceColor: the module writes the night factor, the
// blink (ambient motion only) and the farm's enabled state into it.
//
// Why red stays red: the bloom pass and ACES both run over the whole frame,
// and ACES bleeds red into green at high radiance (a lesson from render/grid).
// The core radiance is therefore kept moderate and hue-stable, and the halo
// is the sprite's own falloff — no bloom needed.

import * as THREE from "three";

export interface GlowUniforms {
  /** km per pixel at 1 km of distance (the screen-size floor). */
  uMinKm: { value: number };
  /** Minimum on-screen size of the glow [px]. */
  uMinPx: { value: number };
  /** World size of the glow [km]; wins up close. */
  uSizeKm: { value: number };
  uColor: { value: THREE.Color };
}

const VERTEX = /* glsl */ `
uniform float uMinKm;
uniform float uMinPx;
uniform float uSizeKm;
varying vec2 vDisc;
varying vec3 vTint;
#include <fog_pars_vertex>
void main() {
  #ifdef USE_INSTANCING
  vec4 origin = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  #else
  vec4 origin = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  #endif
  #ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
  #else
  vTint = vec3( 1.0 );
  #endif
  vec4 mvPosition = viewMatrix * origin;
  float dist = length( mvPosition.xyz );
  // The lamp sits on the fixture merged into the nacelle: pull the billboard
  // 50 m toward the camera so the fixture never wins the depth test against
  // the lamp's own core pixel (the nacelle is 110 m tall, so nothing else
  // of the machine can hide it either).
  mvPosition.xyz *= max( 0.0, 1.0 - 0.05 / max( dist, 0.1 ) );
  float size = max( uSizeKm, uMinPx * uMinKm * dist );
  mvPosition.xy += position.xy * size;
  vDisc = position.xy * 2.0;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec2 vDisc;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  float r = length( vDisc );
  if ( r > 1.0 ) discard;
  // A flat-topped lamp (solid to 30 % of the radius) with a soft skirt: the
  // red blob a night photograph of a wind farm shows, never a pin-prick.
  float core = 1.0 - smoothstep( 0.3, 0.85, r );
  float halo = ( 1.0 - r ) * ( 1.0 - r );
  vec3 color = uColor * vTint * ( core * 1.0 + halo * 0.8 );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    // A lamp is a point source: haze dims it far less than it dims a surface,
    // and a farm's lights are the one thing a dispatcher sees through it.
    color *= 1.0 - 0.5 * fogFactor;
  #endif
  gl_FragColor = vec4( color, 1.0 );
}`;

export function createGlowMaterial(): { material: THREE.ShaderMaterial; uniforms: GlowUniforms } {
  const own: Record<string, THREE.IUniform> = {
    uMinKm: { value: 0 },
    uMinPx: { value: 7 },
    uSizeKm: { value: 0.06 },
    uColor: { value: new THREE.Color(2.0, 0.06, 0.02) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, own]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = "res-aviation-glow";
  // UniformsUtils.merge clones the values; hand back the live ones.
  const live = material.uniforms as unknown as GlowUniforms;
  return { material, uniforms: live };
}

/** A unit quad the vertex shader expands around the instance origin. */
export function glowGeometry(): THREE.BufferGeometry {
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.deleteAttribute("normal");
  quad.deleteAttribute("uv");
  return quad;
}

// --- rotor disc ------------------------------------------------------------------

export interface DiscUniforms {
  /** Colour of the swept disc — daylight white, night grey (set per frame). */
  uColor: { value: THREE.Color };
}

const DISC_VERTEX = /* glsl */ `
varying float vRadius;
varying float vStrength;
#include <fog_pars_vertex>
void main() {
  #ifdef USE_INSTANCING_COLOR
  vStrength = instanceColor.r;
  #else
  vStrength = 1.0;
  #endif
  vRadius = length( uv * 2.0 - 1.0 );
  #ifdef USE_INSTANCING
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  #else
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  #endif
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const DISC_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vRadius;
varying float vStrength;
#include <fog_pars_fragment>
void main() {
  float r = vRadius;
  // Denser toward the hub (three chords sweep a smaller circle), a faint tip
  // ring, a soft outer edge: the long-exposure look of a running rotor.
  float body = mix( 1.0, 0.4, r );
  float ring = smoothstep( 0.84, 0.96, r ) * ( 1.0 - smoothstep( 0.96, 1.0, r ) );
  float edge = 1.0 - smoothstep( 0.965, 1.0, r );
  float alpha = vStrength * ( 0.5 * body + 0.45 * ring ) * edge;
  vec3 color = uColor;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    color = mix( color, fogColor, fogFactor );
    alpha *= 1.0 - 0.8 * fogFactor;
  #endif
  gl_FragColor = vec4( color, alpha );
}`;

/**
 * The static twin of a spinning rotor (docs/08 §4): a translucent swept
 * disc whose density follows the rotor speed (instanceColor.r), drawn only
 * for spinning turbines, so a frozen frame still says "this farm runs".
 */
export function createDiscMaterial(): { material: THREE.ShaderMaterial; uniforms: DiscUniforms } {
  const own: Record<string, THREE.IUniform> = {
    uColor: { value: new THREE.Color(0.9, 0.92, 0.95) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, own]),
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  material.name = "res-rotor-disc";
  const live = material.uniforms as unknown as DiscUniforms;
  return { material, uniforms: live };
}
