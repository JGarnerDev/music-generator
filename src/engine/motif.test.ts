import { describe, it, expect } from "vitest";
import { MotifError, quoteMotif, tonicOf } from "./motif";
import { pitchToMidi } from "./theory";
import type { Composition } from "./composition";

/** A four-note theme in A minor, rising a fifth then falling back. */
const theme: Composition = {
  name: "ashen-king",
  bpm: 90,
  key: "A minor",
  tracks: [
    {
      instrument: "piano",
      notes: [
        { time: "0:0:0", pitch: "A4", duration: "4n", velocity: 0.8 },
        { time: "0:2:0", pitch: "E5", duration: "4n", velocity: 0.7 },
        { time: "1:0:0", pitch: "C5", duration: "4n", velocity: 0.7 },
        { time: "1:2:0", pitch: "A4", duration: "2n", velocity: 0.6 },
      ],
    },
    {
      instrument: "drums",
      notes: [{ time: "0:0:0", pitch: "kick", duration: "16n", velocity: 0.9 }],
    },
  ],
};

const notesOf = (tracks: { notes: unknown[] }[]) => tracks.flatMap((t) => t.notes) as {
  time: string;
  pitch: string;
  velocity?: number;
}[];

describe("quoteMotif", () => {
  it("moves the theme into the host's key", () => {
    // A minor → D minor is five semitones up, which beats seven down.
    const [track] = quoteMotif(theme, { atBar: 0, key: "D minor", intensity: 1 });
    expect(track!.notes.map((n) => n.pitch)).toEqual(["D5", "A5", "F5", "D5"]);
  });

  it("keeps the tune's shape rather than folding it into one octave", () => {
    const [track] = quoteMotif(theme, { atBar: 0, key: "D minor" });
    const midis = track!.notes.map((n) => pitchToMidi(n.pitch));
    const original = theme.tracks[0]!.notes.map((n) => pitchToMidi(n.pitch));
    // Every interval between consecutive notes is unchanged.
    const steps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]!);
    expect(steps(midis)).toEqual(steps(original));
  });

  it("takes the shorter way round rather than transposing up nine semitones", () => {
    // A → G is two down, not ten up: a quote should stay in its register.
    const [track] = quoteMotif(theme, { atBar: 0, key: "G minor" });
    expect(track!.notes[0]!.pitch).toBe("G4");
  });

  it("places the quote at the bar it was asked for", () => {
    const [track] = quoteMotif(theme, { atBar: 24, key: "A minor" });
    expect(track!.notes.map((n) => n.time)).toEqual(["24:0:0", "24:2:0", "25:0:0", "25:2:0"]);
  });

  it("leaves the theme itself untouched", () => {
    const before = JSON.stringify(theme);
    quoteMotif(theme, { atBar: 8, key: "F major" });
    expect(JSON.stringify(theme)).toBe(before);
  });

  it("drops the accompaniment — a theme is a tune, not an arrangement", () => {
    const scored: Composition = {
      ...theme,
      tracks: [
        ...theme.tracks,
        { instrument: "bass", notes: [{ time: "0:0:0", pitch: "A1", duration: "1m" }] },
        { instrument: "pad", notes: [{ time: "0:0:0", pitch: "A3", duration: "1m" }] },
      ],
    };
    const tracks = quoteMotif(scored, { atBar: 0, key: "A minor" });
    expect(tracks.map((t) => t.instrument)).toEqual(["piano"]);
  });

  it("falls back to every pitched track when the theme is only accompaniment", () => {
    const padOnly: Composition = {
      ...theme,
      tracks: [{ instrument: "pad", notes: [{ time: "0:0:0", pitch: "A3", duration: "1m" }] }],
    };
    expect(quoteMotif(padOnly, { atBar: 0, key: "A minor" })).toHaveLength(1);
  });

  it("takes whatever tracks it is told to", () => {
    const tracks = quoteMotif(theme, { atBar: 0, key: "A minor", tracks: () => true });
    expect(tracks).toHaveLength(2);
  });

  it("sits under the host's own material by default", () => {
    const [track] = quoteMotif(theme, { atBar: 0, key: "A minor" });
    const original = theme.tracks[0]!.notes;
    for (const [i, note] of track!.notes.entries()) {
      expect(note.velocity!).toBeLessThan(original[i]!.velocity!);
    }
  });

  it("quotes an octave down when asked", () => {
    const [track] = quoteMotif(theme, { atBar: 0, key: "A minor", octaveShift: -12 });
    expect(track!.notes[0]!.pitch).toBe("A3");
  });

  it("keeps a 3/4 theme's rhythm when quoted into a 4/4 piece", () => {
    const waltz: Composition = { ...theme, meter: [3, 4] };
    const [track] = quoteMotif(waltz, { atBar: 2, key: "A minor" });
    // Bar 1 of a 3/4 theme is 12 sixteenths in, so from bar 2 of a 4/4 host it
    // lands three beats into bar 2 — the theme's own spacing, not its bar lines.
    expect(track!.notes.map((n) => n.time)).toEqual(["2:0:0", "2:2:0", "2:3:0", "3:1:0"]);
  });

  it("places into the host's meter", () => {
    const [track] = quoteMotif(theme, { atBar: 2, key: "A minor", meter: [3, 4] });
    expect(track!.notes[0]!.time).toBe("2:0:0");
  });

  it("is deterministic", () => {
    const once = quoteMotif(theme, { atBar: 4, key: "C major" });
    expect(once).toEqual(quoteMotif(theme, { atBar: 4, key: "C major" }));
  });

  it("refuses a bar that isn't one", () => {
    expect(() => quoteMotif(theme, { atBar: -1, key: "A minor" })).toThrow(MotifError);
    expect(() => quoteMotif(theme, { atBar: 1.5, key: "A minor" })).toThrow(MotifError);
  });

  it("never produces a silent or over-loud note", () => {
    const [track] = quoteMotif(theme, { atBar: 0, key: "A minor", intensity: 5 });
    for (const note of track!.notes) expect(note.velocity!).toBeLessThanOrEqual(1);
    const [quiet] = quoteMotif(theme, { atBar: 0, key: "A minor", intensity: 0 });
    for (const note of quiet!.notes) expect(note.velocity!).toBeGreaterThan(0);
  });
});

describe("tonicOf", () => {
  it("reads the tonic off a key string, mode or no mode", () => {
    expect(tonicOf("D minor")).toBe("D");
    expect(tonicOf("Bb phrygian-dominant")).toBe("Bb");
    expect(tonicOf("  F#  ")).toBe("F#");
  });

  it("throws on a key with no tonic in it", () => {
    expect(() => tonicOf("   ")).toThrow(MotifError);
  });
});
