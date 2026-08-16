// The dispatcher screen (01 §8, handoff README "Layout"): top bar → map +
// docked 400 px panel → day axis → chart strip → full-width report strip.
// The chart is still a placeholder here; M8 fills it.
//
// UI strings are Polish (player-facing); identifiers and comments stay English.

import { useMemo } from "react";
import { ReportStrip } from "./components/ReportStrip";
import { SessionBar } from "./components/SessionBar";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { TopBar } from "./components/TopBar";
import { TurnBar } from "./components/TurnBar";
import { HexMapView } from "./map/HexMapView";
import { buildMapScene } from "./map/sceneModel";
import { DispatcherPanel } from "./panel/DispatcherPanel";
import { reportTiles, reportTitle } from "./panel/report";
import { useGameStore } from "./store/gameStore";
import {
  budgetKpi,
  forecastSystemKpi,
  regimeForecastLabel,
  topBarContext,
} from "./store/selectors";

export function App() {
  const game = useGameStore((store) => store.game);
  const dispatch = useGameStore((store) => store.dispatch);
  const resolve = useGameStore((store) => store.resolve);
  const selectedHex = useGameStore((store) => store.selectedHex);
  const selectHex = useGameStore((store) => store.selectHex);
  // The map paints the last resolved turn (01 §2.3); M8 will hand it an older
  // report when the player scrubs back through the day.
  const report = game.lastTurnReport;
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
          <SessionBar />
          <ThemeSwitch />
        </div>

        <DispatcherPanel game={game} onAction={dispatch} onCommit={resolve} />
      </div>

      {/* Not a post-commit flash: the report of the last turn is a standing
          part of the view (01 §2.3), so a loaded save shows it right away. */}
      {report && <ReportStrip title={reportTitle(report)} tiles={reportTiles(game, report)} />}
    </div>
  );
}
