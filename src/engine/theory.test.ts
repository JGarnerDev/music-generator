import { describe, it, expect } from "vitest";
import { scaleNotes, progressionChords, chordPitches, transpose } from "./theory";

describe("scaleNotes", () => {
  it("returns natural minor pitch classes", () => {
    expect(scaleNotes("A", "minor")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });
  it("throws on garbage scale", () => {
    expect(() => scaleNotes("A", "notascale")).toThrow();
  });
});

describe("progressionChords", () => {
  it("resolves a minor i-VI-III-VII in A", () => {
    expect(progressionChords("A", ["i", "VI", "III", "VII"])).toEqual(["Am", "F", "C", "G"]);
  });
});

describe("chordPitches", () => {
  it("voices a triad ascending with octaves", () => {
    expect(chordPitches("Am", 3)).toEqual(["A3", "C4", "E4"]);
  });
  it("keeps ascending when pitch classes wrap", () => {
    expect(chordPitches("C", 4)).toEqual(["C4", "E4", "G4"]);
  });
  it("throws on unknown chord", () => {
    expect(() => chordPitches("Zzz9", 3)).toThrow();
  });
});

describe("transpose", () => {
  it("moves up an octave", () => {
    expect(transpose("A3", 12)).toBe("A4");
  });
});
