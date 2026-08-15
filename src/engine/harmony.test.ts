import { describe, expect, it } from "vitest";
import { harmonize, resolveSteps, scaleLadderMidi } from "./harmony";
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
