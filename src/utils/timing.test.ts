import { describe, it, expect } from "vitest";
import { secondsPerBeat, notationToSeconds, barsBeatsToSeconds } from "./timing";

describe("secondsPerBeat", () => {
  it("computes quarter-note length", () => {
    expect(secondsPerBeat(120)).toBeCloseTo(0.5);
    expect(secondsPerBeat(60)).toBeCloseTo(1);
  });
  it("rejects non-positive bpm", () => {
    expect(() => secondsPerBeat(0)).toThrow();
  });
});

describe("notationToSeconds", () => {
  it("handles common note values at 120 bpm", () => {
    expect(notationToSeconds("4n", 120)).toBeCloseTo(0.5);
    expect(notationToSeconds("2n", 120)).toBeCloseTo(1);
    expect(notationToSeconds("1n", 120)).toBeCloseTo(2);
    expect(notationToSeconds("8n", 120)).toBeCloseTo(0.25);
  });
  it("handles measures", () => {
    expect(notationToSeconds("1m", 120)).toBeCloseTo(2);
    expect(notationToSeconds("2m", 120)).toBeCloseTo(4);
  });
  it("handles dotted and triplet", () => {
    expect(notationToSeconds("4n.", 120)).toBeCloseTo(0.75);
    expect(notationToSeconds("4t", 120)).toBeCloseTo(0.5 * (2 / 3));
  });
  it("throws on garbage", () => {
    expect(() => notationToSeconds("banana", 120)).toThrow();
  });
});

describe("barsBeatsToSeconds", () => {
  it("converts bars:beats:sixteenths at 120 bpm", () => {
    expect(barsBeatsToSeconds("0:0:0", 120)).toBeCloseTo(0);
    expect(barsBeatsToSeconds("1:0", 120)).toBeCloseTo(2); // 1 bar = 4 beats = 2s
    expect(barsBeatsToSeconds("0:2", 120)).toBeCloseTo(1); // 2 beats
    expect(barsBeatsToSeconds("0:0:2", 120)).toBeCloseTo(0.25); // 2 sixteenths = 0.5 beat
  });
  it("throws on garbage", () => {
    expect(() => barsBeatsToSeconds("a:b", 120)).toThrow();
  });
});
