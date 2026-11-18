/**
 * Legato — hammer-ons, pull-offs and tapping: notes the string changes to
 * without being picked again.
 *
 * Every note a synth plays is a fresh pluck: its envelope restarts, so a fast
 * run is heard as tremolo picking however close the notes are. What makes a
 * tapped run (Van Halen's "Eruption", a pull-off cascade) is the *absence* of
 * those attacks — one strike, then the pitch moves while the string keeps
 * ringing. So a note marked `legato` is not played at all. It becomes a step in
 * the pitch of the note before it, and the whole run is one held note on the
 * track's bending voice, its detune walking from fret to fret.
 *
 * That is also why a run reuses the bend machinery rather than inventing a
 * voice: a bend is the same gesture with a continuous path where this one has
 * steps, and both belong to a single string. The cost is the same rule — one
 * run or bend at a time per track — and the same freedom: chords and unmarked
 * notes on the track still go to its polyphonic synth.
 *
 * Tapped and hammered notes are not told apart. Through a drive the
 * difference is a few dB of attack, which the compression flattens; the
 * velocity of the run is the velocity of its first, picked note.
 *
 * Pure: seconds and MIDI in, runs out. `@app/graph` plays them.
 */
import type { BendPoint } from "./bend";

/**
 * How long the pitch takes to move to the next fret, seconds. A finger landing
 * is not instantaneous, and a step with no travel at all clicks on the detune
 * signal; 4 ms is under what the ear hears as a slide.
 */
export const LEGATO_GLIDE = 0.004;

export interface LegatoNote {
  /** Onset, seconds. */
  start: number;
  /** Written length, seconds. */
  duration: number;
  midi: number;
  legato?: boolean;
}

export interface LegatoRun {
  /** Index of the picked note the run starts on. */
  head: number;
  /** Indices of the legato notes it absorbs, in time order. */
  members: number[];
  /** From the head's onset to the end of the last member, seconds. */
  duration: number;
  /** Detune path in cents off the head's pitch, for the bending voice. */
  points: BendPoint[];
}

/**
 * Group a track's notes into legato runs.
 *
 * A legato note belongs to the note that started most recently before it — the
 * string it is hammered onto. Under a chord that is the chord's top note, which
 * is the string a tapping hand reaches. A legato note with nothing before it has
 * no string to sound on and is left as an ordinary picked note.
 *
 * The run holds the pitch it was last moved to across any gap, the way a
 * string does until the next finger lands.
 */
export function legatoRuns(notes: readonly LegatoNote[]): LegatoRun[] {
  const order = notes.map((_, i) => i).sort((a, b) => notes[a]!.start - notes[b]!.start || a - b);
  const runOf = new Map<number, LegatoRun>();
  const runs: LegatoRun[] = [];

  for (const [k, i] of order.entries()) {
    const note = notes[i]!;
    if (!note.legato) continue;
    const prev = previousOnset(notes, order, k);
    if (prev === undefined) continue;

    let run = runOf.get(prev);
    if (!run) {
      run = { head: prev, members: [], duration: 0, points: [] };
      runs.push(run);
      runOf.set(prev, run);
    }
    run.members.push(i);
    runOf.set(i, run);
  }

  for (const run of runs) {
    const head = notes[run.head]!;
    const points: BendPoint[] = [{ time: 0, cents: 0 }];
    let end = head.start + head.duration;
    let cents = 0;
    for (const m of run.members) {
      const note = notes[m]!;
      const at = note.start - head.start;
      const target = (note.midi - head.midi) * 100;
      // Hold where the last finger left the string, then land on the next fret.
      const leave = Math.max(points.at(-1)!.time, at - LEGATO_GLIDE);
      if (leave > points.at(-1)!.time) points.push({ time: leave, cents });
      points.push({ time: Math.max(at, leave), cents: target });
      cents = target;
      end = Math.max(end, note.start + note.duration);
    }
    run.points = points;
    run.duration = end - head.start;
  }
  return runs;
}

/** The note sounding the string a legato note at `order[k]` lands on. */
function previousOnset(
  notes: readonly LegatoNote[],
  order: readonly number[],
  k: number,
): number | undefined {
  const start = notes[order[k]!]!.start;
  let best: number | undefined;
  for (let j = k - 1; j >= 0; j--) {
    const cand = notes[order[j]!]!;
    // Onsets within a hair are one moment — the chord a tap lands above.
    if (cand.start >= start - 1e-6) continue;
    if (best !== undefined && cand.start < notes[best]!.start - 1e-6) break;
    if (best === undefined || cand.midi > notes[best]!.midi) best = order[j]!;
  }
  return best;
}
