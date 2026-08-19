/**
 * Composition spec — the portable JSON contract between Claude (who writes it in
 * conversation) and the browser app (which plays and records it).
 *
 * Keep this file the single source of truth for the shape of a song. Anything
 * that reads or writes a composition imports these types + `validateComposition`.
 */
// Relative, not `@utils/timing`: `vite.config.ts` pulls this module in through
// its dev plugins, and config is loaded before the resolve aliases exist.
import { barsBeatsToSeconds, notationToSeconds, validateMeter } from "../utils/timing";
import { validateBend, type BendSpec } from "./bend";

export interface Note {
  /** Transport time, "bars:beats:sixteenths" (Tone.js format), e.g. "0:0" or "1:2:2". */
  time: string;
  /** Scientific pitch, e.g. "A3", "C#4". */
  pitch: string;
  /** Note length as a Tone.js duration, e.g. "2n", "4n", "8t". */
  duration: string;
  /** 0..1. Defaults to 0.7 at play time when omitted. */
  velocity?: number;
  /**
   * Bend the pitch across the note — a struck string pushed sharp, a sitar
   * meend. `pitch` stays what was written; this says where it travels. See
   * [`./bend`](./bend.ts) and [`docs/bends.md`](../../docs/bends.md).
   *
   * Bent notes on a track are played by one extra monophonic voice, so two of
   * them may not overlap. Not available on `drums` (a kit piece has no pitch to
   * bend) or on section voices (a desk of players is not one bending hand).
   */
  bend?: BendSpec;
}

/**
 * `pluck` and `lead` are both the electric guitar, split because they are two
 * different jobs: `pluck` is the rhythm part (tight, fast-decaying, wide, low in
 * the mix) and `lead` is the top line (compressed into sustain, mid-forward,
 * centred, loud). One voice cannot do both — a lead played on the rhythm tone is
 * the classic "puny solo" problem.
 */
export type InstrumentName = "piano" | "epiano" | "pad" | "bass" | "pluck" | "lead" | "drums";

/** The known instrument voices, in a stable order. Source of truth for validation + blending. */
export const INSTRUMENT_NAMES = ["piano", "epiano", "pad", "bass", "pluck", "lead", "drums"] as const satisfies readonly InstrumentName[];

/**
 * Pitched voices — the ones a chord, a scale ladder or a transpose applies to.
 * `drums` is deliberately excluded: its notes carry a kit piece, not a pitch.
 */
export const PITCHED_INSTRUMENTS = INSTRUMENT_NAMES.filter(
  (i): i is Exclude<InstrumentName, "drums"> => i !== "drums",
);

/**
 * Kit pieces a `drums` track can play. A drum note's `pitch` is one of these
 * names instead of a scientific pitch — the kit is one instrument with many
 * sounds, so naming the piece is what "which note" means for percussion.
 */
export const DRUM_PIECES = [
  "kick",
  "snare",
  "rim",
  "clap",
  "hat",
  "open-hat",
  "ride",
  "crash",
  "tom-lo",
  "tom-mid",
  "tom-hi",
  "shaker",
] as const;

export type DrumPiece = (typeof DRUM_PIECES)[number];

const DRUM_PIECE_SET: ReadonlySet<string> = new Set<string>(DRUM_PIECES);

export function isDrumPiece(value: unknown): value is DrumPiece {
  return typeof value === "string" && DRUM_PIECE_SET.has(value);
}

export interface Track {
  instrument: InstrumentName;
  notes: Note[];
  /** Linear gain 0..1. Defaults to 1. */
  gain?: number;
  /**
   * Which sound this instrument plays: the slug of a preset in
   * `voices/<instrument>/`. Omitted means the instrument's default voice, so a
   * piece written before a voice existed keeps rendering the same way. See
   * [`./voice`](./voice.ts) and `voices/archive.md` for what is available.
   */
  voice?: string;
  /**
   * This track's own signal chain, as the tokens a timbre palette writes
   * (`["variac-sag", "overdrive", "plate-reverb"]`). Built in order — the order
   * *is* the instrument, so sag before drive and drive before sag are two
   * different amps.
   *
   * Per track rather than per mix because distortion belongs to the guitar and
   * would ruin the drums it was summed with. Words with no effect behind them
   * are ignored rather than rejected: a timbre is prose first. See
   * [`./signal`](./signal.ts).
   */
  fx?: string[];
  /** Stereo position, -1 hard left … 0 centre … 1 hard right. Default centre. */
  pan?: number;
}

export interface LoFiSettings {
  /** Vinyl crackle + noise floor. */
  vinyl?: boolean;
  /** Tape pitch wobble depth, 0..1. */
  wobble?: number;
  /** Low-pass cutoff in Hz; lower = warmer/muddier. */
  lowpassHz?: number;
  /** Reverb wet mix, 0..1. */
  reverb?: number;
}

/**
 * Where a piece repeats forever, for game-style background music.
 *
 * Bars before `startBar` are a one-shot intro: they play once, then the piece
 * cycles `[startBar, endBar)` for as long as the scene lasts. `endBar` is
 * exclusive, so a 64-bar body starting at bar 8 ends at bar 72.
 *
 * The seam is a musical decision, not just a marker: write the last loop bar so
 * it *wants* the first one back (land on the V, leave the phrase open), because
 * the wrap is heard as often as every other bar in the piece.
 */
export interface LoopSettings {
  /** First bar of the looping body. Bars before it play once as an intro. */
  startBar: number;
  /** Bar the loop wraps at, exclusive — playback jumps back to `startBar` here. */
  endBar: number;
}

export interface Composition {
  name: string;
  bpm: number;
  /** e.g. "A minor" — informational; palettes/theory decide pitches. */
  key: string;
  /**
   * Time signature, `[beats, unit]`. Absent = 4/4.
   *
   * Unlike `key` this is **not** informational: it sets how many beats a bar
   * holds, so it decides where `"3:0:0"` falls in seconds, how long `1m` rings,
   * and how many steps a groove lane needs. A piece whose notes were written in
   * 3/4 and whose `meter` says nothing plays at four-quarter bars, which puts
   * every downbeat after the first in the wrong place.
   */
  meter?: [beats: number, unit: number];
  tracks: Track[];
  lofi?: LoFiSettings;
  /** Loop window for endless playback. Absent = the piece plays once. */
  loop?: LoopSettings;
  /** Palette slugs this piece drew from, for provenance. */
  palettes?: string[];
  /** Free-form labels for finding it again in the bench (scene, character, instrument). */
  tags?: string[];
  /**
   * Campaign slug this piece belongs to, e.g. `"redwater"` — the shelf the
   * session page's archive tab is filtered by.
   *
   * Deliberately its own field rather than a convention over `tags`: at the
   * table you filter by campaign *first* and everything else second, and a
   * tag that has to be spelled right in every file is a tag that will one day
   * be spelled wrong and quietly hide a cue. Absent = not filed under any
   * campaign; it still shows in the archive's "All" shelf.
   */
  campaign?: string;
  /**
   * Slugs of the `compositions/leitmotifs/*` themes this piece quotes. Opera
   * logic: a motif is written once and recurs wherever its character or idea
   * does, so a piece points at the theme instead of copying it.
   */
  motifs?: string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const INSTRUMENTS: ReadonlySet<string> = new Set<InstrumentName>(INSTRUMENT_NAMES);

/**
 * Structural validation for a composition parsed from untrusted JSON. Returns a
 * list of issues; empty list means valid. Pure + synchronous so it is trivial
 * to unit test and to run in the `composition:validate` script.
 */
export function validateComposition(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (typeof input !== "object" || input === null) {
    push("$", "composition must be an object");
    return issues;
  }
  const c = input as Record<string, unknown>;

  if (typeof c.name !== "string" || c.name.trim() === "") {
    push("name", "must be a non-empty string");
  }
  if (typeof c.bpm !== "number" || !Number.isFinite(c.bpm) || c.bpm <= 0) {
    push("bpm", "must be a positive number");
  }
  if (typeof c.key !== "string" || c.key.trim() === "") {
    push("key", "must be a non-empty string");
  }

  if (c.meter !== undefined) {
    for (const issue of validateMeter(c.meter)) push(issue.path, issue.message);
  }
  if (c.loop !== undefined) validateLoop(c.loop, push);
  for (const field of ["palettes", "tags", "motifs"] as const) {
    if (c[field] !== undefined) validateSlugList(c[field], field, push);
  }
  if (c.campaign !== undefined && (typeof c.campaign !== "string" || c.campaign.trim() === "")) {
    push("campaign", "must be a non-empty string");
  }

  if (!Array.isArray(c.tracks) || c.tracks.length === 0) {
    push("tracks", "must be a non-empty array");
    return issues;
  }

  c.tracks.forEach((track, ti) => {
    const base = `tracks[${ti}]`;
    if (typeof track !== "object" || track === null) {
      push(base, "must be an object");
      return;
    }
    const t = track as Record<string, unknown>;
    if (!INSTRUMENTS.has(t.instrument as string)) {
      push(`${base}.instrument`, `unknown instrument "${String(t.instrument)}"`);
    }
    if (t.gain !== undefined && !isUnit(t.gain)) {
      push(`${base}.gain`, "must be a number in 0..1");
    }
    // Only the shape is checked here: whether a voice by that slug exists is a
    // question about the `voices/` folder, which this pure contract can't see.
    // An unknown slug falls back to the instrument's default at build time.
    if (t.voice !== undefined && (typeof t.voice !== "string" || t.voice.trim() === "")) {
      push(`${base}.voice`, "must be a non-empty voice slug");
    }
    if (t.fx !== undefined) validateSlugList(t.fx, `${base}.fx`, push);
    // A pan outside -1..1 is silently clamped by the audio node, so it would be
    // a value that looks like it did something and didn't.
    if (t.pan !== undefined && !(typeof t.pan === "number" && t.pan >= -1 && t.pan <= 1)) {
      push(`${base}.pan`, "must be a number in -1..1");
    }
    if (!Array.isArray(t.notes) || t.notes.length === 0) {
      push(`${base}.notes`, "must be a non-empty array");
      return;
    }
    const isDrums = t.instrument === "drums";
    t.notes.forEach((note, ni) => {
      const nb = `${base}.notes[${ni}]`;
      if (typeof note !== "object" || note === null) {
        push(nb, "must be an object");
        return;
      }
      const n = note as Record<string, unknown>;
      if (typeof n.time !== "string") push(`${nb}.time`, "must be a string");
      // A drum note names a kit piece where a pitched note names a pitch. Checked
      // here because a typo'd "kicks" is silent at play time and silence is the
      // one bug an ear can't localise.
      if (isDrums && !isDrumPiece(n.pitch)) {
        push(`${nb}.pitch`, `unknown drum piece "${String(n.pitch)}"`);
      } else if (!isDrums && typeof n.pitch !== "string") {
        push(`${nb}.pitch`, "must be a string");
      }
      if (typeof n.duration !== "string") push(`${nb}.duration`, "must be a string");
      if (n.velocity !== undefined && !isUnit(n.velocity)) {
        push(`${nb}.velocity`, "must be a number in 0..1");
      }
      if (n.bend !== undefined) {
        // A kit piece names a drum, not a pitch, so there is nothing to bend to.
        if (isDrums) push(`${nb}.bend`, "drums have no pitch to bend");
        else validateBend(n.bend, `${nb}.bend`, push);
      }
    });
    validateBendOverlap(t.notes as Record<string, unknown>[], base, c, push);
  });

  return issues;
}

/**
 * Two bent notes on one track may not overlap.
 *
 * A bend is a signal ramp on one voice's detune, and a track gets exactly one
 * bending voice — so two bent notes sounding at once are one string being asked
 * to travel to two places, and what you hear is the second bend dragging the
 * first note with it. Unbent notes are not in the argument: they go to the
 * track's ordinary polyphonic synth and are untouched by any of this, which is
 * why a bent lead line over held chords on the *same* track is fine.
 *
 * Checked here rather than left to the ear because the failure sounds like a
 * bad bend rather than like a rule being broken.
 */
function validateBendOverlap(
  notes: Record<string, unknown>[],
  base: string,
  comp: Record<string, unknown>,
  push: (path: string, message: string) => void,
): void {
  if (typeof comp.bpm !== "number" || !(comp.bpm > 0)) return;
  const meter = Array.isArray(comp.meter) ? (comp.meter as [number, number]) : undefined;

  const spans: { index: number; start: number; end: number }[] = [];
  notes.forEach((n, i) => {
    if (n.bend === undefined) return;
    if (typeof n.time !== "string" || typeof n.duration !== "string") return;
    try {
      const start = barsBeatsToSeconds(n.time, comp.bpm as number, meter);
      spans.push({
        index: i,
        start,
        end: start + notationToSeconds(n.duration, comp.bpm as number, meter),
      });
    } catch {
      // An unparseable time or duration is already an issue of its own; there is
      // nothing useful to say about whether it overlaps.
    }
  });

  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1]!;
    const cur = spans[i]!;
    // A hair of tolerance: a note ending exactly where the next begins is
    // adjacent, not overlapping, and float seconds don't land on the nose.
    if (cur.start < prev.end - 1e-6) {
      push(
        `${base}.notes[${cur.index}].bend`,
        `overlaps the bent note at index ${prev.index} — one track bends one note at a time`,
      );
    }
  }
}

/**
 * Loop bars must be whole bars: the wrap is sample-aligned to a bar boundary, so
 * a fractional bar would drift the grid a little further every lap.
 */
function validateLoop(loop: unknown, push: (path: string, message: string) => void): void {
  if (typeof loop !== "object" || loop === null) {
    push("loop", "must be an object");
    return;
  }
  const l = loop as Record<string, unknown>;
  if (!isBarIndex(l.startBar)) push("loop.startBar", "must be a non-negative integer");
  if (!isBarIndex(l.endBar)) push("loop.endBar", "must be a non-negative integer");
  if (isBarIndex(l.startBar) && isBarIndex(l.endBar) && l.endBar <= l.startBar) {
    push("loop.endBar", "must be greater than loop.startBar");
  }
}

/** `palettes` / `tags` / `motifs` are all the same shape: a list of non-empty labels. */
function validateSlugList(
  value: unknown,
  field: string,
  push: (path: string, message: string) => void,
): void {
  if (!Array.isArray(value)) {
    push(field, "must be an array of strings");
    return;
  }
  value.forEach((item, i) => {
    if (typeof item !== "string" || item.trim() === "") {
      push(`${field}[${i}]`, "must be a non-empty string");
    }
  });
}

function isBarIndex(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function isUnit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}
