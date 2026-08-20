// Adapted from design-system/components/shell/TopBar.{jsx,d.ts}.
// The bar is read-only by design (TopBar.prompt.md): no actions live here.
//
// One deliberate exception, `actions`: the detailed report is opened from the
// top of the screen, and the screen has no other strip up there — the biome
// legend is drawn inside the map's SVG, not in the DOM. The slot takes the
// segmented control's small button, never the primary one: the screen's single
// primary action stays ZATWIERDŹ TURĘ (Button.prompt.md).

import type { ReactNode } from "react";

export interface TopBarKpi {
  /** Uppercase label, e.g. "BUDŻET". */
  label: string;
  /** Value with its unit, e.g. "7,42 mld zł". */
  value: string;
  /** Tone of the value; neutral by default. */
  tone?: "ok" | "warn" | "danger";
}

export interface TopBarProps {
  /** Game name in the wordmark. */
  mark?: string;
  /** Time context, e.g. "ROK 3 · LISTOPAD · DOBA ROBOCZA A". */
  context?: string;
  /** Weather regime name (06 §8.2) — the bar's only accent color. */
  regime?: string;
  /** Right-aligned indicators. Max 4 — beyond that the bar gets crowded. */
  kpis?: TopBarKpi[];
  /** Small controls at the far right, after the indicators. See the note above. */
  actions?: ReactNode;
}

export function TopBar({
  mark = "ELECTRONATION",
  context,
  regime,
  kpis = [],
  actions,
}: TopBarProps) {
  return (
    <div className="en-topbar">
      <div className="en-topbar__mark">⬡ {mark}</div>
      {(context ?? regime) && (
        <div className="en-topbar__ctx">
          {context}
          {regime && (
            <em>
              {context ? " · " : ""}REŻIM: {regime}
            </em>
          )}
        </div>
      )}
      <div className="en-topbar__kpis">
        {kpis.map((kpi) => (
          <div className="en-kpi" key={kpi.label}>
            {kpi.label} <b className={kpi.tone ? `is-${kpi.tone}` : undefined}>{kpi.value}</b>
          </div>
        ))}
      </div>
      {actions && <div className="en-topbar__actions">{actions}</div>}
    </div>
  );
}
