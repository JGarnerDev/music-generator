import { describe, it, expect } from "vitest";
import { composeFromPalette } from "./composer";
import { parsePalette, type Palette } from "./palette";
import { validateComposition } from "./composition";

const sad: Palette = parsePalette(`---
slug: sad
title: Sad
tags: [sad, grief]
tonality:
  tonic: A
  scale: minor
progressions:
  - [i, VI, III, VII]
  - [i, iv, i, V]
tempo: [60, 78]
instruments: [piano, pad]
---
body`);

describe("composeFromPalette", () => {
  it("produces a structurally valid composition", () => {
    const comp = composeFromPalette(sad, "dog dies");
    expect(validateComposition(comp)).toEqual([]);
  });

  it("is deterministic for the same inputs", () => {
    const a = composeFromPalette(sad, "dog dies");
    const b = composeFromPalette(sad, "dog dies");
    expect(a).toEqual(b);
  });

  it("varies take with a different seed", () => {
    const a = composeFromPalette(sad, "dog dies", { seed: "1" });
    const b = composeFromPalette(sad, "dog dies", { seed: "2" });
    expect(a).not.toEqual(b);
  });

  it("respects the palette tempo range and records provenance", () => {
    const comp = composeFromPalette(sad, "quiet farewell");
    expect(comp.bpm).toBeGreaterThanOrEqual(60);
    expect(comp.bpm).toBeLessThanOrEqual(78);
    expect(comp.key).toBe("A minor");
    expect(comp.palettes).toEqual(["sad"]);
  });

  it("derives a filesystem-friendly name from the mood, overridable", () => {
    expect(composeFromPalette(sad, "Dog Dies!!").name).toBe("dog-dies");
    expect(composeFromPalette(sad, "x", { name: "custom" }).name).toBe("custom");
  });

  it("stays in key: every melody pitch is a scale tone", () => {
    const comp = composeFromPalette(sad, "stepwise");
    const aMinor = new Set(["A", "B", "C", "D", "E", "F", "G"]);
    // Only the stepwise melody (quarter notes off the ladder) is scale-bound.
    // Chord voicings legitimately carry accidentals — `[i, iv, i, V]` resolves its
    // V as a major triad, so the harmonic-minor leading tone G# shows up there.
    const melody = comp.tracks.flatMap((t) => t.notes.filter((n) => n.duration === "4n"));
    expect(melody.length).toBeGreaterThan(0);
    for (const note of melody) {
      expect(aMinor.has(note.pitch.replace(/\d+$/, ""))).toBe(true);
    }
  });

  it("picks a progression in the key's own idiom", () => {
    // The major-idiom turnaround would resolve to a Picardy A-major tonic here;
    // the minor-idiom one is the right pick for a minor emotion.
    const mixed: Palette = parsePalette(`---
slug: mixed
title: Mixed
tags: [mixed]
tonality:
  tonic: A
  scale: minor
progressions:
  - [I, vi, ii, V]
  - [i, VI, ii, V]
tempo: [70, 70]
instruments: [piano, pad]
---
body`);
    for (const seed of ["1", "2", "3", "4", "5"]) {
      const comp = composeFromPalette(mixed, "idiom", { seed });
      const opening = comp.tracks[1]!.notes.filter((n) => n.time === "0:0").map((n) => n.pitch);
      expect(opening).toEqual(["A3", "C4", "E4"]); // Am, never A major
    }
  });
});
