// Number formatting rules of the design system (handoff README, "Content &
// Copy Rules"): comma as the decimal separator, space as the thousands
// separator, money without grosze, setpoints as `value / max`, forecasts as a
// band with ±, units always spelled out.
//
// Hand-rolled rather than Intl.NumberFormat: the separator must be exactly the
// space the copy rules ask for, identical in every runtime and in snapshots.

/** U+2212 MINUS SIGN — the typographic minus, not a hyphen (design system). */
export const MINUS = "−";

/** Thousands separator of the copy rules (`4 000 zł/MWh`). */
const THOUSANDS_SEPARATOR = " ";

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
}

/**
 * `1234.5 → "1 234,5"`. Non-finite input renders as an em dash, so a broken
 * number never reaches the player as `NaN`.
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value).toFixed(fractionDigits);
  const [integerPart = "0", fractionPart] = magnitude.split(".");
  // Sign is read off the ROUNDED magnitude: −0,4 at 0 digits is "0", not "−0".
  const sign = value < 0 && Number(magnitude) !== 0 ? MINUS : "";
  const grouped = group(integerPart);
  return fractionPart ? `${sign}${grouped},${fractionPart}` : `${sign}${grouped}`;
}

/** Same as `formatNumber`, but a non-negative value keeps an explicit `+`. */
export function formatSignedNumber(value: number, fractionDigits = 0): string {
  const text = formatNumber(value, fractionDigits);
  return text.startsWith(MINUS) || text === "—" ? text : `+${text}`;
}

/**
 * Money, never with grosze: billions with 2 decimals, millions with 1, below
 * that whole PLN. The scale is picked from the ROUNDED value, so 999 999 999 zł
 * reads "1,00 mld zł" instead of "1 000,0 mln zł".
 */
export function formatMoneyPln(pln: number): string {
  const billions = pln / 1e9;
  if (Math.abs(Number(billions.toFixed(2))) >= 1) return `${formatNumber(billions, 2)} mld zł`;
  const millions = pln / 1e6;
  if (Math.abs(Number(millions.toFixed(1))) >= 1) return `${formatNumber(millions, 1)} mln zł`;
  return `${formatNumber(Math.round(pln))} zł`;
}

/** Money with an explicit sign — turn and day results (`+46,9 mln zł`). */
export function formatSignedMoneyPln(pln: number): string {
  const text = formatMoneyPln(pln);
  return text.startsWith(MINUS) ? text : `+${text}`;
}

export function formatMw(mw: number, fractionDigits = 0): string {
  return `${formatNumber(mw, fractionDigits)} MW`;
}

export function formatMwh(mwh: number, fractionDigits = 0): string {
  return `${formatNumber(mwh, fractionDigits)} MWh`;
}

/** `62` → `"62%"`. The value is already in percent, not a fraction. */
export function formatPercent(percent: number, fractionDigits = 0): string {
  return `${formatNumber(percent, fractionDigits)}%`;
}

/** Setpoint is always "value / max" with the unit (`800 / 900 MW`). */
export function formatSetpoint(value: number, max: number, unit = "MW"): string {
  return `${formatNumber(value)} / ${formatNumber(max)} ${unit}`;
}

/**
 * Forecast is always a band, never a single number (01 §2.4, 06 §8.6.4):
 * `320 ±60 MW`. `halfWidth` is the half-width of the band.
 */
export function formatBand(center: number, halfWidth: number, unit = "MW"): string {
  return `${formatNumber(center)} ±${formatNumber(Math.abs(halfWidth))} ${unit}`;
}

/** Cost multiplier of a biome or similar factor: `×2,5`. */
export function formatMultiplier(multiplier: number, fractionDigits = 1): string {
  return `×${formatNumber(multiplier, fractionDigits)}`;
}
