import React from "react";

/** Włącz/wyłącz całą farmę OZE — jedyne ręczne sterowanie OZE (01 §4.1). */
export function TogglePill({ on = true, labels = ["WŁ.", "WYŁ."], onChange }) {
  return (
    <button
      type="button"
      className={"en-pill" + (on ? "" : " is-off")}
      aria-pressed={on}
      onClick={onChange ? () => onChange(!on) : undefined}
    >
      {on ? labels[0] : labels[1]}
    </button>
  );
}
