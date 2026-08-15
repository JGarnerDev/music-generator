/**
 * Harmony lines — the second guitar.
 *
 * One lead playing one line is thin, and it is thin in a way no amount of gain
 * fixes: a single voice has no interval to be *in*. Twin leads are most of what
 * "Maiden", "Priest" or "Helloween" means as a sound, and the part is mechanical
 * enough that writing it by hand twice is a mistake — a harmony line is the same
 * contour, a fixed number of **scale steps** away, which is a pure function of
 * the melody and the key.
 *
 * Steps, not semitones. A parallel line at a constant semitone distance leaves
 * the key on every second note; at a constant *diatonic* distance it stays in
 * the key and the interval quality changes underneath it — a third that is major
 * over one degree and minor over the next. That alternation is the sound. Asking
 * for semitones instead gives you a chorus pedal.
 *
 * Non-scale notes (the lead's chromatic passing tones, a borrowed raised sixth)
 * snap to the nearest degree before the interval is measured, so the harmony
 * part stays diatonic while the lead goes outside. That is what a second
 * guitarist does, and it is the behaviour that keeps a bII riff from dragging a
 * harmonised line into a key nobody is in.
 *
 * Pure and deterministic → tested. `scripts/build-song.ts` calls this to derive
 * a section's second lead; a section that wants real counterpoint writes both
 * lines out instead and this stays out of the way.
 */
import type { Note } from "./composition";
import { pitchToMidi, scaleNotes } from "./theory";

/**
 * Interval names, as scale steps. A "third" is two steps because the ear counts
 * the note it starts on and the maths does not — the usual off-by-one that makes
 * `steps: 3` sound like a fourth to everyone reading the plan.
 */
export const HARMONY_INTERVALS = {
  unison: 0,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  octave: 7,
} as const;

export type HarmonyInterval = keyof typeof HARMONY_INTERVALS;

export const HARMONY_INTERVAL_NAMES = Object.keys(HARMONY_INTERVALS) as HarmonyInterval[];

export function isHarmonyInterval(value: unknown): value is HarmonyInterval {
  return typeof value === "string" && value in HARMONY_INTERVALS;
}

export interface HarmonyOptions {
  /** Key centre the scale is built on, e.g. `"E"`. */
  tonic: string;
  /** Any mode `theory.ts` supports. Default `minor`. */
  scale?: string;
  /** How far apart the lines run — a name, or raw scale steps. Default `third`. */
  interval?: HarmonyInterval | number;
  /** Put the harmony *under* the melody instead of over it. */
  below?: boolean;
  /**
   * Scales every velocity. The harmony part sits under the lead rather than
   * level with it — two identical volumes read as a detune, not two players.
   * Default 1.
   */
  velocity?: number;
}

/** Lowest and highest MIDI note the ladder covers. Beyond a guitar either way. */
const LADDER_RANGE: [number, number] = [12, 119];

/**
 * The melody, a fixed diatonic distance away.
 *
 * Times and durations are copied, so the two parts are locked by construction —
 * a harmony guitar that drifts against its lead is a flam, not a section.
 */
export function harmonize(notes: readonly Note[], opts: HarmonyOptions): Note[] {
  const ladder = scaleLadderMidi(opts.tonic, opts.scale ?? "minor");
  const steps = resolveSteps(opts.interval ?? "third") * (opts.below ? -1 : 1);
  const scaleVelocity = opts.velocity ?? 1;

  return notes.map((note) => ({
    ...note,
    pitch: midiToPitch(harmonyMidi(pitchToMidi(note.pitch), ladder, steps)),
    velocity: clampVelocity((note.velocity ?? 0.7) * scaleVelocity),
  }));
}

/** Scale steps for an interval name, or the number straight through. */
export function resolveSteps(interval: HarmonyInterval | number): number {
  if (typeof interval === "number") {
    if (!Number.isInteger(interval)) {
      throw new Error(`harmony interval must be whole scale steps, got ${interval}`);
    }
    return interval;
  }
  const steps = HARMONY_INTERVALS[interval];
  if (steps === undefined) {
    throw new Error(
      `unknown harmony interval "${interval}" — expected one of ${HARMONY_INTERVAL_NAMES.join(", ")}`,
    );
  }
  return steps;
}

/**
 * Every MIDI note of the scale, ascending. Built once per call because the
 * lookup is an index shift on this array — which is exactly what "two scale
 * steps up" means, and is why the interval quality varies for free.
 */
export function scaleLadderMidi(tonic: string, scale: string): number[] {
  const pitchClasses = new Set(
    scaleNotes(tonic, scale).map((pitchClass) => pitchToMidi(`${pitchClass}4`) % 12),
  );
  const ladder: number[] = [];
  for (let midi = LADDER_RANGE[0]; midi <= LADDER_RANGE[1]; midi++) {
    if (pitchClasses.has(midi % 12)) ladder.push(midi);
  }
  return ladder;
}

/**
 * One note's partner. A pitch outside the scale snaps to its nearest degree
 * first — ties upward, since the outside notes that turn up in this idiom are
 * leading tones and raised sixths, and both are heard as pointing up.
 */
function harmonyMidi(midi: number, ladder: number[], steps: number): number {
  const index = nearestIndex(ladder, midi);
  const target = index + steps;
  if (target < 0) return ladder[0]!;
  if (target >= ladder.length) return ladder[ladder.length - 1]!;
  return ladder[target]!;
}

/** Index of the ladder entry closest to `midi`, preferring the higher on a tie. */
function nearestIndex(ladder: number[], midi: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < ladder.length; i++) {
    const distance = Math.abs(ladder[i]! - midi);
    // `<=` is the tie rule: a later entry is the higher pitch, and the ladder
    // ascends, so equal distances resolve upward.
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    } else if (ladder[i]! > midi) {
      break;
    }
  }
  return best;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** MIDI number back to a pitch name. Sharps throughout — the guitar idiom. */
function midiToPitch(midi: number): string {
  return `${SHARP_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function clampVelocity(velocity: number): number {
  return Math.min(1, Math.max(0, velocity));
}
