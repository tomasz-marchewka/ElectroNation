// Post-processing (ARCHITECTURE.md §13): bloom for the emissive signals of
// the night (city lights, hot conductors, plumes lit from below), SMAA on the
// high tier, ACES tone mapping and the sRGB output pass. The low tier renders
// straight to the canvas.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { QualityProfile } from "./Quality";

export class PostFx {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private smaa: SMAAPass | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  configure(profile: QualityProfile, width: number, height: number): void {
    this.dispose();
    if (!profile.bloom && profile.antialias === "none") return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (profile.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.45, 1.0);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    if (profile.antialias === "smaa") {
      this.smaa = new SMAAPass();
      composer.addPass(this.smaa);
    }
    composer.setSize(width, height);
    this.composer = composer;
  }

  setSize(width: number, height: number): void {
    this.composer?.setSize(width, height);
  }

  /** Bloom strength follows the night: emissive signals must not wash a noon scene. */
  setDaylight(daylight: number): void {
    if (this.bloom) this.bloom.strength = 0.25 + (1 - daylight) * 0.55;
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  get active(): boolean {
    return this.composer !== null;
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.smaa = null;
  }
}
