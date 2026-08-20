// A row of mutually exclusive tabs, any number of them.
//
// NOT `SegmentedControl`: that component's brief caps it at three options
// ("four options mean the wrong component" — SegmentedControl.prompt.md) and
// the report has four scopes. The visual values are the segmented control's
// own classes, so nothing new enters the design system — only the arity does.

export interface TabOption<T extends string = string> {
  value: T;
  /** Label in caps, e.g. "MIESIĄC". */
  label: string;
}

export interface TabStripProps<T extends string = string> {
  options: readonly TabOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Accessible name of the group, e.g. "Zakres raportu". */
  ariaLabel?: string;
}

export function TabStrip<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
}: TabStripProps<T>) {
  return (
    <div className="en-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          role="tab"
          className="en-seg"
          aria-selected={option.value === value}
          aria-pressed={option.value === value}
          onClick={onChange ? () => onChange(option.value) : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
