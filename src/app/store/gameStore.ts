// State bridge UI ↔ engine. The store owns a GameState and nothing else:
// every transition goes through a pure engine call (applyAction / resolveTurn)
// and replaces the state immutably. No domain logic lives here or in the
// components — derived numbers come from the engine or from ./selectors.

import { create } from "zustand";
import {
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type HexCoord,
} from "../../engine";

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
  /** Hex selected on the map; drives the hex panel from M5/M7 on. */
  selectedHex: HexCoord | null;
  /** Applies a player action (a JSON object — the future replay protocol). */
  dispatch: (action: Action) => void;
  /** Resolves the current turn: reveals the truth and advances the calendar. */
  resolve: () => void;
  selectHex: (hex: HexCoord | null) => void;
  /** Starts a fresh session on `seed`; clears the selection. */
  restart: (seed: number) => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  game: newGame(initialSeed()),
  selectedHex: null,
  dispatch: (action) => set((store) => ({ game: applyAction(store.game, action) })),
  resolve: () => set((store) => ({ game: resolveTurn(store.game) })),
  selectHex: (hex) => set({ selectedHex: hex }),
  restart: (seed) => set({ game: newGame(seed), selectedHex: null }),
}));
