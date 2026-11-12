/**
 * Choke — a new note stops the last one, the way a fretting hand does.
 *
 * A synth voice rings out its release whatever happens next. A guitarist's
 * doesn't: fretting the next note on the same string, or palm-muting before the
 * next chord, stops the one before it. On a clean instrument the difference is
 * small. Through a distortion stage it is the difference between a line and a
 * smear, because a drive multiplies everything it is fed against everything
 * else — a fading Bb under a fresh C comes out as the two notes *plus* a grind
 * of difference tones that belong to neither, and the ear hears that grind as
 * the note being out of tune. Measured on the guitar rig's waveshaper: one note
 * leaves its inharmonic products around -35 dB; a whole step with the old note
 * still ringing puts them at about -7 dB, nearly as loud as the notes.
 *
 * Fifths and octaves survive this (their products land on the same harmonic
 * series), which is why a power chord is two notes struck *together*. So notes
 * that start together are a chord and never choke each other; only a later
 * onset cuts the ones before it.
 *
 * Pure: times in, a duration and release per note out. The audio layer applies
 * them (`src/app/audio/instruments.ts`, `ChokedSynth`).
 */

export interface TimedNote {
  /** Onset, seconds. */
  start: number;
  /** Written length, seconds. */
  duration: number;
}

export interface ChokedNote {
  /** Held length, seconds — the written one, or less if the next onset comes first. */
  duration: number;
  /** Release, seconds — the voice's own, or shortened so the tail is gone by the next onset. */
  release: number;
}

/**
 * Onsets closer than this are one strike. Humanize jitters each note by a few
 * milliseconds, and a power chord whose fifth landed 4 ms late is still a chord,
 * not a note choking its own root.
 */
export const CHORD_WINDOW = 0.012;

/**
 * The shortest a choked tail is allowed to be. A release of zero is a click;
 * 30 ms is a fast mute — short enough that the old note is gone before the new
 * one has finished its attack, long enough not to tick.
 */
export const CHOKE_FLOOR = 0.03;

/**
 * Per-note duration and release for a monophonic-hand part.
 *
 * A note followed by silence keeps the voice's full `release` — the ring-out at
 * the end of a phrase is the instrument, not a fault. A note followed by another
 * onset has its tail shortened to end there, never below `floor`; one written to
 * hold past the next onset is cut at it.
 */
export function chokeNotes(
  notes: readonly TimedNote[],
  release: number,
  floor: number = CHOKE_FLOOR,
): ChokedNote[] {
  const onsets = [...new Set(notes.map((n) => n.start))].sort((a, b) => a - b);
  return notes.map((note) => {
    const next = onsets.find((t) => t > note.start + CHORD_WINDOW);
    if (next === undefined) return { duration: note.duration, release };
    const duration = Math.min(note.duration, next - note.start);
    const room = next - (note.start + duration);
    return { duration, release: Math.min(release, Math.max(floor, room)) };
  });
}
