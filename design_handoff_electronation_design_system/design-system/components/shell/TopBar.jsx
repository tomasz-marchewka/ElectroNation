import React from "react";

/** Pasek górny: znak, kontekst czasu i reżimu pogodowego, wskaźniki po prawej. */
export function TopBar({ mark = "ELECTRONATION", context, regime, kpis = [] }) {
  return (
    <div className="en-topbar">
      <div className="en-topbar__mark">⬡ {mark}</div>
      {(context || regime) && (
        <div className="en-topbar__ctx">
          {context}
          {regime ? <em>{context ? " · " : ""}reżim: {regime}</em> : null}
        </div>
      )}
      <div className="en-topbar__kpis">
        {kpis.map((k, i) => (
          <div className="en-kpi" key={i}>
            {k.label}{" "}
            <b className={k.tone ? "is-" + k.tone : undefined}>{k.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
