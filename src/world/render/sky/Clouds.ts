// The cloud layer (docs/08 §6): a plane at ~8 km over the board and a wide
// margin with an FBM coverage field — coverage from the turn's cloud cover,
// cells, lumps and edges from the regime, lit by the sun as heaps seen from
// above (bright tops toward the sun, the heap toward the sun shading the one
// behind it, a silver lining through the thin edges), drifting with the wind.
// Every camera preset sits above the layer, so the veil's opacity is capped:
// clouds must never cost the read of the map under them (docs/08 §3); a
// camera that dives under the layer sees the darker bases instead.
//
// The same coverage function is rendered into a small texture the terrain
// multiplies its sunlight by — cloud shadows that match the clouds above them,
// drift included, displaced away from the sun by the layer's altitude. The
// field is PERIODIC at CLOUD_PERIOD_KM (every octave repeats an integer
// number of times), so the tiled shadow texture never shows a seam; the
// texture is sampled as `(world.xz − offset) / sizeKm`, offset = drift −
// sun projection, exactly the way render/terrain samples it.

import * as THREE from "three";
import { proceduralTexture, type NoiseField } from "../core/textures";
import type { Lighting, SkyState } from "./skyState";

/** Period of the coverage field [km]; the shadow texture tiles with it. */
export const CLOUD_PERIOD_KM = 640;
export const CLOUD_ALTITUDE_KM = 8;
export const HIGH_LAYER_ALTITUDE_KM = 11.5;
const PLANE_KM = 2400;
const FADE_RADIUS_KM = 1100;
const SHADOW_TEXTURE_SIZE = 512;
/** Cloud drift in world km per second per m/s of wind — slow, continuous (docs/08 §4). */
const DRIFT_KM_PER_S_PER_MS = 0.12;
/** The upper layer rides the faster winds aloft. */
const HIGH_LAYER_WIND = 1.7;
/** Pseudo height of a cumulus heap [km] — sets how far the heap toward the sun shades this one. */
const HEAP_KM = 2.2;
/** How far the shadow of the layer may be displaced from the cloud [km] (a 10° sun). */
const MAX_SHADOW_REACH_KM = 45;

const COVERAGE_GLSL = /* glsl */ `
uniform sampler2D uNoise;
uniform float uPeriod;
uniform vec2 uDrift;
uniform float uCover;
uniform float uSoft;
uniform float uCells;
uniform float uWarp;
uniform float uDetailPhase;

// Every octave repeats an integer number of times per period: the field tiles.
float cloudField(vec2 world) {
  vec2 p = (world - uDrift) / uPeriod;
  float k = uCells;
  vec2 warp = (texture2D(uNoise, p * k * 2.0 + vec2(0.31, 0.77)).rg - 0.5) * (uWarp * 0.09);
  float a = texture2D(uNoise, (p + warp) * k).r;
  float b = texture2D(uNoise, (p + warp * 0.6) * k * 3.0 + vec2(0.37, 0.11)).g;
  float c = texture2D(uNoise, (p + warp * 0.3) * k * 8.0 + vec2(0.71, 0.53) + uDetailPhase).g;
  float d = texture2D(uNoise, p * k * 23.0 + vec2(0.13, 0.91)).g;
  float n = 0.55 * a + 0.25 * b + 0.13 * c + 0.07 * d;
  return clamp(0.5 + (n - 0.5) * 1.8, 0.0, 1.0);
}
// cover 0 → nothing passes even the soft edge; cover 1 → everything is cloud.
float cloudThreshold() { return (1.0 + uSoft) - uCover * (1.02 + 2.0 * uSoft); }
float cloudAlpha(float n) {
  float th = cloudThreshold();
  return smoothstep(th - uSoft, th + uSoft, n);
}
// 0 at the edge of a cloud, 1 in its thick core.
float cloudDepth(float n) {
  float th = cloudThreshold();
  return smoothstep(th, th + 0.5, n);
}
`;

const LAYER_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const LAYER_FRAGMENT = /* glsl */ `
varying vec3 vWorld;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uDark;
uniform float uCap;
uniform float uRelief;
uniform float uAltitude;
uniform float uHeap;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFadeRadius;
uniform vec2 uCenter;
uniform float uLit;
${COVERAGE_GLSL}
void main() {
  vec2 w = vWorld.xz;
  float n = cloudField(w);
  float a = cloudAlpha(n);
  if (a < 0.004) discard;
  float depth = cloudDepth(n);
  vec3 V = normalize(cameraPosition - vWorld);
  float above = smoothstep(-1.5, 1.5, cameraPosition.y - uAltitude);
  vec3 col;
  if (uLit > 0.5) {
    // The tops as a height field: normals from the thickness, heaps shading heaps.
    float e = 2.5;
    float hx = cloudDepth(cloudField(w + vec2(e, 0.0))) - cloudDepth(cloudField(w - vec2(e, 0.0)));
    float hz = cloudDepth(cloudField(w + vec2(0.0, e))) - cloudDepth(cloudField(w - vec2(0.0, e)));
    vec3 N = normalize(vec3(-hx * uRelief * 4.0, 1.0, -hz * uRelief * 4.0));
    vec2 toSun = uSunDir.xz / max(uSunDir.y, 0.12) * uHeap;
    float taller = cloudDepth(cloudField(w + toSun)) - depth;
    float shade = 1.0 - 0.65 * smoothstep(0.0, 0.45, taller) * uRelief;
    float ndl = max(dot(N, uSunDir), 0.0);
    vec3 topLit = uSunColor * (0.5 * ndl + 0.06 * max(uSunDir.y, 0.0)) * shade;
    vec3 topAmb = uSkyColor * (0.85 + 0.35 * N.y);
    vec3 top = (topLit + topAmb) * (1.0 - uDark * 0.5 * depth);
    // The bases, seen from under the layer: sky and ground bounce, the sun through the thin parts.
    vec3 base = (uSkyColor * 0.7 + uGroundColor * 0.3
      + uSunColor * 0.1 * max(uSunDir.y, 0.0) * (1.0 - depth)) * (1.0 - uDark * 0.75 * depth);
    col = mix(base, top, above);
    // Silver lining: forward scattering through the thin edges toward the sun.
    float forward = pow(max(dot(-V, uSunDir), 0.0), 6.0);
    col += uSunColor * forward * 0.2 * (1.0 - depth);
  } else {
    col = (uSkyColor * 1.1 + uSunColor * 0.4 * max(uSunDir.y, 0.0)) * (1.0 - uDark * 0.5 * depth);
  }
  float dist = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fogF);
  float radial = 1.0 - smoothstep(uFadeRadius * 0.6, uFadeRadius, length(w - uCenter));
  float alpha = a * (0.55 + 0.45 * depth) * uCap * radial;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SHADOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
varying vec2 vUv;
${COVERAGE_GLSL}
void main() {
  vec2 w = vUv * uPeriod;
  float n = cloudField(w);
  float a = cloudAlpha(n);
  float shade = 1.0 - a * (0.5 + 0.5 * cloudDepth(n)) * 0.95;
  gl_FragColor = vec4(vec3(shade), 1.0);
}
`;

/** Rank-normalises a noise field so its values are uniform in [0, 1). */
function rankMap(field: NoiseField, lattice: number): (value: number) => number {
  const samples: number[] = [];
  const n = 96;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) samples.push(field.at((x / n) * lattice, (y / n) * lattice));
  }
  samples.sort((a, b) => a - b);
  return (value) => {
    let lo = 0;
    let hi = samples.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((samples[mid] ?? 0) < value) lo = mid + 1;
      else hi = mid;
    }
    return lo / samples.length;
  };
}

function cloudNoiseTexture(): THREE.DataTexture {
  let ranks: { a: (v: number) => number; b: (v: number) => number } | null = null;
  return proceduralTexture({
    name: "sky:cloud-noise",
    size: 256,
    colorSpace: THREE.NoColorSpace,
    fields: {
      a: { lattice: 4, octaves: 5 },
      b: { lattice: 8, octaves: 4 },
    },
    pixel(u, v, fields) {
      const a = fields.a!;
      const b = fields.b!;
      if (!ranks) ranks = { a: rankMap(a, 4), b: rankMap(b, 8) };
      return [ranks.a(a.at(u * 4, v * 4)), ranks.b(b.at(u * 8, v * 8)), 0.5];
    },
  });
}

interface LayerLook {
  altitudeKm: number;
  coverScale: number;
  cellScale: number;
  soft: number | null;
  capScale: number;
  darkScale: number;
  reliefScale: number;
}

const LOW_LAYER: LayerLook = {
  altitudeKm: CLOUD_ALTITUDE_KM,
  coverScale: 1,
  cellScale: 1,
  soft: null,
  capScale: 1,
  darkScale: 1,
  reliefScale: 1,
};
const HIGH_LAYER: LayerLook = {
  altitudeKm: HIGH_LAYER_ALTITUDE_KM,
  coverScale: 0.6,
  cellScale: 2.6,
  soft: 0.32,
  capScale: 0.4,
  darkScale: 0,
  reliefScale: 0.2,
};

function layerMaterial(noise: THREE.Texture, altitudeKm: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "sky-clouds",
    vertexShader: LAYER_VERTEX,
    fragmentShader: LAYER_FRAGMENT,
    uniforms: {
      uNoise: { value: noise },
      uPeriod: { value: CLOUD_PERIOD_KM },
      uDrift: { value: new THREE.Vector2() },
      uCover: { value: 0 },
      uSoft: { value: 0.15 },
      uCells: { value: 10 },
      uWarp: { value: 0.5 },
      uDetailPhase: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uSkyColor: { value: new THREE.Vector3(0.5, 0.6, 0.8) },
      uGroundColor: { value: new THREE.Vector3(0.2, 0.2, 0.18) },
      uDark: { value: 0 },
      uCap: { value: 0.5 },
      uRelief: { value: 1 },
      uAltitude: { value: altitudeKm },
      uHeap: { value: HEAP_KM },
      uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
      uFogDensity: { value: 0 },
      uFadeRadius: { value: FADE_RADIUS_KM },
      uCenter: { value: new THREE.Vector2() },
      uLit: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/** Integer repetitions of the base cell per period — what keeps the field tileable. */
function cellsFor(cellKm: number): number {
  return Math.max(2, Math.round(CLOUD_PERIOD_KM / Math.max(8, cellKm)));
}

const projection = new THREE.Vector2();

export class CloudLayers {
  readonly group = new THREE.Group();
  /** Displacement of the low layer's pattern [km] — the wind has carried it this far. */
  readonly drift = new THREE.Vector2();
  readonly shadowTexture: THREE.Texture;
  private readonly highDrift = new THREE.Vector2();
  private readonly noise: THREE.DataTexture;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly low: THREE.Mesh;
  private readonly lowMaterial: THREE.ShaderMaterial;
  private readonly high: THREE.Mesh;
  private readonly highMaterial: THREE.ShaderMaterial;
  private readonly shadowTarget: THREE.WebGLRenderTarget;
  private readonly shadowScene = new THREE.Scene();
  private readonly shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly shadowMaterial: THREE.ShaderMaterial;
  private readonly shadowQuad: THREE.Mesh;
  private centre = new THREE.Vector2();
  private highLayerAmount = 0;
  private detailPhase = 0;

  constructor() {
    this.noise = cloudNoiseTexture();
    this.geometry = new THREE.PlaneGeometry(PLANE_KM, PLANE_KM, 1, 1);
    this.geometry.rotateX(-Math.PI / 2);
    this.lowMaterial = layerMaterial(this.noise, LOW_LAYER.altitudeKm);
    this.low = new THREE.Mesh(this.geometry, this.lowMaterial);
    this.low.name = "sky-clouds-low";
    this.low.renderOrder = 50;
    this.low.frustumCulled = false;
    this.highMaterial = layerMaterial(this.noise, HIGH_LAYER.altitudeKm);
    this.high = new THREE.Mesh(this.geometry, this.highMaterial);
    this.high.name = "sky-clouds-high";
    this.high.renderOrder = 51;
    this.high.frustumCulled = false;
    this.high.visible = false;
    this.group.add(this.low, this.high);

    this.shadowTarget = new THREE.WebGLRenderTarget(SHADOW_TEXTURE_SIZE, SHADOW_TEXTURE_SIZE, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.shadowTarget.texture.name = "sky:cloud-shadow";
    this.shadowTarget.texture.wrapS = THREE.RepeatWrapping;
    this.shadowTarget.texture.wrapT = THREE.RepeatWrapping;
    this.shadowTexture = this.shadowTarget.texture;
    this.shadowMaterial = new THREE.ShaderMaterial({
      name: "sky-cloud-shadow",
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      uniforms: {
        uNoise: { value: this.noise },
        uPeriod: { value: CLOUD_PERIOD_KM },
        uDrift: { value: new THREE.Vector2() },
        uCover: { value: 0 },
        uSoft: { value: 0.15 },
        uCells: { value: 10 },
        uWarp: { value: 0.5 },
        uDetailPhase: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.shadowQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.shadowMaterial);
    this.shadowQuad.frustumCulled = false;
    this.shadowScene.add(this.shadowQuad);
  }

  /** Where the board is: the plane and the radial fade centre on it. */
  setBoard(centreX: number, centreZ: number): void {
    this.centre.set(centreX, centreZ);
    this.low.position.set(centreX, LOW_LAYER.altitudeKm, centreZ);
    this.high.position.set(centreX, HIGH_LAYER.altitudeKm, centreZ);
    (this.lowMaterial.uniforms.uCenter!.value as THREE.Vector2).copy(this.centre);
    (this.highMaterial.uniforms.uCenter!.value as THREE.Vector2).copy(this.centre);
  }

  /** Two layers with lit relief on high, one flat-lit layer on low. */
  configure(layers: 1 | 2, lit: boolean): void {
    this.high.visible = layers === 2;
    this.lowMaterial.uniforms.uLit!.value = lit ? 1 : 0;
    this.highMaterial.uniforms.uLit!.value = lit ? 1 : 0;
  }

  /** Coverage and look from the state; light from the derived lighting. */
  apply(state: SkyState, lighting: Lighting, fogDensity: number, distanceKm: number): void {
    this.highLayerAmount = state.look.highLayer;
    this.applyLayer(this.lowMaterial, LOW_LAYER, state, lighting, fogDensity, distanceKm);
    this.applyLayer(this.highMaterial, HIGH_LAYER, state, lighting, fogDensity, distanceKm);
    const s = this.shadowMaterial.uniforms;
    s.uCover!.value = state.cloudCover;
    s.uSoft!.value = state.look.soft;
    s.uCells!.value = cellsFor(state.look.cellKm);
    s.uWarp!.value = state.look.warp;
    s.uDetailPhase!.value = this.detailPhase;
  }

  private applyLayer(
    material: THREE.ShaderMaterial,
    layer: LayerLook,
    state: SkyState,
    lighting: Lighting,
    fogDensity: number,
    distanceKm: number,
  ): void {
    const u = material.uniforms;
    const high = layer === HIGH_LAYER;
    const cover = Math.min(
      1,
      state.cloudCover * layer.coverScale * (high ? this.highLayerAmount : 1),
    );
    u.uCover!.value = cover;
    u.uSoft!.value = layer.soft ?? state.look.soft;
    u.uCells!.value = cellsFor(state.look.cellKm * layer.cellScale);
    u.uWarp!.value = state.look.warp * (high ? 0.3 : 1);
    u.uDetailPhase!.value = this.detailPhase;
    (u.uDrift!.value as THREE.Vector2).copy(high ? this.highDrift : this.drift);
    (u.uSunDir!.value as THREE.Vector3).copy(lighting.sunLightDir);
    (u.uSunColor!.value as THREE.Vector3).set(
      lighting.sunColor.r * lighting.sunIntensity,
      lighting.sunColor.g * lighting.sunIntensity,
      lighting.sunColor.b * lighting.sunIntensity,
    );
    (u.uSkyColor!.value as THREE.Vector3).set(
      lighting.skyColor.r,
      lighting.skyColor.g,
      lighting.skyColor.b,
    );
    (u.uGroundColor!.value as THREE.Vector3).set(
      lighting.groundColor.r,
      lighting.groundColor.g,
      lighting.groundColor.b,
    );
    u.uDark!.value = state.look.dark * layer.darkScale;
    u.uRelief!.value = state.look.relief * layer.reliefScale;
    // A solid sheet must not hide the country: the veil's ceiling falls with
    // the coverage and thins as the camera climbs (readable at strategic).
    const sheet = 1 - 0.55 * smoothstep(0.45, 0.95, state.cloudCover);
    // At strategic distance the heaps would sit between the camera and the
    // board: the shadows carry the weather there, the veil steps well back (docs/08 §3).
    const viewCap = 1 - 0.7 * smoothstep(60, 300, distanceKm);
    u.uCap!.value = state.look.cap * layer.capScale * sheet * viewCap;
    (u.uFogColor!.value as THREE.Color).copy(lighting.fogColor);
    u.uFogDensity!.value = fogDensity;
  }

  /** Per-frame: the drift with the wind (ambient motion only) and the gust flicker of the detail. */
  advance(dt: number, state: SkyState): void {
    if (dt <= 0) return;
    const toward = (state.windFromDeg + 180) * (Math.PI / 180);
    const speed = state.windMs * DRIFT_KM_PER_S_PER_MS * dt;
    const dx = Math.sin(toward) * speed;
    const dz = -Math.cos(toward) * speed;
    // The pattern is sampled at world − drift: moving the drift with the wind moves the clouds with it.
    this.drift.x += dx;
    this.drift.y += dz;
    this.highDrift.x += dx * HIGH_LAYER_WIND;
    this.highDrift.y += dz * HIGH_LAYER_WIND;
    // Kept within one period so the numbers never grow past float precision.
    this.drift.x %= CLOUD_PERIOD_KM;
    this.drift.y %= CLOUD_PERIOD_KM;
    this.highDrift.x %= CLOUD_PERIOD_KM;
    this.highDrift.y %= CLOUD_PERIOD_KM;
    this.detailPhase += dt * 0.004 * state.gustiness;
    (this.lowMaterial.uniforms.uDrift!.value as THREE.Vector2).copy(this.drift);
    (this.highMaterial.uniforms.uDrift!.value as THREE.Vector2).copy(this.highDrift);
    this.lowMaterial.uniforms.uDetailPhase!.value = this.detailPhase;
    this.highMaterial.uniforms.uDetailPhase!.value = this.detailPhase;
  }

  /**
   * Where the terrain finds the shadow of the cloud above it: the drift, minus
   * the displacement of a shadow cast from the layer's altitude by a sun in
   * `sunLightDir` — sample the shadow texture at `(world.xz − out) / period`.
   */
  shadowOffset(sunLightDir: THREE.Vector3, out: THREE.Vector2): THREE.Vector2 {
    projection
      .set(sunLightDir.x, sunLightDir.z)
      .multiplyScalar(CLOUD_ALTITUDE_KM / Math.max(sunLightDir.y, 0.02));
    const reach = projection.length();
    if (reach > MAX_SHADOW_REACH_KM) projection.multiplyScalar(MAX_SHADOW_REACH_KM / reach);
    return out.copy(this.drift).sub(projection);
  }

  /** Renders the coverage into the shadow texture (1 = lit, 0 = shadowed) at drift 0. */
  renderShadow(renderer: THREE.WebGLRenderer): void {
    const previousTarget = renderer.getRenderTarget();
    const previousXr = renderer.xr.enabled;
    const previousAutoClear = renderer.autoClear;
    renderer.xr.enabled = false;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.shadowTarget);
    renderer.render(this.shadowScene, this.shadowCamera);
    renderer.setRenderTarget(previousTarget);
    renderer.xr.enabled = previousXr;
    renderer.autoClear = previousAutoClear;
  }

  dispose(): void {
    this.geometry.dispose();
    this.lowMaterial.dispose();
    this.highMaterial.dispose();
    this.shadowMaterial.dispose();
    this.shadowQuad.geometry.dispose();
    this.shadowTarget.dispose();
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
