import React from "react";

/** Podsumowanie bilansu tury: składniki, zapas i ostrzeżenie. */
export function BalanceSummary({ rows = [], totalLabel = "ZAPAS", total, tone = "warn", note }) {
  return (
    <div className="en-summary">
      {rows.map((r, i) => (
        <div className="en-summary__row" key={i}>
          <span>{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
      <div className={"en-summary__total is-" + tone}>
        <span>{totalLabel}</span>
        <span>{total}</span>
      </div>
      {note && <div className={"en-summary__note is-" + tone}>{note}</div>}
    </div>
  );
}
