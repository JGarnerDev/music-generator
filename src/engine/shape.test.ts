import { describe, it, expect } from "vitest";
import { applyShape, formatInterval, summarizeShape, toShape } from "./shape";
import { parseKey, type QuantizedNote } from "./transcribe";

/** `[midi, step, lengthSteps]` → a quantized note, so a test reads as a rhythm. */
function notes(spec: ReadonlyArray<[number, number, number]>): QuantizedNote[] {
  return spec.map(([midi, step, lengthSteps]) => ({ midi, step, lengthSteps, velocity: 0.7 }));
}

/** A minor: 1 b3 5 b7 5 b6 b3 1 in eighths — the same phrase the transcript tests use. */
const PHRASE = notes([
  [57, 0, 2],
  [60, 2, 2],
  [64, 4, 2],
  [67, 6, 2],
  [64, 8, 2],
  [65, 10, 2],
  [60, 12, 2],
  [57, 14, 2],
]);

describe("toShape", () => {
  it("says each note relative to the one before it", () => {
    expect(toShape(PHRASE).notes.map((n) => n.interval)).toEqual([0, 3, 4, 3, -3, 1, -5, -3]);
  });

  it("measures time as the gap between onsets", () => {
    expect(toShape(PHRASE).notes.map((n) => n.gapSteps)).toEqual([0, 2, 2, 2, 2, 2, 2, 2]);
  });

  it("keeps a rest as a large gap rather than losing it", () => {
    const withRest = notes([[60, 0, 2], [62, 16, 2]]);
    expect(toShape(withRest).notes[1]!.gapSteps).toBe(16);
  });

  it("remembers where the phrase sits in its bar, so a pickup survives", () => {
    expect(toShape(notes([[60, 14, 2], [62, 16, 4]])).startStep).toBe(14);
  });

  it("measures its length from first onset to last release", () => {
    expect(toShape(PHRASE).lengthSteps).toBe(16);
  });

  it("is empty for nothing", () => {
    expect(toShape([])).toEqual({ notes: [], startStep: 0, lengthSteps: 0 });
  });
});

describe("applyShape", () => {
  const shape = toShape(PHRASE);

  it("round-trips a take back to itself", () => {
    expect(applyShape(shape, { rootMidi: 57 })).toEqual(PHRASE);
  });

  it("re-roots the whole line without changing a single interval", () => {
    const moved = applyShape(shape, { rootMidi: 62 });
    expect(moved.map((n) => n.midi)).toEqual([62, 65, 69, 72, 69, 70, 65, 62]);
    expect(moved.map((n) => n.step)).toEqual(PHRASE.map((n) => n.step));
  });

  it("places the phrase where it is asked to", () => {
    expect(applyShape(shape, { rootMidi: 57, startStep: 12 })[0]!.step).toBe(12);
  });

  it("snaps every note into the key it is given", () => {
    // The phrase is minor, so rooting it on D major puts four notes outside the
    // key: F, C, Bb and F again. Each is bent by a semitone and no more.
    const inKey = applyShape(shape, { rootMidi: 62, key: parseKey("D") });
    expect(inKey.map((n) => n.midi)).toEqual([62, 66, 69, 73, 69, 71, 64, 62]);
  });

  it("does not let one snapped note drag the rest of the phrase off pitch", () => {
    // Every interval is a semitone, so without an unsnapped running line the
    // errors would compound and the last note would be nowhere near its target.
    const chromatic = toShape(notes([[60, 0, 2], [61, 2, 2], [62, 4, 2], [63, 6, 2]]));
    expect(applyShape(chromatic, { rootMidi: 60, key: parseKey("C") }).map((n) => n.midi)).toEqual([
      60, 62, 62, 64,
    ]);
  });

  it("breaks a snapping tie in the direction the line was travelling", () => {
    // A tritone up from C lands on F#, equidistant between F and G in C major.
    const up = toShape(notes([[60, 0, 2], [66, 2, 2]]));
    const down = toShape(notes([[72, 0, 2], [66, 2, 2]]));
    expect(applyShape(up, { rootMidi: 60, key: parseKey("C") })[1]!.midi).toBe(67);
    expect(applyShape(down, { rootMidi: 72, key: parseKey("C") })[1]!.midi).toBe(65);
  });

  it("returns nothing for an empty shape", () => {
    expect(applyShape(toShape([]), { rootMidi: 60 })).toEqual([]);
  });
});

describe("formatInterval", () => {
  it("signs the direction", () => {
    expect([formatInterval(3), formatInterval(-5), formatInterval(0)]).toEqual(["+3", "-5", "0"]);
  });
});

describe("summarizeShape", () => {
  const summary = summarizeShape({ name: "limping-waltz-hook", shape: toShape(PHRASE) });

  it("heads with what it is, and says nothing about tempo or key", () => {
    expect(summary.split("\n")[0]).toBe("limping-waltz-hook — shape only · 8 notes · 1 bar · 4/4");
    expect(summary).not.toMatch(/BPM/);
    expect(summary).not.toMatch(/minor|major/);
  });

  it("names no absolute pitch anywhere", () => {
    // A pitch name is a letter with an octave after it — that is the thing this
    // mode exists to remove, so it must not leak into a single line.
    expect(summary).not.toMatch(/\b[A-G][#b]?\d\b/);
  });

  it("writes the intervals and the rhythm", () => {
    expect(summary).toContain("intervals +3 +4 +3 -3 +1 -5 -3");
    expect(summary).toContain("rhythm    x-x-x-x-x-x-x-x-");
    expect(summary).toContain("lengths   2 2 2 2 2 2 2 2 steps");
  });

  it("keeps the shape facts that decide how it gets used", () => {
    expect(summary).toContain("span      10 semitones");
    expect(summary).toContain("climbs and comes back down — peak note 4 in bar 1");
    expect(summary).toContain("phrases   1 bar");
  });

  it("calls out a pickup, since re-rooting is where one gets lost", () => {
    const pickup = summarizeShape({ name: "x", shape: toShape(notes([[60, 14, 2], [62, 16, 4]])) });
    expect(pickup).toContain("pickup    starts 14 steps into the bar");
    expect(summary).not.toContain("pickup");
  });

  it("says so plainly when there is nothing to describe", () => {
    expect(summarizeShape({ name: "empty", shape: toShape([]) })).toBe("empty — nothing to shape.");
  });
});
