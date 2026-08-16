// State bridge UI ↔ engine. The store owns a GameState and nothing else:
// every transition goes through a pure engine call (applyAction / resolveTurn /
// migrateState) and replaces the state immutably. No domain logic lives here or
// in the components — derived numbers come from the engine or from ./selectors.
//
// Since M9 the store also owns the autosave. It is written on the transitions
// that end a decision — a resolved turn, a new game, an imported file — and not
// on every setpoint move: an interrupted session resumes at the turn it was
// planning, with its setpoints to redo.

import { create } from "zustand";
import {
  applyAction,
  newGame,
  resolveTurn,
  type Action,
  type GameState,
  type HexCoord,
  type LoadError,
} from "../../engine";
import { loadGame, saveGame } from "../save/autosave";
import { readSaveFile } from "../save/file";

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
  /** Hex selected on the map; drives the hex panel from M5/M7 on. */
  selectedHex: HexCoord | null;
  saveNotice: SaveNotice | null;
  /** Applies a player action (a JSON object — the future replay protocol). */
  dispatch: (action: Action) => void;
  /** Resolves the current turn: reveals the truth and advances the calendar. */
  resolve: () => void;
  selectHex: (hex: HexCoord | null) => void;
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

export const useGameStore = create<GameStore>()((set, get) => ({
  game: newGame(initialSeed()),
  selectedHex: null,
  saveNotice: null,
  dispatch: (action) => set((store) => ({ game: applyAction(store.game, action) })),
  resolve: () => {
    const game = resolveTurn(get().game);
    set({ game, saveNotice: null });
    // Fire and forget: the resolved turn is on screen long before the write
    // lands (M9 brief §1 — the save must not block the loop).
    void saveGame(game);
  },
  selectHex: (hex) => set({ selectedHex: hex }),
  restart: (seed) => {
    const game = newGame(seed);
    set({ game, selectedHex: null, saveNotice: null });
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
    set({ game: result.state, selectedHex: null });
  },
  importSave: async (file) => {
    const result = await readSaveFile(file);
    if (!result.ok) {
      set({ saveNotice: { kind: "error", error: result.error } });
      return;
    }
    set({ game: result.state, selectedHex: null, saveNotice: { kind: "loaded" } });
    void saveGame(result.state);
  },
}));
