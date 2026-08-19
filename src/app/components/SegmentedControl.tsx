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
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
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
