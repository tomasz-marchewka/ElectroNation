// State bridge UI ↔ engine. The store owns a GameState and nothing else:
// every transition goes through a pure engine call (applyAction / resolveTurn /
// migrateState) and replaces the state immutably. No domain logic lives here or
// in the components — derived numbers come from the engine or from ./selectors,
// and the routing session's own transitions come from ../routing/session.
//
// Since M9 the store also owns the autosave. It is written on the transitions
// that end a decision — time moving forward, a new game, an imported file — and
// not on every setpoint move: an interrupted session resumes at the turn it was
// planning, with its setpoints to redo.

import { create } from "zustand";
import {
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type HexCoord,
  type LineType,
  type LoadError,
} from "../../engine";
import type { BottleneckRef } from "../map/sceneModel";
import { nextPeriod, previousPeriod, resolveAnchor, type ReportScope } from "../report/period";
import {
  applyRoutingClick,
  hoverRouting,
  setRoutingType,
  startRouting,
  type RoutingSession,
} from "../routing/session";
import { loadGame, saveGame } from "../save/autosave";
import { readSaveFile } from "../save/file";
import { timelineRange } from "../timeline/timeline";
import { scrubToTurn, skipTurns, type SkipStop } from "./skip";

/** Seed of the default session; `?seed=` in the URL overrides it. */
export const DEFAULT_SEED = 1;

/**
 * Reads the session seed off a URL query string. Kept pure (string in, number
 * out) so it is testable without a browser.
 */
export function seedFromSearch(search: string, fallback: number = DEFAULT_SEED): number {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/**
 * A URL that names a seed asks for THAT session, so it starts fresh instead of
 * continuing the autosave. Without this the dev/debug affordance of M4 would be
 * silently swallowed by whatever was played last.
 */
export function seedIsPinned(search: string): boolean {
  return new URLSearchParams(search).has("seed");
}

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function initialSeed(): number {
  return seedFromSearch(currentSearch());
}

/**
 * Seed of a session started from the UI. Reading the clock is an app-layer
 * affordance — the engine may never do it (determinism rules), but choosing
 * which world to play is not simulation.
 */
export function newSessionSeed(): number {
  return Date.now() % 2 ** 31;
}

/** Outcome of the last save-file interaction; the session bar prints it. */
export type SaveNotice = { kind: "loaded" } | { kind: "error"; error: LoadError };

export interface GameStore {
  game: GameState;
  /** Hex selected on the map; drives the hex panel (01 §8 pt 6). */
  selectedHex: HexCoord | null;
  /** The line being drawn right now, or null (01 §3.3). */
  routing: RoutingSession | null;
  /**
   * Turn the report strip describes, on the ribbon's axis; null is the last
   * resolved one (01 §2.3). View state, deliberately NOT part of GameState:
   * reading a past turn changes nothing about the world.
   */
  selectedTurn: number | null;
  /** First column of the ribbon window; null follows the day being played. */
  timelineFrom: number | null;
  /** What POKAŻ WĄSKIE GARDŁO pointed at, until the view moves on. */
  bottleneck: BottleneckRef | null;
  /** Whether the detailed report is docked next to (or over) the map. */
  reportOpen: boolean;
  /** Which period the detailed report aggregates over. */
  reportScope: ReportScope;
  /**
   * Turn the detailed report is anchored on; null follows the newest resolved
   * one. A SECOND, independent reading of the archive — deliberately not
   * `selectedTurn`: scrolling the report may not move the ribbon, the strip or
   * the map, and committing a turn may not throw the reader out of the month
   * they were studying.
   */
  reportAnchor: number | null;
  /**
   * Why the last scrub stopped (01 §2.5) — null whenever time moved one turn
   * at a time, so the diagnosis never outlives the run that produced it.
   */
  skipStop: SkipStop | null;
  saveNotice: SaveNotice | null;
  /**
   * Applies a player action (a JSON object — the future replay protocol).
   * Returns false when the engine refused it: an illegal action comes back as
   * the very same state (build.ts), which is the interface's cue to explain.
   */
  dispatch: (action: Action) => boolean;
  /** Resolves the current turn: reveals the truth and advances the calendar. */
  resolve: () => void;
  /** Scrubs to a future turn of the day, resolving every turn on the way. */
  resolveUntilTurn: (turnIndex: number) => void;
  /** Scrubs until a stop rule fires or the day ends (01 §2.5). */
  skip: () => void;
  selectHex: (hex: HexCoord | null) => void;
  /** Reads a turn on the ribbon (01 §2.5) — never moves time. */
  selectTurn: (absTurn: number | null) => void;
  /**
   * Slides the ribbon window by `delta` turns. A delta, not a target: several
   * scroll events can land before React re-renders, and each of them has to
   * count. `timelineRange` clamps the result to the scroll bounds.
   */
  scrollTimeline: (delta: number) => void;
  /** Back to the pending turn: window and selection at once. */
  showNow: () => void;
  /** Enters line-routing mode from the object on `from` (01 §3.3). */
  startRouting: (from: HexCoord) => void;
  setRoutingType: (lineType: LineType) => void;
  hoverRouting: (hex: HexCoord | null) => void;
  clickRouting: (hex: HexCoord) => void;
  cancelRouting: () => void;
  /** Orders the routed line and leaves routing mode. */
  confirmRouting: (path: HexCoord[]) => boolean;
  showBottleneck: (ref: BottleneckRef | null) => void;
  /** Opens or closes the detailed report. */
  toggleReport: () => void;
  closeReport: () => void;
  /** Switches the scope, keeping the moment being read (only the zoom changes). */
  setReportScope: (scope: ReportScope) => void;
  /** Steps the report one period back (−1) or forward (+1), clamped. */
  stepReport: (delta: number) => void;
  /** Starts a fresh session on `seed`; clears the selection and the autosave. */
  restart: (seed: number) => void;
  /**
   * Boot step: continues the autosave when there is one. Never rejects — a
   * broken or unreadable slot only leaves the fresh session standing, with the
   * reason in `saveNotice`.
   */
  hydrate: () => Promise<void>;
  /** Takes over a state read from a save file, then autosaves it. */
  importSave: (file: Blob) => Promise<void>;
}

/** Everything that pointed into the world being replaced (new game, load). */
const CLEARED_VIEW = {
  selectedHex: null,
  routing: null,
  bottleneck: null,
  skipStop: null,
  selectedTurn: null,
  timelineFrom: null,
  // The anchor points into an archive that no longer exists; whether the report
  // is open is the player's layout choice and survives.
  reportAnchor: null,
} as const;

export const useGameStore = create<GameStore>()((set, get) => {
  /**
   * Every transition that moves time lands the same way. A new turn makes the
   * previous report — and anything pointing into it — history, so the
   * bottleneck highlight goes with it, and so does the diagnosis of the last
   * scrub unless this run produced its own (01 §2.5). The state then goes to
   * the autosave slot: fire and forget, because the turn is on screen long
   * before the write lands (M9 brief §1 — the save must not block the loop).
   */
  function advance(game: GameState, skipStop: SkipStop | null = null): void {
    // Time moving forward also brings the ribbon back to now (01 §2.3): nobody
    // should plan the next turn while reading the numbers of an old one.
    set({
      game,
      bottleneck: null,
      skipStop,
      saveNotice: null,
      selectedTurn: null,
      timelineFrom: null,
    });
    void saveGame(game);
  }

  return {
    game: newGame(initialSeed()),
    selectedHex: null,
    routing: null,
    bottleneck: null,
    skipStop: null,
    selectedTurn: null,
    timelineFrom: null,
    saveNotice: null,
    reportOpen: false,
    reportScope: "turn",
    reportAnchor: null,
    dispatch: (action) => {
      const before = get().game;
      const game = applyAction(before, action);
      if (game === before) return false;
      set({ game });
      return true;
    },
    resolve: () => advance(resolveTurn(get().game)),
    resolveUntilTurn: (turnIndex) => advance(scrubToTurn(get().game, turnIndex)),
    skip: () => {
      const { game, stop } = skipTurns(get().game);
      advance(game, stop);
    },
    selectTurn: (absTurn) => set({ selectedTurn: absTurn }),
    scrollTimeline: (delta) =>
      set((store) => ({
        timelineFrom:
          timelineRange(store.game, {
            from: store.timelineFrom,
            selected: store.selectedTurn,
          }).from + delta,
      })),
    showNow: () => set({ selectedTurn: null, timelineFrom: null }),
    // Routing owns the map clicks until it ends (M7 brief pt 3).
    selectHex: (hex) =>
      set((store) => (store.routing ? store : { selectedHex: hex, bottleneck: null })),
    startRouting: (from) =>
      set({ selectedHex: from, routing: startRouting(from), bottleneck: null }),
    setRoutingType: (lineType) =>
      set((store) =>
        store.routing ? { routing: setRoutingType(store.routing, lineType) } : store,
      ),
    hoverRouting: (hex) =>
      set((store) => (store.routing ? { routing: hoverRouting(store.routing, hex) } : store)),
    clickRouting: (hex) =>
      set((store) =>
        store.routing ? { routing: applyRoutingClick(store.game, store.routing, hex) } : store,
      ),
    cancelRouting: () => set({ routing: null }),
    confirmRouting: (path) => {
      const store = get();
      if (!store.routing) return false;
      const before = store.game;
      const game = applyAction(before, {
        type: "buildLine",
        lineType: store.routing.lineType,
        path,
      });
      if (game === before) return false;
      set({ game, routing: null });
      return true;
    },
    showBottleneck: (ref) => set({ bottleneck: ref }),
    toggleReport: () => set((store) => ({ reportOpen: !store.reportOpen })),
    closeReport: () => set({ reportOpen: false }),
    setReportScope: (scope) => set({ reportScope: scope }),
    stepReport: (delta) =>
      set((store) => {
        const period = resolveAnchor(store.game, store.reportScope, store.reportAnchor);
        if (period === null) return store;
        const target =
          delta < 0 ? previousPeriod(store.game, period) : nextPeriod(store.game, period);
        if (target === null) return store;
        // Landing back on the newest period re-arms following, so the report
        // then moves with time on its own instead of freezing on what used to
        // be the newest month.
        const newest = resolveAnchor(store.game, store.reportScope, null);
        return {
          reportAnchor: target.fromTurn === newest?.fromTurn ? null : target.fromTurn,
        };
      }),
    restart: (seed) => {
      const game = newGame(seed);
      set({ game, ...CLEARED_VIEW, saveNotice: null });
      void saveGame(game);
    },
    hydrate: async () => {
      if (seedIsPinned(currentSearch())) return;
      const result = await loadGame();
      if (result === null) return;
      if (!result.ok) {
        set({ saveNotice: { kind: "error", error: result.error } });
        return;
      }
      set({ game: result.state, ...CLEARED_VIEW });
    },
    importSave: async (file) => {
      const result = await readSaveFile(file);
      if (!result.ok) {
        set({ saveNotice: { kind: "error", error: result.error } });
        return;
      }
      set({ game: result.state, ...CLEARED_VIEW, saveNotice: { kind: "loaded" } });
      void saveGame(result.state);
    },
  };
});
