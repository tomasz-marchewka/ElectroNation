// Forest cover (docs/08 §2, ARCHITECTURE.md §13): instanced trees wherever
// the forest's ground is — a jittered grid thinned into clumps and clearings
// by seeded noise, standing on the relief, off every building pad and out of
// the towns, in two levels of detail that share one instance buffer per
// species. The forest's share of the ground comes from the same blend the
// shader draws (blend.ts): where a forest reaches over its border in a
// tongue the trees go with it, where a field bites into it they thin out and
// stop. Each tree takes the character (looks.ts) of the forest hex that
// weighs most where it stands — its mix of spruce cones and broadleaf crowns,
// its density and its tone — so a spruce hex, a mixed wood and a broadleaf
// stand read apart. Trees are terrain: they never move. A real tree is 20–30
// m tall, so it takes the shared structure factor of the exaggeration table
// like every other vertical thing.

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorldBoard, WorldHex } from "../../bridge/worldScene";
import { CITY_FOOTPRINT, STRUCTURE_EXAGGERATION } from "../core/exaggeration";
import type { Rng } from "../core/prng";
import { HEX_PITCH_KM, HEX_RADIUS_KM, axialToOffset, worldToHex } from "../core/units";
import {
  BLEND_FRAY,
  BLEND_FRAY_OF,
  BLEND_PER_KM,
  BLEND_WANDER,
  BLEND_WIDTH,
  hexBlend,
  newHexBlend,
  type BlendNoise,
} from "./blend";
import { PAD_BLEND_KM, type HeightField } from "./heightfield";
import { CHARACTERS, NEUTRAL_LOOK, type HexLook } from "./looks";
import { fbm, gradientNoise, smoothstep } from "./noise";

/** Real height of a mature tree [km] × the shared structure factor. */
export const TREE_HEIGHT_KM = 0.025 * STRUCTURE_EXAGGERATION;
/** Trees per forest hex at full detail. */
const TREES_PER_HEX = 520;
/** Expected share of grid slots the clump noise keeps. */
const KEEP_RATE = 0.62;
/** Forest share of the ground at which the trees start to thin out, and where they stop. */
const EDGE_FULL = 0.75;
const EDGE_NONE = 0.25;
/**
 * Past the edge a few trees stray into the neighbour's ground in copses —
 * hedgerow trees and spinneys — their chance falling off by 1/e every
 * STRAY_KM [km], so a forest thins out into the fields instead of ending on
 * a line.
 */
const STRAY_SHARE = 0.8;
const STRAY_KM = 1;
/** No tree this close to a town's centre [km]: its largest footprint (docs/08 §2) and a street. */
const TOWN_CLEAR_KM = CITY_FOOTPRINT.max * (HEX_PITCH_KM / 2) + 0.5;
/** How far past a forest hex's edge its ground can reach [km] (blend.ts). */
const REACH_KM = HEX_PITCH_KM * (BLEND_WANDER + BLEND_FRAY + BLEND_WIDTH / 2);
/**
 * Camera distances [km] switching the level of detail and hiding the trees.
 * At 70 km a tree is ~9 px tall: past that the single crown is all a pixel
 * can show, and only the near mesh casts a shadow (ARCHITECTURE.md §13 —
 * the golden view at 110 km paid 1,6 ms for shadowed 24-triangle trees).
 */
export const FOREST_LOD_NEAR_KM = 70;
export const FOREST_LOD_FAR_KM = 350;

const TRUNK: THREE.Color = new THREE.Color().setRGB(0.3, 0.2, 0.12, THREE.SRGBColorSpace);
const tones = (list: readonly (readonly [number, number, number])[]): readonly THREE.Color[] =>
  list.map(([r, g, b]) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace));
/** Conifer crowns. */
const CANOPY_TONES = tones([
  [0.16, 0.3, 0.1],
  [0.2, 0.34, 0.11],
  [0.24, 0.36, 0.14],
  [0.14, 0.26, 0.09],
  [0.27, 0.36, 0.12],
]);
/**
 * Broadleaf crowns: a touch warmer than the conifers, no lighter — a round
 * crown already catches more sun than a cone, and a bright one pops off the
 * dark forest floor like a ball.
 */
const BROADLEAF_TONES = tones([
  [0.16, 0.28, 0.08],
  [0.2, 0.31, 0.09],
  [0.14, 0.25, 0.07],
  [0.22, 0.31, 0.09],
  [0.18, 0.28, 0.08],
]);

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

/**
 * A round crown with smooth normals: the polyhedra come faceted and
 * non-indexed, and a faceted crown glints like a cut gem in the sun.
 */
function roundCrown(polyhedron: THREE.BufferGeometry): THREE.BufferGeometry {
  polyhedron.deleteAttribute("normal");
  polyhedron.deleteAttribute("uv");
  const smooth = mergeVertices(polyhedron);
  polyhedron.dispose();
  smooth.computeVertexNormals();
  return coloured(smooth, new THREE.Color(1, 1, 1));
}

/** Near broadleaf: a trunk and a round crown — 30 triangles. */
function nearBroadleafGeometry(): THREE.BufferGeometry {
  const trunk = coloured(new THREE.CylinderGeometry(0.03, 0.045, 0.22, 5, 1, true), TRUNK);
  trunk.translate(0, 0.11, 0);
  const crown = roundCrown(new THREE.IcosahedronGeometry(0.2, 0));
  crown.scale(1, 0.85, 1);
  crown.translate(0, 0.36, 0);
  const merged = mergeGeometries([trunk, crown], false);
  trunk.dispose();
  crown.dispose();
  const scale = TREE_HEIGHT_KM / 0.54;
  merged.scale(scale, scale, scale);
  return merged;
}

/** Far broadleaf: one round crown — 8 triangles. */
function farBroadleafGeometry(): THREE.BufferGeometry {
  const crown = roundCrown(new THREE.OctahedronGeometry(0.21, 0));
  crown.scale(1, 0.9, 1);
  crown.translate(0, 0.3, 0);
  const scale = TREE_HEIGHT_KM / 0.5;
  crown.scale(scale, scale, scale);
  return crown;
}

/** A tree tone graded by the hex's character, the way the ground is (terrainMaterial enGrade). */
function grade(color: THREE.Color, look: HexLook): THREE.Color {
  color.r *= look.tint[0];
  color.g *= look.tint[1];
  color.b *= look.tint[2];
  const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  color.r = Math.max(0, luma + (color.r - luma) * look.saturation);
  color.g = Math.max(0, luma + (color.g - luma) * look.saturation);
  color.b = Math.max(0, luma + (color.b - luma) * look.saturation);
  return color;
}

export interface Forest {
  /** Every tree mesh: both species, both levels of detail. */
  group: THREE.Group;
  count: number;
  material: THREE.MeshStandardMaterial;
  /** Picks the level of detail for the camera distance; hides the trees far out. */
  setDistance(distanceKm: number): void;
  setSnowline(km: number): void;
  dispose(): void;
}

const AXIAL_NEIGHBOURS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

/** Instances of one species: shared by its near and far meshes. */
interface Stand {
  matrices: number[];
  colours: number[];
}

export function buildForest(
  board: WorldBoard,
  field: HeightField,
  rng: Rng,
  detail: number,
  castShadow: boolean,
  looks: ReadonlyMap<string, HexLook>,
  noise: BlendNoise,
): Forest | null {
  const forestHexes = board.hexes.filter((hex) => hex.terrain === "forest");
  if (forestHexes.length === 0 || detail <= 0) return null;
  const clumps = gradientNoise(rng);
  const perHex = Math.max(1, Math.round(TREES_PER_HEX * detail));
  const hexArea = ((3 * Math.sqrt(3)) / 2) * HEX_RADIUS_KM * HEX_RADIUS_KM;
  const spacing = Math.sqrt(hexArea / (perHex / KEEP_RATE));

  // The board by offset address, and the hexes a forest can reach: its own
  // and their neighbours — a candidate anywhere else is dropped unweighed.
  const grid: (WorldHex | undefined)[] = new Array<WorldHex | undefined>(board.cols * board.rows);
  const hexAt = (q: number, r: number): WorldHex | undefined => {
    const { col, row } = axialToOffset({ q, r });
    if (col < 0 || row < 0 || col >= board.cols || row >= board.rows) return undefined;
    return grid[col * board.rows + row];
  };
  for (const hex of board.hexes) grid[hex.col * board.rows + hex.row] = hex;
  // Off the board the shader's virtual ring carries on the edge hex (looks.ts):
  // the weights here do the same, but only a board hex owns a tree.
  const frayOf = (q: number, r: number): number => {
    const { col, row } = axialToOffset({ q, r });
    const edge =
      grid[
        Math.min(board.cols - 1, Math.max(0, col)) * board.rows +
          Math.min(board.rows - 1, Math.max(0, row))
      ];
    return edge ? BLEND_FRAY_OF[edge.terrain] : -1;
  };
  const nearForest = new Set<WorldHex>();
  for (const hex of forestHexes) {
    nearForest.add(hex);
    for (const [dq, dr] of AXIAL_NEIGHBOURS) {
      const neighbour = hexAt(hex.q + dq, hex.r + dr);
      if (neighbour) nearForest.add(neighbour);
    }
  }
  const towns = board.hexes.filter((hex) => hex.terrain === "urban");
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const hex of forestHexes) {
    x0 = Math.min(x0, hex.x - HEX_RADIUS_KM - REACH_KM);
    x1 = Math.max(x1, hex.x + HEX_RADIUS_KM + REACH_KM);
    z0 = Math.min(z0, hex.z - HEX_PITCH_KM / 2 - REACH_KM);
    z1 = Math.max(z1, hex.z + HEX_PITCH_KM / 2 + REACH_KM);
  }

  const conifers: Stand = { matrices: [], colours: [] };
  const broadleaves: Stand = { matrices: [], colours: [] };
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tone = new THREE.Color();
  const blend = newHexBlend();
  for (let gz = z0; gz <= z1; gz += spacing) {
    for (let gx = x0; gx <= x1; gx += spacing) {
      const x = gx + (rng.next() - 0.5) * spacing * 0.9;
      const z = gz + (rng.next() - 0.5) * spacing * 0.9;
      const home = worldToHex({ x, z });
      const own = hexAt(home.q, home.r);
      if (!own || !nearForest.has(own)) continue;
      // The forest's share of the land here. The weights share it among the
      // board and its virtual ring; the ring's copies of a forest edge count as
      // no forest, so the trees end with the board. The forest hex pushing
      // hardest is the nearest forest — the one whose trees stand or stray here.
      hexBlend(x, z, noise, frayOf, blend);
      let canopy = 0;
      let forestPush = Number.NEGATIVE_INFINITY;
      let owner: WorldHex | null = null;
      let pad = false;
      for (let i = 0; i < 3; i++) {
        const hex = hexAt(blend.q[i]!, blend.r[i]!);
        if (!hex || hex.terrain === "lake" || hex.terrain === "sea") continue;
        if (Math.hypot(x - hex.x, z - hex.z) < PAD_BLEND_KM - 0.3) pad = true;
        if (hex.terrain !== "forest") continue;
        canopy += blend.w[i]!;
        if (blend.pushed[i]! > forestPush) {
          forestPush = blend.pushed[i]!;
          owner = hex;
        }
      }
      if (!owner || pad) continue;
      const top = Math.max(blend.pushed[0]!, blend.pushed[1]!, blend.pushed[2]!);
      const outsideKm = (top - forestPush) / BLEND_PER_KM;
      const inside = smoothstep(EDGE_NONE, EDGE_FULL, canopy);
      const copse = smoothstep(0.45, 0.6, fbm(clumps, x / 1.5 + 40, z / 1.5, 2) * 0.5 + 0.5);
      const stray = STRAY_SHARE * Math.exp(-outsideKm / STRAY_KM) * copse * (1 - inside);
      if (inside <= 0 && stray < 0.01) continue;
      const look = looks.get(owner.key) ?? NEUTRAL_LOOK;
      const kind = CHARACTERS.forest[look.character];
      const density = kind?.density ?? 1;
      const broadleaf = kind?.broadleaf ?? 0;
      const treeScale = kind?.treeScale ?? 1;
      const clump = fbm(clumps, x / 5, z / 5, 3) * 0.5 + 0.5;
      const keep = ((0.25 + 0.75 * smoothstep(0.3, 0.7, clump)) * inside + stray) * density;
      if (rng.next() > keep) continue;
      if (towns.some((town) => Math.hypot(x - town.x, z - town.z) < TOWN_CLEAR_KM)) continue;
      const ground = field.heightAt(x, z);
      if (ground < 0.06) continue;
      const size = (0.7 + rng.next() * 0.6) * (0.85 + 0.3 * clump) * treeScale;
      position.set(x, ground - 0.02, z);
      quaternion.setFromAxisAngle(up, rng.next() * Math.PI * 2);
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      const isBroadleaf = rng.next() < broadleaf;
      const stand = isBroadleaf ? broadleaves : conifers;
      stand.matrices.push(...matrix.elements);
      tone
        .copy(rng.pick(isBroadleaf ? BROADLEAF_TONES : CANOPY_TONES))
        .multiplyScalar(0.85 + rng.next() * 0.3);
      grade(tone, look);
      stand.colours.push(tone.r, tone.g, tone.b);
    }
  }
  const count = (conifers.matrices.length + broadleaves.matrices.length) / 16;
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

  const group = new THREE.Group();
  group.name = "terrain-trees";
  const nears: THREE.InstancedMesh[] = [];
  const fars: THREE.InstancedMesh[] = [];
  const species = [
    { stand: conifers, name: "trees", near: nearTreeGeometry, far: farTreeGeometry },
    {
      stand: broadleaves,
      name: "broadleaf",
      near: nearBroadleafGeometry,
      far: farBroadleafGeometry,
    },
  ];
  for (const { stand, name, near: nearGeometry, far: farGeometry } of species) {
    const instances = stand.matrices.length / 16;
    if (instances === 0) continue;
    const instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(stand.matrices), 16);
    const instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(stand.colours), 3);
    const near = new THREE.InstancedMesh(nearGeometry(), material, instances);
    const far = new THREE.InstancedMesh(farGeometry(), material, instances);
    for (const mesh of [near, far]) {
      mesh.instanceMatrix = instanceMatrix;
      mesh.instanceColor = instanceColor;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.computeBoundingSphere();
    }
    near.castShadow = castShadow;
    far.castShadow = false;
    near.name = `terrain-${name}-near`;
    far.name = `terrain-${name}-far`;
    far.visible = false;
    nears.push(near);
    fars.push(far);
    group.add(near, far);
  }

  return {
    group,
    count,
    material,
    setDistance(distanceKm) {
      for (const near of nears) near.visible = distanceKm < FOREST_LOD_NEAR_KM;
      for (const far of fars) {
        far.visible = distanceKm >= FOREST_LOD_NEAR_KM && distanceKm < FOREST_LOD_FAR_KM;
      }
    },
    setSnowline(km) {
      uniforms.uSnowline.value = km;
    },
    dispose() {
      for (const mesh of [...nears, ...fars]) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      material.dispose();
    },
  };
}
