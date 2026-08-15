import { describe, it, expect } from "vitest";
import {
  SUPPORTED_MODES,
  scaleNotes,
  progressionChords,
  progressionIdiom,
  progressionsInIdiom,
  modeFamily,
  chordPitches,
  fitToBand,
  scaleLadder,
  transpose,
  voiceLead,
} from "./theory";
import { Note } from "tonal";

/** Total semitone travel between two voicings, nearest-neighbour costed. */
function travel(from: string[], to: string[]): number {
  return to.reduce((sum, pitch) => {
    const m = Note.midi(pitch)!;
    return sum + Math.min(...from.map((p) => Math.abs(Note.midi(p)! - m)));
  }, 0);
}

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

  it("throws on a scale that isn't a supported mode", () => {
    // Not "any scale tonal knows": pentatonics have no seventh to stack a triad
    // on, and hungarian minor has a degree whose triad is unnameable.
    expect(() => progressionChords("A", ["i"], "hungarian minor")).toThrow(/unsupported mode/);
    expect(() => progressionChords("A", ["i"], "major pentatonic")).toThrow(/unsupported mode/);
  });
});

describe("progressionChords — modes", () => {
  it("gives dorian its natural 6 where minor flattens it", () => {
    // The whole point of dorian: the VI is B, not Bb.
    expect(progressionChords("D", ["i", "VI", "i", "VII"], "dorian")).toEqual([
      "Dm",
      "B",
      "Dm",
      "C",
    ]);
    expect(progressionChords("D", ["i", "VI", "i", "VII"], "minor")).toEqual([
      "Dm",
      "Bb",
      "Dm",
      "C",
    ]);
  });

  it("gives phrygian its b2 as a diatonic chord, not a borrowed one", () => {
    expect(progressionChords("E", ["i", "II", "i"], "phrygian")).toEqual(["Em", "F", "Em"]);
    expect(progressionChords("E", ["i", "II", "i"], "minor")).toEqual(["Em", "F#", "Em"]);
  });

  it("keeps lydian's #4 on the fourth degree", () => {
    expect(progressionChords("C", ["I", "iv", "I"], "lydian")).toEqual(["C", "F#dim", "C"]);
  });

  it("resolves mixolydian's b7 as a plain diatonic VII", () => {
    expect(progressionChords("G", ["I", "VII", "IV", "I"], "mixolydian")).toEqual([
      "G",
      "F",
      "C",
      "G",
    ]);
  });

  it("aliases ionian/aeolian to major/minor", () => {
    expect(progressionChords("C", ["I", "V", "vi", "IV"], "ionian")).toEqual([
      ...progressionChords("C", ["I", "V", "vi", "IV"], "major"),
    ]);
    expect(progressionChords("A", ["i", "VI", "III", "VII"], "aeolian")).toEqual([
      ...progressionChords("A", ["i", "VI", "III", "VII"], "minor"),
    ]);
  });

  it("resolves locrian's diminished tonic instead of faking a triad", () => {
    expect(progressionChords("B", ["i", "IV", "i"], "locrian")).toEqual(["Bdim", "E", "Bdim"]);
  });
});

describe("modeFamily", () => {
  it("files each mode by the quality of its tonic triad", () => {
    expect(modeFamily("dorian")).toBe("minor");
    expect(modeFamily("phrygian")).toBe("minor");
    expect(modeFamily("aeolian")).toBe("minor");
    expect(modeFamily("lydian")).toBe("major");
    expect(modeFamily("mixolydian")).toBe("major");
    expect(modeFamily("ionian")).toBe("major");
  });

  it("files phrygian-dominant as major — its tonic triad is, unlike phrygian's", () => {
    expect(modeFamily("phrygian")).toBe("minor");
    expect(modeFamily("phrygian-dominant")).toBe("major");
    expect(modeFamily("harmonic-minor")).toBe("minor");
    expect(modeFamily("lydian-dominant")).toBe("major");
  });

  it("takes a mode name hyphenated, spaced or shouted", () => {
    expect(modeFamily("phrygian-dominant")).toBe("major");
    expect(modeFamily("phrygian dominant")).toBe("major");
    expect(modeFamily("Phrygian_Dominant")).toBe("major");
  });

  it("throws on anything that isn't a supported mode", () => {
    expect(() => modeFamily("blues")).toThrow(/unsupported mode/);
  });

  /**
   * The gate on `MODE_FAMILY`. Every degree of every listed mode has to stack
   * into a nameable triad, because that is how `progressionChords` resolves a
   * numeral. Modes with an augmented fourth between two degrees (hungarian
   * minor, double harmonic) fail here rather than at compose time — which is the
   * whole reason the list is hand-picked instead of "whatever tonal knows".
   */
  it("every supported mode stacks a triad on every degree, in every key", () => {
    const numerals = ["I", "II", "III", "IV", "V", "VI", "VII"];
    for (const mode of SUPPORTED_MODES) {
      for (const tonic of ["C", "A", "Eb", "F#", "Bb", "B"]) {
        expect(() => progressionChords(tonic, numerals, mode)).not.toThrow();
      }
    }
  });
});

describe("the modes beyond the church seven", () => {
  it("resolves a freygish I-II-I-VII in A phrygian-dominant", () => {
    // The b2 is already in the scale, so `II` takes it — writing `bII` would
    // flatten an already-flat degree.
    expect(progressionChords("A", ["I", "II", "I", "VII"], "phrygian-dominant")).toEqual([
      "A",
      "Bb",
      "A",
      "G",
    ]);
  });

  it("gives harmonic minor its dominant diatonically rather than by borrowing", () => {
    // In aeolian `V` is a borrow — the same chord reached by raising the third
    // in place. Here degree 4 already stacks E G# B, so the mode supplies it.
    expect(progressionChords("A", ["i", "iv", "V", "i"], "harmonic-minor")).toEqual([
      "Am",
      "Dm",
      "E",
      "Am",
    ]);
  });

  it("still reads case as an instruction in the new modes", () => {
    // Lowercase asks for minor even where the mode's own triad is major, which
    // is the one way to write the aeolian v inside a harmonic-minor piece.
    expect(progressionChords("A", ["v"], "harmonic-minor")).toEqual(["Em"]);
  });

  it("keeps the mode's own accidentals in the melodic ladder", () => {
    expect(scaleLadder("A", "phrygian-dominant", 4, 4)).toEqual([
      "A4",
      "Bb4",
      "C#5",
      "D5",
      "E5",
      "F5",
      "G5",
    ]);
  });

  it("matches major-idiom progressions to a phrygian-dominant key", () => {
    const both = [
      ["i", "VII", "VI", "VII"],
      ["I", "II", "I", "VII"],
    ];
    expect(progressionsInIdiom(both, "phrygian-dominant")).toEqual([["I", "II", "I", "VII"]]);
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

  it("matches a mode by its family, not its name", () => {
    // Dorian has a minor tonic, so it takes the minor-idiom set; mixolydian's is
    // major. Neither mode names an idiom of its own.
    expect(progressionsInIdiom(lofi, "dorian")).toEqual([["i", "VI", "ii", "V"]]);
    expect(progressionsInIdiom(lofi, "mixolydian")).toEqual([
      ["ii", "V", "I", "I"],
      ["I", "vi", "ii", "V"],
    ]);
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

describe("scaleLadder", () => {
  it("ascends past the octave where the pitch classes wrap", () => {
    // The whole point: C and up belong to octave 5 here, not 4.
    expect(scaleLadder("F", "major", 4, 4)).toEqual(["F4", "G4", "A4", "Bb4", "C5", "D5", "E5"]);
  });

  it("is monotonically ascending across every octave it spans", () => {
    for (const tonic of ["C", "F", "A", "Eb", "B"]) {
      const ladder = scaleLadder(tonic, "minor", 3, 5);
      const midis = ladder.map((p) => Note.midi(p)!);
      for (let i = 1; i < midis.length; i++) {
        expect(midis[i]).toBeGreaterThan(midis[i - 1]!);
      }
    }
  });

  it("spans one scale per octave asked for", () => {
    expect(scaleLadder("A", "minor", 4, 5)).toHaveLength(14);
  });

  it("starts on the tonic at the low octave", () => {
    expect(scaleLadder("A", "minor", 3, 4)[0]).toBe("A3");
  });
});

describe("voiceLead", () => {
  it("voices the first chord in root position at the start octave", () => {
    expect(voiceLead("Am", null, 3)).toEqual(chordPitches("Am", 3));
  });

  it("keeps the common tone and moves the rest by a step", () => {
    // Am -> F share A and C; root position (F3 A3 C4) would leap the whole hand
    // down a third, the second inversion holds both and moves E4 up to F4.
    expect(voiceLead("F", ["A3", "C4", "E4"])).toEqual(["A3", "C4", "F4"]);
  });

  it("travels less than root-position voicing over a progression", () => {
    const chords = progressionChords("A", ["i", "VI", "III", "VII"], "minor");

    let led: string[] | null = null;
    let ledCost = 0;
    let rootCost = 0;
    let prevRoot: string[] | null = null;

    for (const chord of chords) {
      const next: string[] = voiceLead(chord, led, 3);
      if (led) ledCost += travel(led, next);
      led = next;

      const root = chordPitches(chord, 3);
      if (prevRoot) rootCost += travel(prevRoot, root);
      prevRoot = root;
    }

    expect(ledCost).toBeLessThan(rootCost);
  });

  it("stays near the previous chord instead of near the start octave", () => {
    const high = voiceLead("F", ["A5", "C6", "E6"]);
    expect(high.every((p) => Note.midi(p)! > Note.midi("A4")!)).toBe(true);
  });

  it("is deterministic", () => {
    expect(voiceLead("G", ["C4", "E4", "G4"])).toEqual(voiceLead("G", ["C4", "E4", "G4"]));
  });
});

describe("fitToBand", () => {
  it("raises a pitch that sits below the band", () => {
    expect(fitToBand("D0", [31, 43])).toBe("D2");
  });
  it("lowers a pitch that sits above the band", () => {
    expect(fitToBand("D5", [31, 43])).toBe("D2");
  });
  it("leaves a pitch already inside the band alone", () => {
    expect(fitToBand("C2", [31, 43])).toBe("C2");
  });
  it("throws on an inverted band rather than looping", () => {
    expect(() => fitToBand("C2", [43, 31])).toThrow();
  });
});
