// Materials of the renewables layer (ARCHITECTURE.md §14: everything
// procedural). PBR throughout — the turbine white is RAL 7035 with rain
// streaks and weld seams, the offshore transition piece the yellow of the
// Baltic farms, the PV glass a dark navy under an anti-reflective sheen that
// throws the sun's own specular back at the camera. Two vertex-shader hooks
// keep the structures legible at map distance: a tower never thins below a
// pixel and a blade never vanishes between two pixels — the silhouette keeps
// its real proportions up close and a readable minimum width far away.

import * as THREE from "three";
import { mix, normalMapFromHeight, proceduralTexture } from "../core/textures";

/** Uniform shared by every hooked material: km of expansion per km of camera distance. */
export interface ScreenUniforms {
  uMinKm: { value: number };
}

export function createScreenUniforms(): ScreenUniforms {
  return { uMinKm: { value: 0 } };
}

/**
 * The origin of the drawn instance in world space and its distance to the
 * camera — `enOrigin`/`enDist` for the expansion hooks below.
 */
const ORIGIN_CHUNK = /* glsl */ `
#ifdef USE_INSTANCING
vec3 enOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
#else
vec3 enOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
#endif
float enDist = distance( cameraPosition, enOrigin );`;

/**
 * Radial minimum: a body of revolution around its local Y axis (tower,
 * monopile, post) is pushed out to at least `uMinKm × distance` — one pixel
 * — so a farm of 3 km towers still reads as towers from 600 km away.
 */
export function withMinRadius(material: THREE.Material, uniforms: ScreenUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uMinKm;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${ORIGIN_CHUNK}
float enMinR = uMinKm * enDist;
float enR = length( transformed.xz );
if ( enR > 1e-5 ) transformed.xz += transformed.xz / enR * max( 0.0, enMinR - enR );`,
      );
  };
  material.customProgramCacheKey = () => "en-res-min-radius";
}

/**
 * Thickness minimum: a thin plate (blade, panel) grows along its normal until
 * it is at least half a pixel thick on each face.
 */
export function withMinThickness(material: THREE.Material, uniforms: ScreenUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uMinKm;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${ORIGIN_CHUNK}
transformed += objectNormal * max( 0.0, uMinKm * enDist * 0.5 - 0.004 );`,
      );
  };
  material.customProgramCacheKey = () => "en-res-min-thickness";
}

// --- textures ----------------------------------------------------------------

/** Rain streaks and a faint grime foot on the tower's white. */
function towerAlbedo(): THREE.DataTexture {
  return proceduralTexture({
    name: "res:tower-albedo",
    size: 128,
    fields: {
      streak: { lattice: 24, octaves: 3 },
      grime: { lattice: 4, octaves: 3 },
    },
    pixel(u, v, fields) {
      // The streak field is sampled almost only along u: constant down the tower.
      const streak = fields.streak!.at(u * 24, v * 1.5);
      const grime = fields.grime!.at(u * 4, v * 4);
      const foot = Math.max(0, 0.12 - v) / 0.12;
      const k = 0.86 - 0.05 * streak - 0.06 * foot * (0.6 + 0.4 * grime);
      return [k, k * 1.01, k * 1.0];
    },
  });
}

/** Weld seams every tower section and a whisper of the streaks. */
function towerNormal(): THREE.DataTexture {
  return normalMapFromHeight(
    "res:tower-normal",
    128,
    (u, v, fields) => {
      const seam = Math.abs(((v * 6) % 1) - 0.5);
      const ridge = Math.max(0, 0.04 - seam) / 0.04;
      return ridge * 0.6 + 0.15 * (fields.streak!.at(u * 24, v * 1.5) - 0.5);
    },
    { streak: { lattice: 24, octaves: 3 } },
    1.4,
  );
}

/** Photovoltaic cells: navy silicon between silver busbars, a bright frame edge. */
function pvCells(): THREE.DataTexture {
  return proceduralTexture({
    name: "res:pv-cells",
    size: 64,
    fields: { grain: { lattice: 8, octaves: 2 } },
    pixel(u, v, fields) {
      const cellsU = 12;
      const cellsV = 4;
      const fu = (u * cellsU) % 1;
      const fv = (v * cellsV) % 1;
      const gap = Math.min(fu, 1 - fu, fv, 1 - fv) < 0.06;
      const frame = Math.min(u, 1 - u, v, 1 - v) < 0.025;
      const grain = fields.grain!.at(u * 8, v * 8);
      if (frame) return [0.62, 0.64, 0.66];
      if (gap) return [0.55, 0.57, 0.6];
      const k = 0.85 + 0.3 * grain;
      return [0.035 * k, 0.07 * k, 0.17 * k];
    },
  });
}

/**
 * Ground of a PV yard: mown grass over sandy soil, worn to earth where the
 * maintenance lanes run — the uniform green-brown strip between rows that
 * aerial photographs of Polish farms show, darker than the fields around.
 */
function pvGround(): THREE.DataTexture {
  return proceduralTexture({
    name: "res:pv-ground",
    size: 64,
    fields: { grass: { lattice: 8, octaves: 3 }, wear: { lattice: 3, octaves: 2 } },
    pixel(u, v, fields) {
      const grass = fields.grass!.at(u * 8, v * 8);
      const wear = fields.wear!.at(u * 3, v * 3);
      const lane = Math.max(0, wear - 0.62) / 0.38;
      const green = mix([0.24, 0.3, 0.13], [0.33, 0.38, 0.18], grass);
      return mix(green, [0.4, 0.35, 0.26], lane * 0.8);
    },
  });
}

/** Chain-link: a fine diamond mesh, mostly open. */
function chainLink(): THREE.DataTexture {
  return proceduralTexture({
    name: "res:chain-link",
    size: 32,
    pixel(u, v) {
      const a = Math.abs(((u * 4 + v * 4) % 1) - 0.5);
      const b = Math.abs(((u * 4 - v * 4 + 4) % 1) - 0.5);
      const wire = Math.min(a, b) < 0.09 ? 1 : 0;
      const k = 0.35 + 0.35 * wire;
      return [k, k, k];
    },
  });
}

// --- material set ---------------------------------------------------------------

export interface ResMaterials {
  tower: THREE.MeshStandardMaterial;
  /** Nacelle, hub and painted steel: vertex-coloured. */
  steel: THREE.MeshStandardMaterial;
  blade: THREE.MeshStandardMaterial;
  foundation: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  pad: THREE.MeshStandardMaterial;
  /** 0..1 snow cover on the PV ground — the module sets it from the terrain's snowline. */
  padSnow: { value: number };
  fence: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createResMaterials(screen: ScreenUniforms): ResMaterials {
  const tower = new THREE.MeshStandardMaterial({
    map: towerAlbedo(),
    normalMap: towerNormal(),
    normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.12,
  });
  tower.name = "res-tower";
  withMinRadius(tower, screen);

  const steel = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.15,
  });
  steel.name = "res-steel";

  const blade = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    metalness: 0.05,
  });
  blade.name = "res-blade";
  withMinThickness(blade, screen);

  const foundation = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.2,
  });
  foundation.name = "res-foundation";
  withMinRadius(foundation, screen);

  const glass = new THREE.MeshPhysicalMaterial({
    map: pvCells(),
    color: new THREE.Color(1, 1, 1),
    roughness: 0.28,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    specularIntensity: 1,
    specularColor: new THREE.Color(0.7, 0.78, 1.0),
    iridescence: 0.3,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 380],
    envMapIntensity: 1.2,
  });
  glass.name = "res-pv-glass";

  const pad = new THREE.MeshStandardMaterial({
    map: pvGround(),
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  pad.name = "res-pv-pad";
  // Snow lies on the ground between the rows exactly as on the fields around
  // (the tilted glass sheds it): the albedo blends to snow with the cover.
  const padSnow = { value: 0 };
  pad.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSnow: padSnow });
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSnow;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.88, 0.92 ), uSnow );`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, 0.7, uSnow );`,
      );
  };
  pad.customProgramCacheKey = () => "en-res-pad-snow";

  const fence = new THREE.MeshStandardMaterial({
    map: chainLink(),
    color: new THREE.Color(0.55, 0.56, 0.58),
    roughness: 0.6,
    metalness: 0.5,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  fence.name = "res-fence";

  return {
    tower,
    steel,
    blade,
    foundation,
    glass,
    pad,
    padSnow,
    fence,
    dispose() {
      for (const material of [tower, steel, blade, foundation, glass, pad, fence]) {
        material.dispose();
      }
    },
  };
}
