import { describe, it, expect } from "vitest";
import {
  FIGURES,
  FIGURE_NAMES,
  figureLine,
  isFigureName,
  powerChordFigure,
  validateFigure,
  type FigureName,
} from "./figure";

describe("the figure shelf", () => {
  it("every figure is internally valid", () => {
    for (const name of FIGURE_NAMES) {
      expect(validateFigure(FIGURES[name]), name).toEqual([]);
    }
  });

  it("every figure has a summary worth printing", () => {
    for (const name of FIGURE_NAMES) {
      expect(FIGURES[name].summary.length, name).toBeGreaterThan(20);
    }
  });

  it("no two figures are the same rhythm", () => {
    const cells = FIGURE_NAMES.map((n) => `${FIGURES[n].resolution}:${FIGURES[n].steps}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("recognises its own names and nothing else", () => {
    expect(isFigureName("gallop")).toBe(true);
    expect(isFigureName("3+3+2")).toBe(true);
    expect(isFigureName("shuffle")).toBe(false);
    expect(isFigureName(undefined)).toBe(false);
  });

  it("throws with the shelf listed when asked for a figure that isn't there", () => {
    expect(() => figureLine("shuffle" as FigureName, { startBar: 0, roots: ["A1"] })).toThrow(
      /unknown figure "shuffle".*gallop/s,
    );
  });
});

describe("figureLine", () => {
  it("reads a step string into timed hits", () => {
    const notes = figureLine("3+3+2", { startBar: 0, roots: ["A1"] });
    expect(notes.map((n) => n.time)).toEqual([
      "0:0:0", "0:0:3", "0:1:2", "0:2:0", "0:2:3", "0:3:2",
    ]);
  });

  it("derives each duration from the gap to the next hit", () => {
    // 3+3+2: dotted eighth, dotted eighth, eighth — and the last hit runs into
    // the next repeat of the cell, not off the end of the bar
    const notes = figureLine("3+3+2", { startBar: 0, roots: ["A1"] });
    expect(notes.map((n) => n.duration)).toEqual(["8n.", "8n.", "8n", "8n.", "8n.", "8n"]);
  });

  it("honours a fixed duration where the figure is stabs, not legato", () => {
    const notes = figureLine("four-on-floor-stab", { startBar: 0, roots: ["A1"] });
    // a quarter-note grid, but each hit is short — the gaps are the point
    expect(notes.map((n) => n.time)).toEqual(["0:0:0", "0:1:0", "0:2:0", "0:3:0"]);
    expect(notes.every((n) => n.duration === "8n")).toBe(true);
  });

  it("puts triplet figures on fractional sixteenths", () => {
    const notes = figureLine("triplet-canter", { startBar: 2, roots: ["A1"] });
    expect(notes.slice(0, 4).map((n) => n.time)).toEqual([
      "2:0:0", "2:0:2.6667", "2:1:0", "2:1:2.6667",
    ]);
    expect(notes.slice(0, 2).map((n) => n.duration)).toEqual(["4t", "8t"]);
  });

  it("advances one bar per root", () => {
    const notes = figureLine("straight-eighths", { startBar: 4, roots: ["A1", "Bb1"] });
    expect(notes[8]).toMatchObject({ time: "5:0:0", pitch: "Bb1" });
  });

  it("puts the approach note on the last hit of its bar only", () => {
    const notes = figureLine("half-time-chug", {
      startBar: 0,
      roots: ["A1", "A1"],
      approaches: ["Bb1", null],
    });
    expect(notes.map((n) => `${n.time} ${n.pitch}`)).toEqual([
      "0:0:0 A1", "0:2:0 Bb1", "1:0:0 A1", "1:2:0 A1",
    ]);
  });

  it("maps accent characters onto velocities", () => {
    const notes = figureLine("gallop", { startBar: 0, roots: ["D2"], accent: 0.95, ghost: 0.8 });
    expect(notes[0]!.velocity).toBe(0.95); // X, beat 0
    expect(notes[1]!.velocity).toBe(0.8); // o
    expect(notes[3]!.velocity).toBeCloseTo(0.88); // x, beat 1 backed off by `secondary`
  });

  it("ghosts the downbeat where the figure says to", () => {
    const notes = figureLine("pushed-eighths", { startBar: 0, roots: ["A2"], accent: 0.9, ghost: 0.6 });
    expect(notes[0]).toMatchObject({ time: "0:0:0", velocity: 0.6 });
    expect(notes[1]).toMatchObject({ time: "0:0:2", velocity: 0.9 });
  });

  it("cycles a multi-bar cell against the roots", () => {
    // bar 1 of the cell hits the downbeat, bar 2 answers on beat 3
    const twoBar = {
      ...FIGURES["half-time-chug"],
      steps: "X...............x.......x.......",
    };
    const notes = figureLine(twoBar, { startBar: 0, roots: ["A1", "C2", "A1"] });
    expect(notes.map((n) => `${n.time} ${n.pitch}`)).toEqual([
      "0:0:0 A1", "1:0:0 C2", "1:2:0 C2", "2:0:0 A1",
    ]);
  });

  it("splits a bar between roots when the entry is an array", () => {
    const notes = figureLine("straight-eighths", { startBar: 0, roots: [["A1", "C2"]] });
    expect(notes.map((n) => `${n.time} ${n.pitch}`)).toEqual([
      "0:0:0 A1", "0:0:2 A1", "0:1:0 A1", "0:1:2 A1",
      "0:2:0 C2", "0:2:2 C2", "0:3:0 C2", "0:3:2 C2",
    ]);
  });

  it("changes on the beat when a bar names four roots", () => {
    const notes = figureLine("four-on-floor-stab", {
      startBar: 0,
      roots: [["A1", "Bb1", "C2", "Bb1"]],
    });
    expect(notes.map((n) => n.pitch)).toEqual(["A1", "Bb1", "C2", "Bb1"]);
  });

  it("never rings a note through a chord change inside the bar", () => {
    // half-time-chug holds 2n; against four chords a hit may only hold a beat
    const whole = figureLine("half-time-chug", { startBar: 0, roots: ["A1"] });
    expect(whole.every((n) => n.duration === "2n")).toBe(true);
    const split = figureLine("half-time-chug", { startBar: 0, roots: [["A1", "Bb1", "C2", "D2"]] });
    expect(split.map((n) => `${n.pitch}/${n.duration}`)).toEqual(["A1/4n", "C2/4n"]);
  });

  it("puts the approach on the last hit of a split bar too", () => {
    const notes = figureLine("straight-eighths", {
      startBar: 0,
      roots: [["A1", "C2"]],
      approaches: ["Db2"],
    });
    expect(notes.at(-1)).toMatchObject({ time: "0:3:2", pitch: "Db2" });
  });

  it("refuses an inline figure that would rotate against the bar line", () => {
    expect(() =>
      figureLine({ ...FIGURES.gallop, steps: "X.oox.oo" }, { startBar: 0, roots: ["A1"] }),
    ).toThrow(/invalid inline figure/);
  });
});

describe("powerChordFigure", () => {
  it("stacks a fifth on the hits the figure names and no others", () => {
    const notes = powerChordFigure("gallop", { startBar: 0, roots: ["D3"] });
    expect(notes.filter((n) => n.time === "0:0:0").map((n) => n.pitch)).toEqual(["D3", "A3"]);
    expect(notes.filter((n) => n.time === "0:0:2").map((n) => n.pitch)).toEqual(["D3"]);
  });

  it("voices the fifth below the root", () => {
    const [root, fifth] = powerChordFigure("3+3+2", { startBar: 0, roots: ["D3"], accent: 0.9 });
    expect(fifth!.pitch).toBe("A3");
    expect(fifth!.velocity!).toBeLessThan(root!.velocity!);
  });

  it("does not stack the ghosted downbeats of a pushed figure", () => {
    const notes = powerChordFigure("pushed-eighths", { startBar: 0, roots: ["A2"] });
    expect(notes.filter((n) => n.time === "0:0:0")).toHaveLength(1);
    expect(notes.filter((n) => n.time === "0:0:2")).toHaveLength(2);
  });

  it("keeps a chorded approach note in the chord", () => {
    // half-time-chug's last hit is an accent, so the approach arrives voiced
    const notes = powerChordFigure("half-time-chug", {
      startBar: 0,
      roots: ["A2"],
      approaches: ["Bb2"],
    });
    expect(notes.filter((n) => n.time === "0:2:0").map((n) => n.pitch)).toEqual(["Bb2", "F3"]);
  });
});

describe("validateFigure", () => {
  const base = { steps: "X...x...X...x...", resolution: 4, secondary: -0.07, chordOn: "Xx", summary: "x" };

  it("accepts a whole number of bars", () => {
    expect(validateFigure({ ...base, steps: base.steps.repeat(2) })).toEqual([]);
  });

  it("rejects a length that would rotate against the bar line", () => {
    expect(validateFigure({ ...base, steps: "X...x...X...x.." })).toMatchObject([
      { path: "figure.steps", message: expect.stringContaining("multiple of 16") },
    ]);
  });

  it("rejects unknown step characters", () => {
    expect(validateFigure({ ...base, steps: "Z...............".repeat(1) })).toMatchObject([
      { path: "figure.steps", message: expect.stringContaining('may only use') },
      { path: "figure.steps", message: expect.stringContaining("at least one hit") },
    ]);
  });

  it("rejects a resolution that is neither sixteenths nor triplets", () => {
    expect(validateFigure({ ...base, resolution: 6 })).toMatchObject([
      { path: "figure.resolution", message: expect.stringContaining("must be 3") },
    ]);
  });

  it("rejects a non-object", () => {
    expect(validateFigure(null)).toMatchObject([{ path: "figure" }]);
  });
});
