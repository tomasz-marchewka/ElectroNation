// Adapted from design-system/components/shell/TurnBar.{jsx,d.ts}.
// The day axis under the map: 8 blocks of 3 h (01 §2.2). Never 24 hours —
// a day is 8 turns.

import type { TurnPhase } from "../../engine";

export interface DayTurn {
  /** Engine phase this cell stands for — the two lists are 1:1 by index. */
  phase: TurnPhase;
  /** Phase name in caps, abbreviated as the design system abbreviates it. */
  name: string;
  /** Hour block, e.g. "18–21". */
  hours: string;
}

/**
 * Canon of doc 01 §2.2, in the design system's own abbreviations. Order and
 * length match `TURN_PHASES` exactly; `tests/components/turnbar.test.tsx`
 * holds that mapping.
 */
export const DAY_TURNS = [
  { phase: "night", name: "NOC", hours: "00–03" },
  { phase: "preDawn", name: "PRZEDŚWIT", hours: "03–06" },
  { phase: "morningRamp", name: "RANO", hours: "06–09" },
  { phase: "lateMorning", name: "PRZEDPOŁ.", hours: "09–12" },
  { phase: "noon", name: "POŁUDNIE", hours: "12–15" },
  { phase: "afternoon", name: "POPOŁ.", hours: "15–18" },
  { phase: "eveningPeak", name: "SZCZYT WIECZ.", hours: "18–21" },
  { phase: "lateEvening", name: "PÓŹNY WIECZ.", hours: "21–24" },
] as const satisfies readonly DayTurn[];

/** Full phase names of doc 01 §2.2 — the panel title, unlike the axis cell. */
export const DAY_TURN_FULL_NAMES: Record<TurnPhase, string> = {
  night: "NOC",
  preDawn: "PRZEDŚWIT",
  morningRamp: "RANO",
  lateMorning: "PRZEDPOŁUDNIE",
  noon: "POŁUDNIE",
  afternoon: "POPOŁUDNIE",
  eveningPeak: "SZCZYT WIECZORNY",
  lateEvening: "PÓŹNY WIECZÓR",
};

export interface TurnBarProps {
  /** The turns to render. Defaults to DAY_TURNS. */
  turns?: readonly DayTurn[];
  /** Index of the current turn (0–7). */
  current?: number;
  /** Click on a turn — turn scrubbing (01 §2.5), wired in M8. */
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
        return (
          <button
            type="button"
            className={className}
            key={turn.phase}
            onClick={onSelect ? () => onSelect(index) : undefined}
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

/** Turn cell for the turn `index` of a day; out of range falls back to NOC. */
export function dayTurnAt(index: number): DayTurn {
  return DAY_TURNS[index] ?? DAY_TURNS[0];
}
