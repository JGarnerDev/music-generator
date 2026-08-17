import { describe, it, expect } from "vitest";
import {
  cleanDetected,
  degreesOf,
  estimateTempo,
  fitGrid,
  formatDegree,
  parseKey,
  quantizeNotes,
  toComposition,
  toTrackNotes,
  type DetectedNote,
} from "./transcribe";
import { validateComposition } from "./composition";

/** Build a detected note with sensible defaults, so a test states only what it is about. */
function hit(midi: number, startSeconds: number, durationSeconds = 0.4, amplitude = 0.7): DetectedNote {
  return { midi, startSeconds, durationSeconds, amplitude };
}

/**
 * A played phrase at a known tempo: `[midi, stepIndex, lengthSteps]` on the
 * sixteenth grid, rendered to seconds so the tests can push it back through
 * quantization and expect the grid they started from.
 */
function play(bpm: number, spec: ReadonlyArray<[number, number, number]>, offset = 0): DetectedNote[] {
  const step = 60 / bpm / 4;
  return spec.map(([midi, at, len]) => hit(midi, offset + at * step, len * step));
}

describe("cleanDetected", () => {
  it("drops blips, quiet ghosts and out-of-range octave errors", () => {
    const notes = [
      hit(60, 0),
      hit(62, 1, 0.02), // too short
      hit(64, 2, 0.4, 0.05), // too quiet
      hit(100, 3), // above a guitar — a harmonic reported as its own note
      hit(30, 4), // below a guitar
    ];
    expect(cleanDetected(notes).map((n) => n.midi)).toEqual([60]);
  });

  it("absorbs a ring tail into the attack it came from", () => {
    const merged = cleanDetected([hit(60, 0, 0.2, 0.8), hit(60, 0.21, 0.2, 0.5)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.durationSeconds).toBeCloseTo(0.41, 5);
    expect(merged[0]!.amplitude).toBe(0.8); // the attack's, not the tail's
  });

  it("keeps deliberate rearticulation of the same pitch", () => {
    const notes = [hit(57, 0, 0.35), hit(57, 0.5, 0.35), hit(57, 1.0, 0.35)];
    expect(cleanDetected(notes)).toHaveLength(3);
  });

  it("does not let a chain of tails swallow the re-pluck at the end of it", () => {
    // Verbatim from a real detector run: attack, tail, then a new pluck. Judging
    // the pluck against the attack's 0.77 rather than the tail's 0.45 loses it,
    // which is exactly what happened before the decay was tracked per link.
    const notes = [hit(64, 1.161, 0.3367, 0.773), hit(64, 1.4977, 0.3367, 0.45), hit(64, 1.8344, 0.3264, 0.739)];
    const cleaned = cleanDetected(notes);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0]!.durationSeconds).toBeCloseTo(0.6734, 4); // attack + its tail
    expect(cleaned[1]!.startSeconds).toBeCloseTo(1.8344, 4);
  });

  it("keeps a note re-plucked exactly where the last one stopped ringing", () => {
    // Same pitch, no gap at all — only the swell in amplitude says this is a new
    // pluck rather than more of the old one.
    const notes = [hit(64, 0, 0.34, 0.45), hit(64, 0.34, 0.33, 0.74)];
    expect(cleanDetected(notes)).toHaveLength(2);
  });

  it("drops a smeared attack reported just before the note it belongs to", () => {
    // Verbatim from a real run: a 93ms scrap, then the note proper, louder.
    const cleaned = cleanDetected([hit(57, 3.0663, 0.0929, 0.434), hit(57, 3.1592, 0.3483, 0.767)]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.startSeconds).toBeCloseTo(3.1592, 4);
  });

  it("drops a scrap of ring left over after a long note", () => {
    const cleaned = cleanDetected([hit(72, 4.4956, 1.9982, 0.68), hit(72, 6.5635, 0.0929, 0.506)]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.durationSeconds).toBeCloseTo(1.9982, 4);
  });

  it("keeps a run of fast notes, which are short but not short beside each other", () => {
    // Eight 32nds at 90 BPM: every one is under the blip threshold, and none of
    // them has a long neighbour to be a smear of.
    const run = Array.from({ length: 8 }, (_, i) => hit(60 + i, i * 0.083, 0.083, 0.6));
    expect(cleanDetected(run)).toHaveLength(8);
  });

  it("sorts into playing order", () => {
    expect(cleanDetected([hit(64, 2), hit(60, 0), hit(62, 1)]).map((n) => n.midi)).toEqual([60, 62, 64]);
  });
});

describe("fitGrid", () => {
  it("finds the offset of a phrase that starts off the grid", () => {
    const onsets = play(120, [
      [60, 0, 4],
      [62, 4, 4],
      [64, 8, 4],
    ], 0.31).map((n) => n.startSeconds);
    const fit = fitGrid(onsets, 120);
    expect(fit.offsetSeconds).toBeCloseTo(0.31 % (60 / 120 / 4), 5);
    expect(fit.error).toBeCloseTo(0, 6);
  });

  it("reports a worse error for playing that does not sit on the grid", () => {
    const step = 60 / 120 / 4;
    const sloppy = fitGrid([0, step * 4 + step * 0.5, step * 8], 120);
    expect(sloppy.error).toBeGreaterThan(0.1);
  });

  it("throws on no onsets", () => {
    expect(() => fitGrid([], 120)).toThrow(/at least one onset/);
  });
});

describe("estimateTempo", () => {
  it("recovers the tempo of a quarter-note pulse", () => {
    const onsets = play(90, [
      [60, 0, 4],
      [60, 4, 4],
      [60, 8, 4],
      [60, 12, 4],
      [60, 16, 4],
      [60, 20, 4],
    ]).map((n) => n.startSeconds);
    expect(estimateTempo(onsets)!.bpm).toBe(90);
  });

  it("is confident about a machine-perfect take", () => {
    const onsets = play(100, [
      [60, 0, 2],
      [62, 2, 2],
      [64, 4, 2],
      [65, 6, 2],
      [67, 8, 2],
    ]).map((n) => n.startSeconds);
    expect(estimateTempo(onsets)!.confidence).toBeGreaterThan(0.95);
  });

  it("returns null when there is not enough to go on", () => {
    expect(estimateTempo([0, 0.5, 1])).toBeNull();
  });
});

describe("quantizeNotes", () => {
  it("puts a clean take back on the grid it was played to", () => {
    const notes = play(120, [
      [60, 0, 4],
      [62, 4, 2],
      [64, 6, 2],
      [65, 8, 8],
    ]);
    expect(quantizeNotes(notes, { bpm: 120 })).toEqual([
      { step: 0, lengthSteps: 4, midi: 60, velocity: 0.7 },
      { step: 4, lengthSteps: 2, midi: 62, velocity: 0.7 },
      { step: 6, lengthSteps: 2, midi: 64, velocity: 0.7 },
      { step: 8, lengthSteps: 8, midi: 65, velocity: 0.7 },
    ]);
  });

  it("pulls human timing to the nearest step", () => {
    const step = 60 / 120 / 4;
    const notes = [hit(60, 0), hit(62, step * 4 + step * 0.3), hit(64, step * 8 - step * 0.25)];
    expect(quantizeNotes(notes, { bpm: 120 }).map((n) => n.step)).toEqual([0, 4, 8]);
  });

  it("drops whole bars of count-in but keeps a pickup", () => {
    // Played on the "and" of 4 in bar 2, i.e. step 46 of a 4/4 grid.
    const notes = play(120, [
      [67, 46, 2],
      [72, 48, 8],
    ]);
    expect(quantizeNotes(notes, { bpm: 120 }).map((n) => n.step)).toEqual([14, 16]);
  });

  it("truncates ringing notes at the next onset when monophonic", () => {
    const notes = play(120, [
      [60, 0, 16], // let ring across the next three notes
      [62, 4, 4],
      [64, 8, 4],
    ]);
    expect(quantizeNotes(notes, { bpm: 120 }).map((n) => n.lengthSteps)).toEqual([4, 4, 4]);
  });

  it("leaves overlaps alone when the take is not monophonic", () => {
    const notes = play(120, [
      [60, 0, 16],
      [64, 0, 16],
      [67, 0, 16],
    ]);
    const chord = quantizeNotes(notes, { bpm: 120, monophonic: false });
    expect(chord.map((n) => n.lengthSteps)).toEqual([16, 16, 16]);
    expect(chord.map((n) => n.step)).toEqual([0, 0, 0]);
  });

  it("rounds to eighths on a coarser grid", () => {
    const notes = play(120, [
      [60, 0, 2],
      [62, 3, 2], // a sixteenth late of the eighth
      [64, 6, 2],
    ]);
    expect(quantizeNotes(notes, { bpm: 120, grid: 2 }).map((n) => n.step)).toEqual([0, 4, 6]);
  });

  it("never emits a zero-length note", () => {
    const notes = [hit(60, 0, 0.001), hit(62, 0.5, 0.001)];
    for (const n of quantizeNotes(notes, { bpm: 120 })) expect(n.lengthSteps).toBeGreaterThanOrEqual(1);
  });

  it("carries amplitude through as velocity, floored so nothing is inaudible", () => {
    const notes = [hit(60, 0, 0.4, 0.9), hit(62, 0.5, 0.4, 0.05)];
    expect(quantizeNotes(notes, { bpm: 120 }).map((n) => n.velocity)).toEqual([0.9, 0.2]);
  });

  it("returns nothing for nothing", () => {
    expect(quantizeNotes([], { bpm: 120 })).toEqual([]);
  });
});

describe("toTrackNotes", () => {
  it("writes transport times, notation durations and pitches", () => {
    const notes = [
      { step: 0, lengthSteps: 4, midi: 69, velocity: 0.8 },
      { step: 6, lengthSteps: 2, midi: 72, velocity: 0.6 },
      { step: 16, lengthSteps: 16, midi: 76, velocity: 0.7 },
    ];
    expect(toTrackNotes(notes)).toEqual([
      { time: "0:0:0", pitch: "A4", duration: "4n", velocity: 0.8 },
      { time: "0:1:2", pitch: "C5", duration: "8n", velocity: 0.6 },
      { time: "1:0:0", pitch: "E5", duration: "1m", velocity: 0.7 },
    ]);
  });

  it("spells accidentals the way the key writes them", () => {
    const notes = [{ step: 0, lengthSteps: 4, midi: 70, velocity: 0.7 }];
    expect(toTrackNotes(notes, undefined, parseKey("Dm"))[0]!.pitch).toBe("Bb4");
    expect(toTrackNotes(notes, undefined, parseKey("B minor"))[0]!.pitch).toBe("A#4");
  });

  it("groups steps into bars of the meter it is given", () => {
    const notes = [{ step: 12, lengthSteps: 4, midi: 60, velocity: 0.7 }];
    expect(toTrackNotes(notes, [3, 4])[0]!.time).toBe("1:0:0");
    expect(toTrackNotes(notes, [4, 4])[0]!.time).toBe("0:3:0");
  });
});

describe("toComposition", () => {
  const notes = [
    { step: 0, lengthSteps: 4, midi: 57, velocity: 0.8 },
    { step: 4, lengthSteps: 4, midi: 60, velocity: 0.6 },
  ];

  it("writes a one-track piece that validates", () => {
    const piece = toComposition(notes, { name: "lioness-hook", bpm: 96, key: parseKey("Am") });
    expect(validateComposition(piece)).toEqual([]);
    expect(piece).toMatchObject({
      name: "lioness-hook",
      bpm: 96,
      key: "A minor",
      tracks: [{ instrument: "lead", notes: [{ time: "0:0:0", pitch: "A3" }, { time: "0:1:0", pitch: "C4" }] }],
    });
  });

  it("leaves 4/4 unsaid and states anything else", () => {
    expect(toComposition(notes, { name: "x", bpm: 96, key: parseKey("Am") })).not.toHaveProperty("meter");
    expect(toComposition(notes, { name: "x", bpm: 96, key: parseKey("Am"), meter: [7, 8] }).meter).toEqual([7, 8]);
  });

  it("takes the instrument, voice and tags it is given", () => {
    const piece = toComposition(notes, {
      name: "x",
      bpm: 96,
      key: parseKey("Am"),
      instrument: "piano",
      voice: "felt-upright",
      tags: ["transcribed", "redwater"],
    });
    expect(piece.tracks[0]).toMatchObject({ instrument: "piano", voice: "felt-upright" });
    expect(piece.tags).toEqual(["transcribed", "redwater"]);
  });

  it("omits an empty tag list rather than writing one", () => {
    expect(toComposition(notes, { name: "x", bpm: 96, key: parseKey("Am"), tags: [] })).not.toHaveProperty("tags");
  });

  it("refuses to write a piece with no notes, which would not validate", () => {
    expect(() => toComposition([], { name: "x", bpm: 96, key: parseKey("Am") })).toThrow(/no notes/);
  });
});

describe("parseKey", () => {
  it.each([
    ["Am", { tonic: "A", mode: "minor" }],
    ["A minor", { tonic: "A", mode: "minor" }],
    ["C", { tonic: "C", mode: "major" }],
    ["d dorian", { tonic: "D", mode: "dorian" }],
    ["Bb phrygian dominant", { tonic: "Bb", mode: "phrygian dominant" }],
  ])("parses %s", (input, expected) => {
    expect(parseKey(input)).toEqual(expected);
  });

  it("throws on nonsense", () => {
    expect(() => parseKey("")).toThrow(/empty key/);
    expect(() => parseKey("H minor")).toThrow(/not a key/);
    expect(() => parseKey("banana")).toThrow(/unsupported mode/);
  });
});

describe("degreesOf", () => {
  it("names the notes of a key by function", () => {
    const key = parseKey("Am");
    // A3 C4 E4 G4 — i7 arpeggiated up
    const degrees = degreesOf([57, 60, 64, 67], key);
    expect(degrees.map((d) => d.name)).toEqual(["1", "b3", "5", "b7"]);
    expect(degrees.every((d) => d.inScale)).toBe(true);
  });

  it("flags the notes from outside the key", () => {
    const degrees = degreesOf([57, 63, 64], parseKey("Am")); // A3, Eb4 (blue note), E4
    expect(degrees.map((d) => d.name)).toEqual(["1", "b5", "5"]);
    expect(degrees.map((d) => d.inScale)).toEqual([true, false, true]);
  });

  it("counts octaves from the tonic under the phrase, not from the pitch's own octave", () => {
    // C4 sits above A3, so it is still octave 0 of an A-minor phrase starting at A3.
    const degrees = degreesOf([57, 60, 69, 81], parseKey("Am"));
    expect(degrees.map((d) => d.octave)).toEqual([0, 0, 1, 2]);
  });

  it("reads the same degrees for the same tune played in another key", () => {
    const inA = degreesOf([57, 60, 64, 67], parseKey("Am")).map(formatDegree);
    const inD = degreesOf([62, 65, 69, 72], parseKey("Dm")).map(formatDegree);
    expect(inA).toEqual(inD);
  });

  it("returns nothing for nothing", () => {
    expect(degreesOf([], parseKey("C"))).toEqual([]);
  });
});

describe("formatDegree", () => {
  it("marks octave displacement and leaves the home octave bare", () => {
    expect(formatDegree({ name: "5", octave: 0, inScale: true })).toBe("5");
    expect(formatDegree({ name: "b3", octave: 1, inScale: true })).toBe("b3^");
    expect(formatDegree({ name: "1", octave: 2, inScale: true })).toBe("1^^");
    expect(formatDegree({ name: "6", octave: -1, inScale: true })).toBe("6v");
  });
});
