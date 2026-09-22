// Post-processing (ARCHITECTURE.md §13): bloom for the emissive signals of
// the night (city lights, hot conductors, plumes lit from below), SMAA on the
// high tier, ACES tone mapping and the sRGB output pass. The low tier renders
// straight to the canvas.
//
// Two perf decisions of wave 3 (evidence under captures/perf/s1/):
//
// 1. **Hue-preserving high-pass.** three's UnrealBloomPass thresholds on
//    luminance, so the amber / red alarm radiances (1,25 / 1,55 in R) sat
//    below the cut and the grid drew its own additive halo instead
//    (open issue `bloom-hue`). The high-pass now thresholds on
//    `max(r, g, b)`: a saturated alarm blooms while the hue it blooms in is
//    the hue the material emitted, so a red alarm blooms red under ACES.
// 2. **Bloom at half of the stock chain resolution** (`bloomScale` in
//    Quality.ts): the bright pass and every blur mip run at a quarter of the
//    viewport instead of half. Bloom is soft by construction; the high-tier
//    frames are indistinguishable (md5 twins and side-by-side frames under
//    captures/perf/s1/).

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { QualityProfile } from "./Quality";

/**
 * The stock LuminosityHighPassShader with the luminance test replaced by a
 * per-channel maximum, so colour is preserved through the threshold (an
 * amber at 1,25 R passes, a dim warm metal at 0,5 does not). The output is
 * still the original texel — only the selection changed.
 */
const HUE_PRESERVING_MAX_SEARCH = "float v = luminance( texel.xyz );";

function enableHuePreservingThreshold(bloom: UnrealBloomPass): void {
  const material = bloom.materialHighPassFilter;
  if (!material.fragmentShader.includes(HUE_PRESERVING_MAX_SEARCH)) return;
  material.fragmentShader = material.fragmentShader.replace(
    HUE_PRESERVING_MAX_SEARCH,
    "float v = max( max( texel.r, texel.g ), texel.b );",
  );
  material.needsUpdate = true;
}

export class PostFx {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private smaa: SMAAPass | null = null;
  private profile: QualityProfile | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  configure(profile: QualityProfile, width: number, height: number): void {
    this.dispose();
    this.profile = profile;
    if (!profile.bloom && profile.antialias === "none") return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (profile.bloom) {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        profile.bloomStrength,
        0.45,
        1.0,
      );
      enableHuePreservingThreshold(this.bloom);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    if (profile.antialias === "smaa") {
      this.smaa = new SMAAPass();
      composer.addPass(this.smaa);
    }
    composer.setSize(width, height);
    this.sizeBloom(width, height);
    this.composer = composer;
    this.setDaylight(1);
  }

  /** The composer owns the full-res targets; the bloom chain may run smaller. */
  private sizeBloom(width: number, height: number): void {
    if (!this.bloom || !this.profile) return;
    const scale = Math.min(1, Math.max(0.25, this.profile.bloomScale));
    this.bloom.setSize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
  }

  setSize(width: number, height: number): void {
    this.composer?.setSize(width, height);
    this.sizeBloom(width, height);
  }

  /** Bloom strength follows the night: emissive signals must not wash a noon scene. */
  setDaylight(daylight: number): void {
    if (!this.bloom || !this.profile) return;
    this.bloom.strength = this.profile.bloomStrength * (0.45 + (1 - daylight));
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
    this.profile = null;
  }
}
