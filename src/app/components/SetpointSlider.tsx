// Adapted from design-system/components/controls/SetpointSlider.{jsx,d.ts}.
// A dispatchable unit's setpoint: full 0–100% range every turn (01 §5.1). The
// thumb is a 3×12 px bar, not a circle — this is switchgear, not a form. A
// native range input lies transparent over the drawn track, so the keyboard and
// the pointer both work without reimplementing either.
//
// One divergence from the handoff: `min` may go below zero, which the extracted
// component cannot do. A storage is the only bidirectional object in the game
// (01 §5.3) and the handoff drove it with a three-state switch instead — but
// then charging at 0 MW looks armed while nothing flows. With zero in the
// middle the drawn state and the dispatched state are the same number.

import { formatSetpoint } from "../format";

export interface SetpointSliderProps {
  /** Object name in caps, e.g. "EC MODRZYCA". */
  name: string;
  /** Technology in lowercase, e.g. "węgiel", "CCGT". */
  tech?: string;
  /** Current setpoint [MW]; negative on a bipolar slider. */
  value: number;
  /** Rated power [MW]. */
  max: number;
  /** Lower bound [MW]. Below zero the track fills from the zero tick either way. */
  min?: number;
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
  /**
   * Replaces the readout and the value the slider speaks. A bipolar slider
   * needs it: `−100 / 150 MW` says nothing about which way the power flows.
   */
  valueText?: string;
  /**
   * Where the unit ACTUALLY stands [MW] — the amber tick. A plant follows its
   * setpoint with inertia (01 §5.1 in 0.27), so the order and the output
   * diverge for a few turns; without the tick that reads as a broken slider.
   */
  actualMw?: number;
  /** Without it the slider is read-only. */
  onChange?: (value: number) => void;
}

export function SetpointSlider({
  name,
  tech,
  value,
  max,
  min = 0,
  unit = "MW",
  note,
  color,
  step = 10,
  valueText,
  actualMw,
  onChange,
}: SetpointSliderProps) {
  const span = max - min;
  const percentAt = (mw: number) =>
    span > 0 ? Math.max(0, Math.min(100, ((mw - min) / span) * 100)) : 0;
  // Same arithmetic for both shapes: a unipolar slider simply has its zero at
  // the left edge, so the fill grows from 0% as it always did.
  const zeroPercent = percentAt(0);
  const valuePercent = percentAt(value);
  // A unit at zero goes dim: the player is meant to see the headroom there.
  const off = value === 0;

  return (
    <div className={off ? "en-setpoint is-off" : "en-setpoint"}>
      <div className="en-setpoint__head">
        <span>
          {name} {tech && <small>{tech}</small>}
        </span>
        <span className={off ? "is-muted" : undefined}>
          {valueText ?? formatSetpoint(value, max, unit)}
        </span>
      </div>
      <label className="en-setpoint__track">
        <span
          className={value < 0 ? "en-setpoint__fill is-below" : "en-setpoint__fill"}
          style={{
            left: `${Math.min(zeroPercent, valuePercent)}%`,
            width: `${Math.abs(valuePercent - zeroPercent)}%`,
            background: color ?? "var(--en-gas-ico)",
          }}
        />
        {min < 0 && <span className="en-setpoint__zero" style={{ left: `${zeroPercent}%` }} />}
        {actualMw !== undefined && Math.abs(actualMw - value) > 0.5 && (
          <span className="en-setpoint__actual" style={{ left: `${percentAt(actualMw)}%` }} />
        )}
        <span className="en-setpoint__thumb" style={{ left: `${valuePercent}%` }} />
        <input
          className="en-setpoint__input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={name}
          aria-valuetext={valueText}
          disabled={onChange === undefined}
          onChange={onChange ? (event) => onChange(Number(event.target.value)) : undefined}
        />
      </label>
      {note && <div className="en-setpoint__note">{note}</div>}
    </div>
  );
}
