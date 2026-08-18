// The dispatcher screen (01 §8, handoff README "Layout"): top bar → map +
// docked 400 px panel → time ribbon → full-width report strip.
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
import { SessionBar } from "./components/SessionBar";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { TopBar } from "./components/TopBar";
import { formatMoneyPln } from "./format";
import { daysLabel } from "./labels";
import { HexMapView } from "./map/HexMapView";
import { buildMapScene, type RoutePreview } from "./map/sceneModel";
import { DispatcherPanel } from "./panel/DispatcherPanel";
import { buildReportStrip } from "./panel/report";
import { planRoute } from "./routing/session";
import { TimelineView } from "./timeline/TimelineView";
import { buildTimeline } from "./timeline/timeline";
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
  const routing = useGameStore((store) => store.routing);
  const bottleneck = useGameStore((store) => store.bottleneck);
  const startRouting = useGameStore((store) => store.startRouting);
  const setRoutingType = useGameStore((store) => store.setRoutingType);
  const hoverRouting = useGameStore((store) => store.hoverRouting);
  const clickRouting = useGameStore((store) => store.clickRouting);
  const cancelRouting = useGameStore((store) => store.cancelRouting);
  const confirmRouting = useGameStore((store) => store.confirmRouting);
  const showBottleneck = useGameStore((store) => store.showBottleneck);
  const selectedTurn = useGameStore((store) => store.selectedTurn);
  const timelineFrom = useGameStore((store) => store.timelineFrom);
  const selectTurn = useGameStore((store) => store.selectTurn);
  const scrollTimeline = useGameStore((store) => store.scrollTimeline);
  const showNow = useGameStore((store) => store.showNow);
  // The map paints the last resolved turn and ONLY it (01 §8 pt 1): reading an
  // older turn on the ribbon never rewinds the world, because the world of a
  // month ago had other lines and other objects standing in it.
  const report = game.lastTurnReport;
  const atNow = selectedTurn === null && timelineFrom === null;

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
  const timeline = useMemo(
    () => buildTimeline(game, { from: timelineFrom, selected: selectedTurn }),
    [game, timelineFrom, selectedTurn],
  );
  const strip = useMemo(() => buildReportStrip(game, selectedTurn), [game, selectedTurn]);

  // ESC steps back one level: out of routing first, out of the hex panel next,
  // out of a turn being read back last (01 §2.5).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const store = useGameStore.getState();
      if (store.routing) cancelRouting();
      else if (store.selectedHex) selectHex(null);
      else showNow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelRouting, selectHex, showNow]);

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
            <HexMapView
              scene={scene}
              onHexClick={routing ? clickRouting : selectHex}
              onHexHover={routing ? hoverRouting : undefined}
            />
          </div>
          <TimelineView
            model={timeline}
            onSelect={selectTurn}
            onScroll={scrollTimeline}
            onNow={showNow}
            atNow={atNow}
          >
            <SessionBar />
            <ThemeSwitch />
          </TimelineView>
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
          <DispatcherPanel
            game={game}
            onAction={dispatch}
            onCommit={resolve}
            onSkip={skip}
            onScrubTo={resolveUntilTurn}
            scrubTurnIndex={strip?.scrubTurnIndex ?? null}
            stopNote={skipStop?.text}
          />
        )}
      </div>

      {/* Not a post-commit flash: the strip is a standing part of the view
          (01 §2.3), so a loaded save shows it right away. It describes the turn
          selected on the ribbon — a result behind TERAZ, a bet ahead of it. */}
      {strip && (
        <ReportStrip
          label={strip.label}
          title={strip.title}
          note={strip.note}
          tiles={strip.tiles}
        />
      )}
    </div>
  );
}
