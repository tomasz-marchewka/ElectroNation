// Quality tiers (ARCHITECTURE.md §13): three tiers, auto-selected from a
// measured frame window and overridable. The controller decides a tier; the
// renderer and the modules act on it through the module context.

import type { QualityTier } from "./types";

export const QUALITY_TIERS: readonly QualityTier[] = ["low", "medium", "high"];

export interface QualityProfile {
  tier: QualityTier;
  /** Cap on the device pixel ratio. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  antialias: "smaa" | "none";
  /** Share of instanced detail modules should draw (foliage, particles). */
  detail: number;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: "high",
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    antialias: "smaa",
    detail: 1,
  },
  medium: {
    tier: "medium",
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    antialias: "none",
    detail: 0.6,
  },
  low: {
    tier: "low",
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    bloom: false,
    antialias: "none",
    detail: 0.3,
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
