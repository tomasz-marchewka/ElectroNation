// Materials of the nodes layer (ARCHITECTURE.md §14: everything procedural).
// PBR throughout: hot-dip galvanised steel with its spangle, porcelain and
// toughened glass insulators under a wet sheen, weathered concrete, gravel and
// chain-link. Two shader materials carry the night and flow reads the way the
// res layer does it — additive, hue-stable emission that never has to pass
// through a luminance bloom (a red or cyan that tone-maps to salmon is a
// failed read; see render/grid/PROGRESS.md).

import * as THREE from "three";
import { normalMapFromHeight, proceduralTexture } from "../core/textures";

// --- textures ----------------------------------------------------------------

/** Hot-dip galvanising: a cool grey ground with a crystalline spangle. */
function galvanisedAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "nodes:galvanised",
    size: 128,
    fields: {
      spangle: { lattice: 16, octaves: 3 },
      patch: { lattice: 4, octaves: 2 },
      grime: { lattice: 8, octaves: 2 },
    },
    pixel(u, v, fields) {
      const spangle = fields.spangle!.at(u * 16, v * 16);
      const patch = fields.patch!.at(u * 4, v * 4);
      const grime = fields.grime!.at(u * 8, v * 8);
      // Bright enough that a snowfield does not swallow the yard, dark enough
      // that galvanising still reads as cool grey metal (step-1 capture: the
      // 0,44 ground turned the whole switchyard into a black blotch).
      const k = 0.58 + 0.15 * (spangle - 0.5) + 0.1 * (patch - 0.5) - 0.11 * grime;
      return [k, k * 1.015, k * 1.04];
    },
  });
}

function galvanisedNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "nodes:galvanised-normal",
    64,
    (u, v, fields) => 0.4 * (fields.spangle!.at(u * 16, v * 16) - 0.5),
    { spangle: { lattice: 16, octaves: 3 } },
    0.8,
  );
}

/** Concrete: pale grey, vertical rain streaks, a formwork seam every panel. */
function concreteAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "nodes:concrete",
    size: 128,
    fields: {
      grain: { lattice: 12, octaves: 3 },
      streak: { lattice: 6, octaves: 2 },
      stain: { lattice: 3, octaves: 2 },
    },
    pixel(u, v, fields) {
      const grain = fields.grain!.at(u * 12, v * 12);
      const streak = fields.streak!.at(u * 12, v * 2);
      const stain = fields.stain!.at(u * 3, v * 3);
      const seam = Math.abs(((v * 4) % 1) - 0.5) < 0.02 ? 1 : 0;
      const k = 0.74 + 0.08 * (grain - 0.5) - 0.14 * streak * (0.5 + 0.5 * stain) - 0.12 * seam;
      return [k, k * 0.995, k * 0.96];
    },
  });
}

function concreteNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "nodes:concrete-normal",
    64,
    (u, v, fields) => 0.5 * (fields.grain!.at(u * 12, v * 12) - 0.5),
    { grain: { lattice: 12, octaves: 3 } },
    1.1,
  );
}

/** Compacted gravel of a switchyard pad: grey stones over dark fines. */
function gravelAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "nodes:gravel",
    size: 128,
    fields: {
      stone: { lattice: 32, octaves: 2 },
      tone: { lattice: 6, octaves: 2 },
    },
    pixel(u, v, fields) {
      const stone = fields.stone!.at(u * 32, v * 32);
      const tone = fields.tone!.at(u * 6, v * 6);
      // Compacted ballast in daylight is a mid grey, not an oil slick — the
      // darker fines live in the gaps only (0,28–0,66 before the tint).
      const k = 0.28 + 0.38 * stone * stone + 0.06 * (tone - 0.5);
      return [k, k * 0.98, k * 0.94];
    },
  });
}

function gravelNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "nodes:gravel-normal",
    128,
    (u, v, fields) => fields.stone!.at(u * 32, v * 32),
    { stone: { lattice: 32, octaves: 2 } },
    2.4,
  );
}

/** Painted steel cladding: flat panels with a faint seam grid and grime foot. */
function paintedAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "nodes:painted",
    size: 128,
    fields: { grain: { lattice: 8, octaves: 2 }, grime: { lattice: 4, octaves: 2 } },
    pixel(u, v, fields) {
      const grain = fields.grain!.at(u * 8, v * 8);
      const grime = fields.grime!.at(u * 4, v * 4);
      const seamU = Math.abs(((u * 6) % 1) - 0.5) < 0.015 ? 1 : 0;
      const seamV = Math.abs(((v * 4) % 1) - 0.5) < 0.02 ? 1 : 0;
      const foot = Math.max(0, 0.06 - v) / 0.06;
      const k = 0.82 + 0.05 * (grain - 0.5) - 0.1 * Math.max(seamU, seamV) - 0.12 * foot * grime;
      return [k, k * 1.01, k * 1.02];
    },
  });
}

/**
 * A band of control-building windows: panes in a dark frame, a couple of them
 * dimmer so the night read looks staffed rather than printed. The map is
 * neutral — the module's instance colour decides lit (warm) or dark glass.
 */
function windowAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "nodes:window",
    size: 64,
    pixel(u, v) {
      const col = Math.floor(u * 6);
      const row = Math.floor(v * 2);
      const fu = (u * 6) % 1;
      const fv = (v * 2) % 1;
      const mullion = fu < 0.14 || fv < 0.24 || fu > 0.86 || fv > 0.76;
      const k = mullion ? 0.24 : ((col * 7 + row * 13) % 5 === 0 ? 0.62 : 1) * 0.96;
      return [k, k, k];
    },
  });
}

/** Cleared ground of a construction site: raw soil, tyre ruts, pale spoil. */
function earthAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "nodes:earth",
    size: 128,
    fields: { soil: { lattice: 10, octaves: 3 }, rut: { lattice: 5, octaves: 2 } },
    pixel(u, v, fields) {
      const soil = fields.soil!.at(u * 10, v * 10);
      const rut = fields.rut!.at(u * 5, v * 3);
      const track = Math.max(0, rut - 0.58) / 0.42;
      const k = 0.42 + 0.2 * soil - 0.16 * track;
      return [k * 1.15, k * 0.92, k * 0.72];
    },
  });
}

function earthNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "nodes:earth-normal",
    64,
    (u, v, fields) => 0.8 * (fields.soil!.at(u * 10, v * 10) - 0.5),
    { soil: { lattice: 10, octaves: 3 } },
    1.6,
  );
}

/** Chain-link wire of a fence panel, mostly open. */
function chainLinkAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "nodes:chain-link",
    size: 32,
    pixel(u, v) {
      const a = Math.abs(((u * 4 + v * 4) % 1) - 0.5);
      const b = Math.abs(((u * 4 - v * 4 + 4) % 1) - 0.5);
      const wire = Math.min(a, b) < 0.075 ? 1 : 0;
      const k = 0.45 + 0.4 * wire;
      return [k, k, k];
    },
  });
}

/**
 * Alpha mask of the chain-link: opaque on the wire, a whisper in the mesh
 * opening, so the fence reads as wire up close and its mip average still
 * draws a line at the detail camera (the res layer's trick).
 */
function chainLinkAlpha(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const a = Math.abs(((u * 4 + v * 4) % 1) - 0.5);
      const b = Math.abs(((u * 4 - v * 4 + 4) % 1) - 0.5);
      const wire = Math.min(a, b) < 0.075;
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = Math.round((wire ? 0.95 : 0.08) * 255);
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// --- material set ---------------------------------------------------------------

export interface NodeMaterials {
  /** Galvanised lattice: gantries, breakers' frames, masts, foreign towers. */
  steel: THREE.MeshStandardMaterial;
  /** Porcelain and glass insulators — a wet sheen, near-white. */
  porcelain: THREE.MeshStandardMaterial;
  /** Foundations, plinths, cable troughs. */
  concrete: THREE.MeshStandardMaterial;
  /** Switchyard gravel pad. */
  gravel: THREE.MeshStandardMaterial;
  /** Painted cladding of halls and control buildings. */
  painted: THREE.MeshStandardMaterial;
  /** Lit panes of a control building (unlit; the module paints day/night). */
  window: THREE.MeshBasicMaterial;
  /** Chain-link fence panels (alpha-mapped). */
  fence: THREE.MeshStandardMaterial;
  /** Cleared earth of a construction site. */
  earth: THREE.MeshStandardMaterial;
  /** Steel of the future object's skeleton — a colder shop primer. */
  primer: THREE.MeshStandardMaterial;
  /** Scaffold tubes and couplings — bright zinc, almost silver. */
  zinc: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createNodeMaterials(): NodeMaterials {
  const steel = new THREE.MeshStandardMaterial({
    map: galvanisedAlbedo(),
    normalMap: galvanisedNormal(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    vertexColors: true,
    roughness: 0.5,
    // Kept dielectric enough to answer a low winter sun without an env map:
    // at high metalness the lattice went to near-black against the snow.
    metalness: 0.38,
  });
  steel.name = "nodes-steel";

  const porcelain = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.24,
    metalness: 0.04,
    envMapIntensity: 1.15,
  });
  porcelain.name = "nodes-porcelain";

  const concrete = new THREE.MeshStandardMaterial({
    map: concreteAlbedo(),
    normalMap: concreteNormal(),
    normalScale: new THREE.Vector2(0.3, 0.3),
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
  });
  concrete.name = "nodes-concrete";

  const gravel = new THREE.MeshStandardMaterial({
    map: gravelAlbedo(),
    normalMap: gravelNormal(),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.98,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  gravel.name = "nodes-gravel";

  const painted = new THREE.MeshStandardMaterial({
    map: paintedAlbedo(),
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.18,
  });
  painted.name = "nodes-painted";

  // Windows are unlit quads: the module writes the whole colour per instance
  // (dark glass by day, warm panes at night, hue-stable under ACES because no
  // light path touches it).
  const window = new THREE.MeshBasicMaterial({
    map: windowAlbedo(),
    color: new THREE.Color(1, 1, 1),
    toneMapped: true,
  });
  window.name = "nodes-window";

  const fence = new THREE.MeshStandardMaterial({
    map: chainLinkAlbedo(),
    alphaMap: chainLinkAlpha(),
    color: new THREE.Color(0.66, 0.68, 0.7),
    roughness: 0.5,
    metalness: 0.5,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  fence.name = "nodes-fence";

  const earth = new THREE.MeshStandardMaterial({
    map: earthAlbedo(),
    normalMap: earthNormal(),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  earth.name = "nodes-earth";

  const primer = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.4,
  });
  primer.name = "nodes-primer";

  const zinc = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    metalness: 0.72,
  });
  zinc.name = "nodes-zinc";

  return {
    steel,
    porcelain,
    concrete,
    gravel,
    painted,
    window,
    fence,
    earth,
    primer,
    zinc,
    dispose() {
      for (const material of [
        steel,
        porcelain,
        concrete,
        gravel,
        painted,
        window,
        fence,
        earth,
        primer,
        zinc,
      ]) {
        material.dispose();
      }
    },
  };
}

// --- emission ------------------------------------------------------------------

/** A unit quad the glow vertex shader expands around the instance origin. */
export function glowGeometry(): THREE.BufferGeometry {
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.deleteAttribute("normal");
  quad.deleteAttribute("uv");
  return quad;
}

/** A unit quad for the ground light pools — kept UVs: the shader reads them. */
export function poolGeometry(): THREE.BufferGeometry {
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.deleteAttribute("normal");
  return quad;
}

const GLOW_VERTEX = /* glsl */ `
uniform float uMinKm;
uniform float uMinPx;
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
  float scale = length( instanceMatrix[ 0 ].xyz );
  float size = max( scale, uMinPx * uMinKm * dist );
  mvPosition.xy += position.xy * size;
  vDisc = position.xy * 2.0;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec2 vDisc;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  float r = length( vDisc );
  if ( r > 1.0 ) discard;
  float core = 1.0 - smoothstep( 0.25, 0.8, r );
  float halo = ( 1.0 - r ) * ( 1.0 - r );
  vec3 color = vTint * ( core + halo * 0.7 );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    color *= 1.0 - 0.5 * fogFactor;
  #endif
  gl_FragColor = vec4( color, 1.0 );
}`;

export interface GlowUniforms {
  uMinKm: { value: number };
  uMinPx: { value: number };
}

/**
 * Point lights of the layer (floodlight lamps, obstruction lights, the border
 * flow): one additive billboard per lamp, colour AND intensity written into
 * instanceColor by the module, so the whole layer costs one draw call and no
 * frame ever depends on bloom for a state to read.
 */
export function createGlowMaterial(): { material: THREE.ShaderMaterial; uniforms: GlowUniforms } {
  const own: Record<string, THREE.IUniform> = {
    uMinKm: { value: 0 },
    uMinPx: { value: 6 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, own]),
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = "nodes-glow";
  const live = material.uniforms as unknown as GlowUniforms;
  return { material, uniforms: live };
}

const POOL_VERTEX = /* glsl */ `
varying vec2 vDisc;
varying vec3 vTint;
#include <fog_pars_vertex>
void main() {
  #ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
  #else
  vTint = vec3( 1.0 );
  #endif
  vDisc = uv * 2.0 - 1.0;
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const POOL_FRAGMENT = /* glsl */ `
varying vec2 vDisc;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  float r = length( vDisc );
  if ( r > 1.0 ) discard;
  float alpha = ( 1.0 - r ) * ( 1.0 - r );
  gl_FragColor = vec4( vTint * alpha, alpha );
}`;

/**
 * A floodlight's pool on the ground: one horizontal quad per lamp, additive,
 * its tint the lamp's own colour times the module's night factor.
 */
export function createPoolMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = "nodes-light-pool";
  return material;
}
