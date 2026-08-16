// Adapted from design-system/components/data/ForecastRow.{jsx,d.ts}.
// The forecast is a band, never a number (06 §8.6.4): the track paints
// [value − band, value + band] on a scale SHARED by every row of the section,
// otherwise the widths lie (ForecastRow.prompt.md).

import { formatBand, formatMw } from "../format";

export interface ForecastRowProps {
  /** Quantity in caps: "POPYT", "WIATR", "PV". */
  label: string;
  /** Centre of the band [MW]. */
  value: number;
  /** Half-width of the ± band [MW]. 0 = a value already revealed. */
  band?: number;
  /** Lower end of the track's scale. */
  min?: number;
  /** Upper end of the track's scale — one value for the whole section. */
  max?: number;
  /** Band and value colour: a technology token. Neutral when absent. */
  color?: string;
  /** Text printed instead of the number, e.g. "0 · NOC". */
  note?: string;
  /**
   * Value text in --en-text-4. The reference build's own `Band` has it (for the
   * PV row after sunset); the extracted component lost it.
   */
  muted?: boolean;
}

export function ForecastRow({
  label,
  value,
  band = 0,
  min = 0,
  max = 2000,
  color,
  note,
  muted = false,
}: ForecastRowProps) {
  const span = max - min || 1;
  const low = Math.max(min, value - band);
  const high = Math.min(max, value + band);
  const left = Math.max(0, Math.min(100, ((low - min) / span) * 100));
  // The handoff's floor of 1.5% keeps a zero-width band visible; the ceiling is
  // this port's own — a band wider than the scale must not spill off the track.
  const width = Math.min(100 - left, Math.max(1.5, ((high - low) / span) * 100));
  const text = note ?? (band > 0 ? formatBand(value, band) : formatMw(value));

  return (
    <div className="en-statrow">
      <span className="en-statrow__label">{label}</span>
      <span className="en-statrow__track">
        {value > 0 && (
          <span
            className="en-statrow__band"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: color ?? "var(--en-text-2)",
            }}
          />
        )}
      </span>
      <span className="en-statrow__value" style={{ color: muted ? "var(--en-text-4)" : color }}>
        {text}
      </span>
    </div>
  );
}
