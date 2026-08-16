// The dispatcher screen frame (01 §8, handoff README "Layout"): top bar →
// map + docked 400 px panel → day axis → chart strip → full-width report strip.
// The chart and the panel body are placeholders here; M6–M8 fill them.
//
// UI strings are Polish (player-facing); identifiers and comments stay English.

import { useMemo } from "react";
import { Button } from "./components/Button";
import { Panel } from "./components/Panel";
import { PanelSection } from "./components/PanelSection";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { TopBar } from "./components/TopBar";
import { TurnBar } from "./components/TurnBar";
import { HexMapView } from "./map/HexMapView";
import { buildMapScene } from "./map/sceneModel";
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
  const selectedHex = useGameStore((store) => store.selectedHex);
  const selectHex = useGameStore((store) => store.selectHex);
  const turn = currentDayTurn(game);
  // The map paints the last resolved turn (01 §2.3); M8 will hand it an older
  // report when the player scrubs back through the day.
  const scene = useMemo(
    () => buildMapScene(game, game.lastTurnReport, selectedHex),
    [game, selectedHex],
  );

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
          <div className="en-region--map" data-region="map">
            <HexMapView scene={scene} onHexClick={selectHex} />
          </div>
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
