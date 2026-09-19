// Forest cover (docs/08 §2, ARCHITECTURE.md §13): instanced trees on every
// forest hex — a jittered grid thinned into clumps and clearings by seeded
// noise, standing on the relief, off the building pad, in two levels of
// detail that share one instance buffer. Trees are terrain: they never
// move. A real tree is 20–30 m tall, so it takes the shared structure
// factor of the exaggeration table like every other vertical thing.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorldBoard } from "../../bridge/worldScene";
import { STRUCTURE_EXAGGERATION } from "../core/exaggeration";
import type { Rng } from "../core/prng";
import { HEX_RADIUS_KM } from "../core/units";
import { PAD_BLEND_KM, type HeightField } from "./heightfield";
import { fbm, gradientNoise, smoothstep } from "./noise";

/** Real height of a mature tree [km] × the shared structure factor. */
export const TREE_HEIGHT_KM = 0.025 * STRUCTURE_EXAGGERATION;
/** Trees per forest hex at full detail. */
const TREES_PER_HEX = 520;
/** Expected share of grid slots the clump noise keeps. */
const KEEP_RATE = 0.62;
/**
 * Camera distances [km] switching the level of detail and hiding the trees.
 * At 70 km a tree is ~9 px tall: past that the single crown is all a pixel
 * can show, and only the near mesh casts a shadow (ARCHITECTURE.md §13 —
 * the golden view at 110 km paid 1,6 ms for shadowed 24-triangle trees).
 */
export const FOREST_LOD_NEAR_KM = 70;
export const FOREST_LOD_FAR_KM = 350;

const TRUNK: THREE.Color = new THREE.Color().setRGB(0.3, 0.2, 0.12, THREE.SRGBColorSpace);
const CANOPY_TONES: readonly THREE.Color[] = [
  [0.16, 0.3, 0.1],
  [0.2, 0.34, 0.11],
  [0.24, 0.36, 0.14],
  [0.14, 0.26, 0.09],
  [0.27, 0.36, 0.12],
].map(([r, g, b]) => new THREE.Color().setRGB(r!, g!, b!, THREE.SRGBColorSpace));

function coloured(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");
  return geometry;
}

/** Near tree: a trunk and two stacked crowns — 24 triangles. */
function nearTreeGeometry(): THREE.BufferGeometry {
  const white = new THREE.Color(1, 1, 1);
  const trunk = coloured(new THREE.CylinderGeometry(0.03, 0.045, 0.16, 5, 1, true), TRUNK);
  trunk.translate(0, 0.08, 0);
  const lower = coloured(new THREE.ConeGeometry(0.19, 0.3, 7, 1, true), white);
  lower.translate(0, 0.25, 0);
  const upper = coloured(new THREE.ConeGeometry(0.13, 0.26, 7, 1, true), white);
  upper.translate(0, 0.41, 0);
  const merged = mergeGeometries([trunk, lower, upper], false);
  trunk.dispose();
  lower.dispose();
  upper.dispose();
  const scale = TREE_HEIGHT_KM / 0.54;
  merged.scale(scale, scale, scale);
  return merged;
}

/** Far tree: one crown — 5 triangles. */
function farTreeGeometry(): THREE.BufferGeometry {
  const crown = coloured(new THREE.ConeGeometry(0.17, 0.5, 5, 1, true), new THREE.Color(1, 1, 1));
  crown.translate(0, 0.25, 0);
  const scale = TREE_HEIGHT_KM / 0.5;
  crown.scale(scale, scale, scale);
  return crown;
}

export interface Forest {
  near: THREE.InstancedMesh;
  far: THREE.InstancedMesh;
  count: number;
  material: THREE.MeshStandardMaterial;
  /** Picks the level of detail for the camera distance; hides the trees far out. */
  setDistance(distanceKm: number): void;
  setSnowline(km: number): void;
  dispose(): void;
}

export function buildForest(
  board: WorldBoard,
  field: HeightField,
  rng: Rng,
  detail: number,
  castShadow: boolean,
): Forest | null {
  const forestHexes = board.hexes.filter((hex) => hex.terrain === "forest");
  if (forestHexes.length === 0 || detail <= 0) return null;
  const clumps = gradientNoise(rng);
  const perHex = Math.max(1, Math.round(TREES_PER_HEX * detail));
  const hexArea = ((3 * Math.sqrt(3)) / 2) * HEX_RADIUS_KM * HEX_RADIUS_KM;
  const spacing = Math.sqrt(hexArea / (perHex / KEEP_RATE));
  const inradius = (Math.sqrt(3) / 2) * HEX_RADIUS_KM;
  const limit = inradius * 0.93;

  const matrices: number[] = [];
  const colours: number[] = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tone = new THREE.Color();
  for (const hex of forestHexes) {
    const half = HEX_RADIUS_KM;
    for (let gz = -inradius; gz <= inradius; gz += spacing) {
      for (let gx = -half; gx <= half; gx += spacing) {
        const x = hex.x + gx + (rng.next() - 0.5) * spacing * 0.9;
        const z = hex.z + gz + (rng.next() - 0.5) * spacing * 0.9;
        const dx = Math.abs(x - hex.x);
        const dz = Math.abs(z - hex.z);
        // Inside the flat-top hex, off the building pad.
        if (dz > limit || 0.8660254 * dx + 0.5 * dz > limit) continue;
        if (Math.hypot(dx, dz) < PAD_BLEND_KM - 0.3) continue;
        const clump = fbm(clumps, x / 5, z / 5, 3) * 0.5 + 0.5;
        const keep = 0.25 + 0.75 * smoothstep(0.3, 0.7, clump);
        if (rng.next() > keep) continue;
        const ground = field.heightAt(x, z);
        if (ground < 0.06) continue;
        const size = (0.7 + rng.next() * 0.6) * (0.85 + 0.3 * clump);
        position.set(x, ground - 0.02, z);
        quaternion.setFromAxisAngle(up, rng.next() * Math.PI * 2);
        scale.set(size, size, size);
        matrix.compose(position, quaternion, scale);
        matrices.push(...matrix.elements);
        tone.copy(rng.pick(CANOPY_TONES)).multiplyScalar(0.85 + rng.next() * 0.3);
        colours.push(tone.r, tone.g, tone.b);
      }
    }
  }
  const count = matrices.length / 16;
  if (count === 0) return null;

  const uniforms = { uSnowline: { value: 5 } };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
  });
  material.name = "terrain-trees";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vEnHeight;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec4 enWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
enWorld = instanceMatrix * enWorld;
#endif
enWorld = modelMatrix * enWorld;
vEnHeight = enWorld.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uSnowline;\nvarying float vEnHeight;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float enSnow = smoothstep( uSnowline - 0.3, uSnowline + 0.3, vEnHeight ) * 0.5;
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.86, 0.9 ), enSnow );`,
      );
  };
  material.customProgramCacheKey = () => "en-terrain-trees";

  const instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(matrices), 16);
  const instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colours), 3);
  const near = new THREE.InstancedMesh(nearTreeGeometry(), material, count);
  const far = new THREE.InstancedMesh(farTreeGeometry(), material, count);
  for (const mesh of [near, far]) {
    mesh.instanceMatrix = instanceMatrix;
    mesh.instanceColor = instanceColor;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.computeBoundingSphere();
  }
  near.castShadow = castShadow;
  far.castShadow = false;
  near.name = "terrain-trees-near";
  far.name = "terrain-trees-far";
  far.visible = false;

  return {
    near,
    far,
    count,
    material,
    setDistance(distanceKm) {
      near.visible = distanceKm < FOREST_LOD_NEAR_KM;
      far.visible = distanceKm >= FOREST_LOD_NEAR_KM && distanceKm < FOREST_LOD_FAR_KM;
    },
    setSnowline(km) {
      uniforms.uSnowline.value = km;
    },
    dispose() {
      near.geometry.dispose();
      far.geometry.dispose();
      material.dispose();
      near.dispose();
      far.dispose();
    },
  };
}
