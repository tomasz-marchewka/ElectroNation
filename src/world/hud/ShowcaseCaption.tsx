// The showcase caption (ARCHITECTURE.md §15): in `?showcase=` mode the HUD is
// gone, and this strip is the only thing that says what is on screen — the
// module staged alone, the hour and the weather of the frame (the weather
// strip's own title, so the words match the game), and the camera preset.

import type { CameraPreset } from "../render/core/CameraRig";

const CAMERA_LABELS: Record<CameraPreset, string> = {
  strategic: "STRATEGICZNA",
  overview: "PRZEGLĄD",
  closeup: "ZBLIŻENIE",
  golden: "ZŁOTA GODZINA",
  north: "OD PÓŁNOCY",

  detail: "DETAL",
};

export interface ShowcaseCaptionProps {
  module: string;
  /** `SZCZYT WIECZORNY · 19:30 · WYŻ ZIMOWY — MROŹNY` — the weather strip's title. */
  title: string | null | undefined;
  camera: CameraPreset | null;
}

export function ShowcaseCaption({ module, title, camera }: ShowcaseCaptionProps) {
  return (
    <div className="en-showcase" data-region="showcase">
      <span className="en-showcase__module">POKAZ MODUŁU · {module.toUpperCase()}</span>
      {title && <span className="en-showcase__frame">{title}</span>}
      <span className="en-showcase__camera">
        KAMERA · {camera ? CAMERA_LABELS[camera] : "DOMYŚLNA"}
      </span>
    </div>
  );
}
