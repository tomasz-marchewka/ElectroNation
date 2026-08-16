// Adapted from design-system/components/data/BalanceSummary.{jsx,d.ts}.
// The last thing read before committing the turn. The note always says WHERE
// the risk comes from — diagnosis, never an alarm (BalanceSummary.prompt.md).

export type BalanceTone = "ok" | "warn" | "danger";

export interface BalanceRow {
  /** Component name in caps, e.g. "ZAPOTRZEBOWANIE". */
  label: string;
  /** Value with its unit, already formatted. */
  value: string;
}

export interface BalanceSummaryProps {
  rows?: readonly BalanceRow[];
  totalLabel?: string;
  /** The reserve, e.g. "+25 MW (1,6%)". */
  total: string;
  tone?: BalanceTone;
  /** Diagnosis, e.g. "⚠ dolne pasmo prognozy = −60 MW → ryzyko niedoboru". */
  note?: string;
}

export function BalanceSummary({
  rows = [],
  totalLabel = "ZAPAS",
  total,
  tone = "warn",
  note,
}: BalanceSummaryProps) {
  return (
    <div className="en-summary">
      {rows.map((row) => (
        <div className="en-summary__row" key={row.label}>
          <span>{row.label}</span>
          <b>{row.value}</b>
        </div>
      ))}
      <div className={`en-summary__total is-${tone}`}>
        <span>{totalLabel}</span>
        <span>{total}</span>
      </div>
      {note && <div className={`en-summary__note is-${tone}`}>{note}</div>}
    </div>
  );
}
