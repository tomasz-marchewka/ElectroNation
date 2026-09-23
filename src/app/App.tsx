// The dispatcher screen (01 §8, handoff README "Layout"): top bar → map +
// docked 400 px panel → time ribbon → full-width report strip.
//
// Since the 3D world (docs/08) the map region is one of two renderers: the
// Three.js world behind a floating HUD, or the SVG map of the flat screen —
// picked by `?renderer=`, then the build's VITE_EN_RENDERER, then the player's
// setting, and only ever 3D where WebGL2 exists. Both renderers sit in the
// same frame with the same panels, so a session survives the switch and the
// component tests (jsdom, no WebGL2) exercise the SVG path unchanged.
//
// The detailed report joins the map row as a second dock: next to the map on a
// wide screen, in its place on a narrow one (app-shell.css). The ribbon and the
// dispatcher panel never move, so the screen keeps being one continuous view
// (01 §2.3) — the report is a layer of reading, not a screen of its own.
//
// The 400 px column has four mutually exclusive states and never shows two of
// them at once: the dispatcher panel by default, the hex panel while a hex is
// selected (01 §8 pt 6), the routing panel while a line is being drawn
// (01 §3.3) — which also takes over the map's clicks until it ends — and
// OPCJE GRY while the player has it open (docs/08 §7), over any of the others
// until a hex is picked or it is closed.
//
// UI strings are Polish (player-facing); identifiers and comments stay English.

import { useEffect, useMemo, useState } from "react";
import { REGIME_IDS, hexKey, offsetToAxial, type HexCoord, type RegimeId } from "../engine";
import {
  DEFAULT_SHOWCASE,
  buildWorldScene,
  isShowcaseScenario,
  showcaseState,
  weatherStripModel,
} from "../world/bridge";
import { parseCaptureParams } from "../world/capture/params";
import { Diagnostics } from "../world/hud/Diagnostics";
import { ShowcaseCaption } from "../world/hud/ShowcaseCaption";
import { WeatherStrip } from "../world/hud/WeatherStrip";
import { WorldLegend } from "../world/hud/WorldLegend";
import { useWorldSettings } from "../world/hud/settingsStore";
import { showcaseSpec } from "../world/showcase/registry";
import { WorldView, webglAvailable } from "../world/WorldView";
import { HexPanel } from "./components/HexPanel";
import { OptionsPanel } from "./components/OptionsPanel";
import { ReportStrip } from "./components/ReportStrip";
import { RoutingPanel } from "./components/RoutingPanel";
import { TopBar } from "./components/TopBar";
import { formatMoneyPln } from "./format";
import { daysLabel } from "./labels";
import { HexMapView } from "./map/HexMapView";
import { buildMapScene, type RoutePreview } from "./map/sceneModel";
import { DispatcherPanel } from "./panel/DispatcherPanel";
import { buildReportStrip } from "./panel/report";
import { ReportView } from "./report/ReportView";
import { buildPeriodReport } from "./report/reportModel";
import { planRoute } from "./routing/session";
import { TimelineView } from "./timeline/TimelineView";
import { buildTimeline } from "./timeline/timeline";
import { useGameStore } from "./store/gameStore";
import { useThemeStore } from "./store/themeStore";
import {
  budgetKpi,
  dayResultKpi,
  forecastSystemKpi,
  regimeForecastLabel,
  topBarContext,
} from "./store/selectors";

const SVG_FALLBACK_NOTE = "⚠ brak WebGL2 — mapa w trybie SVG";

function envRenderer(): "svg" | "3d" | null {
  const value = import.meta.env.VITE_EN_RENDERER;
  return value === "svg" || value === "3d" ? value : null;
}

function regimeOverride(value: string | null): RegimeId | null {
  return value && (REGIME_IDS as readonly string[]).includes(value) ? (value as RegimeId) : null;
}

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
  const reportOpen = useGameStore((store) => store.reportOpen);
  const reportScope = useGameStore((store) => store.reportScope);
  const reportAnchor = useGameStore((store) => store.reportAnchor);
  const toggleReport = useGameStore((store) => store.toggleReport);
  const closeReport = useGameStore((store) => store.closeReport);
  const setReportScope = useGameStore((store) => store.setReportScope);
  const optionsOpen = useGameStore((store) => store.optionsOpen);
  const toggleOptions = useGameStore((store) => store.toggleOptions);
  const closeOptions = useGameStore((store) => store.closeOptions);
  const stepReport = useGameStore((store) => store.stepReport);
  const timelineFrom = useGameStore((store) => store.timelineFrom);
  const selectTurn = useGameStore((store) => store.selectTurn);
  const scrollTimeline = useGameStore((store) => store.scrollTimeline);
  const showNow = useGameStore((store) => store.showNow);
  const replaceGame = useGameStore((store) => store.replaceGame);
  const settingsRenderer = useWorldSettings((store) => store.renderer);
  const theme = useThemeStore((store) => store.theme);

  // Capture-mode parameters are read once: a URL names one world.
  const params = useMemo(
    () => parseCaptureParams(typeof window === "undefined" ? "" : window.location.search),
    [],
  );
  const [webgl] = useState(() => webglAvailable());
  const showcase = showcaseSpec(params.showcase);
  const wants3d = (params.renderer ?? envRenderer() ?? settingsRenderer) === "3d";
  const use3d = wants3d && webgl;
  // A showcase is bare by default (the harness passes hud=0); `--hud 1` still
  // overlays the strips, which the whole-game showcase frames need.
  const hudVisible = params.hud;
  const [worldStatus, setWorldStatus] = useState<{ diagnostics: string[]; tier: string }>({
    diagnostics: [],
    tier: "medium",
  });

  // A capture may pin the theme, so a critic can screenshot both (docs/08 §7).
  useEffect(() => {
    if (params.theme) useThemeStore.getState().setTheme(params.theme);
  }, [params.theme]);

  // Every token repaints off this attribute; nothing about the layout moves.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // A capture URL that names a scenario, a day or a turn replaces the session
  // with that curated state and stops the autosave from being written over.
  useEffect(() => {
    if (params.scenario === null && params.day === null && params.turn === null && !showcase)
      return;
    const scenario =
      showcase?.scenario ??
      (params.scenario !== null && isShowcaseScenario(params.scenario) ? params.scenario : "start");
    replaceGame(
      showcaseState({
        scenario,
        seed: params.seed ?? DEFAULT_SHOWCASE.seed,
        dayIndex: params.day ?? showcase?.day ?? 0,
        turnIndex: params.turn === null ? 0 : params.turn + 1,
      }),
    );
    // Once, at boot: the parameters never change within a page.
  }, [params, replaceGame, showcase]);

  // A capture may also pin a selection and the report: HUD states that used to
  // require clicking are reproducible by URL alone. Declared AFTER the scenario
  // effect, because `replaceGame` resets the selection.
  useEffect(() => {
    if (params.select) selectHex(offsetToAxial(params.select));
    if (params.report && !useGameStore.getState().reportOpen) toggleReport();
  }, [params, selectHex, toggleReport]);

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
    () => (use3d ? null : buildMapScene(game, report, selectedHex, { route: preview, bottleneck })),
    [use3d, game, report, selectedHex, preview, bottleneck],
  );
  const weatherOverride = regimeOverride(params.regime);
  const world = useMemo(
    () =>
      use3d
        ? buildWorldScene(
            game,
            report,
            { selected: selectedHex, route: preview, bottleneck },
            { weatherOverride, showcase: params.showcase },
          )
        : null,
    [use3d, game, report, selectedHex, preview, bottleneck, weatherOverride, params.showcase],
  );
  const weather = useMemo(() => (world ? weatherStripModel(world) : null), [world]);
  const timeline = useMemo(
    () => buildTimeline(game, { from: timelineFrom, selected: selectedTurn }),
    [game, timelineFrom, selectedTurn],
  );
  const strip = useMemo(() => buildReportStrip(game, selectedTurn), [game, selectedTurn]);
  const periodReport = useMemo(
    () => (reportOpen ? buildPeriodReport(game, reportScope, reportAnchor) : null),
    [game, reportOpen, reportScope, reportAnchor],
  );

  // ESC steps back one level: out of the options first, out of routing next,
  // then out of the hex panel, out of a turn being read back last (01 §2.5).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const store = useGameStore.getState();
      if (store.optionsOpen) closeOptions();
      else if (store.routing) cancelRouting();
      else if (store.selectedHex) selectHex(null);
      else if (store.reportOpen) closeReport();
      else showNow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelRouting, closeOptions, closeReport, selectHex, showNow]);

  const onHexClick = routing ? clickRouting : selectHex;
  const onHexHover = routing ? hoverRouting : undefined;
  // What the player is told: renderer failures and the fallback. The bridge's
  // own derivation notes (scene.notes) are a matter for docs/STATUS.json and
  // the capture log, not a standing line on the dispatcher's screen.
  const diagnostics = useMemo(
    () => [...(wants3d && !webgl ? [SVG_FALLBACK_NOTE] : []), ...worldStatus.diagnostics],
    [wants3d, webgl, worldStatus.diagnostics],
  );

  const mapRegion = (
    <div className="en-region--map" data-region="map">
      {use3d && world ? (
        <>
          <WorldView
            scene={world}
            selectedHex={selectedHex}
            onHexClick={onHexClick}
            onHexHover={onHexHover}
            onResolve={resolve}
            params={params}
            moduleIds={params.modules ?? showcase?.modules}
            showcaseFrames={showcase?.frames}
            exposeApi={params.capture || import.meta.env.DEV}
            onStatus={(status) =>
              setWorldStatus({ diagnostics: status.diagnostics, tier: status.tier })
            }
          />
          {hudVisible && weather && (
            <>
              <div className="en-worldhud">
                <WeatherStrip model={weather} time={world.time} />
                <Diagnostics lines={diagnostics} />
              </div>
              <WorldLegend />
            </>
          )}
        </>
      ) : (
        scene && <HexMapView scene={scene} onHexClick={onHexClick} onHexHover={onHexHover} />
      )}
    </div>
  );

  if (showcase !== null && world) {
    return (
      <div className="en-app en-app--world en-app--showcase">
        {mapRegion}
        <ShowcaseCaption module={showcase.module} title={weather?.title} camera={params.camera} />
      </div>
    );
  }

  // `?hud=0`: the bare world — a judging frame of the game state with no panel,
  // ribbon or strip over it (ARCHITECTURE §15). The game is not playable here.
  if (!params.hud && use3d && world) {
    return <div className="en-app en-app--world en-app--bare">{mapRegion}</div>;
  }

  return (
    <div className={use3d ? "en-app en-app--world" : "en-app"}>
      <TopBar
        context={topBarContext(game)}
        regime={regimeForecastLabel(game)}
        kpis={[
          { label: "BUDŻET", value: budgetKpi(game) },
          { label: "WYNIK DOBY", ...dayResultKpi(game) },
          { label: "PROGNOZY", value: forecastSystemKpi(game) },
        ]}
        actions={
          <>
            <button
              type="button"
              className="en-seg"
              aria-pressed={reportOpen}
              onClick={toggleReport}
            >
              RAPORTY
            </button>
            <button
              type="button"
              className="en-seg"
              aria-pressed={optionsOpen}
              onClick={toggleOptions}
            >
              OPCJE GRY
            </button>
          </>
        }
      />

      <div className="en-body">
        <div className="en-main">
          <div className={reportOpen ? "en-workspace has-report" : "en-workspace"}>
            {mapRegion}
            {reportOpen && (
              <ReportView
                model={periodReport}
                scope={reportScope}
                onScope={setReportScope}
                onStep={stepReport}
                onClose={closeReport}
              />
            )}
          </div>
          <TimelineView
            model={timeline}
            onSelect={selectTurn}
            onScroll={scrollTimeline}
            onNow={showNow}
            atNow={atNow}
          />
        </div>

        {optionsOpen ? (
          <OptionsPanel
            webgl={webgl}
            world3d={use3d}
            activeTier={worldStatus.tier}
            onClose={closeOptions}
          />
        ) : routing ? (
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
            hex={selectedHex as HexCoord}
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
