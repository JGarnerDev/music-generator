/**
 * Micro-timing and dynamics — the last thing between a render and a performance.
 *
 * Everything else in this engine places notes exactly. A groove's swing moves
 * the off-beats, and accent characters give a lane three velocity levels, but
 * within that every note lands precisely on its grid position and two notes on
 * the same character are bit-identical. That is most of what makes a long loop
 * read as a machine: not the notes, the *sameness* of the notes.
 *
 * Two separate things fix it, and conflating them is why "humanize" often makes
 * music worse:
 *
 * - **Jitter** is per-note noise — the player isn't a clock. Small. Random.
 * - **Lean** is a constant offset for a whole part — the player *means* it. A
 *   drummer's snare sits a few milliseconds behind the beat and their hats sit
 *   ahead of it, and that is the difference between "laid back" and "driving".
 *   Lean is not randomness at all, and randomising it destroys the effect.
 *
 * Deliberately seeded and pure: the same piece humanises the same way every
 * render, so a good take can be reproduced and a bad one can be diffed. The seed
 * is mixed with each note's own time and pitch rather than with its index, so
 * adding a note to the front of a part doesn't reshuffle everything after it.
 */
import type { Note } from "./composition";
import { COMMON_TIME, stepsPerBar, type Meter } from "@utils/timing";
import { makeRng, seedFromString } from "@utils/random";

export interface HumanizeOptions {
  /**
   * Seed. The same seed and the same notes give the same performance —
   * a *take*, not a dice roll.
   */
  seed: string;
  /**
   * Largest timing shift, in sixteenths. 0.12 is a player, 0.4 is a drunk one.
   * Default 0.1 — audible as feel, never as a wrong note.
   */
  jitter?: number;
  /**
   * Largest velocity shift, 0..1. Default 0.06: enough that no two hits on the
   * same accent character are identical, not enough to flatten the accents the
   * groove wrote.
   */
  dynamics?: number;
  /**
   * Constant timing offset for this whole part, in sixteenths. Negative pushes
   * ahead of the beat (urgent), positive drags behind it (laid back). Not
   * randomised — a lean is a decision.
   */
  lean?: number;
  /**
   * Move with the other parts that name the same lock.
   *
   * Two parts meant to be heard as one gesture — a bass and the kick it doubles,
   * an octave-doubled riff — have to move *together*. Independent jitter pulls
   * them a few milliseconds apart, and a few milliseconds apart is not two
   * players, it is a flam: the exact artefact `parts.ts` shares its step reader
   * to avoid. Parts sharing a lock draw one shift per timestamp, so notes that
   * were simultaneous stay simultaneous.
   *
   * Absent, a part moves on its own, which is what you want for parts that are
   * genuinely separate voices.
   */
  lock?: string;
  /** Time signature, so a shift near a barline lands in the right bar. Default 4/4. */
  meter?: Meter;
  /**
   * Let a note be pushed out of its own bar. Default **false**, and think before
   * changing it.
   *
   * A real player does drag a note over the barline, but nothing else in this
   * engine survives it: chords change on the barline and every part is written
   * against the chord of the bar it is in, so a note that drifts back a bar is
   * heard against the *previous* harmony as a wrong note. Loop exports are cut
   * on a bar boundary too, so a note pushed before the loop start is simply
   * lost. Held inside its bar, jitter is feel; allowed out of it, it is a bug
   * that only shows up on the seam.
   */
  crossBarlines?: boolean;
}

const DEFAULT_JITTER = 0.1;
const DEFAULT_DYNAMICS = 0.06;

/**
 * Shift each note off its exact grid position and vary its velocity.
 *
 * Notes are never moved before the start of the piece — a negative transport
 * time is unrepresentable, and a lean at bar 0 would otherwise produce one.
 */
export function humanize(notes: Note[], opts: HumanizeOptions): Note[] {
  const {
    seed,
    jitter = DEFAULT_JITTER,
    dynamics = DEFAULT_DYNAMICS,
    lean = 0,
    lock,
    meter = COMMON_TIME,
    crossBarlines = false,
  } = opts;
  const perBar = stepsPerBar(meter);

  return notes.map((note) => {
    // Per-note seed: identity, not position in the array, so editing one part
    // doesn't re-roll the ones after it. A locked part drops the pitch from the
    // seed, so every part on that lock draws the same shift at a given time.
    const timeRng = makeRng(seedFromString(lock ? `${lock}|${note.time}` : `${seed}|${note.time}|${note.pitch}`));
    const exact = toSixteenths(note.time, perBar);
    const timeShift = lean + centred(timeRng()) * jitter;
    const at = clampToBar(exact + timeShift, exact, perBar, crossBarlines);

    // Dynamics stay per-part even under a lock: two players hitting together
    // still hit with their own weight, and that is what keeps a doubled line
    // sounding like two instruments rather than one loud one.
    const velocityRng = makeRng(seedFromString(`${seed}|${note.time}|${note.pitch}|v`));
    const velocity = note.velocity;
    return {
      ...note,
      time: fromSixteenths(at, perBar),
      ...(velocity === undefined
        ? {}
        : { velocity: clampVelocity(velocity + centred(velocityRng()) * dynamics) }),
    };
  });
}

/**
 * Humanize a whole set of parts at once, each with its own lean.
 *
 * The point of naming the parts is that they must **not** share a lean: a bass
 * and a kick dragging together is a slower tempo, whereas a bass dragging behind
 * a kick that doesn't is a groove. Each part also gets its own seed suffix, so
 * two parts playing the same rhythm don't jitter in lockstep — which would be
 * audible as one wide instrument rather than two players.
 */
export function humanizeParts<K extends string>(
  parts: Record<K, Note[]>,
  opts: HumanizeOptions & { leans?: Readonly<Record<string, number | undefined>> },
): Record<K, Note[]> {
  const out = {} as Record<K, Note[]>;
  for (const [name, notes] of Object.entries(parts) as [K, Note[]][]) {
    out[name] = humanize(notes, {
      ...opts,
      seed: `${opts.seed}|${name}`,
      lean: (opts.leans?.[name] ?? opts.lean ?? 0),
    });
  }
  return out;
}

/**
 * A house set of leans, in sixteenths, for the parts this repo writes.
 *
 * Small numbers on purpose: a sixteenth at 120 BPM is 125 ms, so 0.06 of one is
 * about 8 ms — under the threshold where it reads as an early note and over the
 * one where it reads as a machine. The signs are the conventional ones: hats
 * ahead, snare behind, bass locked to the kick because that is what "tight"
 * means and humanising them apart would undo it.
 */
export const HOUSE_LEANS = {
  drums: 0,
  bass: 0,
  pad: 0.08,
  piano: 0.04,
  epiano: 0.04,
  pluck: -0.03,
  lead: 0.05,
} as const satisfies Record<string, number>;

/**
 * Hold a shifted note inside the bar it was written in — never before the start
 * of the piece, and (unless asked otherwise) never over a barline.
 *
 * The clamp is one-sided by position rather than symmetric: a downbeat can only
 * be dragged late and a note on the last step can only be pushed early, which is
 * what a player at those positions can do without changing which chord they are
 * playing against.
 */
function clampToBar(at: number, exact: number, perBar: number, crossBarlines: boolean): number {
  if (crossBarlines) return Math.max(0, at);
  const bar = Math.floor(exact / perBar);
  const low = bar * perBar;
  // Just inside the next barline, so the note stays in its own bar without
  // landing exactly on the boundary and reading as the next bar's downbeat.
  const high = low + perBar - 1e-4;
  return Math.max(low, Math.min(high, at));
}

/** A number in [0,1) mapped to [-1, 1) — jitter is as often early as late. */
function centred(unit: number): number {
  return unit * 2 - 1;
}

function clampVelocity(v: number): number {
  // Never all the way to zero: a note humanised into silence is a dropped note,
  // which is a different musical statement from a quiet one.
  return Math.round(Math.max(0.02, Math.min(1, v)) * 1000) / 1000;
}

/** "bar:beat:sixteenth" → absolute sixteenths from the start of the piece. */
function toSixteenths(time: string, perBar: number): number {
  const [bar = "0", beat = "0", sixteenth = "0"] = time.split(":");
  return Number(bar) * perBar + Number(beat) * 4 + Number(sixteenth);
}

/** The inverse, rounded to a ten-thousandth so the JSON stays readable. */
function fromSixteenths(at: number, perBar: number): string {
  const bar = Math.floor(at / perBar);
  const withinBar = at - bar * perBar;
  const beat = Math.floor(withinBar / 4);
  const sixteenth = withinBar - beat * 4;
  return `${bar}:${beat}:${Math.round(sixteenth * 1e4) / 1e4}`;
}
