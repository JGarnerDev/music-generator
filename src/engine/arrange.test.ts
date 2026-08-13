import { describe, it, expect } from "vitest";
import { compositionDurationSeconds } from "./arrange";
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
