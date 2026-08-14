import React from "react";

/** Tryb pracy magazynu: ŁADUJ / STOP / ODDAWAJ. */
export function SegmentedControl({ options, value, onChange, ariaLabel }) {
  return (
    <div className="en-segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        return (
          <button
            type="button"
            key={val}
            className="en-seg"
            aria-pressed={val === value}
            onClick={onChange ? () => onChange(val) : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
