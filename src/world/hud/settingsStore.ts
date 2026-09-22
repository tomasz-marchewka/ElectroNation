// World settings of the HUD (docs/08 §4, §7): motion, quality, renderer and
// whether the world legend is unfolded. View preferences, deliberately
// outside GameState — the world looks the same whatever they are set to, it
// only moves and costs differently.

import { create } from "zustand";
import type { MotionMode, QualityTier } from "../render/core/types";

export type QualityChoice = QualityTier | "auto";
export type RendererChoice = "3d" | "svg";
export type LegendChoice = "open" | "closed";

export const SETTINGS_STORAGE_KEY = "electronation.world";

/** Muted by default, and never created without a user gesture (audio brief). */
export interface WorldAudioSettings {
  enabled: boolean;
  volume: number;
}

export interface WorldSettings {
  motion: MotionMode;
  quality: QualityChoice;
  renderer: RendererChoice;
  /** The light-encoding key over the world: unfolded until the player folds it. */
  legend: LegendChoice;
  audio: WorldAudioSettings;
}

interface Stored {
  motion?: unknown;
  quality?: unknown;
  renderer?: unknown;
  legend?: unknown;
  audio?: unknown;
}

function parseMotion(value: unknown, fallback: MotionMode): MotionMode {
  return value === "full" || value === "reduced" || value === "none" ? value : fallback;
}

function parseQualityChoice(value: unknown): QualityChoice {
  return value === "high" || value === "medium" || value === "low" || value === "auto"
    ? value
    : "auto";
}

function parseRenderer(value: unknown): RendererChoice {
  return value === "svg" || value === "3d" ? value : "3d";
}

function parseLegend(value: unknown): LegendChoice {
  return value === "closed" ? "closed" : "open";
}

const DEFAULT_AUDIO: WorldAudioSettings = { enabled: false, volume: 0.6 };

function parseAudio(value: unknown): WorldAudioSettings {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_AUDIO };
  const candidate = value as { enabled?: unknown; volume?: unknown };
  return {
    enabled: candidate.enabled === true,
    volume:
      typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
        ? Math.min(1, Math.max(0, candidate.volume))
        : DEFAULT_AUDIO.volume,
  };
}

/** Reduced motion is the default when the OS asks for it (docs/08 §4). */
function osPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function defaultSettings(): WorldSettings {
  return {
    motion: osPrefersReducedMotion() ? "reduced" : "full",
    quality: "auto",
    renderer: "3d",
    // Folded: unfolded it is a strip across the north coast in the strategic
    // frame; the title stays top-right and one press opens the key.
    legend: "closed",
    audio: { ...DEFAULT_AUDIO },
  };
}

function readStored(): WorldSettings {
  const defaults = defaultSettings();
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Stored;
    return {
      motion: parseMotion(stored.motion, defaults.motion),
      quality: parseQualityChoice(stored.quality),
      renderer: parseRenderer(stored.renderer),
      legend: parseLegend(stored.legend),
      audio: parseAudio(stored.audio),
    };
  } catch {
    return defaults;
  }
}

function persist(settings: WorldSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A session without remembered settings still runs.
  }
}

export interface WorldSettingsStore extends WorldSettings {
  setMotion: (motion: MotionMode) => void;
  setQuality: (quality: QualityChoice) => void;
  setRenderer: (renderer: RendererChoice) => void;
  setLegend: (legend: LegendChoice) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setAudioVolume: (volume: number) => void;
}

function settingsOf(store: WorldSettings): WorldSettings {
  return {
    motion: store.motion,
    quality: store.quality,
    renderer: store.renderer,
    legend: store.legend,
    audio: store.audio,
  };
}

export const useWorldSettings = create<WorldSettingsStore>()((set, get) => ({
  ...readStored(),
  setMotion: (motion) => {
    set({ motion });
    persist(settingsOf(get()));
  },
  setQuality: (quality) => {
    set({ quality });
    persist(settingsOf(get()));
  },
  setRenderer: (renderer) => {
    set({ renderer });
    persist(settingsOf(get()));
  },
  setLegend: (legend) => {
    set({ legend });
    persist(settingsOf(get()));
  },
  setAudioEnabled: (enabled) => {
    set({ audio: { ...get().audio, enabled } });
    persist(settingsOf(get()));
  },
  setAudioVolume: (volume) => {
    const clamped = Math.min(1, Math.max(0, volume));
    set({ audio: { ...get().audio, volume: clamped } });
    persist(settingsOf(get()));
  },
}));
