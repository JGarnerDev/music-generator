import { describe, it, expect } from "vitest";
import {
  STYLES,
  barSlices,
  buildSection,
  emptyVoices,
  firstOf,
  foldRoots,
  isStyle,
  lastOf,
  octaveUp,
  type SectionContext,
  type Style,
  type Voices,
} from "./sections";
import { barsBeatsToSeconds, notationToSeconds, type Meter } from "@utils/timing";

/** A four-bar section over an Andalusian descent, in whatever style is asked for. */
function ctxFor(style: Style, over: Partial<SectionContext> = {}): SectionContext {
  const bassRoots = ["D2", "C2", "Bb1", "A1"];
  return {
    style,
    startBar: 0,
    figure: "gallop",
    bassRoots,
    guitarRoots: bassRoots.map(octaveUp),
    barRoots: bassRoots,
    approaches: [null, null, null, null],
    ...over,
  };
}

function build(style: Style, over: Partial<SectionContext> = {}): Voices {
  const voices = emptyVoices();
  buildSection(ctxFor(style, over), voices);
  return voices;
}

/** Every note in a bucket, flattened — for span and ordering assertions. */
function times(notes: { time: string }[], meter?: Meter): number[] {
  return notes.map((n) => barsBeatsToSeconds(n.time, 120, meter));
}

describe("the style shelf", () => {
  it("builds every style it names", () => {
    for (const style of STYLES) {
      expect(() => build(style), style).not.toThrow();
    }
  });

  it("recognises its own styles and nothing else", () => {
    expect(isStyle("breakdown")).toBe(true);
    expect(isStyle("chorus")).toBe(false);
    expect(isStyle(undefined)).toBe(false);
  });

  it("throws with the shelf listed when asked for a style that isn't there", () => {
    expect(() => build("chorus" as Style)).toThrow(/unknown section style "chorus".*breakdown/s);
  });

  it("writes nothing outside the section's own bars", () => {
    for (const style of STYLES) {
      const voices = build(style, { startBar: 8 });
      for (const notes of Object.values(voices)) {
        for (const note of notes) {
          const bar = Number(note.time.split(":")[0]);
          expect(bar, `${style} wrote bar ${bar}`).toBeGreaterThanOrEqual(8);
          expect(bar, `${style} wrote bar ${bar}`).toBeLessThan(12);
        }
      }
    }
  });

  it("is deterministic — the same context twice gives the same notes", () => {
    for (const style of STYLES) {
      expect(build(style), style).toEqual(build(style));
    }
  });
});

describe("each style is a different arrangement", () => {
  it("riff drives the bass and doubles it with power chords an octave up", () => {
    const { bass, rhythm } = build("riff");
    expect(bass.length).toBeGreaterThan(4);
    // The fifth is stacked only on the accented hits, so the rhythm part has
    // more notes than the bass but not twice as many.
    expect(rhythm.length).toBeGreaterThan(bass.length);
    expect(rhythm.length).toBeLessThan(bass.length * 2);
  });

  it("motor and riff differ in dynamics, not in rhythm", () => {
    const riff = build("riff");
    const motor = build("motor");
    expect(times(motor.bass)).toEqual(times(riff.bass));
    // The motor's pad sits lower — fuzz and sustained voices fight.
    expect(motor.pad[0]!.velocity!).toBeLessThan(riff.pad[0]!.velocity!);
  });

  it("kit writes no pitched voice at all — the groove is the section", () => {
    const voices = build("kit");
    for (const [name, notes] of Object.entries(voices)) {
      expect(notes, name).toEqual([]);
    }
  });

  it("breakdown drops the engine and leaves held bass under the bell", () => {
    const { bass, rhythm, piano } = build("breakdown");
    expect(rhythm).toEqual([]);
    expect(bass).toHaveLength(4); // one held root per bar, not a figure
    expect(piano.length).toBeGreaterThan(0);
  });

  it("standoff plays no engine until the pickup in its last bar", () => {
    const { bass } = build("standoff");
    // Everything it writes to the bass is the two-beat launch out of bar 3.
    expect(bass.length).toBeGreaterThan(0);
    for (const note of bass) expect(note.time.startsWith("3:")).toBe(true);
    for (const note of bass) expect(Number(note.time.split(":")[1])).toBeGreaterThanOrEqual(2);
  });

  it("rebuild gets heavier: eighths first, the full figure in the last two bars", () => {
    const { bass } = build("rebuild");
    const inBar = (b: number) => bass.filter((n) => n.time.startsWith(`${b}:`));
    expect(inBar(0)).toHaveLength(8); // eighths
    expect(inBar(3).length).toBeGreaterThan(8); // the gallop
  });

  it("climb lifts the tremolo an octave half way through", () => {
    const { lead } = build("climb");
    const first = lead[0]!.pitch;
    const last = lead.at(-1)!.pitch;
    expect(Number(last.replace(/\D/g, ""))).toBeGreaterThan(Number(first.replace(/\D/g, "")));
  });

  it("turnaround is the riff plus one stab a bar", () => {
    const riff = build("riff");
    const turn = build("turnaround");
    expect(times(turn.bass)).toEqual(times(riff.bass));
    expect(turn.piano).toHaveLength(4);
  });
});

describe("split bars", () => {
  it("gives each chord of a split bar its own held pad note", () => {
    const roots = ["D2", ["Bb1", "C2"]] as (string | string[])[];
    const voices = build("breakdown", {
      bassRoots: roots,
      guitarRoots: roots.map(octaveUp),
      barRoots: roots.map(firstOf),
      approaches: [null, null],
    });
    // Bar 0 holds one chord, bar 1 holds two.
    expect(voices.bass.filter((n) => n.time.startsWith("0:"))).toHaveLength(1);
    expect(voices.bass.filter((n) => n.time.startsWith("1:"))).toHaveLength(2);
  });

  it("reads the first and last chord sounding in a bar", () => {
    expect(firstOf(["Bb1", "C2"])).toBe("Bb1");
    expect(lastOf(["Bb1", "C2"])).toBe("C2");
    expect(firstOf("D2")).toBe("D2");
    expect(lastOf("D2")).toBe("D2");
  });
});

describe("barSlices", () => {
  it("holds a whole bar when one chord has it, in any meter", () => {
    expect(barSlices("D2", 0)[0]!.duration).toBe("1m");
    expect(barSlices("D2", 0, [3, 4])[0]!.duration).toBe("1m");
  });

  it("splits the bar evenly and never rings past the next chord", () => {
    const slices = barSlices(["Bb1", "C2"], 2);
    expect(slices.map((s) => s.time)).toEqual(["2:0:0", "2:2:0"]);
    expect(slices.every((s) => s.duration === "2n")).toBe(true);
  });

  it("gives a split bar of 3/4 a dotted quarter each, not a half note", () => {
    const slices = barSlices(["Bb1", "C2"], 0, [3, 4]);
    expect(slices.map((s) => s.duration)).toEqual(["4n.", "4n."]);
    // Two of them exactly fill the bar.
    expect(notationToSeconds("4n.", 120) * 2).toBeCloseTo(
      barsBeatsToSeconds("1:0:0", 120, [3, 4]),
    );
  });
});

describe("meter", () => {
  it("fills a bar of 3/4 rather than overrunning it", () => {
    const roots = ["D2", "C2", "Bb1"];
    const voices = build("riff", {
      figure: "waltz-drive",
      meter: [3, 4],
      bassRoots: roots,
      guitarRoots: roots.map(octaveUp),
      barRoots: roots,
      approaches: [null, null, null],
    });
    // Three hits a bar, and none of them past beat 2.
    expect(voices.bass).toHaveLength(9);
    for (const note of voices.bass) {
      expect(Number(note.time.split(":")[1])).toBeLessThan(3);
    }
  });

  it("refuses a 4/4 figure in 3/4 rather than rotating it against the bar line", () => {
    expect(() =>
      build("riff", {
        meter: [3, 4],
        bassRoots: ["D2"],
        guitarRoots: ["D3"],
        barRoots: ["D2"],
        approaches: [null],
      }),
    ).toThrow(/does not state a whole bar of 3\/4/);
  });
});

describe("foldRoots", () => {
  const LOW: [number, number] = [31, 38]; // G1–D2, the house band
  const HIGH: [number, number] = [43, 55]; // G2–G3, a fifth above it

  it("folds every root of a group into that group's band", () => {
    const roots = foldRoots([{ chords: ["Dm", "C", "Bb", "A"], band: LOW }]);
    expect(roots).toEqual(["D2", "C2", "Bb1", "A1"]);
  });

  it("gives each group its own band, so a section can sit above its neighbour", () => {
    const roots = foldRoots([
      { chords: ["Dm", "C"], band: LOW },
      { chords: ["Dm", "C"], band: HIGH },
    ]);
    expect(roots).toEqual(["D2", "C2", "D3", "C3"]);
  });

  it("returns bars flat and in plan order", () => {
    const roots = foldRoots([
      { chords: ["Dm"], band: LOW },
      { chords: ["Bb", "A"], band: LOW },
      { chords: ["Dm"], band: LOW },
    ]);
    expect(roots).toEqual(["D2", "Bb1", "A1", "D2"]);
  });

  it("folds both halves of a split bar, keeping it an array", () => {
    const roots = foldRoots([{ chords: [["Bb", "C"], "Dm"], band: LOW }]);
    expect(roots).toEqual([["Bb1", "C2"], "D2"]);
  });

  it("stops folding once the band is wide enough to hold the roots as written", () => {
    // Roots are read at octave 2. G1–D2 is too narrow for Bb2/A2, so they fold
    // down and the progression comes out as a descent; two octaves holds them
    // where they were written and it comes out as a rise. Same chords, different
    // shape — which is why `register` is a knob and not a detail.
    expect(foldRoots([{ chords: ["Dm", "C", "Bb", "A"], band: LOW }])).toEqual([
      "D2",
      "C2",
      "Bb1",
      "A1",
    ]);
    expect(foldRoots([{ chords: ["Dm", "C", "Bb", "A"], band: [31, 55] }])).toEqual([
      "D2",
      "C2",
      "Bb2",
      "A2",
    ]);
  });

  it("reads a chord's root, not its bass-note spelling of a quality", () => {
    expect(foldRoots([{ chords: ["Cmaj7", "Cm", "C7"], band: LOW }])).toEqual(["C2", "C2", "C2"]);
  });
});
