// Adapted from design-system/components/controls/SetpointSlider.{jsx,d.ts}.
// A dispatchable unit's setpoint: full 0–100% range every turn (01 §5.1). The
// thumb is a 3×12 px bar, not a circle — this is switchgear, not a form. A
// native range input lies transparent over the drawn track, so the keyboard and
// the pointer both work without reimplementing either.

import { formatSetpoint } from "../format";

export interface SetpointSliderProps {
  /** Object name in caps, e.g. "EC MODRZYCA". */
  name: string;
  /** Technology in lowercase, e.g. "węgiel", "CCGT". */
  tech?: string;
  /** Current setpoint [MW]. */
  value: number;
  /** Rated power [MW]. */
  max: number;
  unit?: string;
  /** Note under the slider — the variable cost, e.g. "250 zł/MWh". */
  note?: string;
  /** Fill colour: the technology token. */
  color?: string;
  /**
   * MW per notch. The extracted component has no step; the reference build
   * dispatches in 10 MW and so does the game.
   */
  step?: number;
  /** Without it the slider is read-only. */
  onChange?: (value: number) => void;
}

export function SetpointSlider({
  name,
  tech,
  value,
  max,
  unit = "MW",
  note,
  color,
  step = 10,
  onChange,
}: SetpointSliderProps) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  // A unit at zero goes dim: the player is meant to see the headroom there.
  const off = value === 0;

  return (
    <div className={off ? "en-setpoint is-off" : "en-setpoint"}>
      <div className="en-setpoint__head">
        <span>
          {name} {tech && <small>{tech}</small>}
        </span>
        <span className={off ? "is-muted" : undefined}>{formatSetpoint(value, max, unit)}</span>
      </div>
      <label className="en-setpoint__track">
        <span
          className="en-setpoint__fill"
          style={{ width: `${percent}%`, background: color ?? "var(--en-gas-ico)" }}
        />
        <span className="en-setpoint__thumb" style={{ left: `${percent}%` }} />
        <input
          className="en-setpoint__input"
          type="range"
          min={0}
          max={max}
          step={step}
          value={value}
          aria-label={name}
          disabled={onChange === undefined}
          onChange={onChange ? (event) => onChange(Number(event.target.value)) : undefined}
        />
      </label>
      {note && <div className="en-setpoint__note">{note}</div>}
    </div>
  );
}
