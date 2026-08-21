// Size picker of the build catalogue: `− 400 MW +`, `− DUŻY · 400 MW +`. Not
// in the handoff — the reference build offers one fixed size per entry, while
// the game lets the player pick the farm's MW and the plant block's rung
// (01 §5.1–§5.3). Built from the system's primitives (`.en-seg` buttons, mono
// numbers): no new visual values, no animation. The control is presentational:
// what a step SETS is decided in `panel/hex.ts`, which knows whether it walks
// MW or the four block sizes; here a null handler simply greys the button.

export interface StepperProps {
  /** Caption of the value, e.g. "MOC". */
  label: string;
  /** What the control is called out loud — the entry's name plus the caption. */
  name: string;
  /** The value as it reads: `400 MW`, `DUŻY · 400 MW`. */
  valueLabel: string;
  /** How the buttons are announced, e.g. `−50 MW` / `mniejszy`. */
  decreaseLabel: string;
  increaseLabel: string;
  /** null at the end of the range — the button greys out. */
  onDecrease: (() => void) | null;
  onIncrease: (() => void) | null;
}

export function Stepper({
  label,
  name,
  valueLabel,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
}: StepperProps) {
  return (
    <div className="en-stepper">
      <span className="en-stepper__label">{label}</span>
      <button
        type="button"
        className="en-seg"
        aria-label={`${name} ${decreaseLabel}`}
        disabled={onDecrease === null}
        onClick={onDecrease ?? undefined}
      >
        −
      </button>
      <span className="en-stepper__value">{valueLabel}</span>
      <button
        type="button"
        className="en-seg"
        aria-label={`${name} ${increaseLabel}`}
        disabled={onIncrease === null}
        onClick={onIncrease ?? undefined}
      >
        +
      </button>
    </div>
  );
}
