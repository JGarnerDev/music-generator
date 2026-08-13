import { describe, it, expect } from "vitest";
import {
  scaleNotes,
  progressionChords,
  progressionIdiom,
  progressionsInIdiom,
  chordPitches,
  transpose,
} from "./theory";

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

  it("resolves a major I-V-vi-IV in C", () => {
    expect(progressionChords("C", ["I", "V", "vi", "IV"], "major")).toEqual(["C", "G", "Am", "F"]);
  });

  it("keeps the major V in a minor key (harmonic-minor cadence, not Em)", () => {
    expect(progressionChords("A", ["i", "iv", "i", "V"], "minor")).toEqual(["Am", "Dm", "Am", "E"]);
  });

  it("borrows bVII/bVI from the parallel minor for an uppercase numeral in major", () => {
    // Resolving by degree alone would give the diatonic Bdim/Am here.
    expect(progressionChords("C", ["I", "VII", "VI", "VII"], "major")).toEqual([
      "C",
      "Bb",
      "Ab",
      "Bb",
    ]);
  });

  it("renders a minor-idiom progression as minor even against a major key", () => {
    // A genre's Aeolian vocabulary must not turn into diminished chords on the
    // downbeat when it lands on a major emotion.
    expect(progressionChords("F", ["i", "VII", "VI", "VII"], "major")).toEqual([
      "Fm",
      "Eb",
      "Db",
      "Eb",
    ]);
  });

  it("lowers a major degree for a lowercase numeral (borrowed minor iv)", () => {
    expect(progressionChords("C", ["I", "iv", "I", "V"], "major")).toEqual(["C", "Fm", "C", "G"]);
  });

  it("keeps a diminished degree diminished for a bare lowercase numeral", () => {
    expect(progressionChords("A", ["ii", "V", "I"], "minor")).toEqual(["Bdim", "E", "A"]);
  });

  it("honours explicit accidentals and keeps the letter name", () => {
    expect(progressionChords("C", ["I", "bVII", "bVI", "V"], "major")).toEqual([
      "C",
      "Bb",
      "Ab",
      "G",
    ]);
  });

  it("resolves a Neapolitan bII", () => {
    expect(progressionChords("A", ["i", "bII", "V", "i"], "minor")).toEqual(["Am", "Bb", "E", "Am"]);
  });

  it("throws on a garbage numeral", () => {
    expect(() => progressionChords("A", ["nope"], "minor")).toThrow();
  });

  it("throws on an unsupported scale", () => {
    expect(() => progressionChords("A", ["i"], "dorian")).toThrow();
  });
});

describe("progressionIdiom", () => {
  it("reads the idiom off the tonic numeral's case", () => {
    expect(progressionIdiom(["i", "VII", "VI", "VII"])).toBe("minor");
    expect(progressionIdiom(["I", "vi", "ii", "V"])).toBe("major");
  });

  it("finds the tonic even when it isn't first", () => {
    expect(progressionIdiom(["ii", "V", "I"])).toBe("major");
  });

  it("returns null when no tonic is stated", () => {
    expect(progressionIdiom(["ii", "V"])).toBeNull();
  });
});

describe("progressionsInIdiom", () => {
  const lofi = [
    ["ii", "V", "I", "I"],
    ["I", "vi", "ii", "V"],
    ["i", "VI", "ii", "V"],
  ];

  it("keeps only the minor-idiom progression for a minor key", () => {
    expect(progressionsInIdiom(lofi, "minor")).toEqual([["i", "VI", "ii", "V"]]);
  });

  it("keeps the major-idiom progressions for a major key", () => {
    expect(progressionsInIdiom(lofi, "major")).toEqual([
      ["ii", "V", "I", "I"],
      ["I", "vi", "ii", "V"],
    ]);
  });

  it("falls back to the full list when a genre has only one idiom", () => {
    const minorOnly = [["i", "VII", "VI", "VII"]];
    expect(progressionsInIdiom(minorOnly, "major")).toEqual(minorOnly);
  });

  it("keeps idiom-agnostic progressions in either key", () => {
    const agnostic = [["ii", "V"]];
    expect(progressionsInIdiom(agnostic, "minor")).toEqual(agnostic);
    expect(progressionsInIdiom(agnostic, "major")).toEqual(agnostic);
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
