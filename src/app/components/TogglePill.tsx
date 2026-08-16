// Adapted from design-system/components/controls/TogglePill.{jsx,d.ts}.
// A whole farm on or off — the only manual RES control there is (01 §4.1);
// partial RES setpoints do not exist, hence a pill and not a slider.

export interface TogglePillProps {
  /** Whether the farm runs. */
  on?: boolean;
  /** Labels [on, off]. */
  labels?: readonly [string, string];
  /** Accessible name, e.g. "FW GRZBIET". */
  ariaLabel?: string;
  onChange?: (on: boolean) => void;
}

export function TogglePill({
  on = true,
  labels = ["WŁ.", "WYŁ."],
  ariaLabel,
  onChange,
}: TogglePillProps) {
  return (
    <button
      type="button"
      className={on ? "en-pill" : "en-pill is-off"}
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={onChange ? () => onChange(!on) : undefined}
    >
      {on ? labels[0] : labels[1]}
    </button>
  );
}
