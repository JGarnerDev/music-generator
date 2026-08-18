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

  it("accepts a valid loop window", () => {
    expect(validateComposition({ ...valid, loop: { startBar: 8, endBar: 72 } })).toEqual([]);
  });

  it("rejects an empty or inverted loop window", () => {
    for (const loop of [{ startBar: 8, endBar: 8 }, { startBar: 8, endBar: 4 }]) {
      const issues = validateComposition({ ...valid, loop });
      expect(issues.some((i) => i.path === "loop.endBar")).toBe(true);
    }
  });

  it("rejects fractional or negative loop bars", () => {
    const issues = validateComposition({ ...valid, loop: { startBar: -1, endBar: 7.5 } });
    expect(issues.some((i) => i.path === "loop.startBar")).toBe(true);
    expect(issues.some((i) => i.path === "loop.endBar")).toBe(true);
  });

  it("accepts a bent note", () => {
    const notes = [{ time: "0:0", pitch: "A3", duration: "2n", bend: { semitones: 2 } }];
    expect(validateComposition({ ...valid, tracks: [{ instrument: "lead", notes }] })).toEqual([]);
  });

  it("passes a malformed bend down to the bend validator", () => {
    const notes = [{ time: "0:0", pitch: "A3", duration: "2n", bend: { semitones: 99 } }];
    const issues = validateComposition({ ...valid, tracks: [{ instrument: "lead", notes }] });
    expect(issues.some((i) => i.path === "tracks[0].notes[0].bend.semitones")).toBe(true);
  });

  it("rejects a bend on drums", () => {
    const notes = [{ time: "0:0", pitch: "kick", duration: "8n", bend: { semitones: 2 } }];
    const issues = validateComposition({ ...valid, tracks: [{ instrument: "drums", notes }] });
    expect(issues.some((i) => i.path === "tracks[0].notes[0].bend")).toBe(true);
  });

  it("rejects two bent notes that overlap on one track", () => {
    // At 72 bpm a half note runs 1.67s, so a bend on beat 1 is still sounding
    // when the bend on beat 2 starts.
    const notes = [
      { time: "0:0", pitch: "A3", duration: "2n", bend: { semitones: 2 } },
      { time: "0:1", pitch: "C4", duration: "2n", bend: { semitones: 2 } },
    ];
    const issues = validateComposition({ ...valid, tracks: [{ instrument: "lead", notes }] });
    expect(issues.some((i) => i.path === "tracks[0].notes[1].bend")).toBe(true);
  });

  it("lets a bent note overlap unbent ones — they are different voices", () => {
    const notes = [
      { time: "0:0", pitch: "A3", duration: "1m" },
      { time: "0:0", pitch: "C4", duration: "1m" },
      { time: "0:1", pitch: "E4", duration: "4n", bend: { semitones: 2 } },
    ];
    expect(validateComposition({ ...valid, tracks: [{ instrument: "lead", notes }] })).toEqual([]);
  });

  it("counts back-to-back bends as adjacent, not overlapping", () => {
    const notes = [
      { time: "0:0", pitch: "A3", duration: "4n", bend: { semitones: 2 } },
      { time: "0:1", pitch: "C4", duration: "4n", bend: { semitones: -1 } },
    ];
    expect(validateComposition({ ...valid, tracks: [{ instrument: "lead", notes }] })).toEqual([]);
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
