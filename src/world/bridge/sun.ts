// The sun, from the engine's own astronomy (06 §3): declination, hour angle
// and altitude are the exported primitives of src/engine/astronomy.ts; the
// azimuth of 06 §3.5 — which the engine skips, as the doc allows — is computed
// here from those same primitives, so no engine change is needed and the two
// can never disagree about where the sun is.

import {
  CONFIG,
  clearSkyGhiW,
  dayLengthHours,
  hourAngleDeg,
  solarAltitudeDeg,
  solarDeclinationDeg,
  sunriseHour,
  sunsetHour,
} from "../../engine";
import type { Vec3, WorldSun } from "./worldScene";

const DEG = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 06 §3.5: solar azimuth [deg], clockwise from north (0 = N, 90 = E, 180 = S).
 * `cos A = (sin δ · cos φ − cos δ · sin φ · cos ω) / cos α`; the arccos gives
 * the morning half, the afternoon mirrors it.
 */
export function solarAzimuthDeg(latitudeDeg: number, dayOfYear: number, hour: number): number {
  const phi = latitudeDeg * DEG;
  const delta = solarDeclinationDeg(dayOfYear) * DEG;
  const omegaDeg = hourAngleDeg(hour);
  const omega = omegaDeg * DEG;
  const altitude = solarAltitudeDeg(latitudeDeg, dayOfYear, hour) * DEG;
  const cosAltitude = Math.cos(altitude);
  if (cosAltitude < 1e-9) return 180;
  const cosA = clamp(
    (Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(omega)) /
      cosAltitude,
    -1,
    1,
  );
  const morning = Math.acos(cosA) / DEG;
  return omegaDeg <= 0 ? morning : 360 - morning;
}

/** Unit vector pointing AT the sun: east = +X, up = +Y, north = −Z. */
export function sunVector(altitudeDeg: number, azimuthDeg: number): Vec3 {
  const altitude = altitudeDeg * DEG;
  const azimuth = azimuthDeg * DEG;
  const flat = Math.cos(altitude);
  return {
    x: Math.sin(azimuth) * flat,
    y: Math.sin(altitude),
    z: -Math.cos(azimuth) * flat,
  };
}

/** The sun of one hour of one day at the scenario latitude (06 §2: 52° N). */
export function buildSun(dayOfYear: number, hour: number): WorldSun {
  const latitude = CONFIG.latitudeDeg;
  const altitudeDeg = solarAltitudeDeg(latitude, dayOfYear, hour);
  const azimuthDeg = solarAzimuthDeg(latitude, dayOfYear, hour);
  return {
    altitudeDeg,
    azimuthDeg,
    direction: sunVector(altitudeDeg, azimuthDeg),
    declinationDeg: solarDeclinationDeg(dayOfYear),
    hourAngleDeg: hourAngleDeg(hour),
    sunriseHour: sunriseHour(latitude, dayOfYear),
    sunsetHour: sunsetHour(latitude, dayOfYear),
    dayLengthHours: dayLengthHours(latitude, dayOfYear),
    clearSkyGhiW: clearSkyGhiW(altitudeDeg),
    // Civil twilight ends at −6°; full daylight rendering from ~8° up.
    daylight: smoothstep(-6, 8, altitudeDeg),
    twilight: clamp(1 - Math.abs(altitudeDeg - 1) / 7, 0, 1),
  };
}
