// The dispatcher screen (01 §8, handoff README "Layout"): top bar → map +
// docked 400 px panel → day axis → chart strip → full-width report strip.
// The chart is still a placeholder here; M8 fills it.
//
// The 400 px column has three mutually exclusive states and never shows two of
// them at once: the dispatcher panel by default, the hex panel while a hex is
// selected (01 §8 pt 6), and the routing panel while a line is being drawn
// (01 §3.3) — which also takes over the map's clicks until it ends.
//
// UI strings are Polish (player-facing); identifiers and comments stay English.

import { useEffect, useMemo } from "react";
import { hexKey } from "../engine";
import { HexPanel } from "./components/HexPanel";
import { ReportStrip } from "./components/ReportStrip";
import { RoutingPanel } from "./components/RoutingPanel";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { TopBar } from "./components/TopBar";
import { TurnBar } from "./components/TurnBar";
import { formatMoneyPln } from "./format";
import { daysLabel } from "./labels";
import { HexMapView } from "./map/HexMapView";
import { buildMapScene, type RoutePreview } from "./map/sceneModel";
import { DispatcherPanel } from "./panel/DispatcherPanel";
import { reportTiles, reportTitle } from "./panel/report";
import { planRoute } from "./routing/session";
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
  const routing = useGameStore((store) => store.routing);
  const bottleneck = useGameStore((store) => store.bottleneck);
  const startRouting = useGameStore((store) => store.startRouting);
  const setRoutingType = useGameStore((store) => store.setRoutingType);
  const hoverRouting = useGameStore((store) => store.hoverRouting);
  const clickRouting = useGameStore((store) => store.clickRouting);
  const cancelRouting = useGameStore((store) => store.cancelRouting);
  const confirmRouting = useGameStore((store) => store.confirmRouting);
  const showBottleneck = useGameStore((store) => store.showBottleneck);
  // The map paints the last resolved turn (01 §2.3); M8 will hand it an older
  // report when the player scrubs back through the day.
  const report = game.lastTurnReport;

  // Live preview of the route under the cursor (01 §3.3): the price on the map
  // is the price the engine will charge, computed by the same function.
  const preview = useMemo<RoutePreview | null>(() => {
    if (!routing) return null;
    const plan = planRoute(game, routing);
    if (!plan) return null;
    return {
      path: plan.path,
      waypoints: routing.waypoints,
      lineType: routing.lineType,
      valid: plan.note === null,
      label: `${formatMoneyPln(plan.costPln)} · ${daysLabel(plan.buildDays)}`,
    };
  }, [game, routing]);

  const scene = useMemo(
    () => buildMapScene(game, report, selectedHex, { route: preview, bottleneck }),
    [game, report, selectedHex, preview, bottleneck],
  );

  // ESC steps back one level: out of routing first, out of the hex panel next.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (useGameStore.getState().routing) cancelRouting();
      else selectHex(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelRouting, selectHex]);

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
            <HexMapView
              scene={scene}
              onHexClick={routing ? clickRouting : selectHex}
              onHexHover={routing ? hoverRouting : undefined}
            />
          </div>
          <TurnBar current={game.calendar.turnIndex} />
          <div className="en-region--chart" data-region="chart" />
          <ThemeSwitch />
        </div>

        {routing ? (
          <RoutingPanel
            game={game}
            session={routing}
            onType={setRoutingType}
            onConfirm={confirmRouting}
            onCancel={cancelRouting}
          />
        ) : selectedHex ? (
          // Keyed by hex: the catalogue's dialled-in sizes belong to the hex
          // the player is looking at, not to the panel.
          <HexPanel
            key={hexKey(selectedHex)}
            game={game}
            report={report}
            hex={selectedHex}
            onAction={dispatch}
            onRoute={startRouting}
            onBottleneck={showBottleneck}
            onClose={() => selectHex(null)}
          />
        ) : (
          <DispatcherPanel game={game} onAction={dispatch} onCommit={resolve} />
        )}
      </div>

      {/* Not a post-commit flash: the report of the last turn is a standing
          part of the view (01 §2.3), so a loaded save shows it right away. */}
      {report && <ReportStrip title={reportTitle(report)} tiles={reportTiles(game, report)} />}
    </div>
  );
}
