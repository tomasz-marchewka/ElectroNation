// The dispatcher screen (01 §8, handoff README "Layout"): top bar → map +
// docked 400 px panel → day axis → chart strip → full-width report strip.
//
// UI strings are Polish (player-facing); identifiers and comments stay English.

import { useMemo } from "react";
import { DayChartView } from "./chart/DayChartView";
import { buildDayChart } from "./chart/dayChart";
import { ReportStrip } from "./components/ReportStrip";
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
  dayResultKpi,
  forecastSystemKpi,
  regimeForecastLabel,
  topBarContext,
} from "./store/selectors";

export function App() {
  const game = useGameStore((store) => store.game);
  const dispatch = useGameStore((store) => store.dispatch);
  const resolve = useGameStore((store) => store.resolve);
  const resolveUntilTurn = useGameStore((store) => store.resolveUntilTurn);
  const skip = useGameStore((store) => store.skip);
  const skipStop = useGameStore((store) => store.skipStop);
  const selectedHex = useGameStore((store) => store.selectedHex);
  const selectHex = useGameStore((store) => store.selectHex);
  // The map paints the last resolved turn (01 §2.3) — after a scrub, the turn
  // it stopped on, which is the one the report strip names too.
  const report = game.lastTurnReport;
  const scene = useMemo(
    () => buildMapScene(game, game.lastTurnReport, selectedHex),
    [game, selectedHex],
  );
  const chart = useMemo(() => buildDayChart(game), [game]);

  return (
    <div className="en-app">
      <TopBar
        context={topBarContext(game)}
        regime={regimeForecastLabel(game)}
        kpis={[
          { label: "BUDŻET", value: budgetKpi(game) },
          { label: "WYNIK DOBY", ...dayResultKpi(game) },
          { label: "PROGNOZY", value: forecastSystemKpi(game) },
        ]}
      />

      <div className="en-body">
        <div className="en-main">
          <div className="en-region--map" data-region="map">
            <HexMapView scene={scene} onHexClick={selectHex} />
          </div>
          <TurnBar current={game.calendar.turnIndex} onSelect={resolveUntilTurn} />
          <DayChartView model={chart}>
            <ThemeSwitch />
          </DayChartView>
        </div>

        <DispatcherPanel
          game={game}
          onAction={dispatch}
          onCommit={resolve}
          onSkip={skip}
          stopNote={skipStop?.text}
        />
      </div>

      {/* Not a post-commit flash: the report of the last turn is a standing
          part of the view (01 §2.3), so a loaded save shows it right away. */}
      {report && <ReportStrip title={reportTitle(report)} tiles={reportTiles(game, report)} />}
    </div>
  );
}
