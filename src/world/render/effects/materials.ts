// Effects materials (docs/08 §3, ARCHITECTURE.md §9): overlays are diagnosis,
// so every colour here is chosen to stay its own hue through ACES. The grid
// learned this the hard way (grid/PROGRESS.md step 1): ACES' input matrix
// bleeds ~8 % of red into green, so red only stays red near 1,5 and amber
// needs G ≈ 0,25 × R. The alarm radiances below are the grid's, so an alarm
// ring and the overloaded conductor it marks are the same red.
//
// All band shading is patched onto MeshBasicMaterial with `onBeforeCompile`
// (the grid's pattern) rather than a raw ShaderMaterial: tone mapping and the
// colour-space chunks then behave exactly as they do for the built-in
// materials, in both the composer path (OutputPass) and the low tier (direct
// to canvas).
//
// Two kinds of band: a *solid* band (dark underlay + coloured core) is what
// makes a ring readable on snow at noon, where additive light is invisible;
// a *glow* band is the additive night twin. Both share one shader, one vertex
// format and one screen-space width floor.

import * as THREE from "three";

/** Radiances (linear, pre-ACES) shared with the grid's load palette. */
export const EFFECT_COLORS = {
  /** Hover: thin cool white, the one colour no alarm uses. */
  hover: [0.72, 0.82, 0.95] as const,
  /** Dark underlay that keeps every solid band readable on snow at noon. */
  under: [0.02, 0.03, 0.05] as const,
  /** The UI action colour (tokens --en-action #f5a623), the selection accent. */
  accent: [1.15, 0.62, 0.12] as const,
  /** Overload / blackout red (grid LOAD_EMISSIVE.over). */
  alarm: [1.55, 0.04, 0.02] as const,
  /** Warn / curtailment / dump amber (grid LOAD_EMISSIVE.warn). */
  amber: [1.25, 0.31, 0.01] as const,
  /**
   * Dump marker: pale cyan-white, the one warm-reading alarm family is denied
   * to it. Amber means a warn line or a curtailed farm in the legend, so a
   * surplus must not borrow it (critic finding, s3): the shape (chevrons down
   * into the ground) is the marker, the hue only keeps it off the amber keys.
   */
  dump: [0.1, 0.62, 0.85] as const,
  /** A disabled farm: dark cold steel — present, unlit, no state to amplify. */
  disabled: [0.34, 0.37, 0.42] as const,
  /** Border import / storage charge: the UI info cyan (#38bdd8). */
  info: [0.1, 0.62, 0.85] as const,
  /** Storage discharge: warm white, the storage module's own discharge colour. */
  discharge: [1.3, 1.12, 0.82] as const,
} as const;

/** Shared uniforms of the band shader; `sync` keeps the two passes aligned. */
export class BandUniforms {
  readonly solid = {
    uTime: { value: 0 },
    uPxKm: { value: 0.001 },
    uMinPx: { value: 1.0 },
    uPulseAmp: { value: 0 },
    uDaylight: { value: 1 },
    uGlowGain: { value: 1 },
  };
  readonly glow = {
    uTime: { value: 0 },
    uPxKm: { value: 0.001 },
    uMinPx: { value: 1.5 },
    uPulseAmp: { value: 0 },
    uDaylight: { value: 1 },
    uGlowGain: { value: 1 },
  };

  sync(time: number, pxKm: number, pulseAmp: number, daylight: number): void {
    for (const set of [this.solid, this.glow]) {
      set.uTime.value = time;
      set.uPxKm.value = pxKm;
      set.uPulseAmp.value = pulseAmp;
      set.uDaylight.value = daylight;
    }
  }
}

const VERTEX_PARS = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aCentre;
attribute vec4 aParams;
attribute float aPhase;
attribute vec3 aOrigin;
attribute float aClamp;
uniform float uTime;
uniform float uPxKm;
uniform float uMinPx;
uniform float uPulseAmp;
varying vec2 vBandUv;
varying vec4 vBandParams;
varying float vBandPulse;
`;

/**
 * Grows a band to a screen-space minimum half-width around its spine point and
 * computes the 0,5 Hz alarm breath (docs/08 §4: amplitude 30 %, ambient only —
 * `uPulseAmp` is 0 when motion is restricted, and the ring then stays at full
 * brightness: the static twin).
 *
 * Rings also take a screen-space *ceiling* on their radius around `aOrigin`
 * (`aClamp`, px): the hex ring is a strategic-view size, and without the cap an
 * 11 km circle swallows a detail frame and buries the line it marks. Both
 * limits keep the band's own half-width intact, so a capped ring still reads.
 */
const VERTEX_BODY = /* glsl */ `
vBandUv = aUv;
vBandParams = aParams;
{
  vec3 spine = aCentre;
  vec3 offset = transformed - spine;
  float dist = distance(cameraPosition, spine);
  float kmPerPx = uPxKm * dist;
  if (aClamp > 0.0) {
    vec2 radial = transformed.xz - aOrigin.xz;
    float radius = length(radial);
    float maxRadius = kmPerPx * aClamp;
    if (radius > maxRadius && radius > 1e-4) {
      float shrink = maxRadius / radius;
      spine.xz = aOrigin.xz + (spine.xz - aOrigin.xz) * shrink;
      offset *= shrink;
    }
  }
  float halfWidth = length(offset);
  float minHalf = kmPerPx * uMinPx;
  if (halfWidth > 1e-4 && minHalf > halfWidth) {
    offset *= (minHalf / halfWidth);
  }
  transformed = spine + offset;
  transformed.y = spine.y;
}
vBandPulse = 1.0 - uPulseAmp * aParams.w * (0.5 - 0.5 * cos(6.2831853 * uTime * 0.5 + aPhase));
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uTime;
uniform float uDaylight;
uniform float uGlowGain;
varying vec2 vBandUv;
varying vec4 vBandParams;
varying float vBandPulse;
`;

/** Dashes are soft and never fully dark — a gap that vanishes reads as solid at 500 km. */
const DASH_BODY = /* glsl */ `
float enDash = 1.0;
if (vBandParams.y > 0.0) {
  float enPhase = vBandUv.x * vBandParams.y - vBandParams.z * uTime;
  enDash = mix(0.32, 1.0, smoothstep(0.5, 0.44, fract(enPhase)));
}
`;

function patchBand(
  material: THREE.MeshBasicMaterial,
  uniformSet: Record<string, { value: unknown }>,
  glow: boolean,
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniformSet);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
${DASH_BODY}
float enAcross = vBandUv.y;
float enEdge = smoothstep(0.0, ${glow ? "0.45" : "0.2"}, enAcross) *
  smoothstep(1.0, ${glow ? "0.55" : "0.8"}, enAcross);
diffuseColor.a *= vBandParams.x * enEdge * enDash * vBandPulse;
diffuseColor.rgb *= ${glow ? "uGlowGain * vBandPulse * (1.0 - 0.45 * uDaylight)" : "(1.0 + 0.5 * (1.0 - uDaylight))"};`,
      );
  };
  material.customProgramCacheKey = () => `en-effects-band-${glow ? "glow" : "solid"}`;
}

/** The solid band pass: dark underlays and coloured cores, normal blending. */
export function createBandSolidMaterial(uniforms: BandUniforms): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  material.name = "effects-band-solid";
  patchBand(material, uniforms.solid, false);
  return material;
}

/** The additive glow pass: the night twin of every alarm. */
export function createBandGlowMaterial(uniforms: BandUniforms): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  material.name = "effects-band-glow";
  patchBand(material, uniforms.glow, true);
  return material;
}

export interface DashUniforms {
  uTime: { value: number };
  uPxKm: { value: number };
}

/**
 * Flow dashes (docs/08 §3 point 5): instanced quads whose position along their
 * span is computed in the vertex shader from `(aPhase, aSpeed)`, so a frame
 * costs no CPU and two captures of the same URL are identical. The dash is
 * billboarded along its own direction in view space and keeps a screen-space
 * minimum length; motion is a state carrier (motion.stateful) — under BRAK the
 * phase freezes and the same dashes stand still, which is the static twin.
 *
 * Two passes share the instanced geometry: a dark under-dash (the band passes'
 * own trick) and the load-coloured core. Normal blending, not additive — an
 * additive dash vanishes on snow at noon and on the grid's own white conductor
 * at any hour, and the docs demand the flow read at both ends of the day.
 */
export function createDashMaterial(uniforms: DashUniforms, underlay = false): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uPxKm: uniforms.uPxKm,
      uScale: { value: underlay ? 1.5 : 1.0 },
      uUnder: { value: underlay ? 1.0 : 0.0 },
    },
    vertexShader: /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aDir;
attribute vec3 aColor;
attribute vec4 aParams;
uniform float uTime;
uniform float uPxKm;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vQuad;
void main() {
  float t = fract(aParams.x + uTime * aParams.y);
  vec3 p = mix(aFrom, aTo, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = length(mv.xyz);
  float size = max(aParams.z, uPxKm * dist * 2.1) * uScale;
  vec2 dir = (modelViewMatrix * vec4(aDir, 0.0)).xy;
  float dl = length(dir);
  dir = dl > 1e-4 ? dir / dl : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 corner = position.xy;
  mv.xy += dir * (corner.x * size * 3.4) + perp * (corner.y * size);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vQuad = corner;
  vAlpha = aParams.w * (1.0 - 0.5 * abs(corner.y));
}
`,
    fragmentShader: /* glsl */ `
uniform float uTime;
uniform float uPxKm;
uniform float uUnder;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vQuad;
void main() {
  float edge = smoothstep(1.0, ${underlay ? "0.35" : "0.15"}, abs(vQuad.x)) *
    smoothstep(1.0, ${underlay ? "0.4" : "0.2"}, abs(vQuad.y));
  float alpha = vAlpha * edge;
  vec3 tint = mix(vColor, vec3(0.012, 0.016, 0.028), uUnder);
  alpha *= mix(1.0, 0.6, uUnder);
  gl_FragColor = vec4(tint, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  material.name = underlay ? "effects-dash-under" : "effects-dash";
  return material;
}

/**
 * Storage chevrons and waypoint posts: unlit, normal-blended — legible on the
 * gravel pad at noon. One material per colour and one instanced mesh each,
 * because a MeshBasicMaterial does not read `instanceColor` on its own
 * (`color_fragment` only multiplies under `USE_COLOR`, which needs a geometry
 * `color` attribute) — a single-tint mesh is both simpler and cheaper.
 */
export function createUnlitMaterial(
  name: string,
  tint: readonly [number, number, number],
  alpha: number,
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(tint[0], tint[1], tint[2]),
    transparent: true,
    opacity: alpha,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  material.name = name;
  return material;
}

export interface CraneMaterials {
  paint: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  cable: THREE.MeshStandardMaterial;
}

/** Tower-crane PBR (references: Liebherr/Żywiec lattice cranes — yellow paint, weathered steel). */
export function createCraneMaterials(): CraneMaterials {
  const paint = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.82, 0.55, 0.12),
    roughness: 0.62,
    metalness: 0.25,
    emissive: new THREE.Color(0.05, 0.035, 0.008),
  });
  paint.name = "effects-crane-paint";
  const steel = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.3, 0.31, 0.34),
    roughness: 0.7,
    metalness: 0.45,
  });
  steel.name = "effects-crane-steel";
  const cable = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.16, 0.17, 0.19),
    roughness: 0.5,
    metalness: 0.7,
  });
  cable.name = "effects-crane-cable";
  return { paint, steel, cable };
}
