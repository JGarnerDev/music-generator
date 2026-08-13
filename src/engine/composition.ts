/**
 * Composition spec — the portable JSON contract between Claude (who writes it in
 * conversation) and the browser app (which plays and records it).
 *
 * Keep this file the single source of truth for the shape of a song. Anything
 * that reads or writes a composition imports these types + `validateComposition`.
 */

export interface Note {
  /** Transport time, "bars:beats:sixteenths" (Tone.js format), e.g. "0:0" or "1:2:2". */
  time: string;
  /** Scientific pitch, e.g. "A3", "C#4". */
  pitch: string;
  /** Note length as a Tone.js duration, e.g. "2n", "4n", "8t". */
  duration: string;
  /** 0..1. Defaults to 0.7 at play time when omitted. */
  velocity?: number;
}

export type InstrumentName = "piano" | "epiano" | "pad" | "bass" | "pluck" | "drums";

/** The known instrument voices, in a stable order. Source of truth for validation + blending. */
export const INSTRUMENT_NAMES = ["piano", "epiano", "pad", "bass", "pluck", "drums"] as const satisfies readonly InstrumentName[];

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
  tracks: Track[];
  lofi?: LoFiSettings;
  /** Loop window for endless playback. Absent = the piece plays once. */
  loop?: LoopSettings;
  /** Palette slugs this piece drew from, for provenance. */
  palettes?: string[];
  /** Free-form labels for finding it again in the bench (scene, campaign, character). */
  tags?: string[];
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

  if (c.loop !== undefined) validateLoop(c.loop, push);
  for (const field of ["palettes", "tags", "motifs"] as const) {
    if (c[field] !== undefined) validateSlugList(c[field], field, push);
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
    });
  });

  return issues;
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
