// Astronomy and clear-sky irradiance per docs/06 §3–§4. Pure functions of
// (latitude φ [deg], day of year n [1..365], solar hour h [0..24]).
// The equation of time (§3.2) and solar azimuth (§3.5) are omitted per the
// doc's own recommendation for the base version.

const DEG = Math.PI / 180;

// §3.6: altitude of sunrise/sunset corrected for atmospheric refraction
// (upper limb of the disc touches the horizon).
const SUNRISE_ALTITUDE_DEG = -0.833;

/** §3.1 (Cooper): solar declination δ [deg], −23.45 to +23.45. */
export function solarDeclinationDeg(dayOfYear: number): number {
  return 23.45 * Math.sin(((360 * (284 + dayOfYear)) / 365) * DEG);
}

/** §3.3: hour angle ω [deg]; solar noon = 0, mornings negative. */
export function hourAngleDeg(solarHour: number): number {
  return 15 * (solarHour - 12);
}

/** §3.4: sine of solar altitude; ≤ 0 means the sun is below the horizon. */
export function sinSolarAltitude(
  latitudeDeg: number,
  dayOfYear: number,
  solarHour: number,
): number {
  const phi = latitudeDeg * DEG;
  const delta = solarDeclinationDeg(dayOfYear) * DEG;
  const omega = hourAngleDeg(solarHour) * DEG;
  return Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(omega);
}

/** §3.4: solar altitude α [deg]; negative below the horizon. */
export function solarAltitudeDeg(
  latitudeDeg: number,
  dayOfYear: number,
  solarHour: number,
): number {
  return Math.asin(sinSolarAltitude(latitudeDeg, dayOfYear, solarHour)) / DEG;
}

/** §3.4: solar altitude at solar noon, α_max [deg]. */
export function maxSolarAltitudeDeg(latitudeDeg: number, dayOfYear: number): number {
  return 90 - latitudeDeg + solarDeclinationDeg(dayOfYear);
}

/** §3.6: hour angle of sunset ω_s [deg]; 180 = polar day, 0 = polar night. */
export function sunsetHourAngleDeg(latitudeDeg: number, dayOfYear: number): number {
  const phi = latitudeDeg * DEG;
  const delta = solarDeclinationDeg(dayOfYear) * DEG;
  const cosOmegaS =
    (Math.sin(SUNRISE_ALTITUDE_DEG * DEG) - Math.sin(phi) * Math.sin(delta)) /
    (Math.cos(phi) * Math.cos(delta));
  if (cosOmegaS < -1) return 180;
  if (cosOmegaS > 1) return 0;
  return Math.acos(cosOmegaS) / DEG;
}

/** §3.6: day length [hours], refraction-corrected. */
export function dayLengthHours(latitudeDeg: number, dayOfYear: number): number {
  return (2 * sunsetHourAngleDeg(latitudeDeg, dayOfYear)) / 15;
}

/** §3.6: sunrise [solar hour]. */
export function sunriseHour(latitudeDeg: number, dayOfYear: number): number {
  return 12 - sunsetHourAngleDeg(latitudeDeg, dayOfYear) / 15;
}

/** §3.6: sunset [solar hour]. */
export function sunsetHour(latitudeDeg: number, dayOfYear: number): number {
  return 12 + sunsetHourAngleDeg(latitudeDeg, dayOfYear) / 15;
}

/** §4.3 (Haurwitz): clear-sky GHI [W/m²] from solar altitude [deg]. */
export function clearSkyGhiW(altitudeDeg: number): number {
  const sinAlpha = Math.sin(altitudeDeg * DEG);
  if (sinAlpha <= 0) return 0;
  return 1098 * sinAlpha * Math.exp(-0.057 / sinAlpha);
}

/** §4.4 (Kasten–Czeplak): cloud attenuation multiplier for cover C ∈ [0,1]. */
export function cloudAttenuation(cloudCover: number): number {
  return 1 - 0.75 * Math.pow(cloudCover, 3.4);
}
