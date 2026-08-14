import React from "react";

/** Wiersz prognozy: nazwa, pasmo niepewności na torze, wartość ±błąd. */
export function ForecastRow({ label, value, band, min = 0, max = 2000, color, note }) {
  const lo = band ? Math.max(0, value - band) : value;
  const hi = band ? value + band : value;
  const span = max - min || 1;
  const left = ((lo - min) / span) * 100;
  const width = Math.max(1.5, ((hi - lo) / span) * 100);
  return (
    <div className="en-statrow">
      <span className="en-statrow__label">{label}</span>
      <span className="en-statrow__track">
        {value > 0 && (
          <span
            className="en-statrow__band"
            style={{ left: left + "%", width: width + "%", background: color || "var(--en-text-2)" }}
          />
        )}
      </span>
      <span className="en-statrow__value" style={color ? { color } : undefined}>
        {note ? note : band ? value + " ±" + band : value}
      </span>
    </div>
  );
}
