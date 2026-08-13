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
    for (const track of comp.tracks) {
      for (const note of track.notes) {
        const pc = note.pitch.replace(/\d+$/, "");
        expect(aMinor.has(pc)).toBe(true);
      }
    }
  });
});
