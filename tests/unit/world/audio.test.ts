// Audio mappings (MODULE audio, step 1): the pure scene → Web Audio parameter
// functions, tested in Node without an AudioContext. The graphs themselves are
// browser-only; the headless probe under captures/audio/s1 covers those.
//
// Doc anchors: docs/08 §3 (thresholds, diagnosis not alarm), §4 (the bed is
// ambience), ARCHITECTURE.md §12 (determinism) and §13 (node budget).

import { describe, expect, test } from "vitest";
import { hexToWorld } from "../../../src/world/render/core/units";
import { createWorldAudio } from "../../../src/world/audio";
import {
  AUDIBLE_PLANT_KM,
  AUDIBLE_TURBINE_KM,
  OVERLOAD_RATIO,
  buildGustSchedule,
  city,
  clamp01,
  distanceGain,
  gustLevel,
  hexGroundX,
  hexGroundZ,
  isRotorAudible,
  masterGain,
  pingDue,
  PING_COOLDOWN_S,
  plant,
  plantHumKind,
  precipitation,
  snapshot,
  turbine,
  windBed,
} from "../../../src/world/audio/mapping";

describe("wind bed", () => {
  test("is always present but grows monotonically with the open wind", () => {
    const calm = windBed(0, 0, 0.5);
    const breeze = windBed(6, 0, 0.5);
    const gale = windBed(18, 0, 0.5);
    expect(calm.gain).toBeGreaterThan(0);
    expect(breeze.gain).toBeGreaterThan(calm.gain);
    expect(gale.gain).toBeGreaterThan(breeze.gain);
    expect(gale.gain).toBeLessThanOrEqual(0.6);
  });

  test("the band rises with wind and keeps a plausible centre frequency", () => {
    expect(windBed(0, 0, 0.5).freqHz).toBeCloseTo(240, 5);
    expect(windBed(18, 0, 0.5).freqHz).toBeCloseTo(880, 5);
    expect(windBed(6, 0, 0.5).freqHz).toBeGreaterThan(windBed(2, 0, 0.5).freqHz);
    expect(windBed(6, 0, 0.5).q).toBeGreaterThan(windBed(0, 0, 0.5).q);
  });

  test("gusts swing the level only as far as the regime allows", () => {
    const steady = windBed(10, 0, 1);
    const inGust = windBed(10, 1, 1);
    const inLull = windBed(10, 1, 0);
    expect(inGust.gain).toBeGreaterThan(steady.gain);
    expect(inLull.gain).toBeLessThan(steady.gain);
    // The swing is bounded, so a gust never doubles the bed.
    expect(inGust.gain / inLull.gain).toBeLessThan(2.7);
  });

  test("a degressive regime still breathes, but less", () => {
    const low = windBed(10, 0.2, 1).gain - windBed(10, 0.2, 0).gain;
    const high = windBed(10, 1, 1).gain - windBed(10, 1, 0).gain;
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });
});

describe("precipitation layers", () => {
  test("a clear turn drops nothing", () => {
    expect(precipitation("none", 1, false)).toEqual({ rain: 0, snow: 0, storm: 0 });
  });

  test("rain and snow are separate voices; sleet is both, quieter", () => {
    const rain = precipitation("rain", 1, false);
    const snow = precipitation("snow", 1, false);
    const sleet = precipitation("sleet", 1, false);
    expect(rain.rain).toBeGreaterThan(0);
    expect(rain.snow).toBe(0);
    expect(snow.snow).toBeGreaterThan(0);
    expect(snow.rain).toBe(0);
    expect(sleet.rain).toBeGreaterThan(0);
    expect(sleet.snow).toBeGreaterThan(0);
    expect(sleet.rain).toBeLessThan(rain.rain);
  });

  test("intensity scales the layer, and a storm adds a rumble", () => {
    expect(precipitation("rain", 0.5, false).rain).toBeLessThan(
      precipitation("rain", 1, false).rain,
    );
    const storm = precipitation("rain", 0.2, true);
    expect(storm.storm).toBeGreaterThan(0);
    expect(storm.rain).toBeGreaterThanOrEqual(0.22);
  });
});

describe("distance windows (docs/08 §3: near the camera)", () => {
  test("full inside, silent beyond, monotonic between", () => {
    expect(distanceGain(5, 6, 60)).toBe(1);
    expect(distanceGain(60, 6, 60)).toBe(0);
    expect(distanceGain(80, 6, 60)).toBe(0);
    const near = distanceGain(20, 6, 60);
    const far = distanceGain(40, 6, 60);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

describe("turbine whoosh", () => {
  test("only an enabled, spinning rotor makes noise", () => {
    expect(isRotorAudible(true, "spinning", 0.7)).toBe(true);
    expect(isRotorAudible(false, "spinning", 0.7)).toBe(false);
    expect(isRotorAudible(true, "still", 0)).toBe(false);
    expect(isRotorAudible(true, "feathered", 0)).toBe(false);
    expect(isRotorAudible(true, "off", 0)).toBe(false);
  });

  test("level follows rotor speed and falls with distance past the window", () => {
    const close = turbine(1, 5, 0.5);
    const far = turbine(1, AUDIBLE_TURBINE_KM, 0.5);
    const beyond = turbine(1, AUDIBLE_TURBINE_KM + 1, 0.5);
    expect(close.gain).toBeGreaterThan(far.gain);
    expect(far.gain).toBe(0);
    expect(beyond.gain).toBe(0);
    expect(turbine(0.3, 5, 0.5).gain).toBeLessThan(close.gain);
    expect(turbine(1, 5, 0.5).freqHz).toBeGreaterThan(turbine(0.3, 5, 0.5).freqHz);
  });
});

describe("plant hum", () => {
  test("technology picks the voice: nuclear/coal low, gas high, nothing else", () => {
    expect(plantHumKind("nuclear")).toBe("low");
    expect(plantHumKind("coal")).toBe("low");
    expect(plantHumKind("ccgt")).toBe("gas");
    expect(plantHumKind("ocgt")).toBe("gas");
    expect(plantHumKind("pv")).toBe("none");
  });

  test("a stopped plant is silent; a running one rises with output", () => {
    expect(plant("coal", 0, 20).gain).toBe(0);
    const light = plant("coal", 0.15, 20);
    const full = plant("coal", 0.6, 20);
    expect(light.gain).toBeGreaterThan(0);
    expect(full.gain).toBeGreaterThan(light.gain);
    expect(light.kind).toBe("low");
  });

  test("gas whines above coal and only what is near is heard", () => {
    expect(plant("ccgt", 0.8, 20).freqHz).toBeGreaterThan(plant("coal", 0.8, 20).freqHz);
    expect(plant("coal", 1, AUDIBLE_PLANT_KM).gain).toBe(0);
    expect(plant("coal", 1, 5).gain).toBeGreaterThan(0);
  });
});

describe("city murmur", () => {
  test("scales with lit × scale and belongs to the night", () => {
    const night = city(0.9, 1, 0, 10);
    const dusk = city(0.9, 1, 0.5, 10);
    const noon = city(0.9, 1, 1, 10);
    expect(night.gain).toBeGreaterThan(dusk.gain);
    expect(dusk.gain).toBeGreaterThan(noon.gain);
    expect(noon.gain).toBe(0);
    expect(city(0, 1, 0, 10).gain).toBe(0);
    expect(city(1, 1, 0, 10).gain).toBeGreaterThan(city(1, 0.3, 0, 10).gain);
  });

  test("a blacked-out city is dark and far cities are outside the window", () => {
    expect(city(0, 1, 0, 10).gain).toBe(0);
    expect(city(1, 1, 0, 200).gain).toBe(0);
    expect(city(1, 1, 0, 10).freqHz).toBeGreaterThan(city(1, 0.2, 0, 10).freqHz);
  });
});

describe("gust schedule (seeded, ARCHITECTURE.md §12)", () => {
  test("the same seed gives the same wind; another seed does not", () => {
    const a = buildGustSchedule(11);
    const b = buildGustSchedule(11);
    const c = buildGustSchedule(12);
    expect(Array.from(a.starts)).toEqual(Array.from(b.starts));
    expect(Array.from(a.strengths)).toEqual(Array.from(b.strengths));
    expect(Array.from(a.starts)).not.toEqual(Array.from(c.starts));
  });

  test("the level stays in 0..1, repeats every period and actually moves", () => {
    const schedule = buildGustSchedule(7);
    let min = 1;
    let max = 0;
    for (let t = 0; t < schedule.period * 2; t += 0.25) {
      const level = gustLevel(schedule, t);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
      min = Math.min(min, level);
      max = Math.max(max, level);
    }
    expect(max).toBeGreaterThan(0.5);
    expect(min).toBeLessThan(0.5);
    expect(gustLevel(schedule, 3.21)).toBeCloseTo(gustLevel(schedule, 3.21 + schedule.period), 6);
    expect(gustLevel(schedule, -2)).toBe(gustLevel(schedule, schedule.period - 2));
  });
});

describe("diagnostic ping (docs/08 §3: diagnosis, not alarm)", () => {
  test("counts overloaded segments at the map's own threshold and blackout cities", () => {
    const scene = {
      lines: [
        { segments: [{ ratio: 0.4 }, { ratio: OVERLOAD_RATIO }, { ratio: 1 }] },
        { segments: [{ ratio: 0.99 }] },
      ],
      cities: [{ blackout: true }, { blackout: false }, { blackout: true }],
    };
    expect(snapshot(scene)).toEqual({ overloaded: 2, blackouts: 2 });
  });

  test("one ping when something new goes red, then the cooldown holds it", () => {
    const quiet = { overloaded: 0, blackouts: 0 };
    const oneOut = { overloaded: 1, blackouts: 0 };
    const oneMore = { overloaded: 1, blackouts: 1 };
    expect(pingDue(quiet, oneOut, PING_COOLDOWN_S + 1)).toBe(true);
    expect(pingDue(oneOut, oneMore, PING_COOLDOWN_S + 1)).toBe(true);
    expect(pingDue(quiet, oneOut, PING_COOLDOWN_S - 1)).toBe(false);
    expect(pingDue(oneOut, oneOut, PING_COOLDOWN_S + 1)).toBe(false);
    expect(pingDue(oneMore, oneOut, PING_COOLDOWN_S + 1)).toBe(false);
  });
});

describe("master level and hex positions", () => {
  test("volume is clamped and tapered, never negative", () => {
    expect(masterGain(0)).toBe(0);
    expect(masterGain(1)).toBe(1);
    expect(masterGain(0.5)).toBeCloseTo(0.25, 10);
    expect(masterGain(-3)).toBe(0);
    expect(masterGain(9)).toBe(1);
    expect(masterGain(Number.NaN)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
  });

  test("the scalar hex helpers agree with units.hexToWorld", () => {
    for (const hex of [
      { q: 0, r: 0 },
      { q: 3, r: -1 },
      { q: 11, r: 7 },
      { q: 23, r: 15 },
      { q: 1, r: 4 },
    ]) {
      const world = hexToWorld(hex);
      expect(hexGroundX(hex.q)).toBeCloseTo(world.x, 10);
      expect(hexGroundZ(hex.q, hex.r)).toBeCloseTo(world.z, 10);
    }
  });
});

describe("createWorldAudio in a Node environment (no AudioContext)", () => {
  test("starts muted, survives every call and never throws", () => {
    const audio = createWorldAudio(
      () => null,
      () => ({ target: { x: 0, z: 0 }, distanceKm: 400 }),
    );
    expect(audio.debug()).toMatchObject({ enabled: false, contextState: null, nodes: 0, rms: 0 });
    audio.setVolume(0.4);
    expect(audio.debug().volume).toBeCloseTo(0.4, 10);
    audio.update();
    audio.setEnabled(true);
    expect(audio.debug().enabled).toBe(false);
    audio.setEnabled(false);
    audio.update();
    audio.dispose();
    audio.update();
    audio.dispose();
    expect(audio.debug().enabled).toBe(false);
  });
});
