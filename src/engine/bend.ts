/**
 * Pitch bends — a note that arrives at one pitch and leaves at another.
 *
 * This is the part a written pitch cannot say. `vibrato` (in [`./voice`](./voice.ts))
 * is periodic and belongs to the *instrument*: every note that voice plays
 * wobbles, because a hand on a string always wobbles. A bend belongs to the
 * *note*: it happens once, in one direction, because the player chose it there.
 * The two stack — a sitar meend arriving under a vibrato hand is both at once —
 * which is why this is a note field and not a voice block.
 *
 * What comes out is an automation curve in **cents off the written pitch**,
 * sampled into points the browser hangs on a detune signal. Cents rather than
 * a new pitch name for the same reason a section player is detuned rather than
 * transposed: the note stays written as what it is, so the part still reads,
 * and the filter envelope still tracks the pitch it was written for.
 *
 * Pure and tested. The Tone side is `@app/instruments`.
 */

/**
 * How the pitch travels between the two notes. Not a cosmetic knob — it is the
 * difference between two instruments.
 *
 * - `guitar` — fast off the mark, settling into the target. A bent string is
 *   pushed by a finger that starts strong and eases as it arrives; the ear reads
 *   the *settle* as a person, and a straight line as a pitch wheel.
 * - `meend` — slow at both ends. The sitar's glide is the phrase itself rather
 *   than an ornament on it, so it leaves late and arrives late, and it is
 *   normally wider than a guitar would go.
 * - `linear` — a constant rate. Mechanical on purpose: reach for it when the
 *   bend is an effect (a tape stop, a detuning drone) rather than a player.
 */
export type BendCurve = "guitar" | "meend" | "linear";

/**
 * Whole tones and a bit is what hands can do. A guitar's top string gives up
 * around three semitones, a sitar's pulled string reaches five and occasionally
 * seven; past an octave nothing physical is being described and the automation
 * reads as a siren, so that is where the schema stops.
 */
export const MAX_BEND_SEMITONES = 12;

export interface BendSpec {
  /**
   * Where the bend lands, in semitones from the written pitch. Negative bends
   * down — a pre-bent string released onto the note, or a slack detune.
   */
  semitones: number;
  /**
   * Fraction of the note's length held at the written pitch before the bend
   * starts, 0..1. Default 0.15 — a bend that starts at the attack is heard as a
   * slur into the note rather than a bend of it, which is a different gesture.
   */
  at?: number;
  /**
   * Fraction of the note's length the travel itself takes, 0..1. Default 0.3.
   * Short is a blues flick, long is a cry.
   */
  over?: number;
  /**
   * Come back to the written pitch before the note ends. Costs a second travel
   * of the same length, so `at + 2 * over` has to fit inside the note.
   */
  release?: boolean;
  /** Shape of the travel. Default `guitar`. */
  curve?: BendCurve;
}

/** One automation point: seconds from the note's attack, and cents off the written pitch. */
export interface BendPoint {
  /** Seconds after the note's attack. */
  time: number;
  /** Cents off the written pitch. 0 is the note as written. */
  cents: number;
}

const DEFAULT_AT = 0.15;
const DEFAULT_OVER = 0.3;
const DEFAULT_CURVE: BendCurve = "guitar";

/**
 * How many points a travel is sampled into.
 *
 * The browser joins them with straight ramps, so this is how many straight
 * lines the curve is allowed. Twelve is where the staircase stopped being
 * audible on the widest bend the schema permits; the cost is a dozen scheduled
 * values on one signal, which is nothing next to a note.
 */
const SAMPLES = 12;

/**
 * Progress along the travel, 0..1 in and 0..1 out. Each is a shape rather than
 * a formula worth deriving: what matters is where the *fast part* is.
 */
const CURVES: Record<BendCurve, (t: number) => number> = {
  // Ease-out. Most of the distance is covered early, then it creeps in.
  guitar: (t) => 1 - Math.pow(1 - t, 2.4),
  // Smoothstep. Slow away, slow in, all the speed in the middle.
  meend: (t) => t * t * (3 - 2 * t),
  linear: (t) => t,
};

/**
 * A bend spec + how long the note actually is → the points to hang on a detune
 * signal.
 *
 * The first point is always `{ time: 0, cents: 0 }`, even when the bend starts
 * later: the signal has to be anchored at the written pitch at the attack, or
 * whatever the previous note left on it ramps into this one from wherever it
 * happened to end.
 *
 * Fractions are clamped rather than rejected here — validation has already had
 * its say, and a render is not the place to discover that 0.9 and 0.9 don't
 * both fit. What clamping produces is a bend that is merely rushed.
 */
export function bendAutomation(spec: BendSpec, durationSeconds: number): BendPoint[] {
  if (!(durationSeconds > 0)) return [{ time: 0, cents: 0 }];

  const curve = CURVES[spec.curve ?? DEFAULT_CURVE];
  const target = spec.semitones * 100;
  const travels = spec.release ? 2 : 1;

  const at = clamp01(spec.at ?? DEFAULT_AT);
  // Whatever is left after the wait, split between however many travels there
  // are. A note too short for the bend it was given still bends; it just uses
  // every moment it has.
  const over = Math.min(clamp01(spec.over ?? DEFAULT_OVER), (1 - at) / travels);

  const points: BendPoint[] = [{ time: 0, cents: 0 }];
  const startAt = at * durationSeconds;
  const span = over * durationSeconds;

  // Hold the written pitch until the finger moves. Without this the ramp starts
  // at the attack no matter what `at` says — a signal ramps from its last
  // scheduled point, not from the point before the one you asked for.
  if (startAt > 0) points.push({ time: startAt, cents: 0 });
  pushTravel(points, startAt, span, (t) => target * curve(t));

  if (spec.release) {
    // The let-down starts at the end and works back, so a bend held long is
    // held at *pitch* and released late — which is the gesture. Splitting the
    // slack evenly instead would drift the release earlier on every long note.
    const releaseStart = durationSeconds - span;
    if (releaseStart > startAt + span) points.push({ time: releaseStart, cents: target });
    pushTravel(points, releaseStart, span, (t) => target * (1 - curve(t)));
  }
  return points;
}

/** Sample one travel into ramp targets, skipping the point already anchored at `start`. */
function pushTravel(
  points: BendPoint[],
  start: number,
  span: number,
  cents: (t: number) => number,
): void {
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    points.push({ time: start + t * span, cents: cents(t) });
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** The curve names, for validation and for anything offering a choice. */
export const BEND_CURVES = ["guitar", "meend", "linear"] as const satisfies readonly BendCurve[];

const CURVE_SET: ReadonlySet<string> = new Set<string>(BEND_CURVES);

/**
 * Shape-check a `bend` off untrusted JSON. Shares the `push(path, message)`
 * protocol with `validateComposition`, which is its only caller.
 *
 * The fractions are checked *together* as well as apart: `at` and `over` are
 * each legal at 0.9 and impossible as a pair, and a bend silently squeezed into
 * the tail of its note is the kind of wrong that is easier to see here than to
 * hear later.
 */
export function validateBend(
  value: unknown,
  path: string,
  push: (path: string, message: string) => void,
): void {
  if (typeof value !== "object" || value === null) {
    push(path, "must be an object with a `semitones` field");
    return;
  }
  const b = value as Record<string, unknown>;

  if (typeof b.semitones !== "number" || !Number.isFinite(b.semitones) || b.semitones === 0) {
    push(`${path}.semitones`, "must be a non-zero number of semitones");
  } else if (Math.abs(b.semitones) > MAX_BEND_SEMITONES) {
    push(`${path}.semitones`, `must be within ±${MAX_BEND_SEMITONES} semitones`);
  }

  for (const field of ["at", "over"] as const) {
    const v = b[field];
    if (v !== undefined && !(typeof v === "number" && v >= 0 && v <= 1)) {
      push(`${path}.${field}`, "must be a number in 0..1 (a fraction of the note's length)");
    }
  }
  if (b.release !== undefined && typeof b.release !== "boolean") {
    push(`${path}.release`, "must be a boolean");
  }
  if (b.curve !== undefined && !CURVE_SET.has(b.curve as string)) {
    push(`${path}.curve`, `must be one of ${BEND_CURVES.join(", ")}`);
  }

  const at = typeof b.at === "number" ? b.at : DEFAULT_AT;
  const over = typeof b.over === "number" ? b.over : DEFAULT_OVER;
  const travels = b.release === true ? 2 : 1;
  if (at >= 0 && over >= 0 && at + over * travels > 1) {
    push(
      path,
      `at + over${travels === 2 ? " * 2 (release)" : ""} must fit in the note: ` +
        `${at} + ${over}${travels === 2 ? " * 2" : ""} > 1`,
    );
  }
}
