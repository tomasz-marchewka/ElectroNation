// Manual save file — the same JSON the autosave slot holds, handed to the
// player as a download and read back through the same migration path. The file
// is the game's only backup and its only way between two browsers.

import { parseSaveJson, type GameState, type LoadResult } from "../../engine";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `electronation-save-2026-08-16.json`, in the player's own local date. */
export function saveFileName(now: Date): string {
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return `electronation-save-${date}.json`;
}

export function saveFileText(state: GameState): string {
  return JSON.stringify(state);
}

/** Hands the state to the browser as a download; nothing leaves the machine. */
export function downloadSave(state: GameState, now: Date = new Date()): void {
  const url = URL.createObjectURL(new Blob([saveFileText(state)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = saveFileName(now);
  // Firefox only follows an anchor that is in the document.
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Reads a picked file; validation and migration are the engine's (M9 §2). */
export async function readSaveFile(file: Blob): Promise<LoadResult> {
  return parseSaveJson(await file.text());
}
