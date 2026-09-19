// The lights (docs/08 §5): one sun following the engine's astronomy, one
// faint cool moon, one hemisphere for the sky and the ground bounce. The sun
// casts the only shadows; its orthographic shadow camera follows the camera
// target and scales with the view distance, so shadows exist at strategic and
// closeup zoom alike, with a bias tuned to the texel size so the relief does
// not acne. Shadow map size and on/off come from the quality profile.

import * as THREE from "three";
import type { QualityProfile } from "../core/Quality";
import type { CameraView } from "../core/types";
import type { Lighting } from "./skyState";

export class LightRig {
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  private readonly group = new THREE.Group();
  private mapSize = 0;
  private shadowsOn = false;

  constructor(parent: THREE.Object3D) {
    this.group.name = "sky-lights";
    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.name = "sun";
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 3000;
    this.sun.shadow.bias = -0.0001;
    this.sun.shadow.radius = 2;
    this.moon = new THREE.DirectionalLight(0xbfd4ff, 0);
    this.moon.name = "moon";
    this.moon.castShadow = false;
    this.hemisphere = new THREE.HemisphereLight(0x88aaff, 0x334422, 1);
    this.hemisphere.name = "sky-hemisphere";
    this.group.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemisphere);
    parent.add(this.group);
  }

  configure(profile: QualityProfile): void {
    const size = profile.shadowMapSize;
    if (size !== this.mapSize) {
      this.mapSize = size;
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
      this.sun.shadow.needsUpdate = true;
    }
    this.shadowsOn = profile.shadows;
    this.sun.castShadow = profile.shadows;
  }

  apply(lighting: Lighting): void {
    this.sun.color.copy(lighting.sunColor);
    this.sun.intensity = lighting.sunIntensity;
    this.sun.shadow.intensity = lighting.shadowIntensity;
    this.sun.castShadow = this.shadowsOn && lighting.sunIntensity > 0.02;
    this.moon.color.copy(lighting.moonColor);
    this.moon.intensity = lighting.moonIntensity;
    this.hemisphere.color.copy(lighting.skyColor);
    this.hemisphere.groundColor.copy(lighting.groundColor);
    this.hemisphere.intensity = lighting.ambientIntensity;
  }

  /** Once per frame: the shadow frustum around what the camera looks at. */
  follow(view: CameraView, sunDir: THREE.Vector3, moonDir: THREE.Vector3): void {
    const target = view.target;
    const half = Math.min(420, Math.max(30, view.distanceKm * 0.8));
    const reach = half * 2.2;
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(sunDir, reach);
    const camera = this.sun.shadow.camera;
    if (camera.left !== -half) {
      camera.left = -half;
      camera.right = half;
      camera.top = half;
      camera.bottom = -half;
      camera.near = 1;
      // A low sun lights the far side of the frustum from very far away.
      camera.far = reach + half * 8;
      camera.updateProjectionMatrix();
      // Bias scaled to the texel so the relief neither acnes nor peels off its shadow.
      const texelKm = (2 * half) / Math.max(this.mapSize, 1);
      this.sun.shadow.normalBias = texelKm * 1.2;
    }
    this.moon.target.position.copy(target);
    this.moon.position.copy(target).addScaledVector(moonDir.y > 0.05 ? moonDir : sunDir, reach);
  }

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
    this.moon.dispose();
    this.hemisphere.dispose();
    this.group.parent?.remove(this.group);
  }
}
