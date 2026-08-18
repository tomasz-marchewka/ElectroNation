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

/**
 * The three modes as badges, in the order the slider runs: charging left of
 * zero, giving back right of it. Nothing is clickable here — the slider decides
 * which badge lights up (see SetpointSlider on the divergence from the handoff,
 * whose own control was a three-state switch).
 */
const STORAGE_MODES: readonly SegmentedOption<StorageMode>[] = [
  { value: "charge", label: STORAGE_MODE_LABELS.charge },
  { value: "idle", label: STORAGE_MODE_LABELS.idle },
  { value: "discharge", label: STORAGE_MODE_LABELS.discharge },
];

/**
 * Signed setpoint → the engine's `{ mode, mw }` pair. The centre of the track
 * is the only zero there is, so a rested storage carries no direction at all.
 */
function storageAction(storageId: string, signedMw: number): Action {
  const mode: StorageMode = signedMw === 0 ? "idle" : signedMw < 0 ? "charge" : "discharge";
  return { type: "setStorage", storageId, mode, mw: Math.abs(signedMw) };
}

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
            min={-row.maxMw}
            max={row.maxMw}
            color={row.color}
            valueText={row.valueLabel}
            onChange={(mw) => onAction(storageAction(row.id, mw))}
          />
          <div className="en-unit__controls">
            <SegmentedControl options={STORAGE_MODES} value={row.mode} readOnly />
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
  /** Scrub until something happens or the day ends (01 §2.5). */
  onSkip: () => void;
  /** Scrub straight to a turn picked on the ribbon (01 §2.5). */
  onScrubTo: (turnIndex: number) => void;
  /**
   * Future turn of THIS day selected on the ribbon, or null. It decides which
   * of the two scrubs the one ghost button performs — the ribbon names the
   * target, the panel keeps the action.
   */
  scrubTurnIndex?: number | null;
  /** Why the last scrub stopped; absent when time moved one turn at a time. */
  stopNote?: string;
}

export function DispatcherPanel({
  game,
  onAction,
  onCommit,
  onSkip,
  onScrubTo,
  scrubTurnIndex = null,
  stopNote,
}: DispatcherPanelProps) {
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
        {stopNote && <div className="en-panel__stop">{stopNote}</div>}
        <div className="en-panel__actions">
          <Button block onClick={onCommit}>
            ZATWIERDŹ TURĘ ▸
          </Button>
          {/* Commit and skip diverge (open question of the handoff README):
              commit is one turn, skip runs until a stop rule fires (01 §2.5).
              Picking a future turn on the ribbon aims the same button at it —
              the two scrubs of 01 §2.5 are one control, never two. */}
          <Button
            variant="ghost"
            onClick={() => (scrubTurnIndex === null ? onSkip() : onScrubTo(scrubTurnIndex))}
            title={
              scrubTurnIndex === null
                ? "Przewiń tury aż do zdarzenia albo do końca doby"
                : `Przewiń do tury ${scrubTurnIndex + 1} — nastawy bez zmian`
            }
          >
            {scrubTurnIndex === null ? "PRZEWIŃ ⏭" : `PRZEWIŃ DO T${scrubTurnIndex + 1} ⏭`}
          </Button>
        </div>
      </PanelSection>
    </Panel>
  );
}
