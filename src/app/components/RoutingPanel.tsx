// Line-routing mode in the right column (01 §3.3, 02 §10 pt 2): pick a type,
// hover the map for the auto-route, click the target object to lock it, bend
// it by hand with waypoints, confirm. The dispatcher panel is hidden while
// this runs, so the screen still has exactly one primary action — here it is
// the route (M7 brief pt 5).
//
// Markup only: the route, its price and its refusal come from
// ../routing/session.ts, which prices it exactly as the engine will charge it.

import { useMemo } from "react";
import { LINE_TYPES, type GameState, type HexCoord, type LineType } from "../../engine";
import { formatMoneyPln, formatMw, formatNumber } from "../format";
import { LINE_TYPE_LABELS, daysLabel } from "../labels";
import { hexPanelTitle } from "../panel/hex";
import { planRoute, type RoutingSession } from "../routing/session";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { PanelSection } from "./PanelSection";

const LINE_ORDER: readonly LineType[] = ["lv", "mv", "hv"];

export interface RoutingPanelProps {
  game: GameState;
  session: RoutingSession;
  onType: (lineType: LineType) => void;
  onConfirm: (path: HexCoord[]) => void;
  onCancel: () => void;
}

export function RoutingPanel({ game, session, onType, onConfirm, onCancel }: RoutingPanelProps) {
  const plan = useMemo(() => planRoute(game, session), [game, session]);
  // The same route priced in all three types — the choice is a cost decision
  // (01 §4.2), so the card shows what each one would cost right now.
  const prices = useMemo(
    () => LINE_ORDER.map((type) => ({ type, plan: planRoute(game, session, type) })),
    [game, session],
  );
  const origin = hexPanelTitle(game, session.from).title;
  const target = session.target ? hexPanelTitle(game, session.target).title : null;
  const ready = plan !== null && plan.note === null && session.target !== null;

  return (
    <Panel meta={`LINIA Z ${origin}`} title="TRASOWANIE LINII">
      <PanelSection label="TYP LINII">
        <div className="en-actions">
          {prices.map(({ type, plan: priced }) => {
            const spec = LINE_TYPES[type];
            return (
              <button
                key={type}
                type="button"
                className="en-seg en-catalog__buy"
                aria-pressed={type === session.lineType}
                onClick={() => onType(type)}
              >
                <span className="en-catalog__name">
                  {LINE_TYPE_LABELS[type]} · {formatMw(spec.capacityMw)}
                  <span className="en-catalog__size">
                    straty {formatNumber(spec.lossPctPer100km)}%/100 km ·{" "}
                    {formatNumber(spec.buildHoursPerHex)} h/heks
                  </span>
                </span>
                <span className="en-catalog__price">
                  {priced ? formatMoneyPln(priced.costPln) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection label="TRASA" grow>
        <div className="en-stack en-stack--tight">
          <div className="en-kv">
            <span>CEL</span>
            <span className={target === null ? "is-muted" : undefined}>
              {target ?? "wskaż obiekt na mapie"}
            </span>
          </div>
          <div className="en-kv">
            <span>DŁUGOŚĆ</span>
            <span>{plan ? `${formatNumber(plan.lengthKm)} km` : "—"}</span>
          </div>
          <div className="en-kv">
            <span>KOSZT</span>
            <span>{plan ? formatMoneyPln(plan.costPln) : "—"}</span>
          </div>
          <div className="en-kv">
            <span>CZAS BUDOWY</span>
            <span>
              {plan ? `${formatNumber(plan.buildHours)} H · ${daysLabel(plan.buildDays)}` : "—"}
            </span>
          </div>
          <div className="en-kv">
            <span>PUNKTY POŚREDNIE</span>
            <span>{formatNumber(session.waypoints.length)}</span>
          </div>
        </div>
        <div className="en-note">
          {session.target === null
            ? "Klik obiektu docelowego zatrzaskuje trasę."
            : "Klik heksa wstawia punkt pośredni, klik punktu usuwa go."}
        </div>
        {plan?.note != null && <div className="en-note is-danger">{plan.note}</div>}
        {plan === null && session.target !== null && (
          <div className="en-note is-danger">✕ brak przejezdnej trasy do tego obiektu</div>
        )}
      </PanelSection>

      <PanelSection sunk>
        <div className="en-panel__actions">
          <Button
            block
            disabled={!ready}
            onClick={() => {
              if (plan) onConfirm(plan.path);
            }}
          >
            {plan && session.target !== null
              ? `ZATWIERDŹ — ${formatMoneyPln(plan.costPln)} · ${daysLabel(plan.buildDays)}`
              : "ZATWIERDŹ TRASĘ ▸"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            ✕ ANULUJ
          </Button>
        </div>
      </PanelSection>
    </Panel>
  );
}
