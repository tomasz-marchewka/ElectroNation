// The sky's state (docs/08 §5–§6, ARCHITECTURE.md §7–§8): everything the dome,
// the lights, the clouds and the fog are driven by, as plain numbers that can
// be blended — a turn resolution eases from the previous hour to the new one
// over 1,5 s (docs/08 §4), so the whole state must interpolate. `targetState`
// derives it from the scene slice the sky consumes (time, sun, weather);
// `deriveLighting` turns a state into light colours with the atmosphere model
// of ./atmosphere, the same maths the dome shader runs per pixel.

import * as THREE from "three";
import type { PrecipitationKind, WorldScene, WorldWeather } from "../../bridge/worldScene";
import {
  AIRGLOW,
  AUREOLE_KNEE,
  MOON_RADIANCE_RATIO,
  MOON_TINT,
  SUN_RADIANCE,
  luminance,
  scatterLight,
  transmittanceToward,
} from "./atmosphere";

export type Regime = WorldWeather["regime"];

const DEG = Math.PI / 180;

/** The scattering's sun never sinks below this altitude [deg]; its radiance fades to 0 at TWILIGHT_END_DEG. */
export const TWILIGHT_FLOOR_DEG = -0.8;
export const TWILIGHT_END_DEG = -9;

/** Latitude of the country (06 §2, docs/08 §2) — one sun and one moon for all of it. */
export const LATITUDE_DEG = 52;

/**
 * Eight regimes, eight faces (06 §8.2, docs/08 §6). The cloud numbers of a
 * turn come from the engine's truth; a look only says HOW that coverage is
 * drawn and how the air between the camera and the country behaves.
 */
export interface RegimeLook {
  /** Size of a cloud cell [km] — the dominant feature of the coverage field. */
  cellKm: number;
  /** Softness of the coverage threshold: 0,07 hard cauliflower edges … 0,4 stratus veil. */
  soft: number;
  /** Darkness of the cloud mass 0..1 — storm scud is 0,75, fair-weather cumulus 0,05. */
  dark: number;
  /** Ceiling of the veil's opacity seen from above; the map must stay readable through it. */
  cap: number;
  /** Amount of the high thin layer (high tier only). */
  highLayer: number;
  /** Turbidity of the clear air: 0,4 brutally clear … 2,4 milky. */
  mie: number;
  /** Whitening of the horizon band — heat haze, ice haze, the murk under a low. */
  hazeBand: number;
  /** Cold tint of the ambient light 0..1. */
  cool: number;
  /** Share of the view washed by fog at its far edge, before the fog level scales it. */
  wash: number;
  /** Domain warp of the cloud lumps 0..1 — cumulus is lumpy, stratus is not. */
  warp: number;
  /** Relief of the cloud tops 0..1 — how much the lighting models them as heaps. */
  relief: number;
}

export const REGIME_LOOK: Record<Regime, RegimeLook> = {
  // Hard low winter sun, cold blue shadows, clear, a thin ice haze on the horizon.
  frostHigh: {
    cellKm: 48,
    soft: 0.1,
    dark: 0.08,
    cap: 0.9,
    highLayer: 0.25,
    mie: 0.55,
    hazeBand: 0.35,
    cool: 0.8,
    wash: 0.12,
    warp: 0.6,
    relief: 0.8,
  },
  // Milky grey stratus, no shadows, Dunkelflaute.
  fogHigh: {
    cellKm: 220,
    soft: 0.4,
    dark: 0.22,
    cap: 0.55,
    highLayer: 0,
    mie: 2.4,
    hazeBand: 1,
    cool: 0.4,
    wash: 0.62,
    warp: 0.15,
    relief: 0.25,
  },
  // Fast grey-white clouds, drizzle.
  atlanticLow: {
    cellKm: 75,
    soft: 0.24,
    dark: 0.38,
    cap: 0.7,
    highLayer: 0.5,
    mie: 1.5,
    hazeBand: 0.55,
    cool: 0.1,
    wash: 0.3,
    warp: 0.5,
    relief: 0.55,
  },
  // Dark scud, heavy rain, gusty.
  storm: {
    cellKm: 55,
    soft: 0.2,
    dark: 0.78,
    cap: 0.75,
    highLayer: 0.5,
    mie: 2.0,
    hazeBand: 0.65,
    cool: 0.15,
    wash: 0.42,
    warp: 0.75,
    relief: 0.7,
  },
  // Deep blue, heat haze on the horizon, strong sun, a few fair-weather puffs.
  summerHigh: {
    cellKm: 28,
    soft: 0.07,
    dark: 0.05,
    cap: 0.95,
    highLayer: 0.15,
    mie: 0.85,
    hazeBand: 0.55,
    cool: 0,
    wash: 0.2,
    warp: 0.9,
    relief: 1,
  },
  // Broken cumulus, showers.
  summerLow: {
    cellKm: 42,
    soft: 0.11,
    dark: 0.45,
    cap: 0.8,
    highLayer: 0.3,
    mie: 1.2,
    hazeBand: 0.35,
    cool: 0,
    wash: 0.28,
    warp: 0.9,
    relief: 1,
  },
  // Mixed.
  transitional: {
    cellKm: 58,
    soft: 0.15,
    dark: 0.3,
    cap: 0.8,
    highLayer: 0.4,
    mie: 1.1,
    hazeBand: 0.4,
    cool: 0.2,
    wash: 0.22,
    warp: 0.7,
    relief: 0.8,
  },
  // Brutal clear cold, bright low sun.
  coldWave: {
    cellKm: 80,
    soft: 0.12,
    dark: 0.15,
    cap: 0.8,
    highLayer: 0.3,
    mie: 0.4,
    hazeBand: 0.2,
    cool: 1,
    wash: 0.08,
    warp: 0.5,
    relief: 0.7,
  },
};

export interface SkyState {
  sunDir: THREE.Vector3;
  sunAltitudeDeg: number;
  moonDir: THREE.Vector3;
  moonAltitudeDeg: number;
  /** 0..1 brightness of the moon this night (phase, deterministic from the day of year). */
  moonLight: number;
  daylight: number;
  hour: number;
  cloudCover: number;
  fog: number;
  haze: number;
  tempC: number;
  snowCover: number;
  /** Open-terrain wind [m/s] — drives cloud drift and the slant of the rain. */
  windMs: number;
  windFromDeg: number;
  gustiness: number;
  precipitation: number;
  precipitationKind: PrecipitationKind;
  regime: Regime;
  look: RegimeLook;
}

export function emptyState(): SkyState {
  return {
    sunDir: new THREE.Vector3(0, 1, 0),
    sunAltitudeDeg: 90,
    moonDir: new THREE.Vector3(0, -1, 0),
    moonAltitudeDeg: -90,
    moonLight: 0,
    daylight: 1,
    hour: 12,
    cloudCover: 0,
    fog: 0,
    haze: 0.15,
    tempC: 10,
    snowCover: 0,
    windMs: 0,
    windFromDeg: 0,
    gustiness: 0,
    precipitation: 0,
    precipitationKind: "none",
    regime: "transitional",
    look: { ...REGIME_LOOK.transitional },
  };
}

/** Altitude and azimuth (clockwise from north) of a body at the given declination and hour angle. */
function bodyPosition(declinationDeg: number, hourAngleDeg: number): { alt: number; az: number } {
  const phi = LATITUDE_DEG * DEG;
  const delta = declinationDeg * DEG;
  const omegaDeg = ((((hourAngleDeg + 180) % 360) + 360) % 360) - 180;
  const omega = omegaDeg * DEG;
  const sinAlt =
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(omega);
  const alt = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
  const cosAlt = Math.cos(alt);
  let az = 180;
  if (cosAlt > 1e-9) {
    const cosA = Math.min(
      1,
      Math.max(
        -1,
        (Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(omega)) /
          cosAlt,
      ),
    );
    const morning = Math.acos(cosA) / DEG;
    az = omegaDeg <= 0 ? morning : 360 - morning;
  }
  return { alt: alt / DEG, az };
}

function directionOf(altDeg: number, azDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const flat = Math.cos(altDeg * DEG);
  return out.set(
    Math.sin(azDeg * DEG) * flat,
    Math.sin(altDeg * DEG),
    -Math.cos(azDeg * DEG) * flat,
  );
}

/**
 * A synodic month over the day of year; offset so the January judging day
 * (day 21) is near full. A renderer decoration, not a game number — nights
 * are never darker than a quarter moon so the country stays readable.
 */
function moonLightOf(dayOfYear: number): number {
  const phase = ((dayOfYear + 23.3) % 29.53) / 29.53;
  const illuminated = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return 0.25 + 0.75 * illuminated;
}

/** The state the scene asks for; `out` is filled in place. */
export function targetState(scene: WorldScene, out: SkyState): SkyState {
  const { sun, weather, time } = scene;
  out.sunDir.set(sun.direction.x, sun.direction.y, sun.direction.z).normalize();
  out.sunAltitudeDeg = sun.altitudeDeg;
  // The moon rides opposite the sun: anti-solar hour angle, mirrored declination.
  const moon = bodyPosition(-sun.declinationDeg, sun.hourAngleDeg + 180);
  directionOf(moon.alt, moon.az, out.moonDir);
  out.moonAltitudeDeg = moon.alt;
  out.moonLight = moonLightOf(time.dayOfYear);
  out.daylight = sun.daylight;
  out.hour = time.hour;
  out.cloudCover = weather.cloudCover;
  out.fog = weather.fog;
  out.haze = weather.haze;
  out.tempC = weather.tempC;
  out.snowCover = weather.snowCover;
  out.windMs = weather.windMs.open;
  out.windFromDeg = weather.windFromDeg;
  out.gustiness = weather.gustiness;
  out.precipitation = weather.precipitation.intensity;
  out.precipitationKind = weather.precipitation.kind;
  out.regime = weather.regime;
  Object.assign(out.look, REGIME_LOOK[weather.regime]);
  return out;
}

/** A key that changes exactly when the target state would. */
export function stateKey(scene: WorldScene): string {
  const w = scene.weather;
  return [
    scene.time.dayIndex,
    scene.time.turnIndex,
    scene.time.hour,
    scene.time.dayOfYear,
    w.regime,
    w.cloudCover.toFixed(3),
    w.fog.toFixed(3),
    w.haze.toFixed(3),
    w.windMs.open.toFixed(2),
    w.windFromDeg.toFixed(1),
    w.precipitation.kind,
    w.precipitation.intensity.toFixed(3),
    w.snowCover.toFixed(2),
    w.tempC.toFixed(1),
    scene.sun.altitudeDeg.toFixed(3),
    scene.sun.azimuthDeg.toFixed(3),
  ].join("|");
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** out = a → b at k; directions renormalised, discrete values switch at the midpoint. */
export function blendState(a: SkyState, b: SkyState, k: number, out: SkyState): SkyState {
  out.sunDir.lerpVectors(a.sunDir, b.sunDir, k).normalize();
  out.sunAltitudeDeg = lerp(a.sunAltitudeDeg, b.sunAltitudeDeg, k);
  out.moonDir.lerpVectors(a.moonDir, b.moonDir, k).normalize();
  out.moonAltitudeDeg = lerp(a.moonAltitudeDeg, b.moonAltitudeDeg, k);
  out.moonLight = lerp(a.moonLight, b.moonLight, k);
  out.daylight = lerp(a.daylight, b.daylight, k);
  out.hour = lerp(a.hour, b.hour, k);
  out.cloudCover = lerp(a.cloudCover, b.cloudCover, k);
  out.fog = lerp(a.fog, b.fog, k);
  out.haze = lerp(a.haze, b.haze, k);
  out.tempC = lerp(a.tempC, b.tempC, k);
  out.snowCover = lerp(a.snowCover, b.snowCover, k);
  out.windMs = lerp(a.windMs, b.windMs, k);
  // Shortest way round for the heading.
  const dHeading = ((b.windFromDeg - a.windFromDeg + 540) % 360) - 180;
  out.windFromDeg = (((a.windFromDeg + dHeading * k) % 360) + 360) % 360;
  out.gustiness = lerp(a.gustiness, b.gustiness, k);
  out.precipitation = lerp(a.precipitation, b.precipitation, k);
  out.precipitationKind = k < 0.5 ? a.precipitationKind : b.precipitationKind;
  out.regime = k < 0.5 ? a.regime : b.regime;
  for (const key of Object.keys(a.look) as (keyof RegimeLook)[]) {
    out.look[key] = lerp(a.look[key], b.look[key], k);
  }
  return out;
}

export function copyState(from: SkyState, out: SkyState): SkyState {
  return blendState(from, from, 0, out);
}

// --- lighting derived from a state ---------------------------------------------

export interface Lighting {
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Direction the shadow-casting light uses: the sun, never below 2° so the frustum stays sane. */
  sunLightDir: THREE.Vector3;
  /** 0..1 — how far up the sun is for anything that needs a "sun is out" ramp. */
  sunUp: number;
  shadowIntensity: number;
  moonColor: THREE.Color;
  moonIntensity: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  ambientIntensity: number;
  /** Colour of the air at the horizon — what fog is made of. */
  fogColor: THREE.Color;
  /** The flat grey the dome and the veil turn into under a solid overcast. */
  overcastColor: THREE.Color;
  overcastMix: number;
  zenithColor: THREE.Color;
  starVisibility: number;
  /** Turbidity factor and phase asymmetry the dome runs with. */
  mie: number;
  g: number;
  /** Radiance of the moon term in the dome (0 by day). */
  moonRadiance: number;
  /**
   * The sun the SCATTERING sees: never below −0,8°, with its radiance fading
   * out over civil twilight — a single-scattering model has no multiple
   * scattering, so without this the sky at −3° is black while the real one
   * still glows (docs/08 §5: dawn must read as dawn). The disc uses the true sun.
   */
  scatterSunDir: THREE.Vector3;
  sunRadiance: number;
  /** Colour of the sun disc after the air, in dome units. */
  sunDiscColor: THREE.Color;
  /** Colour the dome fades to for the ground beyond the board (below the horizon). */
  distantGround: THREE.Color;
  nightFloor: THREE.Color;
  /** Strength of the cloud shadow on the ground, 0..1 (docs/08 §6). */
  cloudShadowStrength: number;
  /** Whitening of the dome's horizon band. */
  hazeBand: number;
}

export function emptyLighting(): Lighting {
  return {
    sunColor: new THREE.Color(1, 1, 1),
    sunIntensity: 0,
    sunLightDir: new THREE.Vector3(0, 1, 0),
    sunUp: 1,
    shadowIntensity: 1,
    moonColor: new THREE.Color(0.75, 0.85, 1),
    moonIntensity: 0,
    skyColor: new THREE.Color(0.5, 0.6, 0.8),
    groundColor: new THREE.Color(0.2, 0.2, 0.18),
    ambientIntensity: 1,
    fogColor: new THREE.Color(0.7, 0.75, 0.8),
    overcastColor: new THREE.Color(0.5, 0.5, 0.5),
    overcastMix: 0,
    zenithColor: new THREE.Color(0.2, 0.4, 0.8),
    starVisibility: 0,
    mie: 1,
    g: 0.78,
    moonRadiance: 0,
    scatterSunDir: new THREE.Vector3(0, 1, 0),
    sunRadiance: SUN_RADIANCE,
    sunDiscColor: new THREE.Color(1, 1, 1),
    distantGround: new THREE.Color(0.4, 0.45, 0.5),
    nightFloor: new THREE.Color(0, 0, 0),
    cloudShadowStrength: 0,
    hazeBand: 0.3,
  };
}

const moonTint = new THREE.Vector3(...MOON_TINT);

const dir = new THREE.Vector3();
const sample = new THREE.Vector3();
const accum = new THREE.Vector3();
const tmp = new THREE.Vector3();
const sunT = new THREE.Vector3();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The dome's radiance in `d` — sun and moon scattering plus the night floor, as the shader does it. */
function domeRadiance(
  d: THREE.Vector3,
  state: SkyState,
  sunDir: THREE.Vector3,
  sunRadiance: number,
  mie: number,
  g: number,
  moonRadiance: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  scatterLight(d, sunDir, sunRadiance, mie, g, out);
  if (moonRadiance > 0) {
    scatterLight(d, state.moonDir, moonRadiance, mie, g, tmp).multiply(moonTint);
    out.add(tmp);
  }
  const up = 0.5 + 0.5 * Math.max(d.y, 0);
  out.x += AIRGLOW[0] * up;
  out.y += AIRGLOW[1] * up;
  out.z += AIRGLOW[2] * up;
  // The dome shader's aureole knee, so the ambient twin sees the same sky.
  const lum = luminance(out);
  if (lum > AUREOLE_KNEE) {
    const over = lum - AUREOLE_KNEE;
    out.multiplyScalar((AUREOLE_KNEE + over / (1 + over)) / lum);
  }
  return out;
}

/** Fills `out` from the state; every colour is linear. */
export function deriveLighting(state: SkyState, out: Lighting): Lighting {
  const { look } = state;
  const alt = state.sunAltitudeDeg;
  // Turbidity: the regime's clear-air value, nudged by the day's haze.
  const mie = look.mie * (0.85 + 0.35 * state.haze);
  const g = 0.76 + 0.06 * Math.min(1, state.haze);
  out.mie = mie;
  out.g = g;
  out.hazeBand = look.hazeBand;
  const night = 1 - state.daylight;
  // The twilight sun of the scattering: lifted to the horizon, fading out by −9°.
  const azimuthDeg = Math.atan2(state.sunDir.x, -state.sunDir.z) / DEG;
  directionOf(Math.max(alt, TWILIGHT_FLOOR_DEG), azimuthDeg, out.scatterSunDir);
  out.sunRadiance = SUN_RADIANCE * smoothstep(TWILIGHT_END_DEG, TWILIGHT_FLOOR_DEG, alt);
  const scatterSun = out.scatterSunDir;
  const sunRadiance = out.sunRadiance;
  out.moonRadiance =
    state.daylight > 0.97 || state.moonAltitudeDeg < -8
      ? 0
      : SUN_RADIANCE * MOON_RADIANCE_RATIO * state.moonLight * night;

  // Overcast: a flat grey sheet. Computed before the sun because both the
  // direct light and the ambient read it: under a solid cover the sun softens
  // and the sky share grows, so machines stop showing hard black/white faces.
  out.overcastMix = Math.max(smoothstep(0.4, 0.95, state.cloudCover), 0.9 * state.fog);

  // Sun: colour from transmittance, intensity from the altitude, dimmed by cloud and fog.
  const lightAlt = Math.max(alt, 2);
  const azimuth = Math.atan2(state.sunDir.x, -state.sunDir.z);
  const flat = Math.cos(lightAlt * DEG);
  out.sunLightDir.set(
    Math.sin(azimuth) * flat,
    Math.sin(lightAlt * DEG),
    -Math.cos(azimuth) * flat,
  );
  dir.copy(out.sunLightDir);
  transmittanceToward(dir, mie, sunT);
  const peak = Math.max(sunT.x, sunT.y, sunT.z, 1e-4);
  // Single scattering over-reddens a low sun (no multiple scattering, no
  // ozone): a gamma on the ratios keeps the disc orange and the light warm.
  out.sunColor.setRGB(
    Math.pow(sunT.x / peak, 0.6),
    Math.pow(sunT.y / peak, 0.6),
    Math.pow(sunT.z / peak, 0.6),
  );
  out.sunDiscColor.setRGB(sunT.x, sunT.y, sunT.z);
  const cover = state.cloudCover;
  const cloudDim = 1 - 0.9 * Math.pow(cover, 1.5);
  const fogDim = 1 - 0.75 * state.fog;
  // Direct sun ends at the horizon (a short tail for refraction and the soft terminator of the relief).
  const sunUp = smoothstep(-1.5, 4, alt);
  out.sunUp = sunUp;
  // Under a heavy overcast the directional term softens further: the light is
  // the sheet, not a lamp, so faces stay readable instead of split black/white.
  const overcastSoft = 1 - 0.35 * out.overcastMix;
  out.sunIntensity = 3.8 * Math.pow(peak, 0.7) * sunUp * cloudDim * fogDim * overcastSoft;
  out.shadowIntensity = Math.min(
    1,
    Math.max(
      0,
      (0.55 + 0.45 * smoothstep(0, 20, alt)) *
        (1 - 0.8 * smoothstep(0.35, 0.95, cover)) *
        (1 - 0.85 * state.fog),
    ),
  );

  // Moon light: faint, cool, only above the horizon and by night.
  const moonUp = smoothstep(-2, 6, state.moonAltitudeDeg);
  out.moonColor.setRGB(0.72, 0.84, 1.0);
  out.moonIntensity = 0.14 * state.moonLight * moonUp * night * cloudDim * fogDim;

  // Cloud shadows: the sun's, or the moon's faint ones by night; fog diffuses both.
  out.cloudShadowStrength = Math.max(
    0.92 * sunUp * (1 - 0.6 * state.fog),
    0.3 * moonUp * Math.pow(night, 3) * state.moonLight * (1 - 0.6 * state.fog),
  );

  // Sky ambient: the dome averaged over the upper hemisphere.
  accum.set(0, 0, 0);
  let weight = 0;
  const ring = (elevationDeg: number, count: number, offsetDeg: number, w: number) => {
    for (let i = 0; i < count; i++) {
      const az = (offsetDeg + (360 / count) * i) * DEG;
      const f = Math.cos(elevationDeg * DEG);
      dir.set(Math.sin(az) * f, Math.sin(elevationDeg * DEG), -Math.cos(az) * f);
      domeRadiance(dir, state, scatterSun, sunRadiance, mie, g, out.moonRadiance, sample);
      accum.addScaledVector(sample, w);
      weight += w;
    }
  };
  dir.set(0, 1, 0);
  domeRadiance(dir, state, scatterSun, sunRadiance, mie, g, out.moonRadiance, sample);
  out.zenithColor.setRGB(sample.x, sample.y, sample.z);
  accum.addScaledVector(sample, 1);
  weight += 1;
  ring(50, 4, 0, 1);
  ring(15, 4, 45, 0.8);
  accum.divideScalar(weight);
  const skyClearLum = luminance(accum);

  // The horizon: six azimuths just above the ground.
  tmp.set(0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const az = (30 + 60 * i) * DEG;
    const f = Math.cos(2 * DEG);
    dir.set(Math.sin(az) * f, Math.sin(2 * DEG), -Math.cos(az) * f);
    domeRadiance(dir, state, scatterSun, sunRadiance, mie, g, out.moonRadiance, sample);
    tmp.add(sample);
  }
  tmp.divideScalar(6);

  // Overcast: a flat grey, slightly cool, keeping a hint of the hour's tint,
  // scaled by how bright the day is and darkened by the regime's cloud mass.
  const zenithLum = luminance({ x: out.zenithColor.r, y: out.zenithColor.g, z: out.zenithColor.b });
  const overcastLum = Math.max(zenithLum, skyClearLum) * 1.7 * (1 - 0.65 * look.dark);
  const tintLum = Math.max(skyClearLum, 1e-6);
  const tintR = 0.4 * (accum.x / tintLum) + 0.6;
  const tintG = 0.4 * (accum.y / tintLum) + 0.6;
  const tintB = 0.4 * (accum.z / tintLum) + 0.6;
  out.overcastColor.setRGB(
    0.9 * overcastLum * tintR,
    0.93 * overcastLum * tintG,
    0.99 * overcastLum * tintB,
  );

  // Ambient under the sky the player sees: clear sky → overcast grey.
  const skyR = accum.x + (out.overcastColor.r * 0.85 - accum.x) * out.overcastMix;
  const skyG = accum.y + (out.overcastColor.g * 0.85 - accum.y) * out.overcastMix;
  const skyB = accum.z + (out.overcastColor.b * 0.85 - accum.z) * out.overcastMix;
  // Night floor: a moonlit country is dark, never black (docs/08 §3 — the read survives the night).
  const floor = 0.4 + 0.6 * state.moonLight;
  out.nightFloor.setRGB(0.045 * floor * night, 0.062 * floor * night, 0.11 * floor * night);
  const coolR = 1 - 0.12 * look.cool;
  const coolB = 1 + 0.12 * look.cool;
  out.skyColor.setRGB(
    (skyR + out.nightFloor.r) * coolR,
    skyG + out.nightFloor.g,
    (skyB + out.nightFloor.b) * coolB,
  );
  const snow = state.snowCover;
  const albedoR = 0.3 + (0.72 - 0.3) * snow;
  const albedoG = 0.3 + (0.74 - 0.3) * snow;
  const albedoB = 0.25 + (0.82 - 0.25) * snow;
  const bounce = 0.06 * out.sunIntensity * Math.max(Math.sin(alt * DEG), 0);
  out.groundColor.setRGB(
    out.skyColor.r * albedoR + out.sunColor.r * bounce * albedoR,
    out.skyColor.g * albedoG + out.sunColor.g * bounce * albedoG,
    out.skyColor.b * albedoB + out.sunColor.b * bounce * albedoB,
  );
  out.ambientIntensity = 1.25 * (1 + 0.45 * out.overcastMix);

  // Fog is the horizon air: greyer under overcast, milky under the fog high, dark at night.
  const horizonR = tmp.x + (out.overcastColor.r * 0.95 - tmp.x) * out.overcastMix;
  const horizonG = tmp.y + (out.overcastColor.g * 0.95 - tmp.y) * out.overcastMix;
  const horizonB = tmp.z + (out.overcastColor.b * 0.95 - tmp.z) * out.overcastMix;
  const milk = Math.max(luminance({ x: skyR, y: skyG, z: skyB }), 0.0005) * 1.15;
  const milkMix = 0.8 * state.fog;
  out.fogColor.setRGB(
    horizonR + (0.86 * milk - horizonR) * milkMix + out.nightFloor.r * 0.5,
    horizonG + (0.88 * milk - horizonG) * milkMix + out.nightFloor.g * 0.5,
    horizonB + (0.92 * milk - horizonB) * milkMix + out.nightFloor.b * 0.5,
  );
  out.distantGround.setRGB(out.fogColor.r * 0.84, out.fogColor.g * 0.84, out.fogColor.b * 0.82);

  // Stars only once the sun is really down: `daylight` alone leaves them on
  // through a bright low sun, where their white dots read as speckle over the
  // ground and the sky (terrain's report).
  const starAltitude = smoothstep(2, -8, alt);
  out.starVisibility =
    Math.pow(night, 1.5) *
    starAltitude *
    (1 - smoothstep(0.25, 0.85, cover)) *
    (1 - 0.9 * state.fog);
  return out;
}
