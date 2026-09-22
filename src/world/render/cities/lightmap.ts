// The night light map of a settlement (docs/08 §5, ARCHITECTURE.md §9): a
// city the way night satellite imagery shows it — the sodium-orange web of
// its streets, whiter LED arterials, the warm haze over its lit blocks, dark
// parks and a ragged edge — rasterised once per layout into ONE atlas texture
// and drawn as a terrain-conforming additive quilt: a single draw call for
// every city of the country. Near the ground the individual lamp pools carry
// the night; from ~120 km out a pool is sub-pixel speckle, so the quilt fades
// in and takes over with a coherent glow of the same colour. It is scaled by
// `lit` like every other light of the city, and an off-grid city has no tile.
//
// Radiance is rasterised per km², not per texel, so a 7 km town and a 20 km
// metro come out equally bright per screen pixel; the soft knee saturates the
// dense core toward yellow-white while the suburbs stay orange — exactly what
// the reference photographs do.

import * as THREE from "three";
import { HEIGHT_KM } from "../core/exaggeration";
import type { TerrainProvider } from "../core/types";
import type { CityLayout } from "./layout";

/** Texels per city tile; the tile spans this many footprint radii. */
export const TILE_TEXELS = 128;
export const TILE_SPAN_RADII = 3;
/** Quilt cells per side of a city; the quilt floats this high over the ground [km]. */
const QUILT_CELLS = 16;
const QUILT_LIFT_KM = 0.06;
/**
 * Blur of a lamp on the map [km]. Wider than a real pool (~120 m) on purpose:
 * the atlas is read at map distance, where two lamps 260 m apart must merge
 * into a street, not shine as separate white dots.
 */
const LAMP_BLUR_KM = 0.32;
/** Smallest blur in texels: below this the map is a field of one-texel spikes. */
const LAMP_BLUR_TEXELS = 2;
/** Light a single lamp throws on the map [km²]; the street sum of ~4 lamps/km
 *  lands near 0,35 and only the dense core saturates toward white. */
const LAMP_ENERGY_KM2 = 0.32;
/** Soft knee: 1 − exp(−radiance × KNEE); a core of ~5 lamps/km² lands near 0,6. */
const KNEE = 0.24;
/** Warm haze a lit block throws over its own footprint (per storey of cityBlockLow). */
const BLOCK_GLOW = 1.7;
const BLOCK_TINT: readonly [number, number, number] = [1.0, 0.74, 0.44];

export interface LightTile {
  /** Atlas uv origin and size of the tile. */
  u0: number;
  v0: number;
  size: number;
  /** Half-span of the tile in world km around the city centre. */
  halfKm: number;
}

export interface LightAtlas {
  texture: THREE.DataTexture;
  /** One tile per layout, in layout order; null for a city without light. */
  tiles: (LightTile | null)[];
  dispose(): void;
}

/** Splats a normalised gaussian of `sigma` texels around (fx, fy) into rgb. */
function splat(
  accum: Float32Array,
  size: number,
  fx: number,
  fy: number,
  sigma: number,
  amount: number,
  color: readonly [number, number, number],
): void {
  const reach = Math.ceil(sigma * 2.5);
  const x0 = Math.max(0, Math.floor(fx) - reach);
  const x1 = Math.min(size - 1, Math.floor(fx) + reach);
  const y0 = Math.max(0, Math.floor(fy) - reach);
  const y1 = Math.min(size - 1, Math.floor(fy) + reach);
  if (x1 < x0 || y1 < y0) return;
  const inv = -1 / (2 * sigma * sigma);
  // Analytic normalisation of the sampled gaussian (2π σ²), clipped kernels lose a little.
  const norm = amount / (2 * Math.PI * sigma * sigma);
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - fy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - fx;
      const w = Math.exp((dx * dx + dy * dy) * inv) * norm;
      const at = (y * size + x) * 3;
      accum[at] = (accum[at] ?? 0) + w * color[0];
      accum[at + 1] = (accum[at + 1] ?? 0) + w * color[1];
      accum[at + 2] = (accum[at + 2] ?? 0) + w * color[2];
    }
  }
}

/** Rasterises one city into `accum` (TILE_TEXELS², radiance per km²). */
function rasterise(layout: CityLayout, accum: Float32Array): number {
  const half = layout.radiusKm * TILE_SPAN_RADII * 0.5;
  const texelKm = (2 * half) / TILE_TEXELS;
  const toTile = (x: number, z: number): [number, number] => [
    ((x - layout.centre.x) / (2 * half) + 0.5) * TILE_TEXELS,
    ((z - layout.centre.z) / (2 * half) + 0.5) * TILE_TEXELS,
  ];
  // Everything is rasterised as energy over its blur area, then divided by
  // the texel area, so the map holds radiance per km² whatever the tile scale.
  const perKm2 = 1 / (texelKm * texelKm);
  for (const lamp of layout.lamps) {
    const [fx, fy] = toTile(lamp.x, lamp.z);
    const sigma = Math.max(LAMP_BLUR_TEXELS, LAMP_BLUR_KM / texelKm);
    splat(accum, TILE_TEXELS, fx, fy, sigma, LAMP_ENERGY_KM2 * perKm2, lamp.color);
  }
  for (const building of layout.buildings) {
    const [fx, fy] = toTile(building.x, building.z);
    const area = building.w * building.d;
    const storeys = building.h / HEIGHT_KM.cityBlockLow;
    const domestic =
      building.archetype === "house" ? 0.45 : building.archetype === "hall" ? 0.25 : 1;
    const amount = area * Math.min(storeys, 2.5) * BLOCK_GLOW * domestic * perKm2;
    const sigma = Math.max(0.8, Math.max(building.w, building.d) / (2.2 * texelKm));
    splat(accum, TILE_TEXELS, fx, fy, sigma, amount, BLOCK_TINT);
  }
  return half;
}

/** Builds the atlas for every layout; cities without light get no tile. */
export function buildLightAtlas(layouts: CityLayout[]): LightAtlas {
  const lit = layouts.filter((layout) => layout.lamps.length > 0);
  const cols = Math.max(1, Math.ceil(Math.sqrt(lit.length)));
  const rows = Math.max(1, Math.ceil(lit.length / cols));
  const width = cols * TILE_TEXELS;
  const height = rows * TILE_TEXELS;
  const data = new Uint8Array(width * height * 4);
  const accum = new Float32Array(TILE_TEXELS * TILE_TEXELS * 3);
  const tiles: (LightTile | null)[] = [];
  let index = 0;
  for (const layout of layouts) {
    if (layout.lamps.length === 0) {
      tiles.push(null);
      continue;
    }
    accum.fill(0);
    const halfKm = rasterise(layout, accum);
    const col = index % cols;
    const row = Math.floor(index / cols);
    for (let y = 0; y < TILE_TEXELS; y++) {
      for (let x = 0; x < TILE_TEXELS; x++) {
        const from = (y * TILE_TEXELS + x) * 3;
        const to = ((row * TILE_TEXELS + y) * width + col * TILE_TEXELS + x) * 4;
        // A one-texel black frame keeps linear filtering from bleeding between tiles.
        const frame = x === 0 || y === 0 || x === TILE_TEXELS - 1 || y === TILE_TEXELS - 1;
        for (let c = 0; c < 3; c++) {
          const value = frame ? 0 : 1 - Math.exp(-(accum[from + c] ?? 0) * KNEE);
          data[to + c] = Math.round(Math.min(1, value) * 255);
        }
        data[to + 3] = 255;
      }
    }
    tiles.push({
      u0: (col * TILE_TEXELS) / width,
      v0: (row * TILE_TEXELS) / height,
      size: TILE_TEXELS / width,
      halfKm,
    });
    index += 1;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return {
    texture,
    tiles,
    dispose() {
      texture.dispose();
    },
  };
}

export interface QuiltRange {
  /** First vertex and vertex count of a city's patch in the merged geometry. */
  start: number;
  count: number;
}

export interface LightQuilt {
  mesh: THREE.Mesh;
  /** One range per layout; null where the city has no tile. */
  ranges: (QuiltRange | null)[];
  uniforms: QuiltUniforms;
  /** Writes one city's lit share into its vertices. */
  setLit(index: number, lit: number): void;
  dispose(): void;
}

export interface QuiltUniforms {
  uNight: { value: number };
  /** Camera distance band [km] over which the quilt fades in. */
  uFade: { value: THREE.Vector2 };
  /** HDR radiance of a saturated texel. */
  uGain: { value: number };
}

const QUILT_VERTEX_PARS = /* glsl */ `
attribute float enLit;
uniform vec2 uFade;
varying float vEnLit;
varying float vEnFade;
`;

const QUILT_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  vec3 enWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  float enDist = distance( cameraPosition, enWorld );
  vEnFade = smoothstep( uFade.x, uFade.y, enDist );
  // A short city keeps a steeper-than-linear share: the eye reads light on a log scale.
  vEnLit = pow( max( enLit, 0.0 ), 1.6 );
}
`;

const QUILT_FRAGMENT_PARS = /* glsl */ `
uniform float uNight;
uniform float uGain;
varying float vEnLit;
varying float vEnFade;
`;

const QUILT_COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= uGain * uNight * vEnFade * vEnLit;
`;

/**
 * One merged, terrain-conforming grid per lit city, all in one geometry with
 * a per-vertex `enLit`, drawn additively over the ground with the atlas.
 */
export function buildLightQuilt(
  layouts: CityLayout[],
  atlas: LightAtlas,
  terrain: TerrainProvider,
  fade: { value: THREE.Vector2 },
): LightQuilt {
  const positions: number[] = [];
  const uvs: number[] = [];
  const lits: number[] = [];
  const indices: number[] = [];
  const ranges: (QuiltRange | null)[] = [];
  layouts.forEach((layout, index) => {
    const tile = atlas.tiles[index];
    if (!tile) {
      ranges.push(null);
      return;
    }
    const start = positions.length / 3;
    const n = QUILT_CELLS + 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const fx = i / QUILT_CELLS;
        const fz = j / QUILT_CELLS;
        const x = layout.centre.x + (fx - 0.5) * 2 * tile.halfKm;
        const z = layout.centre.z + (fz - 0.5) * 2 * tile.halfKm;
        const y = Math.max(terrain.heightAt(x, z), terrain.seaLevelKm) + QUILT_LIFT_KM;
        positions.push(x, y, z);
        uvs.push(tile.u0 + fx * tile.size, tile.v0 + fz * tile.size);
        lits.push(1);
      }
    }
    for (let j = 0; j < QUILT_CELLS; j++) {
      for (let i = 0; i < QUILT_CELLS; i++) {
        const a = start + j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    ranges.push({ start, count: n * n });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const litAttribute = new THREE.Float32BufferAttribute(lits, 1);
  litAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("enLit", litAttribute);
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const uniforms: QuiltUniforms = {
    uNight: { value: 0 },
    uFade: fade,
    // Under the bloom threshold (1,0): the quilt is a glow, never a white blot.
    uGain: { value: 0.45 },
  };
  const material = new THREE.MeshBasicMaterial({
    map: atlas.texture,
    color: new THREE.Color(1, 1, 1),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${QUILT_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", QUILT_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${QUILT_FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", QUILT_COLOR_FRAGMENT);
  };
  material.customProgramCacheKey = () => "en-cities-quilt";
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "cities:lightmap";
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return {
    mesh,
    ranges,
    uniforms,
    setLit(index, lit) {
      const range = ranges[index];
      if (!range) return;
      const array = litAttribute.array as Float32Array;
      for (let i = 0; i < range.count; i++) array[range.start + i] = lit;
      litAttribute.addUpdateRange(range.start, range.count);
      litAttribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
