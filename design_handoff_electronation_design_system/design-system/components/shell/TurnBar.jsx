import React from "react";

export const DAY_TURNS = [
  { name: "NOC", hours: "00–03" },
  { name: "PRZEDŚWIT", hours: "03–06" },
  { name: "RANO", hours: "06–09" },
  { name: "PRZEDPOŁ.", hours: "09–12" },
  { name: "POŁUDNIE", hours: "12–15" },
  { name: "POPOŁ.", hours: "15–18" },
  { name: "SZCZYT WIECZ.", hours: "18–21" },
  { name: "PÓŹNY WIECZ.", hours: "21–24" },
];

/** Oś doby: 8 tur po 3 h, z zaznaczoną turą bieżącą. */
export function TurnBar({ turns = DAY_TURNS, current = 0, onSelect }) {
  return (
    <div className="en-turnbar">
      {turns.map((t, i) => {
        const cls = ["en-turn", i === current && "is-current", i < current && "is-past"]
          .filter(Boolean)
          .join(" ");
        return (
          <button type="button" className={cls} key={i} onClick={onSelect ? () => onSelect(i) : undefined}>
            {t.name}
            <br />
            {t.hours}
            {i === current ? " ◂ TURA " + (i + 1) : ""}
          </button>
        );
      })}
    </div>
  );
}
