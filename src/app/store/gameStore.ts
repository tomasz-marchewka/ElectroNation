// State bridge UI ↔ engine. The store owns a GameState and nothing else:
// every transition goes through a pure engine call (applyAction / resolveTurn)
// and replaces the state immutably. No domain logic lives here or in the
// components — derived numbers come from the engine or from ./selectors, and
// the routing session's own transitions come from ../routing/session.

import { create } from "zustand";
import {
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type HexCoord,
  type LineType,
} from "../../engine";
import type { BottleneckRef } from "../map/sceneModel";
import {
  applyRoutingClick,
  hoverRouting,
  setRoutingType,
  startRouting,
  type RoutingSession,
} from "../routing/session";

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

function initialSeed(): number {
  if (typeof window === "undefined") return DEFAULT_SEED;
  return seedFromSearch(window.location.search);
}

export interface GameStore {
  game: GameState;
  /** Hex selected on the map; drives the hex panel (01 §8 pt 6). */
  selectedHex: HexCoord | null;
  /** The line being drawn right now, or null (01 §3.3). */
  routing: RoutingSession | null;
  /** What POKAŻ WĄSKIE GARDŁO pointed at, until the view moves on. */
  bottleneck: BottleneckRef | null;
  /**
   * Applies a player action (a JSON object — the future replay protocol).
   * Returns false when the engine refused it: an illegal action comes back as
   * the very same state (build.ts), which is the interface's cue to explain.
   */
  dispatch: (action: Action) => boolean;
  /** Resolves the current turn: reveals the truth and advances the calendar. */
  resolve: () => void;
  selectHex: (hex: HexCoord | null) => void;
  /** Enters line-routing mode from the object on `from` (01 §3.3). */
  startRouting: (from: HexCoord) => void;
  setRoutingType: (lineType: LineType) => void;
  hoverRouting: (hex: HexCoord | null) => void;
  clickRouting: (hex: HexCoord) => void;
  cancelRouting: () => void;
  /** Orders the routed line and leaves routing mode. */
  confirmRouting: (path: HexCoord[]) => boolean;
  showBottleneck: (ref: BottleneckRef | null) => void;
  /** Starts a fresh session on `seed`; clears the selection. */
  restart: (seed: number) => void;
}

export const useGameStore = create<GameStore>()((set, get) => ({
  game: newGame(initialSeed()),
  selectedHex: null,
  routing: null,
  bottleneck: null,
  dispatch: (action) => {
    const before = get().game;
    const game = applyAction(before, action);
    if (game === before) return false;
    set({ game });
    return true;
  },
  // A new turn makes the previous report — and anything pointing into it —
  // history, so the bottleneck highlight goes with it.
  resolve: () => set((store) => ({ game: resolveTurn(store.game), bottleneck: null })),
  // Routing owns the map clicks until it ends (M7 brief pt 3).
  selectHex: (hex) =>
    set((store) => (store.routing ? store : { selectedHex: hex, bottleneck: null })),
  startRouting: (from) => set({ selectedHex: from, routing: startRouting(from), bottleneck: null }),
  setRoutingType: (lineType) =>
    set((store) => (store.routing ? { routing: setRoutingType(store.routing, lineType) } : store)),
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
  restart: (seed) =>
    set({ game: newGame(seed), selectedHex: null, routing: null, bottleneck: null }),
}));
