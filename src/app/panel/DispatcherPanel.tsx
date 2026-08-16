// The dispatcher panel — the default state of the 400 px right column
// (01 §2.3, §8 pt 5). Forecast, setpoints and the balance coexist in one
// standing view, the setpoints stay editable the whole time, and the only
// action that moves time is `ZATWIERDŹ TURĘ ▸`.
//
// The component is markup: every number it prints is built by ./forecast,
// ./setpoints and ./constructions out of the engine's own API.

import { useMemo } from "react";
import type { Action, GameState, StorageMode } from "../../engine";
import { BalanceSummary } from "../components/BalanceSummary";
import { Button } from "../components/Button";
import { ForecastRow } from "../components/ForecastRow";
import { Panel } from "../components/Panel";
import { PanelSection } from "../components/PanelSection";
import { SegmentedControl, type SegmentedOption } from "../components/SegmentedControl";
import { SetpointSlider } from "../components/SetpointSlider";
import { TogglePill } from "../components/TogglePill";
import { STORAGE_MODE_LABELS } from "../labels";
import { currentDayTurn, currentTurnTitle, turnMeta } from "../store/selectors";
import { buildQueue } from "./constructions";
import { panelForecast } from "./forecast";
import { setpointRowKey, setpointRows, type SetpointRow } from "./setpoints";

/** Three modes, never a slider: the storage either charges, rests or gives back. */
const STORAGE_MODES: readonly SegmentedOption<StorageMode>[] = [
  { value: "charge", label: STORAGE_MODE_LABELS.charge },
  { value: "idle", label: STORAGE_MODE_LABELS.idle },
  { value: "discharge", label: STORAGE_MODE_LABELS.discharge },
];

interface RowProps {
  row: SetpointRow;
  onAction: (action: Action) => void;
}

function SetpointRowView({ row, onAction }: RowProps) {
  switch (row.kind) {
    case "plant":
      return (
        <SetpointSlider
          name={row.name}
          tech={row.tech}
          value={row.valueMw}
          max={row.maxMw}
          note={row.note}
          color={row.color}
          onChange={(mw) => onAction({ type: "setPlantSetpoint", plantId: row.id, mw })}
        />
      );
    case "storage":
      return (
        <div className="en-unit">
          <SetpointSlider
            name={row.name}
            tech={row.tech}
            value={row.valueMw}
            max={row.maxMw}
            color={row.color}
            onChange={(mw) =>
              onAction({ type: "setStorage", storageId: row.id, mode: row.mode, mw })
            }
          />
          <div className="en-unit__controls">
            <SegmentedControl
              options={STORAGE_MODES}
              value={row.mode}
              ariaLabel={`Tryb pracy — ${row.name}`}
              onChange={(mode) =>
                onAction({ type: "setStorage", storageId: row.id, mode, mw: row.valueMw })
              }
            />
            <span className="en-soc">
              <span className="en-soc__track">
                <span className="en-soc__fill" style={{ width: `${row.socPercent}%` }} />
              </span>
              <span className="en-soc__value">{row.socLabel}</span>
            </span>
          </div>
        </div>
      );
    case "import":
      return (
        <SetpointSlider
          name={row.name}
          value={row.valueMw}
          max={row.maxMw}
          note={row.note}
          color={row.color}
          onChange={(mw) => onAction({ type: "setImport", borderId: row.id, mw })}
        />
      );
    case "export":
      return (
        <SetpointSlider
          name={row.name}
          value={row.valueMw}
          max={row.maxMw}
          note={row.note}
          color={row.color}
          onChange={(mw) => onAction({ type: "setExport", borderId: row.id, mw })}
        />
      );
    case "farm":
      return (
        <div className="en-farm">
          <span className="en-farm__name">
            {row.name} <small>{row.size}</small>
          </span>
          <span className="en-farm__control">
            <TogglePill
              on={row.enabled}
              ariaLabel={row.name}
              onChange={(enabled) => onAction({ type: "setFarmEnabled", farmId: row.id, enabled })}
            />
            <span
              className="en-farm__value"
              style={{ color: row.enabled ? row.color : "var(--en-text-4)" }}
            >
              {row.value}
            </span>
          </span>
        </div>
      );
  }
}

export interface DispatcherPanelProps {
  game: GameState;
  /** Player actions — JSON objects the engine applies (the replay protocol). */
  onAction: (action: Action) => void;
  /** The one action that moves time (01 §2.3). */
  onCommit: () => void;
}

export function DispatcherPanel({ game, onAction, onCommit }: DispatcherPanelProps) {
  const turn = currentDayTurn(game);
  const forecast = useMemo(() => panelForecast(game), [game]);
  const units = useMemo(() => setpointRows(game), [game]);
  const queue = useMemo(() => buildQueue(game), [game]);

  return (
    <Panel meta={turnMeta(game)} title={currentTurnTitle(game)} hours={turn.hours}>
      <PanelSection label={`PROGNOZA · TURA ${game.calendar.turnIndex + 1}`}>
        <div className="en-stack">
          {forecast.rows.map((row) => (
            <ForecastRow
              key={row.key}
              label={row.label}
              value={row.mw}
              band={row.bandMw}
              max={forecast.scaleMw}
              color={row.color}
              note={row.note}
              muted={row.muted}
            />
          ))}
        </div>
        <div className="en-section__label">BILANS PRZY OBECNYCH NASTAWACH</div>
        <div className="en-stack en-stack--tight">
          {forecast.turns.map((row) => (
            <div className="en-kv" key={row.turnIndex}>
              <span>{row.label}</span>
              <span className={`is-${row.tone}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection label="NASTAWY" grow>
        <div className="en-setpoints">
          {units.map((row) => (
            <SetpointRowView key={setpointRowKey(row)} row={row} onAction={onAction} />
          ))}
        </div>
      </PanelSection>

      {queue.length > 0 && (
        <PanelSection label="BUDOWY">
          <div className="en-stack en-stack--tight">
            {queue.map((row) => (
              <div className="en-kv" key={row.key}>
                <span>{row.name}</span>
                <span>{row.remaining}</span>
              </div>
            ))}
          </div>
        </PanelSection>
      )}

      <PanelSection sunk>
        <BalanceSummary
          rows={forecast.summary.rows}
          total={forecast.summary.total}
          tone={forecast.summary.tone}
          note={forecast.summary.note}
        />
        <div className="en-panel__actions">
          <Button block onClick={onCommit}>
            ZATWIERDŹ TURĘ ▸
          </Button>
          {/* Turn scrubbing is defined in 01 §2.5 and lands in M8. */}
          <Button variant="ghost" disabled title="Przewijanie tur — niedostępne w tej wersji">
            PRZEWIŃ ⏭
          </Button>
        </div>
      </PanelSection>
    </Panel>
  );
}
