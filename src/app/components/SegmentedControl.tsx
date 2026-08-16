// Adapted from design-system/components/controls/SegmentedControl.{jsx,d.ts}.
// Two or three mutually exclusive modes and nothing more — four options mean
// the wrong component (SegmentedControl.prompt.md).

export interface SegmentedOption<T extends string = string> {
  value: T;
  /** Label in caps, e.g. "ŁADUJ". */
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  /** Max 3. */
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Accessible name of the group, e.g. "Tryb magazynu". */
  ariaLabel?: string;
  /**
   * Badges, not buttons: the state is decided by another control (the bipolar
   * storage slider) and the strip only names it. Hidden from screen readers —
   * the control that owns the state is the one that speaks it, and a row of
   * unreachable labels would only be noise on the way to it.
   */
  readOnly?: boolean;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  readOnly,
}: SegmentedControlProps<T>) {
  if (readOnly) {
    return (
      <div className="en-segmented is-readonly" aria-hidden="true">
        {options.map((option) => (
          <span
            key={option.value}
            className={option.value === value ? "en-seg is-active" : "en-seg"}
          >
            {option.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="en-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className="en-seg"
          aria-pressed={option.value === value}
          onClick={onChange ? () => onChange(option.value) : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
