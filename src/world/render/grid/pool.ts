// An instance pool: one InstancedMesh per archetype, grown by doubling, fed
// with packed matrices, an optional colour per instance and the optional
// per-instance load of a conductor. Refilling is a copy into the attribute
// arrays — never a geometry rebuild.

import * as THREE from "three";

export interface PoolOptions {
  name: string;
  color: boolean;
  load: boolean;
  /** A per-instance width factor of a conductor (`enWidth`, 1 = the material's radius). */
  width?: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}

export class InstancePool {
  mesh: THREE.InstancedMesh | null = null;
  private capacity = 0;
  private visible = true;

  constructor(
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly parent: THREE.Object3D,
    private readonly options: PoolOptions,
  ) {}

  get count(): number {
    return this.mesh?.count ?? 0;
  }

  private ensure(count: number): THREE.InstancedMesh {
    if (this.mesh && count <= this.capacity) return this.mesh;
    const capacity = Math.max(16, count, this.capacity * 2);
    if (this.mesh) {
      this.parent.remove(this.mesh);
      this.mesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.name = this.options.name;
    mesh.castShadow = this.options.castShadow;
    mesh.receiveShadow = this.options.receiveShadow;
    mesh.frustumCulled = false;
    mesh.visible = this.visible;
    if (this.options.color) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    }
    if (this.options.load) {
      this.geometry.setAttribute(
        "enLoad",
        new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4),
      );
    }
    if (this.options.width) {
      const widths = new Float32Array(capacity).fill(1);
      this.geometry.setAttribute("enWidth", new THREE.InstancedBufferAttribute(widths, 1));
    }
    this.capacity = capacity;
    this.mesh = mesh;
    this.parent.add(mesh);
    return mesh;
  }

  /** Replaces every instance; arrays are 16 / 3 / 4 / 1 floats per instance. */
  fill(
    matrices: ArrayLike<number>,
    colors?: ArrayLike<number>,
    loads?: ArrayLike<number>,
    widths?: ArrayLike<number>,
  ): void {
    const count = Math.floor(matrices.length / 16);
    const mesh = this.ensure(count);
    (mesh.instanceMatrix.array as Float32Array).set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && mesh.instanceColor) {
      (mesh.instanceColor.array as Float32Array).set(colors);
      mesh.instanceColor.needsUpdate = true;
    }
    if (loads) this.setLoads(loads);
    if (widths) this.setWidths(widths);
    mesh.count = count;
  }

  setWidths(widths: ArrayLike<number>): void {
    const attribute = this.geometry.getAttribute("enWidth");
    if (!attribute) return;
    (attribute.array as Float32Array).set(widths);
    attribute.needsUpdate = true;
  }

  setLoads(loads: ArrayLike<number>): void {
    const attribute = this.geometry.getAttribute("enLoad");
    if (!attribute) return;
    (attribute.array as Float32Array).set(loads);
    attribute.needsUpdate = true;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.mesh) this.mesh.visible = visible;
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
