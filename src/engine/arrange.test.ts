import { describe, it, expect } from "vitest";
import { compositionDurationSeconds, loopWindowSeconds } from "./arrange";
import type { Composition } from "./composition";

const comp: Composition = {
  name: "t",
  bpm: 120,
  key: "A minor",
  tracks: [
    { instrument: "pad", notes: [{ time: "0:0", pitch: "A2", duration: "1m" }] },
    { instrument: "piano", notes: [{ time: "2:0", pitch: "A3", duration: "2n" }] },
  ],
};

describe("compositionDurationSeconds", () => {
  it("returns the latest note end across tracks", () => {
    // piano note starts at bar 2 (=4s at 120bpm) + 2n (=1s) = 5s; pad ends at 2s
    expect(compositionDurationSeconds(comp)).toBeCloseTo(5);
  });
});

describe("loopWindowSeconds", () => {
  it("returns null for a one-shot piece", () => {
    expect(loopWindowSeconds(comp)).toBeNull();
  });

  it("converts loop bars to seconds", () => {
    // at 120bpm a bar is 2s, so bars 2..6 is 4s..12s
    const looping: Composition = { ...comp, loop: { startBar: 2, endBar: 6 } };
    expect(loopWindowSeconds(looping)).toEqual({ start: 4, end: 12, duration: 8 });
  });

  it("scales with tempo", () => {
    const looping: Composition = { ...comp, bpm: 150, loop: { startBar: 8, endBar: 72 } };
    // a bar at 150bpm is 1.6s; 64 bars = 102.4s
    expect(loopWindowSeconds(looping)!.duration).toBeCloseTo(102.4);
  });
});
