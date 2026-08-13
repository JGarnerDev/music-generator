/**
 * Riff primitives — the repetitive, mechanical layers of driving music (metal,
 * battle, chase), generated instead of typed.
 *
 * A four-minute game loop is thousands of notes, and almost all of them are one
 * pattern restated on a new root. Hand-authoring that JSON is slow and gets
 * subtly wrong; these builders take a root per bar and emit the notes, so a
 * whole section is one call and the *musical* choices (which roots, which
 * sections, where the seam goes) stay where a human can read them.
 *
 * Pure and deterministic → unit tested. Voicing/naming math lives in `theory`.
 */
import type { Note } from "./composition";
import { transpose } from "./theory";

/** Sixteenth-note offsets of a gallop: an eighth on the beat, then two sixteenths. */
const GALLOP_OFFSETS = [0, 2, 3] as const;
const GALLOP_DURATIONS = ["8n", "16n", "16n"] as const;
const BEATS_PER_BAR = 4;

/** Note value each tremolo subdivision produces. Keys double as the allowed set. */
const TREMOLO_DURATIONS: Record<number, string | undefined> = { 1: "4n", 2: "8n", 4: "16n" };

export interface RiffOptions {
  /** Bar the pattern starts on; roots advance one bar each. */
  startBar: number;
  /** Root pitch per bar, e.g. ["D2", "C2", "Bb1", "A1"]. */
  roots: string[];
  /**
   * Pitch played on the very last sixteenth of a bar, per bar index. A chromatic
   * step into the next root is what makes a repeated riff feel like it is going
   * somewhere. `null`/absent = keep the root.
   */
  approaches?: (string | null)[];
  /** Velocity of the on-beat eighth. Off-beat sixteenths sit below it. */
  accent?: number;
  /** Velocity of the two sixteenths. */
  ghost?: number;
}

/**
 * Single-line gallop — the engine of a driving track, usually the bass.
 *
 * Odd beats are pushed slightly harder than even ones so a bar of identical
 * pitches still has a pulse; without that the pattern reads as a machine.
 */
export function gallopLine(opts: RiffOptions): Note[] {
  const { startBar, roots, approaches = [], accent = 0.95, ghost = 0.8 } = opts;
  const notes: Note[] = [];

  roots.forEach((root, i) => {
    const bar = startBar + i;
    const approach = approaches[i] ?? null;
    for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
      GALLOP_OFFSETS.forEach((offset, slot) => {
        const isLastSixteenth = beat === BEATS_PER_BAR - 1 && slot === GALLOP_OFFSETS.length - 1;
        const pitch = isLastSixteenth && approach ? approach : root;
        const onBeat = slot === 0;
        notes.push({
          time: `${bar}:${beat}:${offset}`,
          pitch,
          duration: GALLOP_DURATIONS[slot]!,
          // downbeat and beat 3 carry the bar; the between-beats sit back
          velocity: onBeat ? (beat % 2 === 0 ? accent : accent - 0.07) : ghost,
        });
      });
    }
  });

  return notes;
}

/**
 * Gallop voiced as power chords: root + fifth on the eighth, root alone on the
 * sixteenths.
 *
 * Dropping the fifth from the fast notes is how the part is actually played —
 * full chords on every sixteenth turn to mud, and the bare root reads as tighter
 * palm-muting. No third, so the mode is carried by the melody (see the `metal`
 * palette).
 */
export function powerChordGallop(opts: RiffOptions): Note[] {
  const fifths = new Map<string, string>();
  const fifthOf = (root: string): string => {
    let f = fifths.get(root);
    if (f === undefined) {
      f = transpose(root, 7);
      fifths.set(root, f);
    }
    return f;
  };

  return gallopLine(opts).flatMap((note) => {
    if (note.duration !== "8n") return [note];
    return [
      note,
      { ...note, pitch: fifthOf(note.pitch), velocity: (note.velocity ?? 0.9) - 0.05 },
    ];
  });
}

export interface SustainOptions {
  startBar: number;
  /** One entry per bar; `null` leaves that bar silent (space is a part too). */
  pitches: (string | string[] | null)[];
  duration?: string;
  velocity?: number;
}

/** One held stack per bar — pads, choir, the tolling bell under a breakdown. */
export function sustainLine(opts: SustainOptions): Note[] {
  const { startBar, pitches, duration = "1m", velocity = 0.4 } = opts;
  const notes: Note[] = [];

  pitches.forEach((entry, i) => {
    if (entry === null) return;
    const stack = Array.isArray(entry) ? entry : [entry];
    stack.forEach((pitch, voice) => {
      notes.push({
        time: `${startBar + i}:0:0`,
        pitch,
        duration,
        // upper voices back off so the stack reads as one chord, not three parts
        velocity: Math.max(0.05, velocity - voice * 0.05),
      });
    });
  });

  return notes;
}

export interface TremoloOptions {
  startBar: number;
  /** Pitch per beat, read across bars — four entries fill one bar. */
  pitches: string[];
  /**
   * Hits per beat: 4 = a full sixteenth tremolo, 2 = eighths, 1 = one per beat.
   * Only divisors of 4 — anything else lands off the sixteenth grid.
   */
  subdivision?: 1 | 2 | 4;
  velocity?: number;
}

/**
 * Repeated fast picking on one pitch per beat — the standard "here comes the
 * climax" gesture. Alternating velocities imply down/up strokes so it breathes.
 */
export function tremoloLine(opts: TremoloOptions): Note[] {
  const { startBar, pitches, subdivision = 4, velocity = 0.9 } = opts;
  const duration = TREMOLO_DURATIONS[subdivision];
  if (duration === undefined) {
    throw new Error(`subdivision must be 1, 2 or 4, got ${subdivision}`);
  }
  const step = 4 / subdivision;

  return pitches.flatMap((pitch, i) => {
    const bar = startBar + Math.floor(i / BEATS_PER_BAR);
    const beat = i % BEATS_PER_BAR;
    return Array.from({ length: subdivision }, (_, hit) => ({
      time: `${bar}:${beat}:${hit * step}`,
      pitch,
      duration,
      velocity: hit === 0 ? velocity : velocity - 0.12,
    }));
  });
}

/** Shift a block of notes by whole bars, for restating a section further along. */
export function shiftBars(notes: Note[], bars: number): Note[] {
  return notes.map((note) => {
    const [bar = "0", beat = "0", sixteenth = "0"] = note.time.split(":");
    return { ...note, time: `${Number(bar) + bars}:${beat}:${sixteenth}` };
  });
}
