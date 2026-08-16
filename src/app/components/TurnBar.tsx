// Adapted from design-system/components/shell/TurnBar.{jsx,d.ts}.
// The day axis under the map: 8 blocks of 3 h (01 §2.2). Never 24 hours —
// a day is 8 turns.

import { DAY_TURNS, type DayTurn } from "../labels";

export interface TurnBarProps {
  /** The turns to render. Defaults to DAY_TURNS. */
  turns?: readonly DayTurn[];
  /** Index of the current turn (0–7). */
  current?: number;
  /**
   * Scrub to a FUTURE turn (01 §2.5): every turn on the way is resolved with
   * the setpoints as they stand. Only future cells offer it — a resolved turn
   * is never replayable, and the current one is where time already is.
   */
  onSelect?: (index: number) => void;
}

export function TurnBar({ turns = DAY_TURNS, current = 0, onSelect }: TurnBarProps) {
  return (
    <div className="en-turnbar">
      {turns.map((turn, index) => {
        const className = [
          "en-turn",
          index === current ? "is-current" : null,
          index < current ? "is-past" : null,
        ]
          .filter(Boolean)
          .join(" ");
        const scrubbable = onSelect !== undefined && index > current;
        return (
          <button
            type="button"
            className={className}
            key={turn.phase}
            disabled={!scrubbable}
            title={scrubbable ? `Przewiń do tury ${index + 1}` : undefined}
            onClick={scrubbable ? () => onSelect(index) : undefined}
          >
            {turn.name}
            <br />
            {turn.hours}
            {index === current ? ` ◂ TURA ${index + 1}` : ""}
          </button>
        );
      })}
    </div>
  );
}
