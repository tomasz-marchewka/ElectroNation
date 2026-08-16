// Size picker of the build catalogue: `− 400 MW +`. Not in the handoff — the
// reference build offers one fixed size per entry, while the game lets the
// player pick the block within the engine's own limit (01 §5.1–§5.3). Built
// from the system's primitives (`.en-seg` buttons, mono numbers): no new
// visual values, no animation.

import { formatNumber } from "../format";

export interface StepperProps {
  /** Caption of the number, e.g. "MOC". */
  label: string;
  /** What the control is called out loud — the entry's name plus the caption. */
  name: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export function Stepper({ label, name, value, unit, min, max, step, onChange }: StepperProps) {
  const move = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));
  const stepLabel = `${formatNumber(step)} ${unit}`;
  return (
    <div className="en-stepper">
      <span className="en-stepper__label">{label}</span>
      <button
        type="button"
        className="en-seg"
        aria-label={`${name} −${stepLabel}`}
        disabled={value <= min}
        onClick={() => move(-step)}
      >
        −
      </button>
      <span className="en-stepper__value">
        {formatNumber(value)} {unit}
      </span>
      <button
        type="button"
        className="en-seg"
        aria-label={`${name} +${stepLabel}`}
        disabled={value >= max}
        onClick={() => move(step)}
      >
        +
      </button>
    </div>
  );
}
