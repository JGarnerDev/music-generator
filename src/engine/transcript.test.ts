import { describe, it, expect } from "vitest";
import { parseKey, type QuantizedNote } from "./transcribe";
import {
  confirmChecklist,
  describeContour,
  findPhrases,
  groupByBar,
  rhythmLane,
  summarizeTranscript,
  type ConfirmContext,
} from "./transcript";

/** `[midi, step, lengthSteps]` → a quantized note, so a test reads as a rhythm. */
function notes(spec: ReadonlyArray<[number, number, number]>): QuantizedNote[] {
  return spec.map(([midi, step, lengthSteps]) => ({ midi, step, lengthSteps, velocity: 0.7 }));
}

/** The phrase used across these tests: A minor, 1 b3 5 b7 5 b6 b3 1 in eighths. */
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

describe("groupByBar", () => {
  it("buckets notes by the bar their onset falls in", () => {
    const bars = groupByBar(notes([
      [60, 0, 4],
      [62, 15, 1],
      [64, 16, 4],
      [65, 50, 4], // bar 4, leaving bar 3 empty
    ]));
    expect(bars.map((b) => b.length)).toEqual([2, 1, 0, 1]);
  });

  it("counts bars in the meter it is given", () => {
    expect(groupByBar(notes([[60, 12, 4]]), [3, 4])).toHaveLength(2);
    expect(groupByBar(notes([[60, 12, 4]]), [4, 4])).toHaveLength(1);
  });

  it("returns nothing for nothing", () => {
    expect(groupByBar([])).toEqual([]);
  });
});

describe("rhythmLane", () => {
  it("marks onsets, sustain and silence", () => {
    expect(rhythmLane(notes([[60, 0, 4], [62, 8, 2]]), 0)).toBe("x---....x-......");
  });

  it("clips a note that rings past the bar line", () => {
    const held = notes([[60, 12, 8]]);
    expect(rhythmLane(held, 0)).toBe("............x---");
    expect(rhythmLane(held, 1)).toBe("----............");
  });

  it("lets an onset win over another note's sustain", () => {
    expect(rhythmLane(notes([[60, 0, 8], [64, 4, 4]]), 0)).toBe("x---x---........");
  });

  it("is all silence for a bar with nothing in it", () => {
    expect(rhythmLane(notes([[60, 0, 2]]), 1)).toBe("................");
  });
});

describe("describeContour", () => {
  it("names a line that climbs and comes back down an arch", () => {
    const contour = describeContour([57, 60, 67, 60, 57]);
    expect(contour.shape).toBe("arch");
    expect(contour.peakIndex).toBe(2);
    expect(contour.rangeSemitones).toBe(10);
  });

  it("names a line that dips and recovers a valley", () => {
    expect(describeContour([67, 60, 57, 62, 67]).shape).toBe("valley");
  });

  it("names a line that ends high rising, and one that ends low falling", () => {
    expect(describeContour([57, 60, 64, 67]).shape).toBe("rising");
    expect(describeContour([67, 64, 60, 57]).shape).toBe("falling");
  });

  it("does not call a peak an arch when the line stays up", () => {
    // Peaks in the middle but ends only a semitone below it — it never came back.
    expect(describeContour([57, 67, 66]).shape).toBe("rising");
  });

  it("calls a line that goes nowhere wandering, and one note static", () => {
    expect(describeContour([60, 62, 60, 61, 60]).shape).toBe("wandering");
    expect(describeContour([60, 60, 61]).shape).toBe("static");
  });

  it("throws on no notes", () => {
    expect(() => describeContour([])).toThrow();
  });
});

describe("findPhrases", () => {
  it("keeps a continuous run as one phrase", () => {
    expect(findPhrases(PHRASE)).toHaveLength(1);
  });

  it("splits at a rest of a beat or more", () => {
    const withGap = notes([
      [60, 0, 2],
      [62, 2, 2],
      [64, 8, 2], // four steps of silence before this
      [65, 10, 2],
    ]);
    const phrases = findPhrases(withGap);
    expect(phrases.map((p) => p.noteCount)).toEqual([2, 2]);
    expect(phrases.map((p) => p.startStep)).toEqual([0, 8]);
  });

  it("does not split on a rest shorter than the threshold", () => {
    expect(findPhrases(notes([[60, 0, 2], [62, 5, 2]]))).toHaveLength(1);
  });

  it("measures a phrase from its first onset to its last release", () => {
    expect(findPhrases(PHRASE)[0]).toMatchObject({ startStep: 0, endStep: 16, lengthSteps: 16 });
  });

  it("returns nothing for nothing", () => {
    expect(findPhrases([])).toEqual([]);
  });
});

describe("summarizeTranscript", () => {
  const summary = summarizeTranscript({
    name: "limping-waltz-hook",
    bpm: 90,
    key: parseKey("Am"),
    notes: PHRASE,
  });

  it("heads with what the piece is", () => {
    expect(summary.split("\n")[0]).toBe("limping-waltz-hook — 8 notes · 1 bar · A minor · 90 BPM · 4/4");
  });

  it("writes degrees rather than pitches when it knows the key", () => {
    expect(summary).toContain("degrees   1 b3 5 b7 5 b6 b3 1");
  });

  it("falls back to pitches when it does not", () => {
    const keyless = summarizeTranscript({ name: "x", bpm: 90, notes: PHRASE });
    expect(keyless).toContain("pitches   A3 C4 E4 G4 E4 F4 C4 A3");
    expect(keyless).toContain("key unknown");
  });

  it("shows the rhythm and the shape", () => {
    expect(summary).toContain("rhythm    x-x-x-x-x-x-x-x-");
    expect(summary).toContain("climbs and comes back down — peak b7 in bar 1");
    expect(summary).toContain("range     A3–G4 (10 semitones)");
  });

  it("calls out the notes from outside the key", () => {
    const blue = notes([[57, 0, 4], [63, 4, 4], [64, 8, 4]]); // A, Eb (b5), E
    const withBlue = summarizeTranscript({ name: "x", bpm: 90, key: parseKey("Am"), notes: blue });
    expect(withBlue).toContain("outside   b5 (bar 1)");
  });

  it("says nothing about outside notes when everything is in the key", () => {
    expect(summary).not.toContain("outside");
  });

  it("points out a bar that repeats the one before it", () => {
    const twice = [...PHRASE, ...PHRASE.map((n) => ({ ...n, step: n.step + 16 }))];
    expect(summarizeTranscript({ name: "x", bpm: 90, notes: twice })).toContain("bar 2 repeats the bar before");
  });

  it("flags square phrasing, since that is the default worth avoiding", () => {
    const square = notes([
      [60, 0, 2],
      [62, 2, 2],
      [64, 16, 2],
      [65, 18, 2],
    ]);
    expect(summarizeTranscript({ name: "x", bpm: 90, notes: square })).toContain("square");
  });

  it("does not round a ragged phrase length into a tidy one", () => {
    const ragged = notes([[60, 0, 2], [62, 2, 2], [64, 4, 21]]); // 25 steps = 6.25 beats
    expect(summarizeTranscript({ name: "x", bpm: 90, notes: ragged })).toContain("phrases   6.25 beats");
  });

  it("reports how much of the grid is actually sounding", () => {
    expect(summary).toContain("density   8 notes over 16 steps, 100% sounding");
  });

  it("says so plainly when there is nothing to describe", () => {
    expect(summarizeTranscript({ name: "empty", bpm: 90, notes: [] })).toBe("empty — nothing detected.");
  });
});

describe("confirmChecklist", () => {
  const base: ConfirmContext = {
    slug: "lioness-hook",
    takeName: "lioness-hook.take",
    bpm: 90,
    bpmSource: "given",
    grid: 4,
    minAmplitude: 0.2,
    mode: "literal",
    hasKey: true,
  };

  it("names both rows to play against each other", () => {
    expect(confirmChecklist(base).split("\n")[0]).toBe(
      "confirm it — play lioness-hook against lioness-hook.take in the bench (npm run dev)",
    );
  });

  /** The checklist rows: a symptom, then three spaces, then the flag that fixes it. */
  const rows = (text: string) => text.split("\n").filter((line) => /\s{3}--/.test(line));

  it("leads with tempo when the tempo was guessed", () => {
    const first = rows(confirmChecklist({ ...base, bpmSource: "estimated", confidence: 0.55 }))[0]!;
    expect(first).toContain("drifts against the take");
    expect(first).toContain("confidence 0.55");
  });

  it("puts tempo last when it was given, since that is the least likely culprit", () => {
    expect(rows(confirmChecklist(base)).at(-1)).toContain("drifts against the take");
  });

  it("suggests amplitude in both directions from where it is", () => {
    const text = confirmChecklist({ ...base, minAmplitude: 0.3 });
    expect(text).toContain("--min-amplitude 0.4");
    expect(text).toContain("--min-amplitude 0.2");
  });

  it("clamps an amplitude suggestion into 0..1 rather than offering an impossible flag", () => {
    expect(confirmChecklist({ ...base, minAmplitude: 0.95 })).toContain("--min-amplitude 1");
    expect(confirmChecklist({ ...base, minAmplitude: 0.05 })).toContain("--min-amplitude 0");
  });

  it("only offers the grid directions that exist", () => {
    const finest = confirmChecklist(base);
    expect(finest).toContain("--grid 2");
    expect(finest).not.toContain("flattened");

    const coarsest = confirmChecklist({ ...base, grid: 1 });
    expect(coarsest).toContain("flattened");
    expect(coarsest).not.toContain("offbeats");

    const middle = confirmChecklist({ ...base, grid: 2 });
    expect(middle).toContain("--grid 1");
    expect(middle).toContain("--grid 4");
  });

  it("says every fix is a requantize, because that is what makes the loop worth going round", () => {
    expect(confirmChecklist(base)).toContain("--requantize");
  });

  it("tells the listener to ignore pitch in shape mode", () => {
    expect(confirmChecklist({ ...base, mode: "shape" })).toContain("the pitches are meant to differ");
    expect(confirmChecklist(base)).not.toContain("meant to differ");
  });

  it("asks for a key when it did not get one", () => {
    expect(confirmChecklist({ ...base, hasKey: false })).toContain("No --key was given");
    expect(confirmChecklist(base)).not.toContain("No --key");
  });

  it("sends a mis-aligned take back to the microphone rather than to a flag", () => {
    expect(confirmChecklist(base)).toContain("one-bar count-in");
  });
});
