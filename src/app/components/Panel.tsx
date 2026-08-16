// Adapted from design-system/components/shell/Panel.{jsx,d.ts}.
// The 400 px right column of the dispatcher screen (01 §8 pt 5): always
// visible, never collapsed, never tabbed.

import type { ReactNode } from "react";

export interface PanelProps {
  /** Meta line above the title, e.g. "TURA 7/8 · LISTOPAD · ×10,9 DNIA". */
  meta?: string;
  /** Current turn name in caps, e.g. "SZCZYT WIECZORNY". */
  title?: string;
  /** Hour block of the turn, e.g. "18–21". Rendered dimmer next to the title. */
  hours?: string;
  /**
   * Whatever else belongs in that same dimmer slot next to the title — the hex
   * panel writes the terrain's cost multiplier there (design: `HexPanel`).
   * Ignored when `hours` is given; the slot holds one thing.
   */
  note?: string;
  /** Panel width. Defaults to the --en-panel-w token (400 px). */
  width?: number | string;
  /** Panel sections (PanelSection). Max 4 — see PanelSection.prompt.md. */
  children?: ReactNode;
}

export function Panel({ meta, title, hours, note, width, children }: PanelProps) {
  const aside = hours ?? note;
  return (
    <aside className="en-panel" style={width !== undefined ? { width } : undefined}>
      {(meta ?? title) && (
        <div className="en-panel__head">
          {meta && <div className="en-panel__meta">{meta}</div>}
          {title && (
            <div className="en-panel__title">
              {title} {aside && <span>{aside}</span>}
            </div>
          )}
        </div>
      )}
      {children}
    </aside>
  );
}
