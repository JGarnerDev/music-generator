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

export type InstrumentName = "piano" | "epiano" | "pad" | "bass" | "pluck";

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

export interface Composition {
  name: string;
  bpm: number;
  /** e.g. "A minor" — informational; palettes/theory decide pitches. */
  key: string;
  tracks: Track[];
  lofi?: LoFiSettings;
  /** Palette slugs this piece drew from, for provenance. */
  palettes?: string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const INSTRUMENTS: ReadonlySet<string> = new Set<InstrumentName>([
  "piano",
  "epiano",
  "pad",
  "bass",
  "pluck",
]);

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
    t.notes.forEach((note, ni) => {
      const nb = `${base}.notes[${ni}]`;
      if (typeof note !== "object" || note === null) {
        push(nb, "must be an object");
        return;
      }
      const n = note as Record<string, unknown>;
      if (typeof n.time !== "string") push(`${nb}.time`, "must be a string");
      if (typeof n.pitch !== "string") push(`${nb}.pitch`, "must be a string");
      if (typeof n.duration !== "string") push(`${nb}.duration`, "must be a string");
      if (n.velocity !== undefined && !isUnit(n.velocity)) {
        push(`${nb}.velocity`, "must be a number in 0..1");
      }
    });
  });

  return issues;
}

function isUnit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}
