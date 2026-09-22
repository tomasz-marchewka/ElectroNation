// Materials for render/storage (docs/08 §2, §3): PBR throughout, every texture
// procedural. Three custom programs:
//
// - **basin** — the pumped reservoir's inner face. The drawdown band is drawn
//   by world Y, not by geometry: below the water line the rock is dark and
//   submerged, between the water line and the full mark pale wet rock (the
//   band a dispatcher reads), above it dry stone. Two uniforms move with SOC,
//   so the level change is a uniform write, never a rebuild.
// - **water** — the reservoir and tailrace surface, the terrain water's look
//   at small scale: teal-to-navy tint, two scrolling wave normals, a Fresnel
//   sky term, wind direction from the turn's weather; `uCalm` flattens it.
// - **night sheen** — a faint up-facing emissive on structures after dusk
//   (the mass plants/cities keep); shared uniform, per-material factor.
//
// Lamp cores and glows are billboards: a hard unlit core plus an additive
// halo, per-instance colour, never smaller than a few pixels, so the SOC bar
// reads from the strategic view. Colours are chosen to stay hue-stable under
// ACES (render/grid's lesson): moderate radiance, the hue carried by the ratio.

import * as THREE from "three";
import type { StorageTextures } from "./textures";

export interface NightSheen {
  value: number;
}

export interface StorageMaterials {
  concrete: THREE.MeshStandardMaterial;
  rockFill: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  container: THREE.MeshStandardMaterial;
  vent: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  fence: THREE.MeshStandardMaterial;
  /** The SOC bar's near-black housing — the dark run the lit share reads on. */
  bar: THREE.MeshStandardMaterial;
  /** The dam crest road: asphalt. */
  road: THREE.MeshStandardMaterial;
  lamp: THREE.ShaderMaterial;
  lampGlow: THREE.ShaderMaterial;
  beacon: THREE.ShaderMaterial;
  yardGlow: THREE.ShaderMaterial;
  window: THREE.MeshStandardMaterial;
  sheen: NightSheen;
  dispose(): void;
}

/** Standard material with the shared night sheen: `factor` sets its strength. */
function sheenMaterial(
  material: THREE.MeshStandardMaterial,
  sheen: NightSheen,
  factor: number,
  key: string,
): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSheen = sheen;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uSheen;`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uSheen * ${factor.toFixed(3)};`,
      );
  };
  material.customProgramCacheKey = () => key;
  return material;
}

export function createStorageMaterials(textures: StorageTextures): StorageMaterials {
  const sheen: NightSheen = { value: 0 };

  const concrete = sheenMaterial(
    new THREE.MeshStandardMaterial({
      map: textures.concrete,
      normalMap: textures.concreteNormal,
      color: 0xe9e7e2,
      roughness: 0.88,
      metalness: 0,
      // Swept concrete works (crest, spillway chute, outfall) are open shells:
      // two-sided keeps every face lit whichever way a strip winds.
      side: THREE.DoubleSide,
    }),
    sheen,
    0.55,
    "en-storage-concrete",
  );
  concrete.name = "storage:concrete";

  const rockFill = sheenMaterial(
    new THREE.MeshStandardMaterial({
      map: textures.rockFill,
      normalMap: textures.rockFillNormal,
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
    }),
    sheen,
    0.45,
    "en-storage-rockfill",
  );
  rockFill.name = "storage:rock-fill";

  const gravel = sheenMaterial(
    new THREE.MeshStandardMaterial({
      map: textures.gravel,
      normalMap: textures.gravelNormal,
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
    }),
    sheen,
    1.0,
    "en-storage-gravel",
  );
  gravel.name = "storage:gravel";

  const container = sheenMaterial(
    new THREE.MeshStandardMaterial({
      map: textures.containerPaint,
      normalMap: textures.containerNormal,
      color: 0xffffff,
      roughness: 0.52,
      metalness: 0.22,
    }),
    sheen,
    0.7,
    "en-storage-container",
  );
  container.name = "storage:container";

  const vent = new THREE.MeshStandardMaterial({
    map: textures.vent,
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.15,
  });
  vent.name = "storage:vent";

  const steel = sheenMaterial(
    new THREE.MeshStandardMaterial({
      map: textures.steel,
      normalMap: textures.steelNormal,
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.72,
    }),
    sheen,
    0.5,
    "en-storage-steel",
  );
  steel.name = "storage:steel";

  const fence = new THREE.MeshStandardMaterial({
    map: textures.steel,
    color: 0x9aa0a4,
    roughness: 0.6,
    metalness: 0.5,
    transparent: true,
    opacity: 0.9,
  });
  fence.name = "storage:fence";

  // The SOC bar housing: near-black and matte, so the lit run is the only
  // bright thing on the row at noon (the daylight read of the state of charge).
  const bar = new THREE.MeshStandardMaterial({
    color: 0x14181c,
    roughness: 0.78,
    metalness: 0.3,
    normalMap: textures.steelNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  bar.name = "storage:bar";

  // The crest road: asphalt on the dam crown.
  const road = new THREE.MeshStandardMaterial({
    map: textures.gravel,
    normalMap: textures.gravelNormal,
    color: 0x7c8288,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  road.name = "storage:road";

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a0e12,
    roughness: 0.18,
    metalness: 0.75,
    emissive: new THREE.Color(1.5, 1.26, 0.98),
  });
  windowMaterial.name = "storage:window";
  windowMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float enGlow;\nvarying float vEnGlow;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEnGlow = enGlow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vEnGlow;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vEnGlow;",
      );
  };
  windowMaterial.customProgramCacheKey = () => "en-storage-window";

  const lamp = createLampCoreMaterial();
  const lampGlow = createLampGlowMaterial(3.9);
  const beacon = createLampGlowMaterial(3.4);
  const yardGlow = createGroundGlowMaterial();

  return {
    concrete,
    rockFill,
    gravel,
    container,
    vent,
    steel,
    fence,
    bar,
    road,
    lamp,
    lampGlow,
    beacon,
    yardGlow,
    window: windowMaterial,
    sheen,
    dispose() {
      for (const material of [
        concrete,
        rockFill,
        gravel,
        container,
        vent,
        steel,
        fence,
        bar,
        road,
        lamp,
        lampGlow,
        beacon,
        yardGlow,
        windowMaterial,
      ]) {
        material.dispose();
      }
    },
  };
}

// --- lamp billboards ---------------------------------------------------------

export interface LampUniforms {
  /** km per pixel at 1 km of distance (the screen-size floor). */
  uMinKm: { value: number };
  /** Minimum on-screen size of the quad [px]. */
  uMinPx: { value: number };
  /** World size of the quad [km]; wins up close. */
  uSizeKm: { value: number };
}

const LAMP_VERTEX = /* glsl */ `
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
  // Pull the billboard toward the camera so the fixture it marks never wins
  // the depth test against the lamp's own core pixel.
  mvPosition.xyz *= max( 0.0, 1.0 - 0.12 / max( dist, 0.1 ) );
  float size = max( uSizeKm, uMinPx * uMinKm * dist );
  mvPosition.xy += position.xy * size;
  vDisc = position.xy * 2.0;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const LAMP_CORE_FRAGMENT = /* glsl */ `
varying vec2 vDisc;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  float r = length( vDisc );
  if ( r > 1.0 ) discard;
  // A lens: a solid lit face to 55 % of the radius, then the dark housing rim
  // that separates the lit run from the unlit one at any distance.
  float core = 1.0 - smoothstep( 0.55, 0.82, r );
  vec3 color = vTint * core + vec3( 0.012 ) * ( 1.0 - core );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    color *= 1.0 - 0.35 * fogFactor;
  #endif
  gl_FragColor = vec4( color, 1.0 );
}`;

function createLampCoreMaterial(): THREE.ShaderMaterial {
  const uniforms: LampUniforms = {
    uMinKm: { value: 0 },
    uMinPx: { value: 2.9 },
    uSizeKm: { value: 0.032 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      uniforms as unknown as Record<string, THREE.IUniform>,
    ]),
    vertexShader: LAMP_VERTEX,
    fragmentShader: LAMP_CORE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = "storage:lamp-core";
  return material;
}

const LAMP_GLOW_FRAGMENT = /* glsl */ `
uniform float uMinPx;
varying vec2 vDisc;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  float r = length( vDisc );
  if ( r > 1.0 ) discard;
  // A halo around the lens: the strategic read of a lit unit. The flat top
  // keeps the hue at the centre instead of washing out to white.
  float core = 1.0 - smoothstep( 0.12, 0.55, r );
  float halo = ( 1.0 - r ) * ( 1.0 - r );
  vec3 color = vTint * ( core * 0.85 + halo * 0.75 );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    color *= 1.0 - 0.4 * fogFactor;
  #endif
  gl_FragColor = vec4( color, 1.0 );
}`;

function createLampGlowMaterial(minPx: number): THREE.ShaderMaterial {
  const uniforms: LampUniforms = {
    uMinKm: { value: 0 },
    uMinPx: { value: minPx },
    uSizeKm: { value: 0.05 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      uniforms as unknown as Record<string, THREE.IUniform>,
    ]),
    vertexShader: LAMP_VERTEX,
    fragmentShader: LAMP_GLOW_FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = `storage:lamp-glow-${minPx}`;
  return material;
}

/** Live uniforms of a lamp material (Utils.merge clones plain values). */
export function lampUniforms(material: THREE.ShaderMaterial): LampUniforms {
  return material.uniforms as unknown as LampUniforms;
}

// --- ground glow pools -------------------------------------------------------

/** Additive pools of light on the ground under the floodlight masts. */
function createGroundGlowMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uColor: { value: new THREE.Color(1, 1, 1) } },
    ]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
        vTint = instanceColor;
        #else
        vTint = vec3( 1.0 );
        #endif
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_fragment>
      void main() {
        float r = length( vUv * 2.0 - 1.0 );
        float pool = ( 1.0 - smoothstep( 0.0, 1.0, r ) );
        pool *= pool;
        vec3 color = uColor * vTint * pool * 0.5;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          color *= 1.0 - fogFactor;
        #endif
        gl_FragColor = vec4( color, 1.0 );
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = "storage:yard-glow";
  return material;
}

// --- pumped storage: basin, water, foam, swirl ------------------------------

export interface BasinUniforms {
  /** World Y of the water surface this frame [km]. */
  uWaterY: { value: number };
  /** World Y of the full mark [km]. */
  uFullY: { value: number };
}

/**
 * The inner basin face: submerged rock darkens, the drawdown band between the
 * water line and the full mark turns pale wet rock, freeboard stays dry.
 */
export function createBasinMaterial(
  textures: StorageTextures,
  sheen: NightSheen,
): { material: THREE.MeshStandardMaterial; uniforms: BasinUniforms } {
  const uniforms: BasinUniforms = { uWaterY: { value: 0 }, uFullY: { value: 1 } };
  const material = new THREE.MeshStandardMaterial({
    map: textures.basinRock,
    normalMap: textures.basinNormal,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.05,
  });
  material.name = "storage:basin";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterY = uniforms.uWaterY;
    shader.uniforms.uFullY = uniforms.uFullY;
    shader.uniforms.uSheen = sheen;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vEnWorldY;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvEnWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uWaterY;\nuniform float uFullY;\nuniform float uSheen;\nvarying float vEnWorldY;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float enLum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
        float enWet = smoothstep( uWaterY + 0.03, uWaterY - 0.03, vEnWorldY );
        float enBand = enWet * ( 1.0 - smoothstep( uFullY - 0.04, uFullY + 0.04, vEnWorldY ) );
        // Submerged: darker and cooler — the water tint over rock.
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.3, 0.38, 0.44 ), enWet );
        // The drawdown band: pale wet stone, the ring that says "not full".
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.9, 0.87, 0.8 ) * ( 0.4 + 0.85 * enLum ), enBand );
        totalEmissiveRadiance += diffuseColor.rgb * uSheen * 0.4;
        // The band is the level gauge: it keeps a faint glow after dusk so the
        // reservoir's state still reads when the sun is gone.
        totalEmissiveRadiance += vec3( 0.42, 0.4, 0.36 ) * enBand * uSheen * 3.0;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        float enGloss = smoothstep( uWaterY + 0.03, uWaterY - 0.03, vEnWorldY ) * ( 1.0 - smoothstep( uFullY - 0.04, uFullY + 0.04, vEnWorldY ) );
        roughnessFactor = mix( roughnessFactor, 0.42, enGloss * 0.7 );`,
      );
  };
  material.customProgramCacheKey = () => "en-storage-basin";
  return { material, uniforms };
}

export interface WaterUniforms {
  uTime: { value: number };
  /** x, z = direction the water drifts TOWARD; z (third) = wind strength 0..1. */
  uWind: { value: THREE.Vector4 };
  uSkyColor: { value: THREE.Color };
  uHasEnv: { value: number };
  /** 0 calm … 1 wind-roughened. */
  uCalm: { value: number };
  /** 0 far … 1 close: gates the fine chop. */
  uFar: { value: number };
  uDeep: { value: THREE.Color };
  uShallow: { value: THREE.Color };
  /** 1 fades the surface out toward its rim (small ponds), 0 keeps it hard. */
  uEdgeFade: { value: number };
}

/**
 * The reservoir/tailrace surface — the terrain water's look at small scale:
 * depth-tinted teal, two scrolling wave normals, Fresnel sky term.
 */
export function createReservoirWater(textures: StorageTextures): {
  material: THREE.MeshStandardMaterial;
  uniforms: WaterUniforms;
} {
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector4(0, 1, 0.3) },
    uSkyColor: { value: new THREE.Color(0.55, 0.7, 0.95) },
    uHasEnv: { value: 0 },
    uCalm: { value: 1 },
    uFar: { value: 1 },
    uShallow: { value: new THREE.Color(0.1, 0.34, 0.36) },
    uDeep: { value: new THREE.Color(0.02, 0.1, 0.22) },
    uEdgeFade: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    normalMap: textures.waterNormal,
    normalScale: new THREE.Vector2(1.2, 1.2),
  });
  material.name = "storage:water";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: uniforms.uTime,
      uWind: uniforms.uWind,
      uSkyColor: uniforms.uSkyColor,
      uHasEnv: uniforms.uHasEnv,
      uCalm: uniforms.uCalm,
      uFar: uniforms.uFar,
      uShallow: uniforms.uShallow,
      uDeep: uniforms.uDeep,
      uEdgeFade: uniforms.uEdgeFade,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vEnWorldPos;\nvarying vec2 vEnUv;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvEnWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvEnUv = uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform vec4 uWind;
        uniform vec3 uSkyColor;
        uniform float uHasEnv;
        uniform float uCalm;
        uniform float uFar;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform float uEdgeFade;
        varying vec3 vEnWorldPos;
        varying vec2 vEnUv;`,
      )
      .replace(
        "#include <map_fragment>",
        `diffuseColor.rgb = mix( uDeep, uShallow, 0.65 );
        float enRim = length( vEnUv * 2.0 - 1.0 );
        diffuseColor.a = 0.94 * mix( 1.0, 1.0 - smoothstep( 0.55, 0.98, enRim ), uEdgeFade );`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `{
          vec2 enP = vEnWorldPos.xz;
          vec2 enDir = normalize( uWind.xy + vec2( 0.001, 0.0 ) );
          float enSpeed = 0.25 + 0.75 * uWind.z;
          float enAmp = ( 0.1 + 0.5 * uWind.z ) * mix( 0.25, 1.0, uCalm );
          vec3 enWaves = texture2D( normalMap, enP / 2.6 + enDir * uTime * 0.01 * enSpeed ).xyz * 2.0 - 1.0;
          float enChop = 0.0;
          if ( uFar > 0.55 ) {
            enChop = ( texture2D( normalMap, enP / 1.1 - enDir * uTime * 0.016 * enSpeed ).x * 2.0 - 1.0 );
          }
          vec3 enTn = normalize( vec3( ( enWaves.xy + enChop * 0.6 ) * enAmp, 1.0 ) );
          vec3 enWorldN = normalize( vec3( enTn.x, enTn.z, enTn.y ) );
          normal = normalize( ( viewMatrix * vec4( enWorldN, 0.0 ) ).xyz );
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor = mix( 0.32, 0.1, uCalm );",
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        if ( uHasEnv < 0.5 ) {
          float enCos = clamp( dot( normal, geometryViewDir ), 0.0, 1.0 );
          float enFresnel = 0.03 + 0.97 * pow( 1.0 - enCos, 5.0 );
          reflectedLight.indirectSpecular += enFresnel * uSkyColor;
        }`,
      );
  };
  material.customProgramCacheKey = () => "en-storage-water";
  return { material, uniforms };
}

/** White water at the tailrace during discharge. */
export function createFoamMaterial(textures: StorageTextures): {
  material: THREE.ShaderMaterial;
  uniforms: { uTime: { value: number }; uStrength: { value: number } };
} {
  const uniforms = { uTime: { value: 0 }, uStrength: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      uniforms,
      { uFoam: { value: textures.foam } },
    ]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFoam;
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float r = length( uv );
        if ( r > 1.0 || uStrength < 0.01 ) discard;
        float lace = texture2D( uFoam, vUv * 3.0 + vec2( 0.0, uTime * 0.03 ) ).r;
        float edge = 1.0 - smoothstep( 0.25, 1.0, r );
        float alpha = uStrength * edge * smoothstep( 0.28, 0.75, lace ) * 0.9;
        vec3 color = mix( vec3( 0.52, 0.6, 0.62 ), vec3( 0.88 ), lace );
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          color = mix( color, fogColor, fogFactor * 0.5 );
        #endif
        gl_FragColor = vec4( color, alpha );
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const live = material.uniforms as unknown as {
    uTime: { value: number };
    uStrength: { value: number };
  };
  material.name = "storage:foam";
  return { material, uniforms: live };
}

/** Dark swirl/ripples at the intake while pumping. */
export function createSwirlMaterial(): {
  material: THREE.ShaderMaterial;
  uniforms: { uTime: { value: number }; uStrength: { value: number }; uDark: { value: number } };
} {
  const uniforms = { uTime: { value: 0 }, uStrength: { value: 0 }, uDark: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      uniform float uDark;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float r = length( uv );
        if ( r > 1.0 || uStrength < 0.01 ) discard;
        float phase = r * 14.0 - uTime * 0.9;
        float ring = 0.5 + 0.5 * sin( phase );
        float edge = 1.0 - smoothstep( 0.5, 1.0, r );
        float fades = smoothstep( 0.05, 0.35, r ) * edge * ( 1.0 - r );
        vec3 dark = vec3( 0.015, 0.045, 0.055 );
        vec3 color = mix( vec3( 0.5, 0.6, 0.62 ), dark, uDark );
        float alpha = uStrength * fades * ( 0.35 + 0.5 * ring );
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          color = mix( color, fogColor, fogFactor );
        #endif
        gl_FragColor = vec4( color, alpha );
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = "storage:swirl";
  const live = material.uniforms as unknown as {
    uTime: { value: number };
    uStrength: { value: number };
    uDark: { value: number };
  };
  return { material, uniforms: live };
}

/** A unit quad the lamp shaders expand around the instance origin. */
export function lampQuadGeometry(): THREE.BufferGeometry {
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.deleteAttribute("normal");
  quad.deleteAttribute("uv");
  return quad;
}

/** A unit disc for foam / swirl decals, uv 0..1 across the disc. */
export function discGeometry(): THREE.BufferGeometry {
  return new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
}
