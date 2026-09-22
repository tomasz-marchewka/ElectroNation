// The settings strip (docs/08 §4, §7): motion, quality and renderer, next to
// the theme switch in the screen's utility strip. Segmented controls of the
// design system; none of them is the primary action. The readout after the
// quality control says what the renderer actually runs at — the tier the
// auto mode settled on and the measured frame rate — in the same voice as
// every other number on the screen. Every segment is a real button, so the
// strip is reachable by Tab and reads its state through aria-pressed; the
// arrow keys walk a group as one control.

import { useEffect, useState, type KeyboardEvent } from "react";
import { parseCaptureParams } from "../capture/params";
import type { MotionMode } from "../render/core/types";
import { useWorldSettings, type QualityChoice, type RendererChoice } from "./settingsStore";

const MOTION_LABELS: Record<MotionMode, string> = {
  full: "PEŁNY",
  reduced: "OGRANICZONY",
  none: "BRAK",
};
const MOTION_ORDER: readonly MotionMode[] = ["full", "reduced", "none"];

const QUALITY_LABELS: Record<QualityChoice, string> = {
  auto: "AUTO",
  high: "WYSOKA",
  medium: "ŚREDNIA",
  low: "NISKA",
};
const QUALITY_ORDER: readonly QualityChoice[] = ["auto", "high", "medium", "low"];

const RENDERER_LABELS: Record<RendererChoice, string> = { "3d": "3D", svg: "SVG" };
const RENDERER_ORDER: readonly RendererChoice[] = ["3d", "svg"];

// Audio is muted by default; this control's click is also the user gesture the
// AudioContext needs before it may start (audio brief).
const AUDIO_LABELS = { off: "WYŁ.", on: "WŁ." } as const;
const AUDIO_ORDER = ["off", "on"] as const;
type AudioChoice = (typeof AUDIO_ORDER)[number];

/** How often the readout samples the renderer [ms] — a number, not a flicker. */
const READOUT_INTERVAL_MS = 1000;

interface Readout {
  fps: number;
  tier: string;
}

/**
 * The measured frame rate and the active tier, from the capture/debug surface
 * when the page exposes it (`window.__en`, ARCHITECTURE.md §15). A capture
 * pins the clock and compares frames byte for byte, so it gets no live number.
 */
function useReadout(): Readout | null {
  const [readout, setReadout] = useState<Readout | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (parseCaptureParams(window.location.search).capture) return;
    const sample = () => {
      const api = window.__en;
      if (!api?.ready) {
        setReadout(null);
        return;
      }
      const info = api.info();
      setReadout({ fps: Math.round(info.fps), tier: info.tier });
    };
    const handle = window.setInterval(sample, READOUT_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, []);
  return readout;
}

export interface SettingsStripProps {
  /** Tier the renderer actually runs at (auto resolves to one of them). */
  activeTier?: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  order: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ label, order, labels, value, onChange }: SegmentedProps<T>) {
  // Left/right arrows walk the choices and carry the focus along, the way a
  // radio group does; Home and End jump to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const index = order.indexOf(value);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    if (next === null) return;
    const choice = order[Math.max(0, Math.min(order.length - 1, next))];
    if (choice === undefined || choice === value) return;
    event.preventDefault();
    onChange(choice);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
    buttons[order.indexOf(choice)]?.focus();
  };
  return (
    <span className="en-worldsettings__group" role="group" aria-label={label}>
      <span className="en-worldsettings__label">{label}</span>
      <span className="en-segmented" onKeyDown={onKeyDown}>
        {order.map((choice) => (
          <button
            type="button"
            key={choice}
            className="en-seg"
            aria-pressed={value === choice}
            onClick={() => onChange(choice)}
          >
            {labels[choice]}
          </button>
        ))}
      </span>
    </span>
  );
}

export function SettingsStrip({ activeTier }: SettingsStripProps) {
  const motion = useWorldSettings((store) => store.motion);
  const quality = useWorldSettings((store) => store.quality);
  const renderer = useWorldSettings((store) => store.renderer);
  const setMotion = useWorldSettings((store) => store.setMotion);
  const setQuality = useWorldSettings((store) => store.setQuality);
  const setRenderer = useWorldSettings((store) => store.setRenderer);
  const audioEnabled = useWorldSettings((store) => store.audio.enabled);
  const setAudioEnabled = useWorldSettings((store) => store.setAudioEnabled);
  const readout = useReadout();

  const tier = readout?.tier ?? activeTier;
  const tierLabel = tier ? (QUALITY_LABELS[tier as QualityChoice] ?? tier.toUpperCase()) : null;
  const fps = readout && Number.isFinite(readout.fps) && readout.fps > 0 ? readout.fps : null;

  return (
    <div className="en-worldsettings" data-region="settings">
      <Segmented
        label="RUCH"
        order={MOTION_ORDER}
        labels={MOTION_LABELS}
        value={motion}
        onChange={setMotion}
      />
      <Segmented
        label="JAKOŚĆ"
        order={QUALITY_ORDER}
        labels={QUALITY_LABELS}
        value={quality}
        onChange={setQuality}
      />
      {renderer === "3d" && tierLabel && (
        <span
          className="en-worldsettings__readout"
          data-region="readout"
          title="Poziom jakości, na którym pracuje renderer, i zmierzona liczba klatek na sekundę"
        >
          ▸ <b>{tierLabel}</b>
          {fps !== null && (
            <>
              {" · "}
              <b>{fps}</b> FPS
            </>
          )}
        </span>
      )}
      <Segmented
        label="RENDERER"
        order={RENDERER_ORDER}
        labels={RENDERER_LABELS}
        value={renderer}
        onChange={setRenderer}
      />
      <Segmented
        label="DŹWIĘK"
        order={AUDIO_ORDER}
        labels={AUDIO_LABELS}
        value={audioEnabled ? "on" : "off"}
        onChange={(choice: AudioChoice) => setAudioEnabled(choice === "on")}
      />
    </div>
  );
}
