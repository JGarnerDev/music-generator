import { describe, it, expect } from "vitest";
import { validateComposition, type Composition } from "./composition";

const valid: Composition = {
  name: "demo",
  bpm: 72,
  key: "A minor",
  tracks: [
    {
      instrument: "piano",
      notes: [{ time: "0:0", pitch: "A3", duration: "2n", velocity: 0.6 }],
    },
  ],
};

describe("validateComposition", () => {
  it("accepts a well-formed composition", () => {
    expect(validateComposition(valid)).toEqual([]);
  });

  it("rejects non-objects", () => {
    expect(validateComposition(null)).toHaveLength(1);
    expect(validateComposition("nope")[0]?.path).toBe("$");
  });

  it("flags bad bpm", () => {
    const bad = { ...valid, bpm: 0 };
    const issues = validateComposition(bad);
    expect(issues.some((i) => i.path === "bpm")).toBe(true);
  });

  it("requires at least one track", () => {
    const bad = { ...valid, tracks: [] };
    expect(validateComposition(bad).some((i) => i.path === "tracks")).toBe(true);
  });

  it("flags unknown instruments", () => {
    const bad = { ...valid, tracks: [{ instrument: "kazoo", notes: valid.tracks[0]!.notes }] };
    const issues = validateComposition(bad);
    expect(issues.some((i) => i.path === "tracks[0].instrument")).toBe(true);
  });

  it("flags out-of-range velocity", () => {
    const bad = {
      ...valid,
      tracks: [{ instrument: "piano", notes: [{ time: "0:0", pitch: "A3", duration: "2n", velocity: 2 }] }],
    };
    const issues = validateComposition(bad);
    expect(issues.some((i) => i.path === "tracks[0].notes[0].velocity")).toBe(true);
  });

  it("flags missing note fields", () => {
    const bad = {
      ...valid,
      tracks: [{ instrument: "piano", notes: [{ time: "0:0" }] }],
    };
    const issues = validateComposition(bad);
    expect(issues.some((i) => i.path === "tracks[0].notes[0].pitch")).toBe(true);
    expect(issues.some((i) => i.path === "tracks[0].notes[0].duration")).toBe(true);
  });
});
