import { describe, expect, it } from "vitest";
import { chordSpans, findClashes, formatClash } from "./clash";
import type { Note } from "./composition";

const n = (time: string, pitch: string, duration = "4n"): Note => ({ time, pitch, duration, velocity: 0.8 });

describe("chordSpans", () => {
  it("gives each bar its own span, offset by the section's start", () => {
    expect(chordSpans(["Fm", "Db"], 2)).toEqual([
      { start: 8, end: 12, symbol: "Fm" },
      { start: 12, end: 16, symbol: "Db" },
    ]);
  });

  it("splits an array entry evenly across its bar", () => {
    expect(chordSpans([["Db", "C"]], 0, [4, 4], "talons")).toEqual([
      { start: 0, end: 2, symbol: "Db", section: "talons" },
      { start: 2, end: 4, symbol: "C", section: "talons" },
    ]);
  });

  it("follows the meter", () => {
    expect(chordSpans(["Am", "E"], 0, [3, 4]).map((s) => s.start)).toEqual([0, 3]);
  });
});

describe("findClashes", () => {
  const spans = chordSpans(["Fm", "C", "Db"], 0);

  it("flags a held note a semitone off the root or fifth", () => {
    const [c] = findClashes(spans, [[n("1:0:0", "C#5")]]);
    expect(c).toMatchObject({ kind: "rub", chord: "C", pitch: "C#5" });
    expect(c!.detail).toContain("root");
  });

  it("does not flag chord tones, colour tones or passing sixteenths", () => {
    const line = [n("0:0:0", "Ab4"), n("0:1:0", "G4"), n("1:0:0", "Db5", "16n")];
    expect(findClashes(spans, [line])).toEqual([]);
  });

  it("flags two lines a whole step apart while both sound", () => {
    const clashes = findClashes(spans, [[n("0:0:0", "D5")], [n("0:0:0", "C5")]]);
    expect(clashes.map((c) => c.kind)).toContain("pair");
  });

  it("leaves thirds, fourths and octaves between the lines alone", () => {
    const lead = [n("0:0:0", "C5"), n("0:1:0", "F5"), n("0:2:0", "Ab4")];
    const twin = [n("0:0:0", "Ab4"), n("0:1:0", "C5"), n("0:2:0", "Ab3")];
    expect(findClashes(spans, [lead, twin])).toEqual([]);
  });

  it("formats a line a reader can find in the plan", () => {
    const [c] = findClashes(chordSpans(["Fm", "C"], 0, [4, 4], "strike"), [[n("1:2:0", "Db5")]]);
    expect(formatClash(c!)).toMatch(/^strike\s+1:2\s+Db5 over C/);
  });
});

describe("findClashes octave doubles", () => {
  it("reports a rub once when the twin doubles it at the octave", () => {
    const spans = chordSpans(["C"], 0);
    const clashes = findClashes(spans, [[n("0:0:0", "C#5")], [n("0:0:0", "C#4")]]);
    expect(clashes.filter((c) => c.kind === "rub")).toHaveLength(1);
  });
});
