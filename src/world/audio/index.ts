// World audio (MODULE audio, step 1): a country at work, quietly, synthesised
// entirely in Web Audio — oscillators, one shared pink-noise buffer, biquad
// filters and gains. No files, no downloads, no engine and no frame clock:
// the module reads the scene and the camera view through the two getters the
// integrator hands it.
//
// Contract (ARCHITECTURE.md §2, docs/08 §3–§4):
//   - MUTED BY DEFAULT. No AudioContext exists until setEnabled(true) is called
//     from a user gesture (browser autoplay policy), and never in capture mode
//     (?capture=1) — captures stay byte-identical and silent.
//   - update() is throttled to one pass per 250 ms and allocates nothing (all
//     mappings write into per-instance scratch objects).
//   - One short diagnostic ping per new overload/blackout — diagnosis, never an
//     alarm loop, never louder than the bed.
//
// `debug()` is an evidence hook on top of the four-method contract: the
// headless probe reads the node count, the context state and the analyser RMS
// from it. Nothing else calls it.

import type { WorldScene } from "../bridge/worldScene";
import { analyserRms, buildAudioGraph, triggerPing, type AudioGraph } from "./graph";
import {
  AUDIBLE_CITY_KM,
  AUDIBLE_PLANT_KM,
  AUDIBLE_TURBINE_KM,
  type AudioSnapshot,
  type CityParams,
  cityInto,
  clamp01,
  gustLevel,
  buildGustSchedule,
  hexGroundX,
  hexGroundZ,
  isRotorAudible,
  masterGain,
  PING_COOLDOWN_S,
  plantInto,
  type PlantParams,
  precipitationInto,
  type PrecipLayers,
  pingDue,
  snapshotInto,
  turbineInto,
  type TurbineParams,
  windBedInto,
  type WindBedParams,
  type GustSchedule,
} from "./mapping";

export interface WorldAudioView {
  /** Camera look-at point on the ground [km] — what the player is attending to. */
  target: { x: number; z: number };
  distanceKm: number;
}

/** Evidence-only surface (headless probe); not part of the module contract. */
export interface WorldAudioDebug {
  enabled: boolean;
  contextState: string | null;
  nodes: number;
  volume: number;
  rms: number;
  pingCount: number;
  gust: number;
}

export interface WorldAudio {
  setEnabled(on: boolean): void;
  setVolume(v: number): void;
  update(): void;
  dispose(): void;
  debug(): WorldAudioDebug;
}

/** The brief's cadence: at most one pass every 250 ms. */
export const MIN_UPDATE_S = 0.25;

/** Starting volume, before the persisted setting arrives. */
export const DEFAULT_VOLUME = 0.6;

/** A capture or a screenshot run must never make a sound (brief, ARCHITECTURE §15). */
function captureMode(): boolean {
  if (typeof window === "undefined" || typeof window.location === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("capture");
  } catch {
    return false;
  }
}

function groundDistance(viewX: number, viewZ: number, q: number, r: number): number {
  return Math.hypot(viewX - hexGroundX(q), viewZ - hexGroundZ(q, r));
}

/** Smoothed parameter move — the standard 0,18 s glide, click-free and allocation-free. */
function smooth(param: AudioParam, value: number, now: number): void {
  param.setTargetAtTime(value, now, 0.18);
}

function setToneFrequency(voice: ToneVoiceLike, baseHz: number, now: number): void {
  for (let i = 0; i < voice.oscs.length; i++) {
    const osc = voice.oscs[i];
    if (!osc) continue;
    osc.frequency.setTargetAtTime(baseHz * (voice.ratios[i] ?? 1), now, 0.25);
  }
}

interface ToneVoiceLike {
  oscs: OscillatorNode[];
  ratios: number[];
}

/**
 * Creates the world audio controller. Muted until `setEnabled(true)`; the
 * integrator calls `update()` on a 250 ms interval (see PROGRESS.md for the
 * exact WorldView wiring proposal).
 */
export function createWorldAudio(
  getScene: () => WorldScene | null,
  getView: () => WorldAudioView,
): WorldAudio {
  const wind: WindBedParams = { gain: 0, freqHz: 0, q: 0 };
  const precip: PrecipLayers = { rain: 0, snow: 0, storm: 0 };
  const turbine: TurbineParams = { gain: 0, freqHz: 0 };
  const plant: PlantParams = { kind: "none", gain: 0, freqHz: 0 };
  const city: CityParams = { gain: 0, freqHz: 0 };
  const snapshot: AudioSnapshot = { overloaded: 0, blackouts: 0 };

  let graph: AudioGraph | null = null;
  let enabled = false;
  let disposed = false;
  let volume = DEFAULT_VOLUME;
  let lastUpdateAt = Number.NEGATIVE_INFINITY;
  let lastPingAt = Number.NEGATIVE_INFINITY;
  let baseline: AudioSnapshot | null = null;
  let gust: GustSchedule | null = null;
  let gustSeed = Number.NaN;
  let gustNow = 0;
  let pingCount = 0;

  function ensureGust(seed: number): GustSchedule {
    if (gust === null || gustSeed !== seed) {
      gust = buildGustSchedule(seed);
      gustSeed = seed;
    }
    return gust;
  }

  function teardown(): void {
    const current = graph;
    graph = null;
    enabled = false;
    baseline = null;
    if (current) current.dispose();
  }

  function update(): void {
    if (disposed) return;
    const current = graph;
    if (!current) return;
    const scene = getScene();
    if (!scene) return;
    const now = current.ctx.currentTime;
    if (now - lastUpdateAt < MIN_UPDATE_S) return;
    lastUpdateAt = now;

    // A persisted "enabled" can beat the first user gesture; every later
    // pointer/key gesture makes this resume succeed without extra wiring.
    if (current.ctx.state === "suspended") {
      void current.ctx.resume().catch(() => {
        // Still no gesture — the next pass tries again; the world stays silent.
      });
    }

    const schedule = ensureGust(scene.seed);
    const view = getView();
    const viewX = view.target.x;
    const viewZ = view.target.z;
    const weather = scene.weather;
    const gustValue = gustLevel(schedule, now);
    gustNow = gustValue;
    const daylight = scene.sun.daylight;

    // Wind bed: the open-terrain wind of the shown turn, breathing with gusts.
    windBedInto(wind, weather.windMs.open, weather.gustiness, gustValue);
    smooth(current.wind.gain.gain, wind.gain, now);
    current.wind.filter.frequency.setTargetAtTime(wind.freqHz, now, 0.2);
    current.wind.filter.Q.setTargetAtTime(wind.q, now, 0.2);

    // Precipitation: rain hiss, snow hush, storm rumble.
    precipitationInto(
      precip,
      weather.precipitation.kind,
      weather.precipitation.intensity,
      weather.storm,
    );
    smooth(current.rain.gain.gain, precip.rain, now);
    smooth(current.snow.gain.gain, precip.snow, now);
    smooth(current.storm.gain.gain, precip.storm, now);

    // Turbine whoosh: the loudest spinning farm inside its window.
    let turbineGain = 0;
    let turbineHz = 0;
    for (let i = 0; i < scene.farms.length; i++) {
      const farm = scene.farms[i];
      if (!farm || !isRotorAudible(farm.enabled, farm.rotor, farm.rotorSpeed)) continue;
      const distanceKm = groundDistance(viewX, viewZ, farm.hex.q, farm.hex.r);
      turbineInto(turbine, farm.rotorSpeed, distanceKm, gustValue);
      if (turbine.gain > turbineGain) {
        turbineGain = turbine.gain;
        turbineHz = turbine.freqHz;
      }
    }
    smooth(current.turbine.gain.gain, turbineGain, now);
    if (turbineGain > 0) current.turbine.filter.frequency.setTargetAtTime(turbineHz, now, 0.25);

    // Plant hum: low drone for nuclear/coal, whine for gas, by output.
    let lowGain = 0;
    let lowHz = 0;
    let gasGain = 0;
    let gasHz = 0;
    for (let i = 0; i < scene.plants.length; i++) {
      const source = scene.plants[i];
      if (!source) continue;
      const load = source.capacityMw > 0 ? source.outputMw / source.capacityMw : 0;
      const distanceKm = groundDistance(viewX, viewZ, source.hex.q, source.hex.r);
      plantInto(plant, source.tech, load, distanceKm);
      if (plant.kind === "low" && plant.gain > lowGain) {
        lowGain = plant.gain;
        lowHz = plant.freqHz;
      } else if (plant.kind === "gas" && plant.gain > gasGain) {
        gasGain = plant.gain;
        gasHz = plant.freqHz;
      }
    }
    smooth(current.plantLow.gain.gain, lowGain, now);
    smooth(current.plantGas.gain.gain, gasGain, now);
    if (lowGain > 0) setToneFrequency(current.plantLow, lowHz, now);
    if (gasGain > 0) setToneFrequency(current.plantGas, gasHz, now);

    // City murmur: the loudest lit city in its window, at night.
    let cityGain = 0;
    let cityHz = 0;
    for (let i = 0; i < scene.cities.length; i++) {
      const settlement = scene.cities[i];
      if (!settlement) continue;
      const distanceKm = groundDistance(viewX, viewZ, settlement.hex.q, settlement.hex.r);
      cityInto(city, settlement.lit, settlement.scale, daylight, distanceKm);
      if (city.gain > cityGain) {
        cityGain = city.gain;
        cityHz = city.freqHz;
      }
    }
    smooth(current.city.gain.gain, cityGain, now);
    if (cityGain > 0) current.city.filter.frequency.setTargetAtTime(cityHz, now, 0.25);

    // One ping for something newly red; a persistent state never re-pings.
    snapshotInto(snapshot, scene);
    if (baseline === null) {
      baseline = { overloaded: snapshot.overloaded, blackouts: snapshot.blackouts };
    } else {
      if (pingDue(baseline, snapshot, now - lastPingAt)) {
        triggerPing(current, now);
        lastPingAt = now;
        pingCount += 1;
      }
      baseline.overloaded = snapshot.overloaded;
      baseline.blackouts = snapshot.blackouts;
    }
  }

  return {
    setEnabled(on: boolean): void {
      if (disposed || on === enabled) return;
      if (!on) {
        teardown();
        return;
      }
      // Capture mode is silent by contract, even if something toggles audio.
      if (captureMode()) return;
      const built = buildAudioGraph();
      if (!built) return;
      graph = built;
      enabled = true;
      lastUpdateAt = Number.NEGATIVE_INFINITY;
      lastPingAt = Number.NEGATIVE_INFINITY;
      baseline = null;
      gust = null;
      gustSeed = Number.NaN;
      built.master.gain.value = masterGain(volume);
      void built.ctx.resume().catch(() => {
        // No gesture: the context stays suspended and the world stays silent.
      });
    },
    setVolume(v: number): void {
      volume = clamp01(Number.isFinite(v) ? v : 0);
      if (graph) {
        graph.master.gain.setTargetAtTime(masterGain(volume), graph.ctx.currentTime, 0.1);
      }
    },
    update,
    dispose(): void {
      teardown();
      disposed = true;
    },
    debug(): WorldAudioDebug {
      return {
        enabled,
        contextState: graph ? graph.ctx.state : null,
        nodes: graph ? graph.nodes.length : 0,
        volume,
        rms: graph ? analyserRms(graph) : 0,
        pingCount,
        gust: gustNow,
      };
    },
  };
}

// Re-exported so a caller can reason about the windows without reading mapping.
export { AUDIBLE_CITY_KM, AUDIBLE_PLANT_KM, AUDIBLE_TURBINE_KM, PING_COOLDOWN_S };
