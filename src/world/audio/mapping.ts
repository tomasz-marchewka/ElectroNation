// Pure audio mappings (MODULE audio, step 1): WorldScene numbers in, Web Audio
// parameters out. Nothing in this file touches an AudioContext, the DOM or a
// frame clock, so every mapping is unit-tested in Node
// (tests/unit/world/audio.test.ts).
//
// The runtime path calls the `*Into` variants: they write into a caller-owned
// scratch object, so update() allocates nothing per call (the brief's budget).
// The convenience wrappers allocate and exist for tests and evidence only.
//
// Levels are linear gains fed to `setTargetAtTime`; each constant carries its
// mixing rule. The overload threshold is the SVG map's own (docs/08 §3; the
// map's `sceneModel.ts` uses 0,75 warn / 0,995 overload), so a ping and a red
// conductor always agree about what "overloaded" means.

import type { PrecipitationKind, RotorState } from "../bridge/worldScene";
import { worldRng } from "../render/core/prng";
import { COLUMN_STEP_KM, ROW_STEP_KM } from "../render/core/units";

/** usedMw / capacityMw at or above which a segment counts as overloaded. */
export const OVERLOAD_RATIO = 0.995;

/** Audibility windows [km] — 1 at `nearKm`, 0 at `farKm` (docs/08 §3 "near the camera"). */
export const AUDIBLE_TURBINE_KM = 60;
export const AUDIBLE_PLANT_KM = 90;
export const AUDIBLE_CITY_KM = 70;

/** Peak of the single diagnostic ping: quieter than the bed at every wind speed. */
export const PING_PEAK = 0.04;
export const PING_DECAY_S = 0.7;

/** One ping per this many seconds, at most — diagnosis, never a loop (docs/08 §3). */
export const PING_COOLDOWN_S = 6;

/** The bed never falls silent (a country always breathes) but stays quiet. */
const WIND_FLOOR = 0.06;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Smooth 1 → 0 falloff between `nearKm` and `farKm`; 1 inside, 0 beyond.
 * Smoothstep, so a crossing object fades instead of clicking.
 */
export function distanceGain(distanceKm: number, nearKm: number, farKm: number): number {
  if (!(distanceKm > nearKm)) return 1;
  if (distanceKm >= farKm) return 0;
  const t = (distanceKm - nearKm) / (farKm - nearKm);
  return 1 - t * t * (3 - 2 * t);
}

// --- wind bed ----------------------------------------------------------------

export interface WindBedParams {
  gain: number;
  freqHz: number;
  q: number;
}

/**
 * The wind bed: band-passed noise whose level and centre frequency follow the
 * open-terrain wind of the shown turn. `gust` (0..1, see {@link gustLevel})
 * opens and closes the band; `gustiness` of the regime decides how far.
 */
export function windBedInto(
  out: WindBedParams,
  windMs: number,
  gustiness: number,
  gust: number,
): WindBedParams {
  const speed = clamp01((Math.max(0, windMs) - 1) / 17);
  const swing = 1 + clamp01(gustiness) * (clamp01(gust) - 0.45) * 1.1;
  out.gain = (WIND_FLOOR + 0.5 * speed) * Math.min(1.45, Math.max(0.55, swing));
  out.freqHz = 240 + 640 * speed;
  out.q = 0.6 + 0.5 * speed;
  return out;
}

export function windBed(windMs: number, gustiness: number, gust: number): WindBedParams {
  return windBedInto({ gain: 0, freqHz: 0, q: 0 }, windMs, gustiness, gust);
}

// --- precipitation -----------------------------------------------------------

export interface PrecipLayers {
  rain: number;
  snow: number;
  storm: number;
}

/** Rain hisses through a high-pass, snow is a soft hush, a storm adds a rumble. */
export function precipitationInto(
  out: PrecipLayers,
  kind: PrecipitationKind,
  intensity: number,
  storm: boolean,
): PrecipLayers {
  const i = clamp01(intensity);
  out.rain = kind === "rain" ? 0.3 * i : kind === "sleet" ? 0.18 * i : 0;
  out.snow = kind === "snow" ? 0.12 * i : kind === "sleet" ? 0.07 * i : 0;
  if (storm) out.rain = Math.max(out.rain, 0.22);
  out.storm = storm ? 0.18 : 0;
  return out;
}

export function precipitation(
  kind: PrecipitationKind,
  intensity: number,
  storm: boolean,
): PrecipLayers {
  return precipitationInto({ rain: 0, snow: 0, storm: 0 }, kind, intensity, storm);
}

// --- wind turbines -----------------------------------------------------------

/** Only a farm that is on and actually turning makes noise (06 §6.3). */
export function isRotorAudible(enabled: boolean, rotor: RotorState, rotorSpeed: number): boolean {
  return enabled && rotor === "spinning" && rotorSpeed > 0.02;
}

export interface TurbineParams {
  gain: number;
  freqHz: number;
}

/** Blade whoosh: level ∝ rotorSpeed^1,15, window 6–60 km, gusts breathe it. */
export function turbineInto(
  out: TurbineParams,
  rotorSpeed: number,
  distanceKm: number,
  gust: number,
): TurbineParams {
  const level = clamp01(rotorSpeed);
  out.gain =
    0.24 *
    Math.pow(level, 1.15) *
    distanceGain(distanceKm, 6, AUDIBLE_TURBINE_KM) *
    (0.8 + 0.35 * clamp01(gust));
  out.freqHz = 170 + 300 * level;
  return out;
}

export function turbine(rotorSpeed: number, distanceKm: number, gust: number): TurbineParams {
  return turbineInto({ gain: 0, freqHz: 0 }, rotorSpeed, distanceKm, gust);
}

// --- power plants ------------------------------------------------------------

export type PlantHumKind = "low" | "gas" | "none";

/** Nuclear and coal drone low; gas turbines whine higher; PV has no voice. */
export function plantHumKind(tech: string): PlantHumKind {
  if (tech === "nuclear" || tech === "coal") return "low";
  if (tech === "ccgt" || tech === "ocgt") return "gas";
  return "none";
}

export interface PlantParams {
  kind: PlantHumKind;
  gain: number;
  freqHz: number;
}

/**
 * Plant hum by output: a running block is heard even at minimum load, and above
 * a third of rated the level saturates — a plant is a place, not a meter.
 */
export function plantInto(
  out: PlantParams,
  tech: string,
  load: number,
  distanceKm: number,
): PlantParams {
  const kind = plantHumKind(tech);
  const l = clamp01(load);
  out.kind = kind;
  if (kind === "none" || l <= 0.01) {
    out.gain = 0;
    out.freqHz = 0;
    return out;
  }
  out.gain =
    0.2 * (0.3 + 0.7 * Math.min(1, l * 3)) * distanceGain(distanceKm, 10, AUDIBLE_PLANT_KM);
  out.freqHz = kind === "low" ? 42 + 22 * l : 165 + 145 * l;
  return out;
}

export function plant(tech: string, load: number, distanceKm: number): PlantParams {
  return plantInto({ kind: "none", gain: 0, freqHz: 0 }, tech, load, distanceKm);
}

// --- cities ------------------------------------------------------------------

export interface CityParams {
  gain: number;
  freqHz: number;
}

/**
 * City murmur: the night share follows `1 − daylight`, the level follows
 * `lit × scale` (docs/08 §3: lit = delivered / demand), and only the near city
 * is heard — a country at night, not a traffic mix.
 */
export function cityInto(
  out: CityParams,
  lit: number,
  scale: number,
  daylight: number,
  distanceKm: number,
): CityParams {
  const night = Math.pow(1 - clamp01(daylight), 1.1);
  out.gain =
    0.16 * clamp01(lit) * clamp01(scale) * night * distanceGain(distanceKm, 5, AUDIBLE_CITY_KM);
  out.freqHz = 230 + 150 * clamp01(scale);
  return out;
}

export function city(lit: number, scale: number, daylight: number, distanceKm: number): CityParams {
  return cityInto({ gain: 0, freqHz: 0 }, lit, scale, daylight, distanceKm);
}

// --- gusts -------------------------------------------------------------------

export interface GustSchedule {
  /** Seconds after which the schedule repeats (bumps wrap across the seam). */
  period: number;
  starts: Float32Array;
  strengths: Float32Array;
  widths: Float32Array;
}

/**
 * Gusts timed by the seeded stream `worldRng(seed, "audio:gust")` — the same
 * seed gives the same wind, so two runs of the same world breathe alike
 * (ARCHITECTURE.md §12; audio is not part of a captured frame, but its
 * randomness still comes from the renderer's PRNG, never Math.random).
 */
export function buildGustSchedule(seed: number, count = 9): GustSchedule {
  const n = Math.max(1, Math.trunc(count));
  const rng = worldRng(seed, "audio:gust");
  const period = 41.7;
  const starts = new Float32Array(n);
  const strengths = new Float32Array(n);
  const widths = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    starts[i] = rng.next() * period;
    strengths[i] = 0.4 + 0.6 * rng.next();
    widths[i] = 1 + 2 * rng.next();
  }
  return { period, starts, strengths, widths };
}

/** Raised-cosine bumps summed with wrap-around; 0..1, peaking at 1. */
export function gustLevel(schedule: GustSchedule, tSec: number): number {
  const period = schedule.period;
  if (!(period > 0) || !Number.isFinite(tSec)) return 0;
  let t = tSec % period;
  if (t < 0) t += period;
  let level = 0;
  for (let i = 0; i < schedule.starts.length; i++) {
    let d = t - (schedule.starts[i] ?? 0);
    if (d < -period / 2) d += period;
    else if (d > period / 2) d -= period;
    const x = d / (schedule.widths[i] ?? 1);
    level += (schedule.strengths[i] ?? 0) * Math.exp(-x * x);
  }
  return clamp01(level);
}

// --- diagnostics ping --------------------------------------------------------

export interface AudioSnapshot {
  overloaded: number;
  blackouts: number;
}

export interface SnapshotScene {
  lines: readonly { segments: readonly { ratio: number }[] }[];
  cities: readonly { blackout: boolean }[];
}

/** Counts what docs/08 §3 paints red: overloaded segments and blackout cities. */
export function snapshotInto(out: AudioSnapshot, scene: SnapshotScene): AudioSnapshot {
  let overloaded = 0;
  for (let i = 0; i < scene.lines.length; i++) {
    const line = scene.lines[i];
    if (!line) continue;
    for (let j = 0; j < line.segments.length; j++) {
      const segment = line.segments[j];
      if (segment && segment.ratio >= OVERLOAD_RATIO) overloaded += 1;
    }
  }
  let blackouts = 0;
  for (let i = 0; i < scene.cities.length; i++) {
    if (scene.cities[i]?.blackout) blackouts += 1;
  }
  out.overloaded = overloaded;
  out.blackouts = blackouts;
  return out;
}

export function snapshot(scene: SnapshotScene): AudioSnapshot {
  return snapshotInto({ overloaded: 0, blackouts: 0 }, scene);
}

/**
 * One ping when something NEW goes red (a count rises) and the cooldown has
 * passed. A state that stays red never pings again — diagnosis, not alarm.
 */
export function pingDue(
  previous: AudioSnapshot,
  next: AudioSnapshot,
  sinceLastPingSec: number,
  cooldownSec = PING_COOLDOWN_S,
): boolean {
  const appeared = next.overloaded > previous.overloaded || next.blackouts > previous.blackouts;
  return appeared && sinceLastPingSec >= cooldownSec;
}

// --- master level ------------------------------------------------------------

/** The one volume control; 0..1, squared for a roughly perceptual taper. */
export function masterGain(volume: number): number {
  const v = clamp01(volume);
  return v * v;
}

// --- hex position without an allocation --------------------------------------

/** World X [km] of a hex — the formula of `units.hexToWorld`, scalar in place. */
export function hexGroundX(q: number): number {
  return COLUMN_STEP_KM * q;
}

/** World Z [km] of a hex — the formula of `units.hexToWorld`, scalar in place. */
export function hexGroundZ(q: number, r: number): number {
  const row = r + Math.floor(q / 2);
  return ROW_STEP_KM * row + (q % 2 !== 0 ? ROW_STEP_KM / 2 : 0);
}
