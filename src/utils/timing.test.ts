import { describe, it, expect } from "vitest";
import {
  secondsPerBeat,
  notationToSeconds,
  barsBeatsToSeconds,
  sixteenthsToNotation,
} from "./timing";

describe("sixteenthsToNotation", () => {
  it("names the exact grid lengths", () => {
    expect(sixteenthsToNotation(1)).toBe("16n");
    expect(sixteenthsToNotation(2)).toBe("8n");
    expect(sixteenthsToNotation(4)).toBe("4n");
    expect(sixteenthsToNotation(8)).toBe("2n");
    expect(sixteenthsToNotation(16)).toBe("1m");
  });

  it("names dotted lengths", () => {
    expect(sixteenthsToNotation(3)).toBe("8n.");
    expect(sixteenthsToNotation(6)).toBe("4n.");
  });

  it("counts whole measures past the bar", () => {
    expect(sixteenthsToNotation(32)).toBe("2m");
  });

  it("falls back to the longest value that fits, leaving space", () => {
    expect(sixteenthsToNotation(5)).toBe("4n");
    expect(sixteenthsToNotation(7)).toBe("4n.");
  });

  it("round-trips through notationToSeconds", () => {
    for (const steps of [1, 2, 3, 4, 6, 8, 12, 16, 32]) {
      expect(notationToSeconds(sixteenthsToNotation(steps), 120)).toBeCloseTo(
        (steps / 4) * secondsPerBeat(120),
      );
    }
  });

  it("rejects a length under one sixteenth", () => {
    expect(() => sixteenthsToNotation(0)).toThrow();
  });
});

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
