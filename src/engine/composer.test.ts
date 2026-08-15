import { describe, it, expect } from "vitest";
import { composeFromPalette, composeFromBlend } from "./composer";
import { blendPalettes } from "./blend";
import { parsePalette, type Palette } from "./palette";
import { validateComposition, type Composition, type Note } from "./composition";
import { pitchToMidi } from "./theory";

const sad: Palette = parsePalette(`---
slug: sad
title: Sad
tags: [sad, grief]
tonality:
  tonic: A
  scale: minor
progressions:
  - [i, VI, III, VII]
  - [i, iv, i, V]
tempo: [60, 78]
instruments: [piano, pad]
---
body`);

const withBeat: Palette = parsePalette(`---
kind: genre
slug: lofi
title: Lo-Fi
tags: [lofi]
tempo: [70, 90]
groove:
  swing: 0.4
  swingUnit: 8n
  patterns:
    kick: "X.....x........."
    snare: "........X......."
    hat: "x.o.x.o.x.o.x.o."
---
body`);

const busyBeat: Palette = parsePalette(`---
kind: genre
slug: funk
title: Funk
tags: [funk]
tempo: [95, 110]
groove:
  patterns:
    kick: "X..x..X...x..x.."
    snare: "....X.......X..x"
    hat: "x.x.x.x.x.x.x.x."
---
body`);

const barOf = (note: Note): number => Number(note.time.split(":")[0]);
/** Position within the bar, in sixteenths — parts are performed, so it is fractional. */
const sixteenthOf = (note: Note): number => {
  const [, beat = "0", sixteenth = "0"] = note.time.split(":");
  return Number(beat) * 4 + Number(sixteenth);
};
const trackNotes = (comp: Composition, instrument: string): Note[] =>
  comp.tracks.filter((t) => t.instrument === instrument).flatMap((t) => t.notes);

describe("form", () => {
  it("states the progression twice and lands on a tonic bar", () => {
    // [i, VI, III, VII] and [i, iv, i, V] are both 4 bars: 4 + 4 + resolution.
    const comp = composeFromPalette(sad, "two passes");
    const lastBar = Math.max(...comp.tracks.flatMap((t) => t.notes.map(barOf)));
    expect(lastBar).toBe(8);
  });

  it("resolves every voice together on the final bar", () => {
    const comp = composeFromPalette(sad, "landing");
    const final = comp.tracks.flatMap((t) => t.notes.filter((n) => barOf(n) === 8));
    expect(final.every((n) => n.time === "8:0:0")).toBe(true);
    // The tonic, in whichever octave the piece's register put the rest of the
    // line — an arrival an octave from what led to it is heard as a wrong note.
    expect(trackNotes(comp, "bass").at(-1)!.pitch).toMatch(/^A\d$/);
  });

  it("voice-leads the chords instead of leaping to root position each bar", () => {
    // One progression, so the assertion doesn't depend on which the seed picks.
    const aeolian: Palette = parsePalette(`---
slug: aeolian
title: Aeolian
tags: [aeolian]
tonality:
  tonic: A
  scale: minor
progressions:
  - [i, VI, III, VII]
tempo: [70, 70]
instruments: [piano, pad]
---
body`);
    // Am -> F holds A and C; root position would restate the whole hand lower.
    const bar1 = trackNotes(composeFromPalette(aeolian, "smooth"), "pad").filter(
      (n) => barOf(n) === 1,
    );
    expect(new Set(bar1.map((n) => n.pitch))).toEqual(new Set(["A2", "C3", "F3"]));
  });
});

describe("layers", () => {
  it("always writes a bass — the bottom the old composer had none of", () => {
    const bass = trackNotes(composeFromPalette(sad, "bottom"), "bass");
    expect(bass.length).toBeGreaterThan(0);
    // Whatever register was chosen, every root is folded into it, so the line
    // never leaps an octave when the progression steps down.
    const midis = bass.map((n) => pitchToMidi(n.pitch));
    expect(Math.max(...midis) - Math.min(...midis)).toBeLessThanOrEqual(12);
  });

  it("keeps the statement's bass on the kick when the blend has a kit", () => {
    // A bass on its own rhythm against a busy kick reads as two records
    // playing, so with a kit present and no scene word asking otherwise, the
    // statement plays the kick's own pattern.
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "locked");
    const kicks = new Set(
      trackNotes(comp, "drums")
        .filter((n) => n.pitch === "kick")
        .map((n) => n.time),
    );
    const statement = trackNotes(comp, "bass").filter((n) => barOf(n) < 4);
    expect(statement.length).toBeGreaterThan(0);
    for (const hit of statement) expect(kicks.has(hit.time)).toBe(true);
  });

  it("changes rhythmic cell at the restatement", () => {
    // Repetition with a change is structure; the same cell for eight bars is a
    // drum machine left running.
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "locked");
    const bass = trackNotes(comp, "bass");
    const cell = (bar: number) =>
      bass
        .filter((n) => barOf(n) === bar)
        .map((n) => n.time.split(":").slice(1).join(":"))
        .join(" ");
    expect(cell(4)).not.toBe(cell(0));
  });

  it("lets a scene word overrule the kick", () => {
    const locked = composeFromBlend(blendPalettes([sad, withBeat]), "a quiet room");
    const chased = composeFromBlend(blendPalettes([sad, withBeat]), "a rooftop chase");
    const cell = (comp: Composition) =>
      trackNotes(comp, "bass")
        .filter((n) => barOf(n) === 0)
        .map((n) => n.time)
        .join(" ");
    expect(cell(chased)).not.toBe(cell(locked));
  });

  it("takes an explicit knob over the scene's choice", () => {
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "anything", {
      knobs: { figures: ["half-time-chug", "half-time-chug"], figureFromScene: true },
    });
    // "X.......x......." — two hits a bar, on beats 0 and 2, and nothing else.
    // Times are approximate because the parts are performed, not placed.
    const bar0 = trackNotes(comp, "bass").filter((n) => barOf(n) === 0);
    expect(bar0).toHaveLength(2);
    expect(bar0.map((n) => Math.round(sixteenthOf(n)))).toEqual([0, 8]);
  });

  it("puts the bass in the register it was told to", () => {
    const comp = composeFromBlend(blendPalettes([sad]), "deep", {
      knobs: { register: "subterranean" },
    });
    for (const note of trackNotes(comp, "bass")) {
      expect(pitchToMidi(note.pitch)).toBeLessThanOrEqual(pitchToMidi("C2"));
    }
  });

  it("comps the harmony in rhythm rather than one block chord per bar", () => {
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "comping");
    const chordHits = new Set(
      trackNotes(comp, "piano")
        .filter((n) => barOf(n) === 0)
        .map((n) => n.time),
    );
    expect(chordHits.size).toBeGreaterThan(1);
  });

  it("plays the chords in the busy genre's feel, not the quiet one's", () => {
    const quiet = composeFromBlend(blendPalettes([sad, withBeat]), "feel");
    const busy = composeFromBlend(blendPalettes([sad, busyBeat]), "feel");
    const times = (c: Composition) =>
      new Set(
        trackNotes(c, "piano")
          .filter((n) => barOf(n) === 0)
          .map((n) => n.time),
      );
    expect(times(quiet)).not.toEqual(times(busy));
  });

  it("arranges the restatement up rather than repeating it flat", () => {
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "restate");
    const notesIn = (lo: number, hi: number) =>
      comp.tracks.flatMap((t) => t.notes.filter((n) => barOf(n) >= lo && barOf(n) < hi)).length;
    expect(notesIn(4, 8)).toBeGreaterThan(notesIn(0, 4));
  });

  it("swings the pitched parts with the kit, not against it", () => {
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "swung");
    const swungDrums = trackNotes(comp, "drums").some((n) => n.time.includes("."));
    const swungBass = trackNotes(comp, "bass").some((n) => n.time.includes("."));
    expect(swungDrums).toBe(true);
    expect(swungBass).toBe(true);
  });
});

describe("drum track", () => {
  it("stays drumless when no layer states a groove", () => {
    const comp = composeFromPalette(sad, "quiet farewell");
    expect(comp.tracks.map((t) => t.instrument)).not.toContain("drums");
  });

  it("plays the blended groove, and validates as drums", () => {
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "rainy window");
    const drums = comp.tracks.find((t) => t.instrument === "drums");
    expect(drums).toBeDefined();
    expect(new Set(drums!.notes.map((n) => n.pitch))).toEqual(
      new Set(["kick", "snare", "hat", "crash"]),
    );
    expect(validateComposition(comp)).toEqual([]);
  });

  it("covers every bar of the form and crashes on the resolution", () => {
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "rainy window");
    const drums = comp.tracks.find((t) => t.instrument === "drums")!;
    const lastBar = Math.max(...comp.tracks.flatMap((t) => t.notes.map(barOf)));
    const bars = new Set(drums.notes.map(barOf));
    expect(bars.size).toBe(lastBar + 1);
    expect(drums.notes.filter((n) => n.pitch === "crash").map((n) => n.time)).toEqual([
      `${lastBar}:0:0`,
    ]);
  });

  it("plays the restatement harder than the statement", () => {
    const comp = composeFromBlend(blendPalettes([sad, withBeat]), "lift");
    const drums = trackNotes(comp, "drums");
    const loudest = (lo: number, hi: number) =>
      Math.max(...drums.filter((n) => barOf(n) >= lo && barOf(n) < hi).map((n) => n.velocity!));
    expect(loudest(4, 8)).toBeGreaterThan(loudest(0, 4));
  });
});

describe("melody", () => {
  it("answers the statement with the motif inverted, not a new tune", () => {
    const comp = composeFromPalette(sad, "call and response");
    const melody = comp.tracks.at(-1)!.notes;
    // Same rhythm across the form — it is one idea restated, so the phrase
    // placement holds even though the contour flips. Rounded to the step,
    // because the line is performed rather than placed on the grid.
    const rhythm = (bar: number) =>
      melody.filter((n) => barOf(n) === bar).map((n) => Math.round(sixteenthOf(n)));
    expect(rhythm(4)).toEqual(rhythm(0));
  });

  it("starts each bar on a tone of that bar's chord", () => {
    const comp = composeFromPalette(sad, "chord tones");
    const melody = comp.tracks.at(-1)!.notes;
    const pad = trackNotes(comp, "pad");
    for (const bar of [0, 1, 2, 3]) {
      const chordTones = new Set(
        pad.filter((n) => barOf(n) === bar).map((n) => n.pitch.replace(/\d+$/, "")),
      );
      const first = melody.find((n) => barOf(n) === bar)!;
      expect(chordTones.has(first.pitch.replace(/\d+$/, ""))).toBe(true);
    }
  });

  it("stays in key: every melody pitch is a scale tone", () => {
    const comp = composeFromPalette(sad, "stepwise");
    const aMinor = new Set(["A", "B", "C", "D", "E", "F", "G"]);
    // Only the melody is scale-bound. Chord voicings legitimately carry
    // accidentals — `[i, iv, i, V]` resolves its V as a major triad, so the
    // harmonic-minor leading tone G# shows up there.
    const melody = comp.tracks.at(-1)!.notes;
    expect(melody.length).toBeGreaterThan(0);
    for (const note of melody) {
      expect(aMinor.has(note.pitch.replace(/\d+$/, ""))).toBe(true);
    }
  });
});

describe("modal keys", () => {
  const dorian: Palette = parsePalette(`---
slug: seafarer
title: Seafarer
tags: [folk, sea]
tonality:
  tonic: D
  scale: dorian
progressions:
  - [i, VII, i, IV]
tempo: [96, 96]
instruments: [piano, pad]
---
body`);

  it("plays the mode's own chords, not its parallel minor's", () => {
    const comp = composeFromPalette(dorian, "modal harmony");
    const pad = trackNotes(comp, "pad");
    const pitchClasses = new Set(pad.map((n) => n.pitch.replace(/\d+$/, "")));
    // The IV is G major and the melody's 6th is B natural — Bb anywhere means
    // the key collapsed back to D minor.
    expect(pitchClasses.has("B")).toBe(true);
    expect(pitchClasses.has("Bb")).toBe(false);
  });

  it("draws the melody from the mode's ladder", () => {
    const comp = composeFromPalette(dorian, "modal melody");
    const dDorian = new Set(["D", "E", "F", "G", "A", "B", "C"]);
    const melody = comp.tracks.at(-1)!.notes;
    expect(melody.length).toBeGreaterThan(0);
    for (const note of melody) {
      expect(dDorian.has(note.pitch.replace(/\d+$/, ""))).toBe(true);
    }
  });

  it("records the mode in the composition's key", () => {
    expect(composeFromPalette(dorian, "key line").key).toBe("D dorian");
  });
});

describe("composeFromPalette", () => {
  it("produces a structurally valid composition", () => {
    expect(validateComposition(composeFromPalette(sad, "dog dies"))).toEqual([]);
  });

  it("is deterministic for the same inputs", () => {
    const a = composeFromPalette(sad, "dog dies");
    const b = composeFromPalette(sad, "dog dies");
    expect(a).toEqual(b);
  });

  it("varies take with a different seed", () => {
    const a = composeFromPalette(sad, "dog dies", { seed: "1" });
    const b = composeFromPalette(sad, "dog dies", { seed: "2" });
    expect(a).not.toEqual(b);
  });

  it("respects the palette tempo range and records provenance", () => {
    const comp = composeFromPalette(sad, "quiet farewell");
    expect(comp.bpm).toBeGreaterThanOrEqual(60);
    expect(comp.bpm).toBeLessThanOrEqual(78);
    expect(comp.key).toBe("A minor");
    expect(comp.palettes).toEqual(["sad"]);
  });

  it("derives a filesystem-friendly name from the mood, overridable", () => {
    expect(composeFromPalette(sad, "Dog Dies!!").name).toBe("dog-dies");
    expect(composeFromPalette(sad, "x", { name: "custom" }).name).toBe("custom");
  });

  it("picks a progression in the key's own idiom", () => {
    // The major-idiom turnaround would resolve to a Picardy A-major tonic here;
    // the minor-idiom one is the right pick for a minor emotion.
    const mixed: Palette = parsePalette(`---
slug: mixed
title: Mixed
tags: [mixed]
tonality:
  tonic: A
  scale: minor
progressions:
  - [I, vi, ii, V]
  - [i, VI, ii, V]
tempo: [70, 70]
instruments: [piano, pad]
---
body`);
    for (const seed of ["1", "2", "3", "4", "5"]) {
      const comp = composeFromPalette(mixed, "idiom", { seed });
      const opening = trackNotes(comp, "piano")
        .filter((n) => barOf(n) === 0)
        .map((n) => n.pitch);
      // Am, never A major — the C natural is the tell.
      expect(opening).toContain("C4");
      expect(opening).not.toContain("C#4");
    }
  });
});
