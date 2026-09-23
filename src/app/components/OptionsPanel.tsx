// OPCJE GRY (docs/08 §7): every setting of the game in one place — the
// picture, the sound and the session. The panel takes the right column the
// way the hex panel does: the design system has no modal and no motion to
// open one with, and the column is where the screen swaps what the player
// reads. The top bar's OPCJE GRY opens and closes it; ESC and the button at
// the bottom close it.
//
// Every choice is a segmented control of real buttons, so the panel is
// reachable by Tab and reads its state through aria-pressed; the arrow keys
// walk a group as one control. A choice whose effect is not self-evident says
// what it does on the line under it. The settings themselves are the stores'
// (world/hud/settingsStore.ts, store/themeStore.ts): view preferences outside
// GameState, remembered by the browser.

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { parseCaptureParams } from "../../world/capture/params";
import {
  useWorldSettings,
  type QualityChoice,
  type RendererChoice,
} from "../../world/hud/settingsStore";
import type { CloudMode, MotionMode } from "../../world/render/core/types";
import { useThemeStore, type Theme } from "../store/themeStore";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { PanelSection } from "./PanelSection";
import { SessionBar } from "./SessionBar";

const QUALITY_LABELS: Record<QualityChoice, string> = {
  auto: "AUTO",
  high: "WYSOKA",
  medium: "ŚREDNIA",
  low: "NISKA",
};
const QUALITY_ORDER: readonly QualityChoice[] = ["auto", "high", "medium", "low"];

const CLOUD_LABELS: Record<CloudMode, string> = {
  full: "PEŁNE",
  clear: "PRZEJRZYSTE",
  none: "BRAK",
};
const CLOUD_ORDER: readonly CloudMode[] = ["full", "clear", "none"];
const CLOUD_NOTES: Record<CloudMode, string> = {
  full: "warstwa chmur nad całym krajem — z bliska gęstnieje nad mapą",
  clear: "nad planszą tylko cienie chmur — warstwa zostaje wokół granic",
  none: "bez chmur i ich cieni — zachmurzenie podaje pasek pogody",
};

const MOTION_LABELS: Record<MotionMode, string> = {
  full: "PEŁNY",
  reduced: "OGRANICZONY",
  none: "BRAK",
};
const MOTION_ORDER: readonly MotionMode[] = ["full", "reduced", "none"];
const MOTION_NOTES: Record<MotionMode, string> = {
  full: "przepływy na liniach, oddech przeciążenia, dryf chmur i opad",
  reduced: "bez cząstek, oddechu i dryfu chmur — wirniki i smugi nadal pracują",
  none: "świat zamrożony — stan czytają światło, sylwetka i pierścienie",
};

const RENDERER_LABELS: Record<RendererChoice, string> = { "3d": "3D", svg: "SVG" };
const RENDERER_ORDER: readonly RendererChoice[] = ["3d", "svg"];

const THEME_LABELS: Record<Theme, string> = { dark: "CIEMNY", light: "JASNY" };
const THEME_ORDER: readonly Theme[] = ["dark", "light"];

// Audio is muted by default; this control's click is also the user gesture the
// AudioContext needs before it may start (audio brief).
const AUDIO_LABELS = { off: "WYŁ.", on: "WŁ." } as const;
const AUDIO_ORDER = ["off", "on"] as const;
type AudioChoice = (typeof AUDIO_ORDER)[number];

const NO_WEBGL_NOTE = "⚠ brak WebGL2 — mapa w trybie SVG";
const SVG_NOTE = "▸ jakość, chmury i ruch dotyczą mapy 3D";

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

interface ChoiceProps<T extends string> {
  label: string;
  order: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  /** What the chosen option does, on the line under the segments. */
  note?: string;
  disabled?: boolean;
  /** After the segments on the same line: the quality readout. */
  aside?: ReactNode;
}

function Choice<T extends string>({
  label,
  order,
  labels,
  value,
  onChange,
  note,
  disabled = false,
  aside,
}: ChoiceProps<T>) {
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
    <div className="en-option" role="group" aria-label={label}>
      <span className="en-option__label">{label}</span>
      <span className="en-option__control">
        <span className="en-segmented" onKeyDown={disabled ? undefined : onKeyDown}>
          {order.map((choice) => (
            <button
              type="button"
              key={choice}
              className="en-seg"
              aria-pressed={value === choice}
              disabled={disabled}
              onClick={() => onChange(choice)}
            >
              {labels[choice]}
            </button>
          ))}
        </span>
        {aside}
      </span>
      {note && <span className="en-option__note">{note}</span>}
    </div>
  );
}

interface LevelProps {
  label: string;
  /** 0–100 [%]. */
  value: number;
  onChange: (value: number) => void;
  /** Dimmed while the sound is off: the level waits for it. */
  muted?: boolean;
}

/**
 * A level in the options' own row: the setpoint slider's track and 3×12 px
 * thumb (switchgear, not a form), a native range input transparent over it
 * for the pointer and the keyboard, the value with its unit after it.
 */
function Level({ label, value, onChange, muted = false }: LevelProps) {
  return (
    <div className={muted ? "en-option is-muted" : "en-option"}>
      <span className="en-option__label">{label}</span>
      <span className="en-option__control">
        <label className="en-option__track">
          <span className="en-option__fill" style={{ width: `${value}%` }} />
          <span className="en-setpoint__thumb" style={{ left: `${value}%` }} />
          <input
            className="en-setpoint__input"
            type="range"
            min={0}
            max={100}
            step={5}
            value={value}
            aria-label={label}
            aria-valuetext={`${value} %`}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </label>
        <span className="en-option__value">{value} %</span>
      </span>
    </div>
  );
}

export interface OptionsPanelProps {
  /** Whether a WebGL2 context exists — without it the map is SVG and stays so. */
  webgl: boolean;
  /** Whether the 3D world is what the map region shows right now. */
  world3d: boolean;
  /** Tier the renderer actually runs at (auto resolves to one of them). */
  activeTier?: string;
  /** Back to the dispatcher panel. */
  onClose: () => void;
}

export function OptionsPanel({ webgl, world3d, activeTier, onClose }: OptionsPanelProps) {
  const quality = useWorldSettings((store) => store.quality);
  const clouds = useWorldSettings((store) => store.clouds);
  const motion = useWorldSettings((store) => store.motion);
  const renderer = useWorldSettings((store) => store.renderer);
  const audio = useWorldSettings((store) => store.audio);
  const setQuality = useWorldSettings((store) => store.setQuality);
  const setClouds = useWorldSettings((store) => store.setClouds);
  const setMotion = useWorldSettings((store) => store.setMotion);
  const setRenderer = useWorldSettings((store) => store.setRenderer);
  const setAudioEnabled = useWorldSettings((store) => store.setAudioEnabled);
  const setAudioVolume = useWorldSettings((store) => store.setAudioVolume);
  const theme = useThemeStore((store) => store.theme);
  const setTheme = useThemeStore((store) => store.setTheme);
  const readout = useReadout();

  const tier = readout?.tier ?? activeTier;
  const tierLabel = tier ? (QUALITY_LABELS[tier as QualityChoice] ?? tier.toUpperCase()) : null;
  const fps = readout && Number.isFinite(readout.fps) && readout.fps > 0 ? readout.fps : null;
  const volume = Math.round(audio.volume * 100);

  return (
    <Panel meta="USTAWIENIA · ZAPAMIĘTANE W TEJ PRZEGLĄDARCE" title="OPCJE GRY">
      <PanelSection label="GRAFIKA">
        <div className="en-options">
          {!webgl ? (
            <span className="en-options__note">{NO_WEBGL_NOTE}</span>
          ) : (
            !world3d && <span className="en-options__note">{SVG_NOTE}</span>
          )}
          <Choice
            label="JAKOŚĆ"
            order={QUALITY_ORDER}
            labels={QUALITY_LABELS}
            value={quality}
            onChange={setQuality}
            disabled={!world3d}
            aside={
              world3d &&
              tierLabel && (
                <span
                  className="en-option__readout"
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
              )
            }
          />
          <Choice
            label="CHMURY"
            order={CLOUD_ORDER}
            labels={CLOUD_LABELS}
            value={clouds}
            onChange={setClouds}
            note={CLOUD_NOTES[clouds]}
            disabled={!world3d}
          />
          <Choice
            label="RUCH"
            order={MOTION_ORDER}
            labels={MOTION_LABELS}
            value={motion}
            onChange={setMotion}
            note={MOTION_NOTES[motion]}
            disabled={!world3d}
          />
          <Choice
            label="RENDERER"
            order={RENDERER_ORDER}
            labels={RENDERER_LABELS}
            value={renderer}
            onChange={setRenderer}
            disabled={!webgl}
          />
          <Choice
            label="MOTYW"
            order={THEME_ORDER}
            labels={THEME_LABELS}
            value={theme}
            onChange={setTheme}
          />
        </div>
      </PanelSection>

      <PanelSection label="DŹWIĘK">
        <div className="en-options">
          <Choice
            label="ODGŁOSY"
            order={AUDIO_ORDER}
            labels={AUDIO_LABELS}
            value={audio.enabled ? "on" : "off"}
            onChange={(choice: AudioChoice) => setAudioEnabled(choice === "on")}
          />
          <Level
            label="GŁOŚNOŚĆ"
            value={volume}
            muted={!audio.enabled}
            onChange={(value) => setAudioVolume(value / 100)}
          />
        </div>
      </PanelSection>

      <PanelSection label="GRA" grow>
        <SessionBar />
      </PanelSection>

      <PanelSection sunk>
        <Button variant="ghost" block onClick={onClose}>
          ◂ WRÓĆ DO PANELU DYSPOZYTORA
        </Button>
      </PanelSection>
    </Panel>
  );
}
