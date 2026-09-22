// Conductors (docs/08 §3, ARCHITECTURE.md §9): one instanced catenary tube
// per span and phase, whose emissive carries the LOAD — idle: dark metal,
// ok: faint warm white, warn ≥ 75 %: amber, over ≥ 99,5 %: red with a 0,5 Hz
// breath under ambient motion and a static red twin otherwise. Colour codes
// load, silhouette codes type, never mixed.
//
// The tube is a unit catenary (chord from 0 to 1 along x, sag along −y) that
// the instance matrix stretches to the span; its radius is recomputed in the
// vertex shader so a conductor is never thinner than a pixel or so at any
// zoom — at strategic distance the glow is what reads, not the wire.
//
// Why the radiances are modest: the renderer tone-maps with ACES, whose input
// matrix bleeds ~8 % of red into green. A red bright enough to pass the bloom
// threshold (luminance ≥ 1 needs R ≈ 4,7) comes out salmon; red stays red
// only near 1,5 and amber needs G ≈ 0,25 × R. So the wire keeps a hue-stable
// core and warn / over get their halo from a second, wider, additive pass
// (`glow: true`) instead of from bloom.

import * as THREE from "three";
import type { LineLoad } from "../../bridge/worldScene";
import { CONDUCTOR_SAG } from "../core/exaggeration";

/** Per-instance load flag: 0 ok, 1 halo, 2 halo + breath, 3 idle (static twin). */
export const LOAD_FLAG = { none: 0, halo: 1, breath: 2, idle: 3 } as const;

/**
 * The idle twin: a wire that carries nothing still catches the eye as dim
 * cool steel — at night it is the only thing an idle line has, by day it
 * keeps the line off black-on-terrain (a hollow line must be answerable from
 * the strategic view, docs/08 §3).
 */
export const IDLE_EMISSIVE: readonly [number, number, number] = [0.1, 0.13, 0.19];

/** Emissive radiance per load class (r, g, b) and the flag above. */
export const LOAD_EMISSIVE: Record<LineLoad, readonly [number, number, number, number]> = {
  idle: [IDLE_EMISSIVE[0], IDLE_EMISSIVE[1], IDLE_EMISSIVE[2], LOAD_FLAG.idle],
  ok: [0.5, 0.46, 0.4, LOAD_FLAG.none],
  warn: [1.25, 0.31, 0.01, LOAD_FLAG.halo],
  over: [1.55, 0.04, 0.02, LOAD_FLAG.breath],
};

/** docs/08 §4: the overload breath — 0,5 Hz, amplitude 30 %. */
export const BREATH_HZ = 0.5;
export const BREATH_AMPLITUDE = 0.3;

export interface ConductorUniforms {
  uBreath: { value: number };
  /** World radius per km of camera distance — a fixed on-screen width. */
  uPixelRadius: { value: number };
  /** Floor of the world radius [km] at closeup. */
  uMinRadius: { value: number };
  /** Halo brightness relative to the core radiance (glow pass only). */
  uGlowGain: { value: number };
  /**
   * How much of the load radiance survives in full daylight, per class
   * (x idle / ok, y warn, z over). At night all three are 1: the wire is its
   * own light source, the way it reads in night photography. At noon the
   * healthy wire fades back to sun-lit metal (a daylit 0,5 radiance would be
   * a white neon ribbon), while amber and red stay strong — they are alarms.
   */
  uDayScale: { value: THREE.Vector3 };
  /**
   * How much of the idle twin survives in full daylight (1 at night, dimmer at
   * noon): the idle wire must not vanish by day either, but it must stay well
   * below a loaded one.
   */
  uIdleDay: { value: number };
}

/**
 * A unit catenary tube: chord along +x from 0 to 1, sag CONDUCTOR_SAG × chord
 * along −y (a parabola — indistinguishable from the catenary at 8 %), ring
 * of `sides` vertices per station. `enCentre` carries the spine so the shader
 * can re-expand the ring to any radius.
 */
export function catenaryTubeGeometry(
  segments: number,
  sides: number,
  radius: number,
): THREE.BufferGeometry {
  const stations = segments + 1;
  const count = stations * sides;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const centres = new Float32Array(count * 3);
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let i = 0; i < stations; i++) {
    const t = i / segments;
    const cx = t;
    const cy = -4 * CONDUCTOR_SAG * t * (1 - t);
    tangent.set(1, -4 * CONDUCTOR_SAG * (1 - 2 * t), 0).normalize();
    n1.set(-tangent.y, tangent.x, 0);
    for (let j = 0; j < sides; j++) {
      const angle = (2 * Math.PI * j) / sides + Math.PI / sides;
      radial.set(0, 0, Math.sin(angle)).addScaledVector(n1, Math.cos(angle));
      const v = (i * sides + j) * 3;
      positions[v] = cx + radial.x * radius;
      positions[v + 1] = cy + radial.y * radius;
      positions[v + 2] = radial.z * radius;
      normals[v] = radial.x;
      normals[v + 1] = radial.y;
      normals[v + 2] = radial.z;
      centres[v] = cx;
      centres[v + 1] = cy;
      centres[v + 2] = 0;
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("enCentre", new THREE.BufferAttribute(centres, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Vertex code shared by the core and the halo: the screen-space radius. */
const VERTEX_HEADER = `#include <common>
attribute vec3 enCentre;
attribute vec4 enLoad;
attribute float enWidth;
uniform float uPixelRadius;
uniform float uMinRadius;
varying vec4 vEnLoad;`;

const VERTEX_BODY = `#include <begin_vertex>
vEnLoad = enLoad;
#ifdef USE_INSTANCING
vec3 enCentreWorld = ( modelMatrix * instanceMatrix * vec4( enCentre, 1.0 ) ).xyz;
float enScaleY = max( 1e-4, length( instanceMatrix[ 1 ].xyz ) );
float enScaleZ = max( 1e-4, length( instanceMatrix[ 2 ].xyz ) );
float enRadius = max( uMinRadius, distance( cameraPosition, enCentreWorld ) * uPixelRadius ) * enWidth;
transformed = enCentre + vec3( 0.0, normal.y * enRadius / enScaleY, normal.z * enRadius / enScaleZ );
#endif`;

/**
 * Aluminium-steel conductor with the load emissive per instance
 * (`enLoad`: rgb radiance + flag), a screen-space radius and a per-instance
 * width factor (`enWidth` — the far tubes carry the line type in it).
 *
 * The far variant is a stranded ACSR bundle seen from tens of kilometres: a
 * broad, mostly diffuse grey (low metalness) so an idle line reads as a
 * sun-lit wire lying on the ground, never as a black stroke; only its
 * emissive lights up under load.
 */
export function conductorMaterial(
  uniforms: ConductorUniforms,
  cacheKey: "near" | "far",
): THREE.MeshStandardMaterial {
  const far = cacheKey === "far";
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(
      far ? 0.78 : 0.62,
      far ? 0.78 : 0.63,
      far ? 0.78 : 0.65,
      THREE.SRGBColorSpace,
    ),
    // Dielectric enough to catch the sun: at full metalness and no strong
    // environment a daylit stranded conductor reads black on terrain.
    metalness: far ? 0.35 : 0.55,
    roughness: far ? 0.5 : 0.42,
    side: THREE.DoubleSide,
  });
  material.name = `grid-conductor-${cacheKey}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", VERTEX_HEADER)
      .replace("#include <begin_vertex>", VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uBreath;
uniform vec3 uDayScale;
uniform float uIdleDay;
varying vec4 vEnLoad;
vec3 enDayScaled() {
  float scale = vEnLoad.a > 2.5
    ? uIdleDay
    : ( vEnLoad.a < 0.5 ? uDayScale.x : ( vEnLoad.a < 1.5 ? uDayScale.y : uDayScale.z ) );
  return vEnLoad.rgb * scale;
}
float enBreath() {
  return vEnLoad.a > 1.5 && vEnLoad.a < 2.5 ? uBreath : 1.0;
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += enDayScaled() * enBreath();`,
      );
  };
  material.customProgramCacheKey = () => `en-grid-conductor-${cacheKey}`;
  return material;
}

/**
 * The halo of a warn / over conductor: the same tube drawn wider, additive,
 * unfogged, in the load colour — the "bloom" ACES would otherwise turn
 * salmon. Idle and ok instances discard, so the pass costs nothing where a
 * line is healthy.
 */
export function conductorGlowMaterial(
  uniforms: ConductorUniforms,
  cacheKey: string,
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1, 1, 1),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  material.name = `grid-conductor-glow-${cacheKey}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", VERTEX_HEADER)
      .replace("#include <begin_vertex>", VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uBreath;
uniform float uGlowGain;
uniform vec3 uDayScale;
varying vec4 vEnLoad;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
if ( vEnLoad.a < 0.5 || vEnLoad.a > 2.5 ) discard;
float enGlowDay = vEnLoad.a < 1.5 ? uDayScale.y : uDayScale.z;
diffuseColor.rgb = vEnLoad.rgb * uGlowGain * enGlowDay * ( vEnLoad.a > 1.5 ? uBreath : 1.0 );`,
      );
  };
  material.customProgramCacheKey = () => `en-grid-conductor-glow-${cacheKey}`;
  return material;
}

/**
 * Instance matrix of a span from p0 to p1: x = chord, y = vertical scaled by
 * chord × sagFactor (so the sag stays vertical whatever the chord's tilt),
 * z = the horizontal perpendicular. A right-handed basis, sheared on purpose.
 */
export function spanMatrix(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  sagFactor: number,
  out: THREE.Matrix4,
): number {
  const cx = p1.x - p0.x;
  const cy = p1.y - p0.y;
  const cz = p1.z - p0.z;
  const length = Math.hypot(cx, cy, cz);
  if (length < 1e-6) {
    out.identity().setPosition(p0);
    return 0;
  }
  let sx = -cz;
  let sz = cx;
  const horizontal = Math.hypot(sx, sz);
  if (horizontal < 1e-6) {
    sx = 1;
    sz = 0;
  } else {
    sx /= horizontal;
    sz /= horizontal;
  }
  out.set(
    cx,
    0,
    sx * length,
    p0.x,
    cy,
    length * sagFactor,
    0,
    p0.y,
    cz,
    0,
    sz * length,
    p0.z,
    0,
    0,
    0,
    1,
  );
  return length;
}

/** Height of the catenary between p0 and p1 at parameter t, for the given sag factor. */
export function catenaryY(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  sagFactor: number,
  t: number,
): number {
  const length = p0.distanceTo(p1);
  return p0.y + (p1.y - p0.y) * t - 4 * CONDUCTOR_SAG * length * sagFactor * t * (1 - t);
}
