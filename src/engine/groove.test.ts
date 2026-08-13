import { describe, it, expect } from "vitest";
import { grooveNotes, validateGroove, grooveBars, type Groove } from "./groove";
import { validateComposition } from "./composition";

const fourOnTheFloor: Groove = { patterns: { kick: "X...x...X...x..." } };

describe("grooveNotes", () => {
  it("places one note per struck step, on the beat", () => {
    const notes = grooveNotes(fourOnTheFloor, { startBar: 0, bars: 1 });
    expect(notes.map((n) => n.time)).toEqual(["0:0:0", "0:1:0", "0:2:0", "0:3:0"]);
    expect(notes.every((n) => n.pitch === "kick")).toBe(true);
  });

  it("reads accents as dynamics: X > x > o", () => {
    const notes = grooveNotes({ patterns: { snare: "Xxo............." } }, { startBar: 0, bars: 1 });
    const velocities = notes.map((n) => n.velocity!);
    expect(velocities[0]).toBeGreaterThan(velocities[1]!);
    expect(velocities[1]).toBeGreaterThan(velocities[2]!);
  });

  it("repeats a one-bar lane across every bar asked for", () => {
    const notes = grooveNotes(fourOnTheFloor, { startBar: 2, bars: 3 });
    expect(notes).toHaveLength(12);
    expect(notes[0]!.time).toBe("2:0:0");
    expect(notes.at(-1)!.time).toBe("4:3:0");
  });

  it("cycles lanes independently, so a two-bar lane states itself every other bar", () => {
    const groove: Groove = {
      patterns: { kick: "X...............", crash: "X..............................." },
    };
    const notes = grooveNotes(groove, { startBar: 0, bars: 4 });
    expect(notes.filter((n) => n.pitch === "kick")).toHaveLength(4);
    expect(notes.filter((n) => n.pitch === "crash").map((n) => n.time)).toEqual([
      "0:0:0",
      "2:0:0",
    ]);
  });

  it("delays only the off-beat sixteenths when swung", () => {
    const straight = grooveNotes({ patterns: { hat: "xxxx............" } }, { startBar: 0, bars: 1 });
    const swung = grooveNotes(
      { swing: 1, patterns: { hat: "xxxx............" } },
      { startBar: 0, bars: 1 },
    );
    expect(straight.map((n) => n.time)).toEqual(["0:0:0", "0:0:1", "0:0:2", "0:0:3"]);
    // full swing = the off-16th lands a third of a step late (the triplet)
    expect(swung.map((n) => n.time)).toEqual(["0:0:0", "0:0:1.3333", "0:0:2", "0:0:3.3333"]);
  });

  it("swings eighths, not sixteenths, when told to", () => {
    // an eighth-note lane: under 16th swing nothing moves, under 8th swing the
    // off-eighths do — the whole reason swingUnit exists.
    const lane = { hat: "x.x.x.x.x.x.x.x." };
    const sixteenthSwing = grooveNotes({ swing: 1, patterns: lane }, { startBar: 0, bars: 1 });
    const eighthSwing = grooveNotes(
      { swing: 1, swingUnit: "8n", patterns: lane },
      { startBar: 0, bars: 1 },
    );
    expect(sixteenthSwing.map((n) => n.time).slice(0, 4)).toEqual([
      "0:0:0",
      "0:0:2",
      "0:1:0",
      "0:1:2",
    ]);
    expect(eighthSwing.map((n) => n.time).slice(0, 4)).toEqual([
      "0:0:0",
      "0:0:2.6667",
      "0:1:0",
      "0:1:2.6667",
    ]);
  });

  it("scales dynamics with intensity, staying inside 0..1", () => {
    const quiet = grooveNotes(fourOnTheFloor, { startBar: 0, bars: 1, intensity: 0.5 });
    const loud = grooveNotes(fourOnTheFloor, { startBar: 0, bars: 1, intensity: 4 });
    expect(quiet[0]!.velocity).toBeCloseTo(0.475, 3);
    expect(loud[0]!.velocity).toBe(1);
  });

  it("lets open cymbals ring longer than closed hits", () => {
    const notes = grooveNotes(
      { patterns: { hat: "x...............", "open-hat": "....x..........." } },
      { startBar: 0, bars: 1 },
    );
    expect(notes.find((n) => n.pitch === "hat")!.duration).toBe("16n");
    expect(notes.find((n) => n.pitch === "open-hat")!.duration).toBe("8n");
  });

  it("emits notes a composition accepts", () => {
    const notes = grooveNotes(
      { swing: 0.3, patterns: { kick: "X...x...X...x...", hat: "x.o.x.o.x.o.x.o." } },
      { startBar: 0, bars: 2 },
    );
    const issues = validateComposition({
      name: "t",
      bpm: 90,
      key: "A minor",
      tracks: [{ instrument: "drums", notes }],
    });
    expect(issues).toEqual([]);
  });

  it("is deterministic", () => {
    const opts = { startBar: 1, bars: 2 };
    expect(grooveNotes(fourOnTheFloor, opts)).toEqual(grooveNotes(fourOnTheFloor, opts));
  });
});

describe("validateGroove", () => {
  it("accepts a well-formed groove", () => {
    expect(validateGroove({ swing: 0.2, patterns: { kick: "X...x...X...x..." } })).toEqual([]);
  });

  it("rejects an unknown kit piece", () => {
    const issues = validateGroove({ patterns: { kicks: "X..............." } });
    expect(issues[0]!.path).toBe("groove.patterns.kicks");
    expect(issues[0]!.message).toContain("unknown drum piece");
  });

  it("rejects a lane that is not a whole number of bars", () => {
    const issues = validateGroove({ patterns: { kick: "X.............." } });
    expect(issues[0]!.message).toContain("multiple of 16");
  });

  it("rejects unknown step characters", () => {
    const issues = validateGroove({ patterns: { kick: "X...!...X...x..." } });
    expect(issues[0]!.message).toContain('may only use');
  });

  it("rejects swing outside 0..1 and an empty pattern set", () => {
    expect(validateGroove({ swing: 2, patterns: { kick: "X..............." } })[0]!.path).toBe(
      "groove.swing",
    );
    expect(validateGroove({ patterns: {} })[0]!.path).toBe("groove.patterns");
  });
});

describe("grooveBars", () => {
  it("reports the longest lane in bars", () => {
    expect(grooveBars({ patterns: { kick: "X...............", crash: "X".padEnd(32, ".") } })).toBe(2);
    expect(grooveBars({ patterns: {} })).toBe(0);
  });
});
