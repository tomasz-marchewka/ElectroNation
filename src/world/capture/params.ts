// Capture-mode URL parameters (ARCHITECTURE.md §15). Pure parsing, so the
// same query string means the same thing in the app and in the harness.

import type { CameraPreset } from "../render/core/CameraRig";
import type { MotionMode, QualityTier } from "../render/core/types";

export type RendererChoice = "3d" | "svg";

export interface CaptureParams {
  /** `?capture=1` — pins the clock, exposes window.__en, hides nothing else. */
  capture: boolean;
  seed: number | null;
  /** Showcase scenario name; null keeps the store's own session. */
  scenario: string | null;
  day: number | null;
  /** The turn (0..7) shown RESOLVED; null = the day's first turn pending, nothing resolved. */
  turn: number | null;
  /** Weather override by regime id; validated by the bridge. */
  regime: string | null;
  camera: CameraPreset | null;
  /** Hex the close camera presets look at, as offset col,row (`?focus=9,6`). */
  focus: { col: number; row: number } | null;
  /** Camera orientation override [deg], applied after the preset (`?yaw=180`). */
  yaw: number | null;
  pitch: number | null;
  /** Hex selected in the app's store at boot, as offset col,row (`?select=19,6`). */
  select: { col: number; row: number } | null;
  /** `?report=1` opens the period report — reproducible HUD states. */
  report: boolean;
  /** Pinned animation clock [s]; null runs free. */
  clock: number | null;
  quality: QualityTier | "auto" | null;
  motion: MotionMode | null;
  showcase: string | null;
  /** `?modules=terrain,sky,plants` — the module subset to load instead of the showcase's or the whole game's. */
  modules: string[] | null;
  renderer: RendererChoice | null;
  /** `?hud=0` hides the overlay for a clean world capture. */
  hud: boolean;
  /** `?theme=light|dark` — the interface theme of the capture; null keeps the stored one. */
  theme: "light" | "dark" | null;
}

const CAMERA_PRESETS: readonly CameraPreset[] = [
  "strategic",
  "overview",
  "closeup",
  "golden",
  "north",
  "detail",
];

function integer(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function real(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function moduleList(value: string | null): string[] | null {
  if (value === null) return null;
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  return ids.length > 0 ? ids : null;
}

export function parseCaptureParams(search: string): CaptureParams {
  const query = new URLSearchParams(search);
  const camera = query.get("camera");
  const quality = query.get("quality");
  const motion = query.get("motion");
  const renderer = query.get("renderer");
  const clockMs = real(query.get("clock"));
  const [focusCol, focusRow, ...focusRest] = (query.get("focus") ?? "")
    .split(",")
    .map((part) => integer(part));
  const focus =
    focusRest.length === 0 && focusCol != null && focusRow != null
      ? { col: focusCol, row: focusRow }
      : null;
  const [selectCol, selectRow, ...selectRest] = (query.get("select") ?? "")
    .split(",")
    .map((part) => integer(part));
  const select =
    selectRest.length === 0 && selectCol != null && selectRow != null
      ? { col: selectCol, row: selectRow }
      : null;
  return {
    capture: query.get("capture") === "1" || query.get("capture") === "true",
    seed: integer(query.get("seed")),
    scenario: query.get("scenario"),
    day: integer(query.get("day")),
    turn: integer(query.get("turn")),
    regime: query.get("regime"),
    camera:
      camera && (CAMERA_PRESETS as readonly string[]).includes(camera)
        ? (camera as CameraPreset)
        : null,
    focus,
    yaw: real(query.get("yaw")),
    pitch: real(query.get("pitch")),
    select,
    report: query.get("report") === "1",
    clock: clockMs === null ? null : clockMs / 1000,
    quality:
      quality === "high" || quality === "medium" || quality === "low" || quality === "auto"
        ? quality
        : null,
    motion: motion === "full" || motion === "reduced" || motion === "none" ? motion : null,
    showcase: query.get("showcase"),
    modules: moduleList(query.get("modules")),
    renderer: renderer === "svg" || renderer === "3d" ? renderer : null,
    hud: query.get("hud") !== "0",
    theme: query.get("theme") === "light" ? "light" : query.get("theme") === "dark" ? "dark" : null,
  };
}
