import { describe, it, expect } from "vitest";
import { FILLS, FILL_NAMES, fillBars, fillPatterns, isFillName } from "./fill";
import { STEPS_PER_BAR, grooveNotes, validateGroove, type Groove } from "./groove";
import type { Note } from "./composition";

const beat: Groove = {
  patterns: { kick: "X.......X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
};

const barOf = (note: Note): number => Number(note.time.split(":")[0]);
const piecesIn = (notes: Note[], bar: number): Set<string> =>
  new Set(notes.filter((n) => barOf(n) === bar).map((n) => n.pitch));

describe("the fill shelf", () => {
  it("states exactly one bar per lane", () => {
    for (const name of FILL_NAMES) {
      for (const [piece, pattern] of Object.entries(FILLS[name])) {
        expect(pattern.length, `${name}.${piece}`).toBe(STEPS_PER_BAR);
      }
    }
  });

  it("uses only the step vocabulary", () => {
    for (const name of FILL_NAMES) {
      for (const [piece, pattern] of Object.entries(FILLS[name])) {
        expect(pattern, `${name}.${piece}`).toMatch(/^[.xXo]+$/);
      }
    }
  });

  it("builds toward the downbeat rather than away from it", () => {
    // What makes a bar read as a fill is that it *leads in*: more happens in
    // its second half than its first, so the ear is handed to the next phrase.
    for (const name of FILL_NAMES) {
      const lanes = Object.values(FILLS[name]) as string[];
      const hits = (half: string) => [...half].filter((c) => c !== ".").length;
      const early = lanes.reduce((n, lane) => n + hits(lane.slice(0, STEPS_PER_BAR / 2)), 0);
      const late = lanes.reduce((n, lane) => n + hits(lane.slice(STEPS_PER_BAR / 2)), 0);
      expect(late, `${name} does not lead in`).toBeGreaterThan(early);
    }
  });

  it("recognises its own names and nothing else", () => {
    expect(isFillName("tom-tumble")).toBe(true);
    expect(isFillName("paradiddle")).toBe(false);
  });

  it("throws with the shelf listed for a name that isn't there", () => {
    expect(() => fillPatterns("paradiddle" as never)).toThrow(/unknown fill.*tom-tumble/s);
  });
});

describe("fillBars", () => {
  it("marks the end of each phrase, counting from the span's start", () => {
    expect(fillBars(16, 8)).toEqual([7, 15]);
    expect(fillBars(16, 4)).toEqual([3, 7, 11, 15]);
  });

  it("includes the last bar of a loop — the bar before the wrap", () => {
    expect(fillBars(8, 8)).toEqual([7]);
  });

  it("returns nothing for a nonsense interval", () => {
    expect(fillBars(16, 1)).toEqual([]);
    expect(fillBars(16, 0)).toEqual([]);
    expect(fillBars(16, 2.5)).toEqual([]);
  });

  it("skips a phrase that doesn't fit in the span", () => {
    expect(fillBars(6, 8)).toEqual([]);
  });

  it("carries a phrase across two spans via the offset", () => {
    // An eight-bar phrase rendered as two four-bar halves: the first half has
    // no fill, and the second fills its own last bar.
    expect(fillBars(4, 8, 0)).toEqual([]);
    expect(fillBars(4, 8, 4)).toEqual([3]);
  });
});

describe("grooveNotes with a fill", () => {
  const withFill: Groove = { ...beat, fill: "tom-tumble", fillEvery: 4 };

  it("replaces the groove for the fill bar rather than playing over it", () => {
    const notes = grooveNotes(withFill, { startBar: 0, bars: 8 });
    // Bars 0-2 are the beat; bar 3 is the fill and has none of the beat's kit.
    expect(piecesIn(notes, 0)).toEqual(new Set(["kick", "snare", "hat"]));
    expect(piecesIn(notes, 3)).toEqual(new Set(["tom-hi", "tom-mid", "tom-lo"]));
  });

  it("puts one at the end of every phrase", () => {
    const notes = grooveNotes(withFill, { startBar: 0, bars: 8 });
    expect(piecesIn(notes, 7)).toEqual(new Set(["tom-hi", "tom-mid", "tom-lo"]));
    expect(piecesIn(notes, 4)).toEqual(new Set(["kick", "snare", "hat"]));
  });

  it("offsets with the span, so a section fills at its own phrase end", () => {
    const notes = grooveNotes(withFill, { startBar: 16, bars: 4 });
    expect(piecesIn(notes, 19)).toEqual(new Set(["tom-hi", "tom-mid", "tom-lo"]));
    expect(piecesIn(notes, 16)).toEqual(new Set(["kick", "snare", "hat"]));
  });

  it("plays the beat untouched when no fill is stated", () => {
    const plain = grooveNotes(beat, { startBar: 0, bars: 8 });
    for (const bar of [0, 3, 7]) {
      expect(piecesIn(plain, bar)).toEqual(new Set(["kick", "snare", "hat"]));
    }
  });

  it("takes lanes written inline as readily as a name", () => {
    const inline: Groove = { ...beat, fill: { rim: "x.x.x.x.x.x.x.x." }, fillEvery: 4 };
    expect(piecesIn(grooveNotes(inline, { startBar: 0, bars: 4 }), 3)).toEqual(new Set(["rim"]));
  });

  it("scales the fill with the section's intensity, like the rest of the kit", () => {
    const loud = grooveNotes(withFill, { startBar: 0, bars: 4, intensity: 1 });
    const soft = grooveNotes(withFill, { startBar: 0, bars: 4, intensity: 0.5 });
    const peak = (notes: Note[]) =>
      Math.max(...notes.filter((n) => barOf(n) === 3).map((n) => n.velocity!));
    expect(peak(soft)).toBeLessThan(peak(loud));
  });
});

describe("validateGroove — fills", () => {
  it("rejects a fill name that isn't on the shelf", () => {
    const issues = validateGroove({ ...beat, fill: "paradiddle", fillEvery: 8 });
    expect(issues[0]!.path).toBe("groove.fill");
    expect(issues[0]!.message).toMatch(/unknown fill/);
  });

  it("rejects a fill longer than a bar — it would cover the next downbeat", () => {
    const issues = validateGroove({
      ...beat,
      fill: { snare: "x".repeat(32) },
      fillEvery: 8,
    });
    expect(issues[0]!.message).toMatch(/a fill is one bar/);
  });

  it("wants twelve steps for a fill in 3/4", () => {
    expect(validateGroove(
      { patterns: { kick: "X...x...x..." }, fill: { snare: "....x...xxX." }, fillEvery: 4 },
      [3, 4],
    )).toEqual([]);
  });

  it("insists the two fields come as a pair", () => {
    expect(validateGroove({ ...beat, fillEvery: 8 })[0]!.path).toBe("groove.fill");
    expect(validateGroove({ ...beat, fill: "snare-roll" })[0]!.path).toBe("groove.fillEvery");
  });

  it("rejects a phrase length that isn't a phrase", () => {
    const issues = validateGroove({ ...beat, fill: "snare-roll", fillEvery: 1 });
    expect(issues[0]!.path).toBe("groove.fillEvery");
  });

  it("accepts a groove with no fill at all", () => {
    expect(validateGroove(beat)).toEqual([]);
  });
});
