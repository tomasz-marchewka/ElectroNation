// View models of the HUD's new strips, and the seam through which the overlay
// reaches today's panel models (src/app/panel/*, timeline, report): the HUD
// never imports the engine, it reads what this file hands it.

import { REGIME_LABELS, WIND_CLASS_LABELS } from "../../app/labels";
import { formatNumber } from "../../app/format";
import type { WorldScene } from "./worldScene";

export { panelForecast } from "../../app/panel/forecast";
export { setpointRows } from "../../app/panel/setpoints";
export { buildQueue } from "../../app/panel/constructions";
export { buildReportStrip } from "../../app/panel/report";
export { buildTimeline } from "../../app/timeline/timeline";
export { buildPeriodReport } from "../../app/report/reportModel";

export interface WeatherStripItem {
  key: string;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger" | "info";
}

export interface WeatherStripModel {
  /** `SZCZYT WIECZORNY · 19:30 · WYŻ ZIMOWY — MROŹNY` or the pending-turn note. */
  title: string;
  items: WeatherStripItem[];
  /** One-line diagnosis, e.g. the Dunkelflaute note; null when nothing stands out. */
  note: string | null;
  /** Capture-only banner text when the weather is overridden; null in the game. */
  banner: string | null;
}

function hourText(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const PHASE_NAMES: Record<WorldScene["time"]["phase"], string> = {
  night: "NOC",
  preDawn: "PRZEDŚWIT",
  morningRamp: "RANO",
  lateMorning: "PRZEDPOŁUDNIE",
  noon: "POŁUDNIE",
  afternoon: "POPOŁUDNIE",
  eveningPeak: "SZCZYT WIECZORNY",
  lateEvening: "PÓŹNY WIECZÓR",
};

/** The weather of the shown turn in numbers — revealed truth, never a forecast. */
export function weatherStripModel(scene: WorldScene): WeatherStripModel {
  const { weather, time, sun } = scene;
  const items: WeatherStripItem[] = [
    {
      key: "wind",
      label: `WIATR ${WIND_CLASS_LABELS.open.toUpperCase()}`,
      value: `${formatNumber(weather.windMs.open, 1)} m/s`,
      tone: weather.storm ? "danger" : weather.windMs.open < 3 ? "warn" : "info",
    },
    {
      key: "windSea",
      label: `WIATR ${WIND_CLASS_LABELS.baltic.toUpperCase()}`,
      value: `${formatNumber(weather.windMs.baltic, 1)} m/s`,
      tone: weather.storm ? "danger" : "info",
    },
    {
      key: "cloud",
      label: "ZACHMURZENIE",
      value: formatNumber(weather.cloudCover, 2),
      tone: weather.cloudCover > 0.85 ? "warn" : "info",
    },
    { key: "ghi", label: "GHI", value: `${formatNumber(weather.ghiW)} W/m²`, tone: "info" },
    {
      key: "temp",
      label: "TEMPERATURA",
      value: `${formatNumber(weather.tempC, 1)} °C`,
      tone: weather.tempC < -10 ? "warn" : "info",
    },
    {
      key: "sun",
      label: "SŁOŃCE",
      value:
        sun.altitudeDeg > 0
          ? `${formatNumber(sun.altitudeDeg, 1)}°`
          : `pod horyzontem · zachód ${hourText(sun.sunsetHour)}`,
      tone: "info",
    },
  ];
  const note = weather.dunkelflaute
    ? `⚠ Dunkelflaute: wiatr ${formatNumber(weather.windMs.open, 1)} m/s < 3 m/s i GHI ${formatNumber(weather.ghiW)} W/m² → OZE ≈ 0`
    : weather.storm
      ? `⚠ wiatr ≥ 25 m/s → wyłączenie sztormowe turbin (06 §6.3)`
      : null;
  return {
    title: time.resolved
      ? `${PHASE_NAMES[time.phase]} · ${hourText(time.hour)} · ${REGIME_LABELS[weather.regime]}`
      : `${PHASE_NAMES[time.phase]} · ${hourText(time.hour)} · brak rozstrzygnięcia`,
    items,
    note,
    banner: scene.overlay.weatherOverride
      ? `PODGLĄD POGODY: ${REGIME_LABELS[scene.overlay.weatherOverride]}`
      : null,
  };
}
