// The detailed report — the read-out the bottom strip has no room for
// (01 §8 pt 5). It docks between the map and the dispatcher panel on a wide
// screen and takes the map's place on a narrow one (app-shell.css): the panel
// and the ribbon stay alive either way, so reading a year's balance never stops
// the player from nudging a setpoint and committing the turn (01 §2.3).
//
// Scrolling the report left and right moves the report ALONE. The ribbon
// selection, the strip below and the map keep pointing where they pointed —
// this is a second, independent reading of the same archive.

import { TabStrip } from "../components/TabStrip";
import { REPORT_SCOPES, type ReportScope } from "./period";
import { SCOPE_LABELS, type PeriodReportModel, type ReportRow } from "./reportModel";

const SCOPE_OPTIONS = REPORT_SCOPES.map((scope) => ({
  value: scope,
  label: SCOPE_LABELS[scope],
}));

export interface ReportViewProps {
  /** Null when the session has not resolved a single turn yet. */
  model: PeriodReportModel | null;
  scope: ReportScope;
  onScope: (scope: ReportScope) => void;
  /** Steps one period back (−1) or forward (+1). */
  onStep: (delta: number) => void;
  onClose: () => void;
}

function Row({ row }: { row: ReportRow }) {
  const className = ["en-repline", row.strong ? "en-repline--strong" : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className}>
      <div className="en-kv">
        <span>{row.label}</span>
        <span className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</span>
      </div>
      {row.note && <div className="en-repline__note">{row.note}</div>}
    </div>
  );
}

export function ReportView({ model, scope, onScope, onStep, onClose }: ReportViewProps) {
  return (
    <aside className="en-reportdock" data-region="report-detail" aria-label="Raport szczegółowy">
      <div className="en-reportdock__head">
        <div className="en-reportdock__bar">
          <TabStrip
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={onScope}
            ariaLabel="Zakres raportu"
          />
          <button type="button" className="en-seg en-reportdock__close" onClick={onClose}>
            ✕ ZAMKNIJ
          </button>
        </div>

        {model ? (
          <>
            <div className="en-reportdock__nav">
              <button
                type="button"
                className="en-seg"
                onClick={() => onStep(-1)}
                disabled={model.prevAnchor === null}
                aria-label="Poprzedni okres"
              >
                ◀
              </button>
              <div className="en-reportdock__title">
                {model.title}
                <span>{model.subtitle}</span>
              </div>
              <button
                type="button"
                className="en-seg"
                onClick={() => onStep(1)}
                disabled={model.nextAnchor === null}
                aria-label="Następny okres"
              >
                ▶
              </button>
            </div>
            <div className="en-reportdock__coverage">
              {model.coverage}
              {model.atNewest && <em> · NAJNOWSZY</em>}
            </div>
          </>
        ) : (
          <div className="en-reportdock__title">
            BRAK DANYCH
            <span>ŻADNA TURA NIE ZOSTAŁA JESZCZE ROZSTRZYGNIĘTA</span>
          </div>
        )}
      </div>

      <div className="en-reportdock__body">
        {model?.sections.map((section) => (
          <section className="en-section" key={section.label}>
            <div className="en-section__label">{section.label}</div>
            <div className="en-stack en-stack--tight">
              {section.rows.map((row) => (
                <Row row={row} key={row.label} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
