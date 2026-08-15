// Adapted from design-system/components/shell/PanelSection.{jsx,d.ts}.

import type { ReactNode } from "react";

export interface PanelSectionProps {
  /** Section label in caps, e.g. "NASTAWY". Omit for an unlabelled section. */
  label?: string;
  /** Stretches the section over the free height (the setpoints section). */
  grow?: boolean;
  /** Sunken background — reserved for the balance section at the bottom. */
  sunk?: boolean;
  children?: ReactNode;
}

export function PanelSection({ label, grow = false, sunk = false, children }: PanelSectionProps) {
  const className = [
    "en-section",
    grow ? "en-section--grow" : null,
    sunk ? "en-section--sunk" : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={className}>
      {label !== undefined && <div className="en-section__label">{label}</div>}
      {children}
    </section>
  );
}
