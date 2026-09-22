// An instance pool: one InstancedMesh per archetype (container, skid, portal,
// mast, lamp, …), grown by doubling and refilled by copying matrices — and an
// optional colour per instance — into the attribute arrays. A refill is never a
// geometry rebuild. Module-local copy of the pattern render/res uses: modules
// never import each other's helpers.

import * as THREE from "three";

export interface PoolOptions {
  name: string;
  /** Allocate an instanceColor attribute (paint variation, lamp state). */
  color: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  /** A float attribute patched into the shader (window glow). */
  glow?: boolean;
  /** Matrices change every frame (eased state): hint the buffer usage. */
  dynamic?: boolean;
}

export class InstancePool {
  mesh: THREE.InstancedMesh | null = null;
  private capacity = 0;
  private visible = true;
  private shadows: boolean;

  constructor(
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly parent: THREE.Object3D,
    private readonly options: PoolOptions,
  ) {
    this.shadows = options.castShadow;
  }

  get count(): number {
    return this.mesh?.count ?? 0;
  }

  private ensure(count: number): THREE.InstancedMesh {
    if (this.mesh && count <= this.capacity) return this.mesh;
    const capacity = Math.max(8, count, this.capacity * 2);
    if (this.mesh) {
      this.parent.remove(this.mesh);
      this.mesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.name = this.options.name;
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.options.receiveShadow;
    mesh.frustumCulled = false;
    if (this.options.dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.options.color) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      if (this.options.dynamic) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    if (this.options.glow) {
      mesh.geometry.setAttribute(
        "enGlow",
        new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
      );
    }
    this.capacity = capacity;
    this.mesh = mesh;
    this.parent.add(mesh);
    return mesh;
  }

  /** Replaces every instance; arrays are 16 / 3 floats per instance. */
  fill(matrices: ArrayLike<number>, colors?: ArrayLike<number>): void {
    const count = Math.floor(matrices.length / 16);
    const mesh = this.ensure(count);
    (mesh.instanceMatrix.array as Float32Array).set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && mesh.instanceColor) {
      (mesh.instanceColor.array as Float32Array).set(colors);
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.count = count;
    mesh.visible = this.visible && count > 0;
  }

  reset(count = 0): void {
    const mesh = this.ensure(count);
    mesh.count = count;
    mesh.visible = this.visible && count > 0;
  }

  /** Writes one colour in place; call {@link commitColors} once afterwards. */
  setColorAt(index: number, r: number, g: number, b: number): void {
    const attribute = this.mesh?.instanceColor;
    if (!attribute) return;
    const array = attribute.array as Float32Array;
    array[index * 3] = r;
    array[index * 3 + 1] = g;
    array[index * 3 + 2] = b;
  }

  commitColors(): void {
    if (this.mesh?.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Writes one glow attribute in place; call {@link commitGlow} afterwards. */
  setGlowAt(index: number, value: number): void {
    const attribute = this.mesh?.geometry.getAttribute("enGlow") as
      THREE.InstancedBufferAttribute | undefined;
    if (!attribute) return;
    (attribute.array as Float32Array)[index] = value;
  }

  commitGlow(): void {
    const attribute = this.mesh?.geometry.getAttribute("enGlow");
    if (attribute) attribute.needsUpdate = true;
  }

  setShadows(cast: boolean): void {
    this.shadows = cast;
    if (this.mesh) this.mesh.castShadow = cast;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.mesh) this.mesh.visible = visible && this.mesh.count > 0;
  }

  dispose(): void {
    if (this.mesh) {
      this.parent.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
    this.capacity = 0;
  }
}
