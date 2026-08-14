import React from "react";

/** Pasek rozstrzygnięcia i raportu tury — pod mapą, po zatwierdzeniu. */
export function ReportStrip({ label = "PO ZATWIERDZENIU", title = "ROZSTRZYGNIĘCIE + RAPORT", tiles = [] }) {
  return (
    <div className="en-report">
      <div className="en-report__label">
        {label}
        <br />
        <b>{title}</b>
      </div>
      <div className="en-report__tiles">
        {tiles.map((t, i) => (
          <div className={"en-tile" + (t.highlight ? " en-tile--ok" : "")} key={i}>
            <div className={"en-tile__label" + (t.tone ? " is-" + t.tone : "")}>{t.label}</div>
            <div className={"en-tile__value" + (t.tone ? " is-" + t.tone : "")}>{t.value}</div>
            {t.note && <div className="en-tile__note">{t.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
