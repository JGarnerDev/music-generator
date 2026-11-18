import { describe, expect, it } from "vitest";
import { offsetNotes, planBendIssues, withoutBends, type PlanNote } from "./plan-note";

describe("offsetNotes", () => {
  it("moves notes onto the timeline by the section's start bar", () => {
    expect(offsetNotes([["1:2:0", "D5", "4n", 0.7]], 8)).toEqual([
      { time: "9:2:0", pitch: "D5", duration: "4n", velocity: 0.7 },
    ]);
  });

  it("carries a fifth-entry bend onto the note", () => {
    const bend = { semitones: 1, curve: "meend" as const };
    expect(offsetNotes([["0:1:0", "D5", "2n.", 0.66, bend]], 2)).toEqual([
      { time: "2:1:0", pitch: "D5", duration: "2n.", velocity: 0.66, bend },
    ]);
  });

  it("marks a fifth-entry \"legato\" note as hammered rather than picked", () => {
    expect(offsetNotes([["0:0:1", "E5", "16n", 0.7, "legato"]], 4)).toEqual([
      { time: "4:0:1", pitch: "E5", duration: "16n", velocity: 0.7, legato: true },
    ]);
  });

  it("writes no bend field on a note that has none", () => {
    expect(offsetNotes([["0:0:0", "A4", "4n", 0.5]], 0)[0]).not.toHaveProperty("bend");
  });
});

describe("planBendIssues", () => {
  it("accepts notes without bends and well-formed bends", () => {
    const notes: PlanNote[] = [
      ["0:0:0", "A4", "4n", 0.5],
      ["0:1:0", "D5", "2n.", 0.6, { semitones: 1, at: 0.4, over: 0.3, curve: "meend" }],
    ];
    expect(planBendIssues(notes, "melody")).toEqual([]);
  });

  it("names the note and the field when a bend is malformed", () => {
    const issues = planBendIssues(
      [["0:0:0", "A4", "4n", 0.5], ["0:1:0", "D5", "2n", 0.6, { semitones: 0 }]],
      "melody",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^melody\[1\]\.bend\.semitones: /);
  });
});

describe("planBendIssues on legato", () => {
  it("accepts \"legato\" and names any other string", () => {
    expect(planBendIssues([["0:0:0", "E5", "16n", 0.7, "legato"]], "lead")).toEqual([]);
    const bad = [["0:0:0", "E5", "16n", 0.7, "tap"]] as unknown as PlanNote[];
    expect(planBendIssues(bad, "lead")).toEqual(['lead[0][4]: "tap" is not "legato" or a bend']);
  });
});

describe("withoutBends", () => {
  it("strips the bend so a derived line plays the written pitch", () => {
    const bent = { time: "0:0:0", pitch: "F#4", duration: "2n", velocity: 0.6, bend: { semitones: 1 } };
    expect(withoutBends([bent])).toEqual([{ time: "0:0:0", pitch: "F#4", duration: "2n", velocity: 0.6 }]);
  });
});
