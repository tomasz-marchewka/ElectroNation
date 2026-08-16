// The hex panel — the right column's other state (01 §8 pt 6). A click on ANY
// hex opens it: terrain read-outs, the build catalogue that is the only way to
// build anything, and the actions of whatever already stands there.
//
// Adapted from the `HexPanel` function of the reference build
// (ui_kits/dispatcher/DispatcherScreen.jsx) — its only specification. The
// component is markup: every number, price and refusal is built by
// ../panel/hex.ts from the engine's CONFIG, and the design's own catalogue
// numbers are ignored on purpose (plan/README.md).

import { useMemo, useState } from "react";
import type { Action, GameState, HexCoord, TurnReport } from "../../engine";
import {
  DEFAULT_CATALOG_SIZES,
  applyCatalogSize,
  buildCatalog,
  hexLineRows,
  hexObjectView,
  hexPanelMeta,
  hexPanelTitle,
  lineTypeRows,
  terrainRows,
  type CatalogEntry,
  type CatalogSizes,
  type HexAction,
  type InfoRow,
} from "../panel/hex";
import type { BottleneckRef } from "../map/sceneModel";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { PanelSection } from "./PanelSection";
import { StatusDot } from "./StatusDot";
import { Stepper } from "./Stepper";

/** The engine refused an action the interface thought was fine — a UI bug. */
const ENGINE_REFUSED = "✕ silnik odrzucił akcję — warunki budowy się zmieniły";

function InfoRowView({ row }: { row: InfoRow }) {
  return (
    <div className="en-kv">
      <span>{row.label}</span>
      <span className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</span>
    </div>
  );
}

/**
 * One ghost action. Anything that destroys work already paid for asks twice
 * (01 §2.6: cancelling forfeits every zloty), and a refused action stays
 * visible with its diagnosis instead of disappearing.
 */
function HexActionButton({
  action,
  onRun,
}: {
  action: HexAction;
  onRun: (action: HexAction) => void;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <div className="en-action">
      <Button
        variant="ghost"
        block
        disabled={action.note !== null}
        onClick={() => {
          if (action.confirm !== undefined && !armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onRun(action);
        }}
      >
        {armed && action.confirm !== undefined ? action.confirm : action.label}
      </Button>
      {action.note !== null && <div className="en-note">{action.note}</div>}
    </div>
  );
}

function CatalogEntryView({
  entry,
  rejected,
  onBuild,
  onSize,
}: {
  entry: CatalogEntry;
  rejected: string | undefined;
  onBuild: (entry: CatalogEntry) => void;
  onSize: (entry: CatalogEntry, index: number, value: number) => void;
}) {
  const note = entry.note ?? rejected ?? null;
  return (
    <div className="en-catalog__entry">
      <button
        type="button"
        className="en-seg en-catalog__buy"
        disabled={entry.note !== null}
        onClick={() => onBuild(entry)}
      >
        <span className="en-catalog__name">
          {entry.name}
          <span className="en-catalog__size">{entry.size}</span>
        </span>
        <span className="en-catalog__price">{entry.price}</span>
      </button>
      {entry.steppers.map((stepper, index) => (
        <Stepper
          key={stepper.label}
          label={stepper.label}
          name={`${entry.name} · ${stepper.label}`}
          value={stepper.value}
          unit={stepper.unit}
          min={stepper.min}
          max={stepper.max}
          step={stepper.step}
          onChange={(value) => onSize(entry, index, value)}
        />
      ))}
      {note !== null && <div className="en-note">{note}</div>}
    </div>
  );
}

export interface HexPanelProps {
  game: GameState;
  /** The turn the map is showing — the STAN read-outs come from it (01 §2.3). */
  report: TurnReport | null;
  hex: HexCoord;
  /** Runs an engine action; false means the engine refused it. */
  onAction: (action: Action) => boolean;
  /** Enters line-routing mode from this hex (01 §3.3). */
  onRoute: (from: HexCoord) => void;
  /** Points the map at the tightest place of the last report (01 §8 pt 6). */
  onBottleneck: (ref: BottleneckRef) => void;
  /** Back to the dispatcher panel — clears the selection. */
  onClose: () => void;
}

export function HexPanel({
  game,
  report,
  hex,
  onAction,
  onRoute,
  onBottleneck,
  onClose,
}: HexPanelProps) {
  const [sizes, setSizes] = useState<CatalogSizes>(DEFAULT_CATALOG_SIZES);
  const [rejected, setRejected] = useState<Record<string, string>>({});

  const { title, note } = useMemo(() => hexPanelTitle(game, hex), [game, hex]);
  const terrain = useMemo(() => terrainRows(game, hex), [game, hex]);
  const lines = useMemo(() => hexLineRows(game, report, hex), [game, report, hex]);
  const object = useMemo(() => hexObjectView(game, report, hex), [game, report, hex]);
  const catalog = useMemo(
    () => (object ? [] : buildCatalog(game, hex, sizes)),
    [game, hex, object, sizes],
  );
  const lineTable = useMemo(() => lineTypeRows(game, hex), [game, hex]);

  const run = (action: HexAction) => {
    switch (action.intent.kind) {
      case "route":
        onRoute(hex);
        return;
      case "bottleneck":
        onBottleneck(action.intent.ref);
        return;
      case "action":
        onAction(action.intent.action);
        return;
    }
  };

  // The catalogue button is already greyed out when the app can name a reason,
  // so a refusal here means the engine knows something the interface does not
  // (M7 brief pt 4) — it is shown rather than swallowed.
  const build = (entry: CatalogEntry) => {
    const done = onAction(entry.action);
    setRejected((current) => ({ ...current, [entry.key]: done ? "" : ENGINE_REFUSED }));
  };

  return (
    <Panel meta={hexPanelMeta(hex)} title={title} note={note ?? undefined}>
      <PanelSection label="TEREN">
        <div className="en-stack en-stack--tight">
          {terrain.map((row) => (
            <InfoRowView key={row.key} row={row} />
          ))}
        </div>
        {lines.length > 0 && (
          <>
            <div className="en-section__label">LINIE PRZEZ HEKS</div>
            <div className="en-stack en-stack--tight">
              {lines.map((row) => (
                <div key={row.key}>
                  <div className="en-kv">
                    <span>{row.label}</span>
                    <span className={`is-${row.tone}`}>{row.value}</span>
                  </div>
                  {row.actions.map((action) => (
                    <HexActionButton key={action.key} action={action} onRun={run} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </PanelSection>

      {object ? (
        <PanelSection label="OBIEKT" grow>
          <div className="en-stack en-stack--tight">
            <InfoRowView key="kind" row={{ key: "kind", label: "RODZAJ", value: object.kind }} />
            <div className="en-kv">
              <span>STAN</span>
              <span className={`is-${object.status.tone}`}>
                <StatusDot tone={object.status.tone} /> {object.status.label}
              </span>
            </div>
            {object.connections !== null && (
              <InfoRowView
                key="connections"
                row={{ key: "connections", label: "PRZYŁĄCZA", value: object.connections }}
              />
            )}
            {object.rows.map((row) => (
              <InfoRowView key={row.key} row={row} />
            ))}
          </div>
          <div className="en-section__label">AKCJE</div>
          <div className="en-actions">
            {object.actions.map((action) => (
              <HexActionButton key={action.key} action={action} onRun={run} />
            ))}
          </div>
        </PanelSection>
      ) : (
        <PanelSection label="KATALOG BUDOWY — CENY Z MNOŻNIKIEM TERENU" grow>
          <div className="en-catalog">
            {catalog.map((entry) => (
              <CatalogEntryView
                key={entry.key}
                entry={entry}
                rejected={rejected[entry.key] === "" ? undefined : rejected[entry.key]}
                onBuild={build}
                onSize={(built, index, value) => {
                  const stepper = built.steppers[index];
                  if (!stepper) return;
                  setSizes((current) => applyCatalogSize(current, stepper.target, value));
                }}
              />
            ))}
          </div>
          <div className="en-section__label">LINIA Z TEGO HEKSA</div>
          <div className="en-stack en-stack--tight">
            {lineTable.map((row) => (
              <InfoRowView key={row.key} row={row} />
            ))}
          </div>
        </PanelSection>
      )}

      <PanelSection sunk>
        <Button variant="ghost" block onClick={onClose}>
          ◂ WRÓĆ DO PANELU DYSPOZYTORA
        </Button>
      </PanelSection>
    </Panel>
  );
}
