import { useMemo } from "react";
import { CONFIG, dayLengthHours, newGame } from "../engine";

// UI strings are Polish (player-facing); identifiers and comments stay English.

function formatPln(amount: number): string {
  return `${new Intl.NumberFormat("pl-PL").format(amount)} zł`;
}

function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, "0")} min`;
}

export function App() {
  const state = useMemo(() => newGame(1), []);
  const juneDayLength = dayLengthHours(CONFIG.latitudeDeg, 172);

  return (
    <main className="shell">
      <h1>ElectroNation</h1>
      <p>Szkielet gry — silnik symulacji podłączony do interfejsu.</p>
      <ul>
        <li>
          Dzień {state.calendar.dayIndex + 1}, tura {state.calendar.turnIndex + 1}/8
        </li>
        <li>Budżet: {formatPln(state.moneyPln)}</li>
        <li>
          Długość dnia 21 czerwca (φ = 52°N): {formatHours(juneDayLength)}
        </li>
      </ul>
    </main>
  );
}
