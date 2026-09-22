// One atmosphere for the GPU and the CPU (docs/08 §5): a single-scattering
// model of a spherical planet — Rayleigh for the blue, Mie for the haze and
// the aureole, a soft planet shadow so twilight lights the upper air while the
// ground is already in the earth's shadow. The dome shader evaluates it per
// pixel; the light rig evaluates the SAME maths here for the sun colour, the
// sky ambient and the horizon (fog) colour, so the lights can never disagree
// with the sky they stand under. Units: km, +Y up, radiance in the scene's
// linear units (a noon zenith lands near 0,45 in the blue channel).

import * as THREE from "three";

export const PLANET_RADIUS_KM = 6371;
export const ATMOSPHERE_TOP_KM = 6471;
export const RAYLEIGH_SCALE_KM = 8;
export const MIE_SCALE_KM = 1.2;
/** Rayleigh scattering per km for the (r, g, b) primaries. */
export const BETA_RAYLEIGH: readonly [number, number, number] = [5.8e-3, 13.5e-3, 33.1e-3];
/** Mie scattering per km at a turbidity factor of 1. */
export const BETA_MIE = 21e-3;
/**
 * Half-width of the planet's terminator [km] as the scattering sees it: a
 * soft earth shadow that keeps the upper air glowing through civil twilight
 * (the multiple scattering a single-scattering model cannot produce).
 */
export const TWILIGHT_SOFT_KM = 16;
/** Height of the eye above the ground for the dome [km]. */
export const OBSERVER_KM = 0.2;
/** Radiance scale of the sun in the model's units. */
export const SUN_RADIANCE = 22;
/** Dome radiance above which the aureole is soft-clipped (shader and CPU twin alike). */
export const AUREOLE_KNEE = 1.2;
/** Moon radiance relative to the sun at full phase — bright enough to shape a night sky. */
export const MOON_RADIANCE_RATIO = 0.0025;
/** Moonlight reads cool: the tint of the moon's scattering term. */
export const MOON_TINT: readonly [number, number, number] = [0.72, 0.84, 1.0];
/** Airglow floor of the night dome — a dark blue-black, never pure black. */
export const AIRGLOW: readonly [number, number, number] = [0.0012, 0.0016, 0.0034];

const VIEW_SAMPLES = 12;
const LIGHT_SAMPLES = 4;

/** The GLSL twin of the functions below; identical constants and sampling. */
export const ATMOSPHERE_GLSL = /* glsl */ `
#define PI 3.141592653589793
const float R_PLANET = ${PLANET_RADIUS_KM.toFixed(1)};
const float R_ATMOS = ${ATMOSPHERE_TOP_KM.toFixed(1)};
const float H_R = ${RAYLEIGH_SCALE_KM.toFixed(1)};
const float H_M = ${MIE_SCALE_KM.toFixed(2)};
const vec3 BETA_R = vec3(${BETA_RAYLEIGH[0]}, ${BETA_RAYLEIGH[1]}, ${BETA_RAYLEIGH[2]});
const float BETA_M = ${BETA_MIE};
const float OBSERVER_KM = ${OBSERVER_KM};
const float TWILIGHT_SOFT_KM = ${TWILIGHT_SOFT_KM.toFixed(1)};
const float SUN_RADIANCE = ${SUN_RADIANCE.toFixed(1)};
const vec3 MOON_TINT = vec3(${MOON_TINT[0]}, ${MOON_TINT[1]}, ${MOON_TINT[2]});
const vec3 AIRGLOW = vec3(${AIRGLOW[0]}, ${AIRGLOW[1]}, ${AIRGLOW[2]});
const int VIEW_SAMPLES = ${VIEW_SAMPLES};
const int LIGHT_SAMPLES = ${LIGHT_SAMPLES};

vec2 raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(1e9, -1e9);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

// 1 when the light ray from p clears the planet; the terminator is softened
// over TWILIGHT_SOFT_KM to stand in for the multiple scattering a single-
// scattering model lacks — without it civil twilight (−6°…0°) is black.
float planetLit(vec3 p, vec3 l) {
  float b = dot(p, l);
  if (b >= 0.0) return 1.0;
  float d2 = dot(p, p) - b * b;
  return smoothstep(R_PLANET - TWILIGHT_SOFT_KM, R_PLANET + TWILIGHT_SOFT_KM, sqrt(max(d2, 0.0)));
}

vec2 lightDepth(vec3 p, vec3 l) {
  float tEnd = raySphere(p, l, R_ATMOS).y;
  float odR = 0.0;
  float odM = 0.0;
  float prev = 0.0;
  for (int j = 1; j <= LIGHT_SAMPLES; j++) {
    float f = float(j) / float(LIGHT_SAMPLES);
    float t = tEnd * f * f;
    float ds = t - prev;
    vec3 q = p + l * (prev + ds * 0.5);
    float h = max(length(q) - R_PLANET, 0.0);
    odR += exp(-h / H_R) * ds;
    odM += exp(-h / H_M) * ds;
    prev = t;
  }
  return vec2(odR, odM);
}

// In-scattered radiance along dir from a light in direction l.
vec3 scatterLight(vec3 dir, vec3 l, float intensity, float mie, float g) {
  vec3 o = vec3(0.0, R_PLANET + OBSERVER_KM, 0.0);
  float tEnd = raySphere(o, dir, R_ATMOS).y;
  vec2 tp = raySphere(o, dir, R_PLANET);
  if (tp.x > 0.0) tEnd = min(tEnd, tp.x);
  float mu = dot(dir, l);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = g * g;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu))
    / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
  float odR = 0.0;
  float odM = 0.0;
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float prev = 0.0;
  for (int i = 1; i <= VIEW_SAMPLES; i++) {
    float f = float(i) / float(VIEW_SAMPLES);
    float t = tEnd * f * f;
    float ds = t - prev;
    vec3 p = o + dir * (prev + ds * 0.5);
    float h = max(length(p) - R_PLANET, 0.0);
    float dR = exp(-h / H_R) * ds;
    float dM = exp(-h / H_M) * ds;
    odR += dR;
    odM += dM;
    float lit = planetLit(p, l);
    if (lit > 0.001) {
      vec2 ld = lightDepth(p, l);
      vec3 tau = BETA_R * (odR + ld.x) + BETA_M * mie * 1.1 * (odM + ld.y);
      vec3 attn = exp(-tau) * lit;
      sumR += dR * attn;
      sumM += dM * attn;
    }
    prev = t;
  }
  return intensity * (sumR * BETA_R * phaseR + sumM * BETA_M * mie * phaseM);
}

// Transmittance from the observer toward l — the colour of a light after the air.
vec3 transmittanceToward(vec3 l, float mie) {
  vec3 o = vec3(0.0, R_PLANET + OBSERVER_KM, 0.0);
  vec2 ld = lightDepth(o, l);
  return exp(-(BETA_R * ld.x + BETA_M * mie * 1.1 * ld.y));
}
`;

// --- the CPU twin -------------------------------------------------------------

const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Vector3();
const origin = new THREE.Vector3(0, PLANET_RADIUS_KM + OBSERVER_KM, 0);

function raySphere(o: THREE.Vector3, d: THREE.Vector3, r: number): [number, number] {
  const b = o.dot(d);
  const c = o.dot(o) - r * r;
  const disc = b * b - c;
  if (disc < 0) return [1e9, -1e9];
  const s = Math.sqrt(disc);
  return [-b - s, -b + s];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function planetLit(p: THREE.Vector3, l: THREE.Vector3): number {
  const b = p.dot(l);
  if (b >= 0) return 1;
  const d2 = p.dot(p) - b * b;
  return smoothstep(
    PLANET_RADIUS_KM - TWILIGHT_SOFT_KM,
    PLANET_RADIUS_KM + TWILIGHT_SOFT_KM,
    Math.sqrt(Math.max(d2, 0)),
  );
}

function lightDepth(p: THREE.Vector3, l: THREE.Vector3): [number, number] {
  const tEnd = raySphere(p, l, ATMOSPHERE_TOP_KM)[1];
  let odR = 0;
  let odM = 0;
  let prev = 0;
  for (let j = 1; j <= LIGHT_SAMPLES; j++) {
    const f = j / LIGHT_SAMPLES;
    const t = tEnd * f * f;
    const ds = t - prev;
    tmpQ
      .copy(l)
      .multiplyScalar(prev + ds * 0.5)
      .add(p);
    const h = Math.max(tmpQ.length() - PLANET_RADIUS_KM, 0);
    odR += Math.exp(-h / RAYLEIGH_SCALE_KM) * ds;
    odM += Math.exp(-h / MIE_SCALE_KM) * ds;
    prev = t;
  }
  return [odR, odM];
}

/**
 * In-scattered radiance along `dir` from a light toward `l` — the shader's
 * `scatterLight`, written into `out` (linear rgb).
 */
export function scatterLight(
  dir: THREE.Vector3,
  l: THREE.Vector3,
  intensity: number,
  mie: number,
  g: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  let tEnd = raySphere(origin, dir, ATMOSPHERE_TOP_KM)[1];
  const tp = raySphere(origin, dir, PLANET_RADIUS_KM);
  if (tp[0] > 0) tEnd = Math.min(tEnd, tp[0]);
  const mu = dir.dot(l);
  const phaseR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g2 = g * g;
  const phaseM =
    ((3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu))) /
    ((2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5));
  let odR = 0;
  let odM = 0;
  let sumR0 = 0;
  let sumR1 = 0;
  let sumR2 = 0;
  let sumM0 = 0;
  let sumM1 = 0;
  let sumM2 = 0;
  let prev = 0;
  const mieExt = BETA_MIE * mie * 1.1;
  for (let i = 1; i <= VIEW_SAMPLES; i++) {
    const f = i / VIEW_SAMPLES;
    const t = tEnd * f * f;
    const ds = t - prev;
    tmpP
      .copy(dir)
      .multiplyScalar(prev + ds * 0.5)
      .add(origin);
    const h = Math.max(tmpP.length() - PLANET_RADIUS_KM, 0);
    const dR = Math.exp(-h / RAYLEIGH_SCALE_KM) * ds;
    const dM = Math.exp(-h / MIE_SCALE_KM) * ds;
    odR += dR;
    odM += dM;
    const lit = planetLit(tmpP, l);
    if (lit > 0.001) {
      const [ldR, ldM] = lightDepth(tmpP, l);
      const a0 = Math.exp(-(BETA_RAYLEIGH[0] * (odR + ldR) + mieExt * (odM + ldM))) * lit;
      const a1 = Math.exp(-(BETA_RAYLEIGH[1] * (odR + ldR) + mieExt * (odM + ldM))) * lit;
      const a2 = Math.exp(-(BETA_RAYLEIGH[2] * (odR + ldR) + mieExt * (odM + ldM))) * lit;
      sumR0 += dR * a0;
      sumR1 += dR * a1;
      sumR2 += dR * a2;
      sumM0 += dM * a0;
      sumM1 += dM * a1;
      sumM2 += dM * a2;
    }
    prev = t;
  }
  const mieScat = BETA_MIE * mie * phaseM;
  return out.set(
    intensity * (sumR0 * BETA_RAYLEIGH[0] * phaseR + sumM0 * mieScat),
    intensity * (sumR1 * BETA_RAYLEIGH[1] * phaseR + sumM1 * mieScat),
    intensity * (sumR2 * BETA_RAYLEIGH[2] * phaseR + sumM2 * mieScat),
  );
}

/** Transmittance from the observer toward `l`: the colour of a light after the air. */
export function transmittanceToward(
  l: THREE.Vector3,
  mie: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const [ldR, ldM] = lightDepth(origin, l);
  const mieExt = BETA_MIE * mie * 1.1;
  return out.set(
    Math.exp(-(BETA_RAYLEIGH[0] * ldR + mieExt * ldM)),
    Math.exp(-(BETA_RAYLEIGH[1] * ldR + mieExt * ldM)),
    Math.exp(-(BETA_RAYLEIGH[2] * ldR + mieExt * ldM)),
  );
}

/** Rec. 709 luminance of a linear rgb triple. */
export function luminance(rgb: { x: number; y: number; z: number }): number {
  return 0.2126 * rgb.x + 0.7152 * rgb.y + 0.0722 * rgb.z;
}
