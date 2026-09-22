// The dome (docs/08 §5): a sphere around the camera whose every pixel runs
// the atmosphere model — blue by day, the earth's shadow and the glow of the
// upper air at twilight, a moonlit blue-black by night with a seeded star
// field (no twinkle, a Milky Way band) and sun and moon discs. Overcast
// flattens it to grey, fog swallows its horizon, a haze band whitens the
// horizon under a summer high or an ice haze, and below the horizon it turns
// into the haze the country beyond the board dissolves into. The same
// material renders a small private sphere into a PMREM so PBR surfaces
// reflect the sky they stand under; that happens on update, never per frame.
// The dome is drawn AFTER the opaque geometry at the far plane, so the
// per-pixel scattering only runs where the sky is actually visible.

import * as THREE from "three";
import type { Rng } from "../core/prng";
import { ATMOSPHERE_GLSL, AUREOLE_KNEE } from "./atmosphere";
import type { Lighting, SkyState } from "./skyState";

const DOME_RADIUS_KM = 1000;
const STAR_RADIUS_KM = 985;
const ENV_RADIUS_KM = 50;

const DOME_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  clip.z = clip.w * 0.99999;
  gl_Position = clip;
}
`;

const DOME_FRAGMENT = /* glsl */ `
varying vec3 vWorld;
uniform vec3 uSunDir;
uniform vec3 uScatterSunDir;
uniform float uSunRadiance;
uniform vec3 uMoonDir;
uniform float uMoonRadiance;
uniform float uMie;
uniform float uG;
uniform vec3 uOvercastColor;
uniform float uOvercastMix;
uniform vec3 uFogColor;
uniform float uFogAmount;
uniform float uHazeBand;
uniform vec3 uDistantGround;
uniform float uDiscs;
uniform vec3 uSunDisc;
uniform float uMoonLight;
uniform float uDaylight;
const float AUREOLE_KNEE = ${AUREOLE_KNEE.toFixed(1)};
${ATMOSPHERE_GLSL}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  // Below the horizon the air is what the horizon shows; the ground blend follows.
  vec3 sd = normalize(vec3(dir.x, max(dir.y, 0.004), dir.z));
  vec3 col = scatterLight(sd, uScatterSunDir, uSunRadiance, uMie, uG);
  if (uMoonRadiance > 0.0001) {
    col += scatterLight(sd, uMoonDir, uMoonRadiance, uMie, uG) * MOON_TINT;
  }
  col += AIRGLOW * (0.5 + 0.5 * sd.y);
  // Aureole knee: the forward-scattering peak around a low sun is blinding
  // in radiance; a soft knee keeps it bright but not a flat white sheet, so
  // the disc stays the brightest thing and the bloom does not eat a corner.
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  if (lum > AUREOLE_KNEE) {
    float over = lum - AUREOLE_KNEE;
    col *= (AUREOLE_KNEE + over / (1.0 + over)) / lum;
  }
  // The haze band: a thin whitening at the horizon toward the air's own
  // colour, kept narrow so the blue above it survives a strategic camera
  // that only ever sees the lowest degrees of the sky.
  float band = 1.0 - smoothstep(0.0, 0.12, dir.y);
  col = mix(col, uFogColor * 1.12, uHazeBand * band * 0.4);
  // Overcast: Moon & Spencer's gradient — brightest at the zenith.
  float oc = (1.0 + 2.0 * max(sd.y, 0.0)) / 3.0;
  col = mix(col, uOvercastColor * oc, uOvercastMix);
  if (uDiscs > 0.5) {
    float mu = dot(dir, uSunDir);
    float sunR = cos(radians(1.05));
    float disc = smoothstep(sunR - 0.0006, sunR + 0.0003, mu);
    // Limb darkening: the centre of the disc is the brightest.
    float limb = 0.55 + 0.45 * smoothstep(sunR, 1.0, mu);
    // A low sun is a disc one can look at: single scattering under-dims it
    // (no ozone, no multiple scattering), so the disc and its aureole fade
    // with altitude toward the horizon instead of blooming the whole corner.
    float lowSun = smoothstep(0.0, 0.35, uSunDir.y);
    float discGain = mix(0.05, 1.0, lowSun);
    float glowGain = mix(0.25, 1.0, lowSun);
    float glow = (pow(max(mu, 0.0), 400.0) * 0.35 + pow(max(mu, 0.0), 60.0) * 0.035) * glowGain;
    float sunVis = smoothstep(-0.03, 0.02, uSunDir.y) * (1.0 - uOvercastMix * 0.97);
    col += uSunDisc * (disc * limb * 4.5 * discGain + glow) * sunVis * SUN_RADIANCE * 0.2;
    float mum = dot(dir, uMoonDir);
    float moonR = cos(radians(0.95));
    float mdisc = smoothstep(moonR - 0.0005, moonR + 0.0003, mum);
    float mlimb = 0.7 + 0.3 * smoothstep(moonR, 1.0, mum);
    float moonVis = smoothstep(-0.02, 0.03, uMoonDir.y) * (1.0 - uOvercastMix * 0.95)
      * (0.08 + 0.92 * (1.0 - uDaylight));
    float mglow = pow(max(mum, 0.0), 500.0) * 0.06 + pow(max(mum, 0.0), 80.0) * 0.012;
    col += vec3(0.86, 0.9, 1.0) * (mdisc * mlimb * 1.3 + mglow) * moonVis * (0.35 + 0.65 * uMoonLight);
  }
  float horizon = 1.0 - smoothstep(-0.02, 0.18 + 0.14 * uFogAmount, dir.y);
  col = mix(col, uFogColor, uFogAmount * horizon);
  float below = smoothstep(0.0, -0.22, dir.y);
  col = mix(col, uDistantGround, below);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vSize;
void main() {
  vColor = aColor;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  clip.z = clip.w * 0.99998;
  gl_Position = clip;
  gl_PointSize = aSize * uPixelRatio;
  vSize = gl_PointSize;
}
`;

const STAR_FRAGMENT = /* glsl */ `
uniform float uVisibility;
varying vec3 vColor;
varying float vSize;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  // A star smaller than a pixel is dust: fade it out instead of drawing a
  // single bright texel into the twilight sky.
  float resolvable = smoothstep(0.8, 1.5, vSize);
  float a = smoothstep(1.0, 0.3, d) * uVisibility * resolvable;
  gl_FragColor = vec4(vColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly stars: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly envScene = new THREE.Scene();
  private readonly envMesh: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly starCapacity: number;

  constructor(rng: Rng, starCount: number) {
    this.starCapacity = starCount;
    this.material = new THREE.ShaderMaterial({
      name: "sky-dome",
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uScatterSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunRadiance: { value: 22 },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uMoonRadiance: { value: 0 },
        uMie: { value: 1 },
        uG: { value: 0.78 },
        uOvercastColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
        uOvercastMix: { value: 0 },
        uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
        uFogAmount: { value: 0 },
        uHazeBand: { value: 0.3 },
        uDistantGround: { value: new THREE.Color(0.4, 0.45, 0.5) },
        uDiscs: { value: 1 },
        uSunDisc: { value: new THREE.Color(1, 1, 1) },
        uMoonLight: { value: 0 },
        uDaylight: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const geometry = new THREE.SphereGeometry(DOME_RADIUS_KM, 40, 20);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = "sky-dome";
    // After every opaque object: the far-plane depth test rejects the covered pixels.
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;

    this.starMaterial = new THREE.ShaderMaterial({
      name: "sky-stars",
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: { uVisibility: { value: 0 }, uPixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.stars = new THREE.Points(buildStars(rng, starCount), this.starMaterial);
    this.stars.name = "sky-stars";
    this.stars.renderOrder = 21;
    this.stars.frustumCulled = false;
    this.mesh.add(this.stars);

    this.envMesh = new THREE.Mesh(new THREE.SphereGeometry(ENV_RADIUS_KM, 24, 12), this.material);
    this.envScene.add(this.envMesh);
  }

  /** How many of the seeded stars the tier draws (the brightest come first). */
  configure(starCount: number): void {
    this.stars.geometry.setDrawRange(0, Math.max(0, Math.min(this.starCapacity, starCount)));
  }

  /** Feeds the dome the state and the derived lighting. */
  apply(state: SkyState, lighting: Lighting, fogAmount: number): void {
    const u = this.material.uniforms;
    (u.uSunDir!.value as THREE.Vector3).copy(state.sunDir);
    (u.uScatterSunDir!.value as THREE.Vector3).copy(lighting.scatterSunDir);
    u.uSunRadiance!.value = lighting.sunRadiance;
    (u.uMoonDir!.value as THREE.Vector3).copy(state.moonDir);
    u.uMoonRadiance!.value = lighting.moonRadiance;
    u.uMie!.value = lighting.mie;
    u.uG!.value = lighting.g;
    (u.uOvercastColor!.value as THREE.Color).copy(lighting.overcastColor);
    u.uOvercastMix!.value = lighting.overcastMix;
    (u.uFogColor!.value as THREE.Color).copy(lighting.fogColor);
    u.uFogAmount!.value = fogAmount;
    u.uHazeBand!.value = lighting.hazeBand;
    (u.uDistantGround!.value as THREE.Color).copy(lighting.distantGround);
    (u.uSunDisc!.value as THREE.Color).copy(lighting.sunDiscColor);
    u.uMoonLight!.value = state.moonLight;
    u.uDaylight!.value = state.daylight;
    this.starMaterial.uniforms.uVisibility!.value = lighting.starVisibility;
    this.stars.visible = lighting.starVisibility > 0.002;
  }

  /** The dome rides with the camera so it never clips and never parallaxes. */
  frame(camera: THREE.Camera, pixelRatio: number): void {
    this.mesh.position.copy(camera.position);
    this.starMaterial.uniforms.uPixelRatio!.value = pixelRatio;
  }

  /** Prefilters the current sky into an environment map; the caller owns when. */
  generateEnvironment(renderer: THREE.WebGLRenderer, size: number): THREE.Texture {
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    const discs = this.material.uniforms.uDiscs!;
    discs.value = 0;
    const previous = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.02, 0.1, ENV_RADIUS_KM * 4, { size });
    discs.value = 1;
    previous?.dispose();
    return this.envTarget.texture;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.envMesh.geometry.dispose();
    this.stars.geometry.dispose();
    this.material.dispose();
    this.starMaterial.dispose();
    this.envTarget?.dispose();
    this.envTarget = null;
    this.pmrem?.dispose();
    this.pmrem = null;
  }
}

/**
 * A seeded star field on the upper dome: sizes, a few warm and blue giants,
 * a Milky Way band of faint ones along a tilted great circle, no twinkle.
 * Sorted brightest first, so a lower tier drawing fewer keeps the ones that
 * matter.
 */
function buildStars(rng: Rng, count: number): THREE.BufferGeometry {
  const stars: {
    x: number;
    y: number;
    z: number;
    size: number;
    r: number;
    g: number;
    b: number;
  }[] = [];
  // The band's pole: a fixed tilt so the band arches across the sky.
  const poleTilt = rng.range(0.9, 1.2);
  const poleAz = rng.range(0, Math.PI * 2);
  const pole = new THREE.Vector3(
    Math.cos(poleAz) * Math.sin(poleTilt),
    Math.cos(poleTilt),
    Math.sin(poleAz) * Math.sin(poleTilt),
  );
  const u = new THREE.Vector3(0, 1, 0).cross(pole).normalize();
  const v = new THREE.Vector3().crossVectors(pole, u).normalize();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const inBand = rng.next() < 0.42;
    if (inBand) {
      // Along the great circle with a narrow spread: many, faint.
      const along = rng.range(0, Math.PI * 2);
      const across = rng.normal() * 0.14;
      p.copy(u)
        .multiplyScalar(Math.cos(along))
        .addScaledVector(v, Math.sin(along))
        .multiplyScalar(Math.cos(across))
        .addScaledVector(pole, Math.sin(across));
    } else {
      // Uniform on the sphere above −6°: the ones near the horizon fade in the haze anyway.
      const y = rng.range(-0.1, 1);
      const azimuth = rng.range(0, Math.PI * 2);
      const flat = Math.sqrt(Math.max(0, 1 - y * y));
      p.set(Math.cos(azimuth) * flat, y, Math.sin(azimuth) * flat);
    }
    if (p.y < -0.1) continue;
    // Magnitude distribution: many faint, a few bright; the band is fainter.
    const bright = Math.pow(rng.next(), inBand ? 6 : 4);
    const glow = (inBand ? 0.28 : 0.4) + bright * 1.1;
    const temperature = rng.next();
    const r = temperature < 0.12 ? 1.0 : temperature > 0.8 ? 0.78 : 0.95;
    const g = temperature < 0.12 ? 0.82 : temperature > 0.8 ? 0.86 : 0.95;
    const b = temperature < 0.12 ? 0.6 : 1.0;
    stars.push({
      x: p.x * STAR_RADIUS_KM,
      y: p.y * STAR_RADIUS_KM,
      z: p.z * STAR_RADIUS_KM,
      size: 1.4 + bright * 2.8,
      r: r * glow,
      g: g * glow,
      b: b * glow,
    });
  }
  stars.sort((a, b) => b.size - a.size);
  const positions = new Float32Array(stars.length * 3);
  const sizes = new Float32Array(stars.length);
  const colors = new Float32Array(stars.length * 3);
  stars.forEach((star, i) => {
    positions[i * 3] = star.x;
    positions[i * 3 + 1] = star.y;
    positions[i * 3 + 2] = star.z;
    sizes[i] = star.size;
    colors[i * 3] = star.r;
    colors[i * 3 + 1] = star.g;
    colors[i * 3 + 2] = star.b;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  return geometry;
}
