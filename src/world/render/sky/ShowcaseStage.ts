// A stand-in stage for the sky showcase ONLY, shown while no terrain provider
// is registered: a matte ground the size of the board (a photographer's grey
// card for the light) and a few gnomons that cast shadows, so the sun's
// colour, the shadow length and the cloud shadows can be judged before the
// terrain lands. It receives the cloud-shadow texture exactly the way the
// terrain is meant to — a reference implementation of the provider contract
// — and disappears the moment a terrain provider exists.

import * as THREE from "three";
import type { WorldBoard } from "../../bridge/worldScene";
import type { EnvironmentProvider } from "../core/types";
import type { Rng } from "../core/prng";
import { HEIGHT_KM } from "../core/exaggeration";
import { proceduralTexture } from "../core/textures";

/** Faint large-scale variation so the grey card is not one flat value. */
function stageAlbedo(): THREE.Texture {
  return proceduralTexture({
    name: "sky:stage-albedo",
    size: 256,
    fields: { a: { lattice: 3, octaves: 5 }, b: { lattice: 9, octaves: 3 } },
    pixel(u, v, fields) {
      const a = fields.a!.at(u * 3, v * 3);
      const b = fields.b!.at(u * 9, v * 9);
      const k = 0.78 + 0.32 * a + 0.1 * (b - 0.5);
      return [k, k * (1.0 + 0.04 * (a - 0.5)), k * (0.97 - 0.05 * (a - 0.5))];
    },
  });
}

interface CloudShadowUniforms {
  uCloudShadow: { value: THREE.Texture | null };
  uCloudSize: { value: number };
  uCloudOffset: { value: THREE.Vector2 };
  uCloudStrength: { value: number };
}

/**
 * Multiplies the direct light of every directional light by the cloud shadow
 * at the fragment's world position: `uv = (world.xz − offset) / sizeKm` on a
 * repeating texture, texel 1 = lit, 0 = shadowed, `strength` = how much of it
 * to apply — the same sampling render/terrain does.
 */
export function withCloudShadow(
  material: THREE.MeshStandardMaterial,
  uniforms: CloudShadowUniforms,
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCloudWorld;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvCloudWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vCloudWorld;
uniform sampler2D uCloudShadow;
uniform float uCloudSize;
uniform vec2 uCloudOffset;
uniform float uCloudStrength;
float cloudShadowFactor() {
  vec2 uv = (vCloudWorld.xz - uCloudOffset) / uCloudSize;
  return mix(1.0, texture2D(uCloudShadow, uv).r, uCloudStrength);
}`,
      )
      .replace(
        "#include <lights_fragment_begin>",
        THREE.ShaderChunk.lights_fragment_begin!.replace(
          "getDirectionalLightInfo( directionalLight, directLight );",
          "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cloudShadowFactor();",
        ),
      );
  };
  material.customProgramCacheKey = () => "sky-cloud-shadow";
}

export class ShowcaseStage {
  readonly group = new THREE.Group();
  private readonly ground: THREE.Mesh;
  private readonly gnomons: THREE.InstancedMesh;
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly gnomonMaterial: THREE.MeshStandardMaterial;
  private readonly uniforms: CloudShadowUniforms = {
    uCloudShadow: { value: null },
    uCloudSize: { value: 1 },
    uCloudOffset: { value: new THREE.Vector2() },
    uCloudStrength: { value: 0 },
  };

  constructor(board: WorldBoard, rng: Rng) {
    this.group.name = "sky-showcase-stage";
    const margin = 260;
    const geometry = new THREE.PlaneGeometry(board.widthKm + margin, board.depthKm + margin);
    geometry.rotateX(-Math.PI / 2);
    // A photographer's grey card with a hint of country: neutral enough to
    // show the light's own colour, textured enough for the light to model.
    this.groundMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8a9078),
      map: stageAlbedo(),
      roughness: 0.92,
      metalness: 0,
    });
    this.groundMaterial.map!.repeat.set(6, 6);
    withCloudShadow(this.groundMaterial, this.uniforms);
    this.ground = new THREE.Mesh(geometry, this.groundMaterial);
    this.ground.name = "sky-showcase-ground";
    this.ground.position.set(board.widthKm / 2 - 14, -0.02, board.depthKm / 2 - 12);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    // Gnomons: a stack-height box and a hall-height slab per site, twelve sites.
    const count = 24;
    this.gnomonMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xb8b4ac),
      roughness: 0.7,
      metalness: 0.05,
    });
    withCloudShadow(this.gnomonMaterial, this.uniforms);
    this.gnomons = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      this.gnomonMaterial,
      count,
    );
    this.gnomons.name = "sky-showcase-gnomons";
    this.gnomons.castShadow = true;
    this.gnomons.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const x = rng.range(20, board.widthKm - 40);
      const z = rng.range(20, board.depthKm - 30);
      const tall = i % 2 === 0;
      const height = tall ? HEIGHT_KM.stack : HEIGHT_KM.hall;
      const size = tall ? 0.8 : 4;
      matrix.makeScale(size, height, size);
      matrix.setPosition(x, height / 2, z);
      this.gnomons.setMatrixAt(i, matrix);
    }
    this.gnomons.instanceMatrix.needsUpdate = true;
    this.group.add(this.gnomons);
  }

  /** Per frame: the cloud shadow of the provider, exactly as the terrain will read it. */
  apply(environment: EnvironmentProvider): void {
    const shadow = environment.cloudShadow;
    this.uniforms.uCloudShadow.value = shadow?.texture ?? null;
    this.uniforms.uCloudSize.value = shadow?.sizeKm ?? 1;
    if (shadow) this.uniforms.uCloudOffset.value.copy(shadow.offset);
    this.uniforms.uCloudStrength.value = shadow?.strength ?? 0;
  }

  dispose(): void {
    this.ground.geometry.dispose();
    this.groundMaterial.dispose();
    this.gnomons.geometry.dispose();
    this.gnomonMaterial.dispose();
    this.gnomons.dispose();
    this.group.parent?.remove(this.group);
  }
}
