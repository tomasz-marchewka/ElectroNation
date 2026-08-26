// Adapted from design-system/components/controls/SetpointSlider.{jsx,d.ts}.
// A dispatchable unit's setpoint: full 0–100% range every turn (01 §5.1),
// except the dead zone below a technical minimum — see `minOnMw`. The
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
  /**
   * Technical minimum [MW] (01 §5.1 pt 4): the smallest non-zero order the
   * unit can hold, so (0, minOnMw) is a dead zone — the pointer snaps to the
   * nearer of 0 and minOnMw, the arrow keys jump the gap, a tick marks it.
   * The engine floors sub-minimum orders anyway; this keeps the slider honest.
   */
  minOnMw?: number;
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
  minOnMw = 0,
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
  // Min or off: the dead zone resolves to its nearer end.
  const snapMw = (raw: number): number => {
    if (minOnMw <= 0 || raw <= 0 || raw >= minOnMw) return raw;
    return raw < minOnMw / 2 ? 0 : minOnMw;
  };

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
        {minOnMw > 0 && (
          <span className="en-setpoint__min" style={{ left: `${percentAt(minOnMw)}%` }} />
        )}
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
          onChange={
            onChange
              ? (event) => {
                  // Snapping can land back on the current value (the upper half
                  // of the dead zone while the unit holds minimum) — no order.
                  const next = snapMw(Number(event.target.value));
                  if (next !== value) onChange(next);
                }
              : undefined
          }
          onKeyDown={
            onChange && minOnMw > 0
              ? (event) => {
                  // The native step would walk into the dead zone and the snap
                  // would push it straight back — jump the gap instead.
                  const down = event.key === "ArrowDown" || event.key === "ArrowLeft";
                  const up = event.key === "ArrowUp" || event.key === "ArrowRight";
                  if (down && value > 0 && value <= minOnMw) {
                    event.preventDefault();
                    onChange(0);
                  } else if (up && value === 0) {
                    event.preventDefault();
                    onChange(minOnMw);
                  }
                }
              : undefined
          }
        />
      </label>
      {note && <div className="en-setpoint__note">{note}</div>}
    </div>
  );
}
