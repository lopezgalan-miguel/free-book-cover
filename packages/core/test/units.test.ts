import { describe, expect, it } from "vitest";
import { TOLERANCE_IN, approxEqualIn, convert, fromInches, inchesToPixels, toInches } from "../src/index.js";

describe("unidades", () => {
  it("valores conocidos", () => {
    expect(convert(1, "in", "mm")).toBeCloseTo(25.4, 12);
    expect(convert(8.5, "in", "mm")).toBeCloseTo(215.9, 10);
    expect(convert(8.5, "in", "pt")).toBe(612);
    expect(convert(6, "in", "px", 300)).toBe(1800);
    expect(convert(72, "pt", "mm")).toBeCloseTo(25.4, 12);
    expect(convert(300, "px", "pt", 300)).toBe(72);
  });
  it("ida y vuelta dentro de tolerancia estricta", () => {
    for (const unit of ["in", "mm", "pt", "px"] as const) {
      for (const v of [0, 1e-6, 0.125, 6.1375, 123.456, 100]) {
        const back = convert(convert(v, "in", unit, 300), unit, "in", 300);
        expect(Math.abs(back - v)).toBeLessThan(1e-12);
      }
    }
  });
  it("límites: cero y negativos se conservan", () => {
    expect(convert(0, "mm", "pt")).toBe(0);
    expect(convert(-1, "in", "mm")).toBeCloseTo(-25.4, 12);
  });
  it("rechaza no finitos y px sin ppi válido", () => {
    expect(() => toInches(NaN, "in")).toThrow(RangeError);
    expect(() => fromInches(Infinity, "mm")).toThrow(RangeError);
    expect(() => convert(1, "in", "px")).toThrow(RangeError);
    expect(() => convert(1, "px", "in", 0)).toThrow(RangeError);
    expect(() => convert(1, "px", "in", -300)).toThrow(RangeError);
    expect(() => convert(1, "px", "px")).toThrow(RangeError);
  });
  it("píxeles enteros y tolerancia", () => {
    expect(inchesToPixels(6.125, 300)).toBe(1838);
    expect(inchesToPixels(0.00166, 300)).toBe(0);
    expect(approxEqualIn(6, 6 + TOLERANCE_IN)).toBe(true);
    expect(approxEqualIn(6, 6 + TOLERANCE_IN * 1.01)).toBe(false);
    expect(approxEqualIn(1, 1.2, 0.5)).toBe(true);
    // 0,0005 in a 300 ppp son 0,15 px
    expect(TOLERANCE_IN * 300).toBeCloseTo(0.15, 12);
  });
});
