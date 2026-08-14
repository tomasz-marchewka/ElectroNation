import React from "react";

/** Sekcja panelu z etykietą wersalikami. */
export function PanelSection({ label, grow = false, sunk = false, children }) {
  const cls = ["en-section", grow && "en-section--grow", sunk && "en-section--sunk"]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={cls}>
      {label && <div className="en-section__label">{label}</div>}
      {children}
    </section>
  );
}
