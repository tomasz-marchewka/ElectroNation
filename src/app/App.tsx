// The dispatcher screen frame (01 §8, handoff README "Layout"): top bar →
// map + docked 400 px panel → day axis → chart strip → full-width report strip.
// The map, chart and panel body are placeholders here; M5–M8 fill them.
//
// UI strings are Polish (player-facing); identifiers and comments stay English.

import { Button } from "./components/Button";
import { Panel } from "./components/Panel";
import { PanelSection } from "./components/PanelSection";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { TopBar } from "./components/TopBar";
import { TurnBar } from "./components/TurnBar";
import { useGameStore } from "./store/gameStore";
import {
  budgetKpi,
  currentDayTurn,
  currentTurnTitle,
  forecastSystemKpi,
  regimeForecastLabel,
  topBarContext,
  turnMeta,
} from "./store/selectors";

export function App() {
  const game = useGameStore((store) => store.game);
  const resolve = useGameStore((store) => store.resolve);
  const turn = currentDayTurn(game);

  return (
    <div className="en-app">
      <TopBar
        context={topBarContext(game)}
        regime={regimeForecastLabel(game)}
        kpis={[
          { label: "BUDŻET", value: budgetKpi(game) },
          { label: "PROGNOZY", value: forecastSystemKpi(game) },
        ]}
      />

      <div className="en-body">
        <div className="en-main">
          <div className="en-region--map" data-region="map" />
          <TurnBar current={game.calendar.turnIndex} />
          <div className="en-region--chart" data-region="chart" />
          <ThemeSwitch />
        </div>

        <Panel meta={turnMeta(game)} title={currentTurnTitle(game)} hours={turn.hours}>
          {/* Forecast, setpoints and balance land here in M6. */}
          <PanelSection grow />
          <PanelSection sunk>
            <Button block onClick={resolve}>
              ZATWIERDŹ TURĘ ▸
            </Button>
          </PanelSection>
        </Panel>
      </div>

      {game.lastTurnReport && (
        <div className="en-report" data-region="report">
          {/* Settlement tiles land here in M6. */}
          <div className="en-report__label">RAPORT OSTATNIEJ TURY</div>
        </div>
      )}
    </div>
  );
}
