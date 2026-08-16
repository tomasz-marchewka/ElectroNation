// Content & Copy Rules of the design handoff (README, "Content & Copy Rules"):
// comma decimal separator, space thousands separator, money without grosze,
// setpoints as `value / max`, forecasts as a band with ±, units always stated.

import { describe, expect, test } from "vitest";
import {
  MINUS,
  formatBand,
  formatMoneyPln,
  formatMultiplier,
  formatMw,
  formatMwh,
  formatNumber,
  formatPercent,
  formatSetpoint,
  formatSignedMoneyPln,
  formatSignedNumber,
} from "../../../src/app/format";

describe("formatNumber", () => {
  test("uses a comma decimal separator and a space between thousands", () => {
    expect(formatNumber(4000)).toBe("4 000");
    expect(formatNumber(1234567)).toBe("1 234 567");
    expect(formatNumber(1500.45, 1)).toBe("1 500,5");
    expect(formatNumber(0.5, 2)).toBe("0,50");
  });

  test("negatives use the typographic minus, not a hyphen", () => {
    expect(formatNumber(-320)).toBe(`${MINUS}320`);
    expect(MINUS).not.toBe("-");
  });

  test("a value rounding to zero never renders as a signed zero", () => {
    expect(formatNumber(-0.4)).toBe("0");
    expect(formatNumber(-0.04, 1)).toBe("0,0");
  });

  test("non-finite input renders as an em dash, never NaN", () => {
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });

  test("signed variant keeps an explicit plus", () => {
    expect(formatSignedNumber(46.9, 1)).toBe("+46,9");
    expect(formatSignedNumber(-46.9, 1)).toBe(`${MINUS}46,9`);
  });

  test("a rounded zero drops the sign — `+0` would read as a gain", () => {
    expect(formatSignedNumber(0)).toBe("0");
    expect(formatSignedNumber(-0.3)).toBe("0");
    expect(formatSignedNumber(0.3)).toBe("0");
    expect(formatSignedNumber(-0.04, 1)).toBe("0,0");
  });
});

describe("formatMoneyPln", () => {
  test("billions with two decimals, millions with one, never grosze", () => {
    expect(formatMoneyPln(7_420_000_000)).toBe("7,42 mld zł");
    expect(formatMoneyPln(10_000_000_000)).toBe("10,00 mld zł");
    expect(formatMoneyPln(46_900_000)).toBe("46,9 mln zł");
    expect(formatMoneyPln(600_000_000)).toBe("600,0 mln zł");
  });

  test("below a million it falls back to whole PLN with grouped thousands", () => {
    expect(formatMoneyPln(4000)).toBe("4 000 zł");
    expect(formatMoneyPln(0)).toBe("0 zł");
    expect(formatMoneyPln(123_456.7)).toBe("123 457 zł");
  });

  test("the scale is picked from the rounded value", () => {
    // 999 999 999 rounds to 1,00 mld — never "1 000,0 mln zł".
    expect(formatMoneyPln(999_999_999)).toBe("1,00 mld zł");
    expect(formatMoneyPln(999_999)).toBe("1,0 mln zł");
  });

  test("a deficit is signed with the typographic minus", () => {
    expect(formatMoneyPln(-1_200_000_000)).toBe(`${MINUS}1,20 mld zł`);
    expect(formatSignedMoneyPln(46_900_000)).toBe("+46,9 mln zł");
    expect(formatSignedMoneyPln(-46_900_000)).toBe(`${MINUS}46,9 mln zł`);
    // A turn that moved no money is not a profit.
    expect(formatSignedMoneyPln(0)).toBe("0 zł");
  });
});

describe("units", () => {
  test("power and energy always carry their unit", () => {
    expect(formatMw(1500)).toBe("1 500 MW");
    expect(formatMwh(4500)).toBe("4 500 MWh");
    expect(formatPercent(62)).toBe("62%");
  });

  test("a setpoint is always value / max (01 §5.1)", () => {
    expect(formatSetpoint(800, 900)).toBe("800 / 900 MW");
    expect(formatSetpoint(150, 300, "MWh")).toBe("150 / 300 MWh");
  });

  test("a forecast is always a band, never a single number (06 §8.6.4)", () => {
    expect(formatBand(320, 60)).toBe("320 ±60 MW");
    expect(formatBand(1500, -33)).toBe("1 500 ±33 MW");
  });

  test("cost multipliers keep the × sign (02 §8.1)", () => {
    expect(formatMultiplier(2.5)).toBe("×2,5");
    expect(formatMultiplier(10.9)).toBe("×10,9");
  });
});
