import { describe, it, expect } from "vitest";
import { dbToFraction, formatVolume, fractionToDb } from "./volume";

describe("fractionToDb", () => {
  it("maps full travel to unity and half to -6 dB", () => {
    expect(fractionToDb(1)).toBe(0);
    expect(fractionToDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(fractionToDb(0.1)).toBeCloseTo(-20, 2);
  });

  it("treats the bottom of the fader as off, not quiet", () => {
    expect(fractionToDb(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(fractionToDb(0.0005)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("clamps rather than throwing — it feeds a live audio graph", () => {
    expect(fractionToDb(4)).toBe(0);
    expect(fractionToDb(-1)).toBe(Number.NEGATIVE_INFINITY);
    expect(fractionToDb(Number.NaN)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("dbToFraction", () => {
  it("inverts fractionToDb across the useful travel", () => {
    for (const fraction of [0.05, 0.25, 0.5, 0.8, 1]) {
      expect(dbToFraction(fractionToDb(fraction))).toBeCloseTo(fraction, 6);
    }
  });

  it("reads silence as the bottom of the fader", () => {
    expect(dbToFraction(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("formatVolume", () => {
  it("rounds to whole percent", () => {
    expect(formatVolume(0.716)).toBe("72%");
    expect(formatVolume(1)).toBe("100%");
    expect(formatVolume(0)).toBe("0%");
  });

  it("clamps junk to something readable", () => {
    expect(formatVolume(9)).toBe("100%");
    expect(formatVolume(Number.NaN)).toBe("0%");
  });
});
