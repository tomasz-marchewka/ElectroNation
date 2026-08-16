// The autosave slot: one serialized GameState, written after every resolved
// turn and read once at boot. Storage failures are never fatal — a session
// without a save still plays, the same line the theme store takes with
// localStorage. The save IS the state: nothing else is stored beside it.

import { migrateState, type GameState, type LoadResult } from "../../engine";
import { indexedDbStorage, type SaveStorage } from "./storage";

let storage: SaveStorage = indexedDbStorage;

/** Test seam; the app itself runs on the IndexedDB slot from the first render. */
export function setSaveStorage(next: SaveStorage): void {
  storage = next;
}

/** Writes the slot. Resolves to false when the browser denied storage. */
export async function saveGame(state: GameState): Promise<boolean> {
  try {
    await storage.write(state);
    return true;
  } catch {
    // Private mode, a full disk, a denied database — the turn still stands.
    return false;
  }
}

/** `null` = nothing to continue: an empty slot, or no storage at all. */
export async function loadGame(): Promise<LoadResult | null> {
  let raw: unknown;
  try {
    raw = await storage.read();
  } catch {
    return null;
  }
  if (raw === undefined || raw === null) return null;
  return migrateState(raw);
}

export async function clearSave(): Promise<void> {
  try {
    await storage.clear();
  } catch {
    // A slot that cannot be read cannot hold a session hostage either.
  }
}
