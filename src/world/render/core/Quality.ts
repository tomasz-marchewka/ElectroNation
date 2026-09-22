// Quality tiers (ARCHITECTURE.md §13): three tiers, a REAL knob table, auto
// selected from a measured frame window and overridable from the URL
// (`?quality=`) or the settings strip. The controller decides a tier; the
// renderer and the modules act on it through the module context — every knob
// below is consumed somewhere, and the high tier is the shipped look.

import type { QualityTier } from "./types";

export const QUALITY_TIERS: readonly QualityTier[] = ["low", "medium", "high"];

export interface QualityProfile {
  tier: QualityTier;
  /** Cap on the device pixel ratio. */
  maxPixelRatio: number;
  /** Shadow pass on: casters plus the shadow map. */
  shadows: boolean;
  shadowMapSize: number;
  /** Bloom pass on (PostFx) and the strength of its night curve. */
  bloom: boolean;
  /**
   * Multiplier on the bloom pass resolution. three's UnrealBloomPass builds
   * its bright pass and mips from half of what it is given, so 1 is the
   * stock chain and 0,5 halves every level — the veil is soft by design and
   * a quarter-res chain is indistinguishable at the high tier (evidence in
   * render/perf PROGRESS.md).
   */
  bloomScale: number;
  bloomStrength: number;
  antialias: "smaa" | "none";
  /**
   * Instance share modules draw (foliage, particles, city detail) AND the
   * geometry LOD reach divisor (`distanceKm / detail`): lower tiers keep the
   * detail visible over a shorter distance. This is the one knob behind the
   * per-module LOD distances.
   */
  detail: number;
  /** Cloud veil layers above the board (0 = flat sky, 2 = the high horizon). */
  cloudLayers: number;
  /** Share of the precipitation particles (0 = no particle rain/snow). */
  particles: number;
  /** Prefiltered environment-map size [px] (per-face of the cube). */
  envMapSize: number;
  /** Star count of the night dome. */
  stars: number;
  /** Distance [km] under which the per-layer normal maps still pay off (0 = never). */
  terrainNormalKm: number;
  /** Distance [km] under which the anti-tiling second taps still pay off. */
  terrainAltKm: number;
  /** Vertex spacing of the terrain field [km] — the relief's triangle budget. */
  terrainCellKm: number;
  /** Highest terrain splat layer still sampled; above it its mean colour is folded in. */
  terrainSamples: number;
  /** Anisotropy of the ground textures. */
  anisotropy: number;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: "high",
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    bloomScale: 0.5,
    bloomStrength: 0.55,
    antialias: "smaa",
    detail: 1,
    cloudLayers: 2,
    particles: 1,
    envMapSize: 256,
    stars: 3200,
    terrainNormalKm: 65,
    terrainAltKm: 65,
    terrainCellKm: 2,
    terrainSamples: 7.5,
    anisotropy: 4,
  },
  medium: {
    tier: "medium",
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    bloomScale: 0.5,
    bloomStrength: 0.5,
    antialias: "none",
    detail: 0.6,
    cloudLayers: 1,
    particles: 0.6,
    envMapSize: 128,
    stars: 2000,
    terrainNormalKm: 32,
    terrainAltKm: 32,
    terrainCellKm: 3,
    terrainSamples: 3.5,
    anisotropy: 2,
  },
  low: {
    tier: "low",
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    bloom: false,
    bloomScale: 0.5,
    bloomStrength: 0.45,
    antialias: "none",
    detail: 0.3,
    cloudLayers: 1,
    particles: 0,
    envMapSize: 64,
    stars: 1000,
    terrainNormalKm: 0,
    terrainAltKm: 0,
    terrainCellKm: 4,
    terrainSamples: 2.5,
    anisotropy: 1,
  },
};

/** Frames measured before the auto mode decides. */
const AUTO_WINDOW_FRAMES = 120;
/** Below this the tier steps down. */
const STEP_DOWN_FPS = 48;
/** Above this, with headroom, the tier steps up once. */
const STEP_UP_FPS = 58;

export class QualityController {
  tier: QualityTier;
  readonly auto: boolean;
  private frames = 0;
  private accumulatedMs = 0;
  private steppedUp = false;
  private listeners: ((tier: QualityTier) => void)[] = [];

  constructor(initial: QualityTier | "auto") {
    this.auto = initial === "auto";
    this.tier = initial === "auto" ? "medium" : initial;
  }

  get profile(): QualityProfile {
    return QUALITY_PROFILES[this.tier];
  }

  onChange(listener: (tier: QualityTier) => void): void {
    this.listeners.push(listener);
  }

  set(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.frames = 0;
    this.accumulatedMs = 0;
    for (const listener of this.listeners) listener(tier);
  }

  /** Feeds one frame's duration [ms]; in auto mode may change the tier. */
  sample(frameMs: number): void {
    if (!this.auto) return;
    this.frames += 1;
    this.accumulatedMs += frameMs;
    if (this.frames < AUTO_WINDOW_FRAMES) return;
    const fps = 1000 / (this.accumulatedMs / this.frames);
    this.frames = 0;
    this.accumulatedMs = 0;
    const index = QUALITY_TIERS.indexOf(this.tier);
    if (fps < STEP_DOWN_FPS && index > 0) {
      this.set(QUALITY_TIERS[index - 1] as QualityTier);
    } else if (fps > STEP_UP_FPS && index < QUALITY_TIERS.length - 1 && !this.steppedUp) {
      this.steppedUp = true;
      this.set(QUALITY_TIERS[index + 1] as QualityTier);
    }
  }
}

export function parseQuality(value: string | null | undefined): QualityTier | "auto" {
  return value === "high" || value === "medium" || value === "low" ? value : "auto";
}
