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
 * The *rhythm* those builders play is not theirs: it is a named figure from
 * `figure.ts`, so a section can ask for a 3+3+2 or a triplet canter instead of
 * the gallop and the rest of the arrangement is unchanged. What is left here is
 * the layers that are not one repeating cell — sustains, tremolo, the shifter.
 *
 * Pure and deterministic → unit tested. Voicing/naming math lives in `theory`.
 */
import type { Note } from "./composition";
import { figureLine, powerChordFigure, type FigureOptions, type FigureName } from "./figure";

const BEATS_PER_BAR = 4;

/** Note value each tremolo subdivision produces. Keys double as the allowed set. */
const TREMOLO_DURATIONS: Record<number, string | undefined> = { 1: "4n", 2: "8n", 4: "16n" };

/** Figure each motor subdivision plays. Keys double as the allowed set. */
const MOTOR_FIGURES: Record<number, FigureName | undefined> = {
  2: "straight-eighths",
  4: "sixteenth-chug",
};

/** What a figure needs to become notes. The rhythm itself lives in `figure.ts`. */
export type RiffOptions = FigureOptions;

/**
 * Single-line gallop — the engine of a driving track, usually the bass.
 *
 * Odd beats are pushed slightly harder than even ones so a bar of identical
 * pitches still has a pulse; without that the pattern reads as a machine.
 *
 * This is `figureLine("gallop", …)` under a name, kept because the gallop is the
 * one figure enough of the repo reaches for directly. Anything choosing its
 * rhythm should call `figureLine` and pick.
 */
export function gallopLine(opts: RiffOptions): Note[] {
  return figureLine("gallop", opts);
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
  return powerChordFigure("gallop", opts);
}

export interface MotorOptions extends RiffOptions {
  /**
   * Hits per beat: 2 = straight eighths (the desert-rock motor), 4 = a sixteenth
   * chug. Only these two — anything else is either a gallop or off the grid.
   */
  subdivision?: 2 | 4;
}

/**
 * Straight, unvarying subdivision on one root per bar — the *other* driving
 * engine, and the opposite principle to `gallopLine`.
 *
 * A gallop moves: its long-short-short cell leans forward and wants the next
 * chord. A motor refuses to. Every hit is the same length, the root pedals, and
 * the force comes from how long it goes on without changing — desert/stoner rock,
 * krautrock, anything hypnotic. Only the beat accents keep it from reading as a
 * machine, and the approach note on the last hit is the one place it admits the
 * bar is ending.
 */
export function motorLine(opts: MotorOptions): Note[] {
  return figureLine(motorFigure(opts.subdivision), motorOptions(opts));
}

/**
 * The motor voiced as power chords: root + fifth on the beat, root alone
 * off it. Same reasoning as `powerChordGallop` — full chords on every
 * subdivision turn to mud, and the bare root reads as palm-muting.
 */
export function powerChordMotor(opts: MotorOptions): Note[] {
  return powerChordFigure(motorFigure(opts.subdivision), motorOptions(opts));
}

function motorFigure(subdivision: 2 | 4 = 2): FigureName {
  const figure = MOTOR_FIGURES[subdivision];
  if (figure === undefined) {
    throw new Error(`subdivision must be 2 or 4, got ${subdivision}`);
  }
  return figure;
}

/** The motor's ghosts sit a touch above a gallop's — there are fewer of them. */
function motorOptions(opts: MotorOptions): FigureOptions {
  return { ...opts, ghost: opts.ghost ?? 0.82 };
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
