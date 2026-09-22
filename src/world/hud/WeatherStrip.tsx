// The weather strip (docs/08 §7): the numbers behind the sky — revealed
// truth of the shown turn, never a forecast — and the one-line diagnosis the
// contract asks for (Dunkelflaute, storm cut-out). Top-left under the top
// bar, a slim band by default, as a dispatcher console carries telemetry:
// one row names the shown turn, its phase, hour and regime; one row holds
// the numbers inline; the diagnosis and the capture banner follow only when
// present. One press opens the instrument readout (the sun's line and the
// three-column grid). Nothing here is computed: every string is the
// bridge's (bridge/hud.ts weatherStripModel); the only text of this file's
// own is the turn ordinal, so the world's clock cannot be confused with the
// panel's pending turn.

import { useState } from "react";
import type { WeatherStripItem, WeatherStripModel } from "../bridge/hud";
import type { WorldScene } from "../bridge/worldScene";

/** Separator of the model's title: `SZCZYT WIECZORNY · 19:30 · WYŻ ZIMOWY — MROŹNY`. */
const TITLE_SEPARATOR = " · ";

/** The sun's value is a sentence, not a number: it gets a line of its own. */
const SUN_ITEM = "sun";

/** Short labels of the inline row (the grid keeps the full ones). */
const SHORT_LABELS: Record<string, string> = {
  wind: "WIATR",
  windSea: "MORZE",
  cloud: "ZACHM.",
  ghi: "GHI",
  temp: "TEMP.",
};

/**
 * The bridge's note in the copy rules' glyph set (✓ ⚠ ✕ ◂ ▸ ⏭ ⬡ only): the
 * comparison signs and the arrow of the diagnosis become words. Presentation
 * only — the numbers are untouched.
 */
export function plainGlyphs(text: string): string {
  return text
    .replace(/\s*→\s*/g, " · ")
    .replace(/\s≈\s0\b/g, " bliskie zera")
    .replace(/\s≈\s/g, " około ")
    .replace(/\s<\s/g, " poniżej ")
    .replace(/\s≥\s/g, " od ")
    .replace(/\s>\s/g, " powyżej ")
    .replace(/\s≤\s/g, " do ");
}

function valueClass(item: WeatherStripItem): string {
  return item.tone ? `en-weather__value is-${item.tone}` : "en-weather__value";
}

export interface WeatherStripProps {
  model: WeatherStripModel;
  /** The shown turn — its ordinal labels the strip's clock as the world's, not the panel's. */
  time?: Pick<WorldScene["time"], "turnIndex" | "resolved">;
}

export function WeatherStrip({ model, time }: WeatherStripProps) {
  const [open, setOpen] = useState(false);
  const [phase = model.title, hour, ...rest] = model.title.split(TITLE_SEPARATOR);
  const context = rest.join(TITLE_SEPARATOR);
  const pending = context.startsWith("brak");
  const sun = model.items.find((item) => item.key === SUN_ITEM);
  const numbers = model.items.filter((item) => item.key !== SUN_ITEM);
  const turn = time ? `TURA ${time.turnIndex + 1}` : null;
  const note = model.note ? plainGlyphs(model.note) : null;
  return (
    <div
      className={open ? "en-weather is-open" : "en-weather"}
      data-region="weather"
      role="group"
      aria-label="Pogoda tury"
    >
      <button
        type="button"
        className="en-weather__head"
        aria-expanded={open}
        aria-controls="en-weather-readout"
        title={open ? "Zwiń odczyt pogody" : "Rozwiń odczyt pogody"}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="en-weather__phase">
          {turn && (
            <span className="en-weather__turn">
              {time?.resolved ? "POKAZANA " : ""}
              {turn} ·{" "}
            </span>
          )}
          {phase}
          {hour && <span className="en-weather__hour"> · {hour}</span>}
        </span>
        {context && (
          <span className={pending ? "en-weather__regime is-pending" : "en-weather__regime"}>
            {context}
          </span>
        )}
        <span className="en-weather__toggle" aria-hidden="true">
          {open ? "ZWIŃ ◂" : "ODCZYT ▸"}
        </span>
      </button>
      {!open && (
        <div className="en-weather__row">
          {numbers.map((item) => (
            <span className="en-weather__cell" key={item.key}>
              <span className="en-weather__label">{SHORT_LABELS[item.key] ?? item.label}</span>{" "}
              <b className={valueClass(item)}>{item.value}</b>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div id="en-weather-readout">
          {sun && (
            <div className="en-weather__sun">
              <span className="en-weather__label">{sun.label}</span>
              <span className="en-weather__sunvalue">{sun.value}</span>
            </div>
          )}
          <div className="en-weather__grid">
            {numbers.map((item) => (
              <span className="en-weather__item" key={item.key}>
                <span className="en-weather__label">{item.label}</span>
                <b className={valueClass(item)}>{item.value}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {note && (
        <div className="en-weather__note" role="status">
          {note}
        </div>
      )}
      {model.banner && <div className="en-weather__banner">{model.banner}</div>}
    </div>
  );
}
