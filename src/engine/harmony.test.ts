import { describe, expect, it } from "vitest";
import { chordScale, harmonize, resolveSteps, scaleLadderMidi, type ChordSpan } from "./harmony";
import type { Note } from "./composition";

const n = (pitch: string, velocity = 0.8): Note => ({
  time: "0:0:0",
  pitch,
  duration: "4n",
  velocity,
});

const pitches = (notes: Note[]): string[] => notes.map((note) => note.pitch);

describe("resolveSteps", () => {
  it("counts a third as two scale steps, not three", () => {
    expect(resolveSteps("third")).toBe(2);
    expect(resolveSteps("fifth")).toBe(4);
    expect(resolveSteps("octave")).toBe(7);
  });

  it("passes a raw step count through", () => {
    expect(resolveSteps(5)).toBe(5);
  });

  it("rejects an unknown name and a fractional step", () => {
    expect(() => resolveSteps("ninth" as never)).toThrow(/unknown harmony interval/);
    expect(() => resolveSteps(1.5)).toThrow(/whole scale steps/);
  });
});

describe("scaleLadderMidi", () => {
  it("ascends and contains only the scale's pitch classes", () => {
    const ladder = scaleLadderMidi("E", "minor");
    const classes = new Set(ladder.map((midi) => midi % 12));
    // E F# G A B C D
    expect([...classes].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 7, 9, 11]);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
  });
});

describe("harmonize", () => {
  it("varies the interval quality to stay in the key", () => {
    // E minor. A third over E is G (minor third); over G it is B (major third).
    // A fixed semitone transpose cannot do both, which is the whole point.
    expect(pitches(harmonize([n("E4"), n("G4")], { tonic: "E", scale: "minor" }))).toEqual([
      "G4",
      "B4",
    ]);
  });

  it("puts the line under the melody when asked", () => {
    expect(
      pitches(harmonize([n("E4")], { tonic: "E", scale: "minor", below: true })),
    ).toEqual(["C4"]);
  });

  it("reads the mode, so dorian and aeolian harmonise differently", () => {
    // A sixth over E: C in aeolian, C# in dorian — the raised sixth is the mode.
    const opts = { tonic: "E", interval: "sixth" } as const;
    expect(pitches(harmonize([n("E4")], { ...opts, scale: "minor" }))).toEqual(["C5"]);
    expect(pitches(harmonize([n("E4")], { ...opts, scale: "dorian" }))).toEqual(["C#5"]);
  });

  it("harmonises a fifth as a fifth, including the mode's diminished one", () => {
    // In E minor the F#–C pair is the tritone, and diatonic harmony keeps it.
    expect(
      pitches(harmonize([n("E4"), n("F#4")], { tonic: "E", scale: "minor", interval: "fifth" })),
    ).toEqual(["B4", "C5"]);
  });

  it("snaps a non-scale note to the nearest degree, ties upward", () => {
    // C#5 is outside E aeolian; it snaps up to D5, whose third is F#5. The
    // harmony part stays in the key while the lead goes chromatic.
    expect(pitches(harmonize([n("C#5")], { tonic: "E", scale: "minor" }))).toEqual(["F#5"]);
  });

  it("copies time and duration so the parts cannot drift", () => {
    const melody: Note[] = [{ time: "3:2:1", pitch: "A4", duration: "16n", velocity: 0.9 }];
    const [harmony] = harmonize(melody, { tonic: "E", scale: "minor" });
    expect(harmony!.time).toBe("3:2:1");
    expect(harmony!.duration).toBe("16n");
  });

  it("scales velocity so the harmony sits under the lead", () => {
    const [harmony] = harmonize([n("E4", 0.9)], { tonic: "E", scale: "minor", velocity: 0.8 });
    expect(harmony!.velocity).toBeCloseTo(0.72);
  });

  it("clamps velocity into 0..1", () => {
    const [harmony] = harmonize([n("E4", 0.9)], { tonic: "E", scale: "minor", velocity: 2 });
    expect(harmony!.velocity).toBe(1);
  });

  it("leaves an empty line empty", () => {
    expect(harmonize([], { tonic: "E" })).toEqual([]);
  });
});

describe("chordScale", () => {
  it("swaps in the V chord's leading tone in a minor key", () => {
    expect(chordScale("F", "minor", "C")).toEqual(["F", "G", "Ab", "Bb", "C", "Db", "E"]);
  });
  it("swaps in a borrowed IV's raised sixth", () => {
    expect(chordScale("F", "minor", "Bb")).toEqual(["F", "G", "Ab", "Bb", "C", "D", "Eb"]);
  });
  it("leaves a diatonic chord's scale alone", () => {
    expect(chordScale("F", "minor", "Db")).toEqual(["F", "G", "Ab", "Bb", "C", "Db", "Eb"]);
  });
});

describe("harmonize with chords", () => {
  // F minor, a third below — the twin-lead setup the clashes were found in.
  const opts = (symbol: string) => ({
    tonic: "F",
    scale: "minor",
    interval: "third" as const,
    below: true,
    chords: [{ start: 0, end: 4, symbol }] satisfies ChordSpan[],
  });
  const under = (pitch: string, symbol: string) =>
    harmonize([{ time: "0:0:0", pitch, duration: "4n", velocity: 0.8 }], opts(symbol))[0]!.pitch;

  it("keeps a third that doesn't rub", () => {
    expect(under("C5", "Fm")).toBe("G#4"); // Ab under C, both chord tones
    expect(under("Ab4", "Fm")).toBe("F4");
  });

  it("puts the chord's leading tone's partner under it, not a flat nine", () => {
    // Key-only: E snaps up to F, partner Db — a semitone above the chord's C.
    expect(under("E5", "C")).toBe("C5");
  });

  it("thirds a raised sixth inside the borrowed chord instead of a second", () => {
    // Key-only: D snaps up to Eb, partner C — a whole step under the lead.
    expect(under("D5", "Bb")).toBe("A#4");
    expect(under("F5", "Bb")).toBe("D5");
  });

  it("moves off a third that rubs a semitone against the root or fifth", () => {
    expect(under("F4", "Fm")).toBe("C4"); // not Db, a semitone over the fifth
    expect(under("C5", "C")).toBe("G4"); // not Ab, a semitone over the fifth
    expect(under("Bb4", "Db")).toBe("F4"); // not G, a semitone under the fifth
    expect(under("Eb5", "Db")).toBe("G#4"); // not C, a semitone under the root
  });

  it("leaves an octave doubling alone", () => {
    const out = harmonize([{ time: "0:0:0", pitch: "F4", duration: "4n" }], {
      ...opts("C"),
      interval: "octave",
    });
    expect(out[0]!.pitch).toBe("F3");
  });

  it("falls back to the key where no chord covers the note", () => {
    const out = harmonize([{ time: "2:0:0", pitch: "F4", duration: "4n" }], opts("Fm"));
    expect(out[0]!.pitch).toBe("C#4");
  });

  it("finds the chord by onset across bars", () => {
    const out = harmonize(
      [
        { time: "0:0:0", pitch: "C5", duration: "4n" },
        { time: "1:2:0", pitch: "C5", duration: "4n" },
      ],
      {
        ...opts("Fm"),
        chords: [
          { start: 0, end: 4, symbol: "Fm" },
          { start: 4, end: 6, symbol: "Db" },
          { start: 6, end: 8, symbol: "C" },
        ],
      },
    );
    expect(out.map((n) => n.pitch)).toEqual(["G#4", "G4"]);
  });
});
