// Precipitation (docs/08 §6): a box of points around the camera target —
// rain streaks slanted by the wind, or snowflakes that sway — sized to the
// view so a closeup stands in the weather and the strategic view sees a fine
// drizzle. Ambient motion only: with motion reduced or off nothing is drawn,
// the sky and the fog already carry the weather (docs/08 §4). Positions are
// a function of the frame clock, so a pinned clock gives the same frame.
// The kind follows the air mass and the temperature (docs/08 §6): a warm
// regime never snows, rain starts at ~2 °C. Streaks are short and thin, their
// alpha and density fall with distance from the camera and with the ambient
// daylight, so night dims them below what they cover and a moderate regime
// stays a drizzle instead of a blizzard.

import * as THREE from "three";
import type { Rng } from "../core/prng";
import type { PrecipitationKind } from "../../bridge/worldScene";
import type { Regime } from "./skyState";

export const MAX_PARTICLES = 20_000;

/**
 * The kind the frame is actually drawn with: the engine's, corrected for the
 * regime's air mass. Summer regimes are warm by definition — a staged summer
 * low on a January day must still rain (grid's corridor-golden report), and
 * above ~2 °C rain never turns to flakes.
 */
export function effectivePrecipitationKind(
  kind: PrecipitationKind,
  tempC: number,
  regime: Regime,
): PrecipitationKind {
  if (kind === "none") return "none";
  if (regime === "summerHigh" || regime === "summerLow") return "rain";
  if (tempC >= 2) return "rain";
  if (tempC >= 0.5) return "sleet";
  return "snow";
}

const VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uVelocity;
uniform float uSnow;
uniform float uPixelRatio;
uniform float uSize;
uniform float uDepthRef;
varying float vFade;
varying float vSize;
void main() {
  vec3 p = aSeed.xyz + uVelocity * (uTime + aSeed.w * 37.0);
  if (uSnow > 0.5) {
    p.x += sin(uTime * 0.9 + aSeed.w * 40.0) * 0.012;
    p.z += cos(uTime * 0.7 + aSeed.w * 33.0) * 0.012;
  }
  p = fract(p);
  vec3 world = uBoxMin + p * uBoxSize;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  // Perspective: a flake at the view distance is uSize px, nearer ones grow,
  // farther ones shrink to a fine veil; each particle keeps its own size.
  float depth = max(-mv.z, 1.0);
  float perspective = clamp(uDepthRef / depth, 0.5, 2.2);
  float own = uSnow > 0.5 ? 0.55 + 0.9 * aSeed.w : 0.75 + 0.5 * aSeed.w;
  gl_PointSize = uSize * uPixelRatio * own * perspective;
  vSize = gl_PointSize;
  // Alpha and density fall with depth: the streak field thins out toward the
  // horizon instead of covering the frame with a uniform bright noise.
  float rel = depth / max(uDepthRef, 1.0);
  vFade = (1.0 - smoothstep(0.6, 1.5, rel)) * smoothstep(0.0, 0.06, rel);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec2 uStreak;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSnow;
varying float vFade;
varying float vSize;
void main() {
  // Sub-pixel grains are dust: cull them instead of drawing bright texels.
  float resolvable = smoothstep(1.1, 1.9, vSize);
  if (resolvable < 0.004) discard;
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (uSnow > 0.5) {
    a = smoothstep(0.5, 0.12, length(c));
  } else {
    float along = dot(c, uStreak);
    float across = abs(dot(c, vec2(-uStreak.y, uStreak.x)));
    a = smoothstep(0.1, 0.015, across) * smoothstep(0.3, 0.14, abs(along));
  }
  gl_FragColor = vec4(uColor, a * uOpacity * vFade * resolvable);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const viewVelocity = new THREE.Vector3();
const toward = new THREE.Vector3();
const inverseView = new THREE.Quaternion();

export class Precipitation {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private kind: PrecipitationKind = "none";
  private intensity = 0;
  private tempC = 10;
  private regime: Regime = "transitional";
  private windMs = 0;
  private windFromDeg = 0;
  private detail = 1;

  constructor(rng: Rng) {
    const seeds = new Float32Array(MAX_PARTICLES * 4);
    const positions = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      seeds[i * 4] = rng.next();
      seeds[i * 4 + 1] = rng.next();
      seeds[i * 4 + 2] = rng.next();
      seeds[i * 4 + 3] = rng.next();
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    this.material = new THREE.ShaderMaterial({
      name: "sky-precipitation",
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uBoxMin: { value: new THREE.Vector3() },
        uBoxSize: { value: new THREE.Vector3(1, 1, 1) },
        uVelocity: { value: new THREE.Vector3(0, -0.8, 0) },
        uSnow: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: 6 },
        uDepthRef: { value: 100 },
        uStreak: { value: new THREE.Vector2(0, 1) },
        uColor: { value: new THREE.Color(0.8, 0.85, 0.9) },
        uOpacity: { value: 0.3 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      fog: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "sky-precipitation";
    this.points.frustumCulled = false;
    this.points.renderOrder = 60;
    this.points.visible = false;
  }

  /** Share of the particle budget the tier allows. */
  configure(detail: number): void {
    this.detail = detail;
  }

  setWeather(
    kind: PrecipitationKind,
    intensity: number,
    tempC: number,
    regime: Regime,
    windMs: number,
    windFromDeg: number,
  ): void {
    this.kind = kind;
    this.intensity = intensity;
    this.tempC = tempC;
    this.regime = regime;
    this.windMs = windMs;
    this.windFromDeg = windFromDeg;
  }

  /** Per frame: the box follows the target, the streak follows the wind on screen. */
  frame(
    ambient: boolean,
    time: number,
    daylight: number,
    view: { camera: THREE.PerspectiveCamera; target: THREE.Vector3; distanceKm: number },
    fogColor: THREE.Color,
    pixelRatio: number,
  ): void {
    const kind = effectivePrecipitationKind(this.kind, this.tempC, this.regime);
    const active = ambient && kind !== "none" && this.intensity > 0.02 && this.detail > 0;
    this.points.visible = active;
    if (!active) return;
    const snow = kind === "snow";
    const sleet = kind === "sleet";
    const distance = view.distanceKm;
    const width = Math.min(600, Math.max(30, distance * 1.5));
    const height = Math.min(70, Math.max(10, distance * 0.3));
    const u = this.material.uniforms;
    (u.uBoxMin!.value as THREE.Vector3).set(
      view.target.x - width / 2,
      view.target.y,
      view.target.z - width / 2,
    );
    (u.uBoxSize!.value as THREE.Vector3).set(width, height, width);
    // Fall in box fractions per second; the wind slants it toward where it blows.
    const fall = snow ? 0.18 : sleet ? 0.5 : 0.8;
    const heading = (this.windFromDeg + 180) * (Math.PI / 180);
    toward.set(Math.sin(heading), 0, -Math.cos(heading));
    const slant = fall * Math.min(this.windMs / 12, 1.6) * (height / width) * (snow ? 1.4 : 1);
    (u.uVelocity!.value as THREE.Vector3).set(toward.x * slant, -fall, toward.z * slant);
    u.uTime!.value = time;
    u.uSnow!.value = snow ? 1 : 0;
    u.uPixelRatio!.value = pixelRatio;
    u.uSize!.value = snow ? 3.6 : sleet ? 3.4 : 4;
    u.uDepthRef!.value = distance;
    // The streak direction on screen: the world velocity through the view rotation.
    viewVelocity
      .set(toward.x * slant * width, -fall * height, toward.z * slant * width)
      .applyQuaternion(inverseView.copy(view.camera.quaternion).invert());
    const streak = u.uStreak!.value as THREE.Vector2;
    streak.set(viewVelocity.x, -viewVelocity.y);
    if (streak.lengthSq() < 1e-8) streak.set(0, 1);
    else streak.normalize();
    // Rain is the air's colour; snow is lit from every side and stays white.
    // Both fade with the ambient light: at night precipitation is a darker
    // veil than what it covers, never a bright noise field (res' report).
    const lit = clamp01(daylight);
    const gain = 1 + 0.35 * lit;
    const lift = (snow ? 0.2 : 0.06) * lit;
    (u.uColor!.value as THREE.Color).setRGB(
      Math.min(1, fogColor.r * gain + lift),
      Math.min(1, fogColor.g * gain + lift),
      Math.min(1, fogColor.b * gain + lift + 0.01 * lit),
    );
    const distanceFade = 1 - 0.7 * smoothstep(120, 420, distance);
    u.uOpacity!.value =
      (snow ? 0.5 : sleet ? 0.3 : 0.26) *
      Math.sqrt(this.intensity) *
      distanceFade *
      (0.2 + 0.8 * lit);
    // Density follows the intensity with a curve: a moderate regime is a
    // drizzle, not a curtain, and a far view thins out on top of that.
    const count = Math.round(
      MAX_PARTICLES *
        this.detail *
        (0.12 + 0.88 * Math.pow(this.intensity, 1.6)) *
        (snow ? 0.45 : sleet ? 0.7 : 1) *
        (0.3 + 0.7 * distanceFade),
    );
    this.geometry.setDrawRange(0, Math.max(1, Math.min(MAX_PARTICLES, count)));
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
