import { describe, it, expect } from "vitest";
import {
  secondsPerBeat,
  notationToSeconds,
  barsBeatsToSeconds,
  beatsPerBar,
  sixteenthsToNotation,
  sixteenthsToTransport,
  stepsPerBar,
  validateMeter,
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

describe("sixteenthsToTransport", () => {
  it("splits a step index into bars, beats and sixteenths", () => {
    expect(sixteenthsToTransport(0)).toBe("0:0:0");
    expect(sixteenthsToTransport(2)).toBe("0:0:2");
    expect(sixteenthsToTransport(4)).toBe("0:1:0");
    expect(sixteenthsToTransport(16)).toBe("1:0:0");
    expect(sixteenthsToTransport(37)).toBe("2:1:1");
  });
  it("counts bars in the meter it is given", () => {
    expect(sixteenthsToTransport(12, [3, 4])).toBe("1:0:0"); // 3/4 bar = 12 steps
    expect(sixteenthsToTransport(12, [4, 4])).toBe("0:3:0");
  });
  it("round-trips through barsBeatsToSeconds", () => {
    for (const step of [0, 3, 7, 16, 45]) {
      expect(barsBeatsToSeconds(sixteenthsToTransport(step), 120)).toBeCloseTo(step * (60 / 120 / 4), 6);
    }
  });
  it("throws on a fractional or negative step", () => {
    expect(() => sixteenthsToTransport(1.5)).toThrow();
    expect(() => sixteenthsToTransport(-1)).toThrow();
  });
});

describe("meter", () => {
  it("counts a bar in quarter-note beats", () => {
    expect(beatsPerBar()).toBe(4);
    expect(beatsPerBar([3, 4])).toBe(3);
    expect(beatsPerBar([6, 8])).toBe(3);
    expect(beatsPerBar([12, 8])).toBe(6);
    expect(beatsPerBar([7, 8])).toBe(3.5);
  });

  it("counts a bar in sixteenth steps — 3/4 and 6/8 are both twelve", () => {
    expect(stepsPerBar()).toBe(16);
    expect(stepsPerBar([3, 4])).toBe(12);
    expect(stepsPerBar([6, 8])).toBe(12);
    expect(stepsPerBar([12, 8])).toBe(24);
    expect(stepsPerBar([5, 4])).toBe(20);
  });

  it("moves the bar line, not the beat", () => {
    // A quarter note is a quarter note in any meter; what changes is how many
    // of them a bar holds before the next one starts.
    expect(notationToSeconds("4n", 120, [3, 4])).toBeCloseTo(0.5);
    expect(notationToSeconds("1m", 120, [3, 4])).toBeCloseTo(1.5);
    expect(barsBeatsToSeconds("1:0:0", 120, [3, 4])).toBeCloseTo(1.5);
    expect(barsBeatsToSeconds("2:0:0", 120, [6, 8])).toBeCloseTo(3);
  });

  it("names a whole bar `1m` whatever the meter", () => {
    expect(sixteenthsToNotation(12, [3, 4])).toBe("1m");
    expect(sixteenthsToNotation(24, [12, 8])).toBe("1m");
    expect(sixteenthsToNotation(24, [3, 4])).toBe("2m");
    // 16 isn't a whole bar of 3/4, so it falls back to a plain note value.
    expect(sixteenthsToNotation(16, [3, 4])).toBe("1n");
  });

  it("rejects a meter whose bar isn't a whole number of sixteenths", () => {
    expect(validateMeter([4, 4])).toEqual([]);
    expect(validateMeter([7, 8])).toEqual([]);
    expect(validateMeter([3, 32])).not.toEqual([]);
    expect(validateMeter([0, 4])).not.toEqual([]);
    expect(validateMeter([3, 5])).not.toEqual([]);
    expect(validateMeter("3/4")).not.toEqual([]);
  });
});
