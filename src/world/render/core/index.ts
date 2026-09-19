// Public surface of render/core — what a render module may import besides
// three and the scene contract.

export { CameraRig, CAMERA_LIMITS, type CameraPreset, type RigState } from "./CameraRig";
export * from "./exaggeration";
export { FrameClock, type FrameClockState } from "./FrameClock";
export { FLAT_TERRAIN, ModuleRegistry, defaultEnvironment } from "./ModuleRegistry";
export { hash01, hashString, worldRng, type Rng } from "./prng";
export {
  QUALITY_PROFILES,
  QUALITY_TIERS,
  QualityController,
  parseQuality,
  type QualityProfile,
} from "./Quality";
export {
  disposeTextures,
  fbm,
  mix,
  normalMapFromHeight,
  proceduralTexture,
  valueNoise,
  type NoiseField,
  type TextureSpec,
} from "./textures";
export * from "./types";
export * from "./units";
export {
  LAYERS,
  WorldRenderer,
  type Projected,
  type WorldEvent,
  type WorldRendererOptions,
} from "./WorldRenderer";
