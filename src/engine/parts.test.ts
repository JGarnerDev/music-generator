import { describe, it, expect } from "vitest";
import { Note as TonalNote } from "tonal";
import { arpLine, bassLine, bassPatternFromKick, compLine, BASS_BAND } from "./parts";
import { voiceLead } from "./theory";

const midi = (pitch: string): number => TonalNote.midi(pitch)!;

describe("bassLine", () => {
  it("strikes the pattern's steps, one root per bar", () => {
    const notes = bassLine({
      startBar: 0,
      roots: ["A2", "F2"],
      pattern: "X.......X.......",
    });
    expect(notes.map((n) => [n.time, n.pitch])).toEqual([
      ["0:0:0", "A2"],
      ["0:2:0", "A2"],
      ["1:0:0", "F2"],
      ["1:2:0", "F2"],
    ]);
  });

  it("folds roots into one octave so the line never leaps", () => {
    const notes = bassLine({
      startBar: 0,
      roots: ["A1", "F4", "C3"],
      pattern: "X...............",
    });
    for (const note of notes) {
      expect(midi(note.pitch)).toBeGreaterThanOrEqual(BASS_BAND[0]);
      expect(midi(note.pitch)).toBeLessThanOrEqual(BASS_BAND[1]);
    }
  });

  it("plays the approach note on the bar's last hit only", () => {
    const notes = bassLine({
      startBar: 0,
      roots: ["A2", "F2"],
      pattern: "X...X...X...X...",
      approaches: ["E2", null],
    });
    const firstBar = notes.filter((n) => n.time.startsWith("0:"));
    expect(firstBar.map((n) => n.pitch)).toEqual(["A2", "A2", "A2", "E2"]);
  });

  it("skips the approach when the bar's last hit isn't leading into the next bar", () => {
    // Last hit on beat 2 of 4: an approach there is a wrong root held half a
    // bar, not a lead-in.
    const notes = bassLine({
      startBar: 0,
      roots: ["A2", "F2"],
      pattern: "X.....x.........",
      approaches: ["E2", null],
    });
    expect(notes.filter((n) => n.time.startsWith("0:")).map((n) => n.pitch)).toEqual(["A2", "A2"]);
  });

  it("rings each note up to the next hit, so a sparse pattern sustains", () => {
    const sparse = bassLine({ startBar: 0, roots: ["A2"], pattern: "X..............." });
    const busy = bassLine({ startBar: 0, roots: ["A2"], pattern: "X.X.X.X.X.X.X.X." });
    expect(sparse[0]!.duration).toBe("1m");
    expect(busy[0]!.duration).toBe("8n");
  });

  it("caps sustain when asked, leaving space instead of a held note", () => {
    const notes = bassLine({
      startBar: 0,
      roots: ["A2"],
      pattern: "X...............",
      maxSustain: 4,
    });
    expect(notes[0]!.duration).toBe("4n");
  });

  it("takes swing from the kit so the two lock", () => {
    const notes = bassLine({
      startBar: 0,
      roots: ["A2"],
      pattern: "x.x.x.x.x.x.x.x.",
      swing: 1,
      swingUnit: "8n",
    });
    expect(notes.map((n) => n.time).slice(0, 2)).toEqual(["0:0:0", "0:0:2.6667"]);
  });
});

describe("compLine", () => {
  it("states the whole voicing on each struck step", () => {
    const notes = compLine({
      startBar: 0,
      voicings: [["A3", "C4", "E4"]],
      pattern: "....X.......X...",
    });
    expect(notes.map((n) => n.time)).toEqual(["0:1:0", "0:1:0", "0:1:0", "0:3:0", "0:3:0", "0:3:0"]);
    expect(notes.slice(0, 3).map((n) => n.pitch)).toEqual(["A3", "C4", "E4"]);
  });

  it("backs off the upper voices so the stack reads as one chord", () => {
    const notes = compLine({ startBar: 0, voicings: [["A3", "C4", "E4"]], pattern: "X..............." });
    expect(notes[0]!.velocity!).toBeGreaterThan(notes[1]!.velocity!);
    expect(notes[1]!.velocity!).toBeGreaterThan(notes[2]!.velocity!);
  });

  it("follows the voice-led chords bar by bar", () => {
    const first = voiceLead("Am", null, 3);
    const second = voiceLead("F", first);
    const notes = compLine({
      startBar: 0,
      voicings: [first, second],
      pattern: "X...............",
    });
    expect(notes.filter((n) => n.time === "1:0:0").map((n) => n.pitch)).toEqual(second);
  });

  it("writes nothing for a bar with no voicing rather than throwing", () => {
    const notes = compLine({ startBar: 0, voicings: [[]], pattern: "X..............." });
    expect(notes).toEqual([]);
  });
});

describe("arpLine", () => {
  it("advances one chord tone per struck step, across bars", () => {
    const notes = arpLine({
      startBar: 0,
      voicings: [["A3", "C4", "E4"], ["F3", "A3", "C4"]],
      pattern: "X...X...X...X...",
    });
    // The cursor carries across the bar line: bar 2 starts on the second tone.
    expect(notes.map((n) => n.pitch)).toEqual([
      "A3", "C4", "E4", "A3",
      "A3", "C4", "F3", "A3",
    ]);
  });

  it("descends when told to", () => {
    const notes = arpLine({
      startBar: 0,
      voicings: [["A3", "C4", "E4"]],
      pattern: "X...X...X.......",
      direction: "down",
    });
    expect(notes.map((n) => n.pitch)).toEqual(["E4", "C4", "A3"]);
  });

  it("turns around without repeating the outer notes", () => {
    const notes = arpLine({
      startBar: 0,
      voicings: [["A3", "C4", "E4"]],
      pattern: "X.X.X.X.........",
      direction: "updown",
    });
    expect(notes.map((n) => n.pitch)).toEqual(["A3", "C4", "E4", "C4"]);
  });
});

describe("bassPatternFromKick", () => {
  it("keeps the kick's hits so bass and kick land together", () => {
    expect(bassPatternFromKick("X..x..X..x......")).toBe("X..x..X..x......");
  });

  it("drops ghost notes — a bass can't articulate them", () => {
    expect(bassPatternFromKick("X..o..X.........")).toBe("X.....X.........");
  });

  it("always states the downbeat, even when the kick starts late", () => {
    expect(bassPatternFromKick("....X.......X...")).toBe("x...X.......X...");
  });

  it("preserves multi-bar length", () => {
    const twoBar = "X.......X...............X.......";
    expect(bassPatternFromKick(twoBar)).toHaveLength(twoBar.length);
  });

  it("is empty for an empty lane", () => {
    expect(bassPatternFromKick("")).toBe("");
  });
});
