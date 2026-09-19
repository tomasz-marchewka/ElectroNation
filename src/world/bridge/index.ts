// Public surface of the bridge — the only module in src/world that reads the
// engine (ARCHITECTURE.md §2–§3).

export {
  buildWorldScene,
  type BuildWorldSceneOptions,
  type WorldOverlayInput,
} from "./buildWorldScene";
export { segmentDirections, type FlowDirection } from "./flowDirection";
export { weatherStripModel, type WeatherStripItem, type WeatherStripModel } from "./hud";
export {
  DEFAULT_SHOWCASE,
  SHOWCASE_SCENARIOS,
  isShowcaseScenario,
  showcaseState,
  type ShowcaseScenario,
  type ShowcaseTarget,
} from "./showcase";
export { buildSun, solarAzimuthDeg, sunVector } from "./sun";
export { buildWeather, precipitationOf, snowCoverOf } from "./weather";
export * from "./worldScene";
