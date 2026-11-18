/**
 * Arrangement math over a whole composition — pure, so the app can size an
 * offline render (how many seconds of WAV to produce) without touching audio.
 */
import type { Composition } from "./composition";
import { COMMON_TIME, type Meter } from "@utils/timing";
import { tempoMap } from "./tempo";

/** A composition's time signature, defaulting to 4/4 when it doesn't state one. */
export function meterOf(comp: Pick<Composition, "meter">): Meter {
  return comp.meter ?? COMMON_TIME;
}

/** A loop's position on the timeline, in seconds. */
export interface LoopWindow {
  /** Where the looping body begins (end of the one-shot intro). */
  start: number;
  /** Where it wraps back to `start`. */
  end: number;
  /** `end - start` — the length of one lap, and of an exported loop file. */
  duration: number;
}

/**
 * Wall-clock length of a composition in seconds: the latest note end across all
 * tracks. Callers usually add a reverb/release tail before rendering.
 */
export function compositionDurationSeconds(comp: Composition): number {
  const map = tempoMap(comp);
  let end = 0;
  for (const track of comp.tracks) {
    for (const note of track.notes) {
      end = Math.max(end, map.secondsAt(note.time) + map.durationSeconds(note.time, note.duration));
    }
  }
  return end;
}

/**
 * The composition's loop window in seconds, or null when it isn't a looping
 * piece. Bar indices are exact because a bar is a fixed number of beats in any
 * one meter, and the tempo map integrates the same ramps the transport plays — that exactness is what lets the exporter cut a loop file on a
 * sample boundary.
 */
export function loopWindowSeconds(comp: Composition): LoopWindow | null {
  if (!comp.loop) return null;
  const map = tempoMap(comp);
  const start = map.secondsAt(`${comp.loop.startBar}:0:0`);
  const end = map.secondsAt(`${comp.loop.endBar}:0:0`);
  return { start, end, duration: end - start };
}

/**
 * How much of the full render plays before a looping piece settles into its
 * `.loop` file — up to the loop body's *end*, since the `.loop` file opens with
 * that ending's tail wrapped in. Null when there is no intro to play: no loop,
 * or a loop that starts on bar 0.
 */
export function loopIntroSeconds(comp: Composition): number | null {
  if (!comp.loop || comp.loop.startBar <= 0) return null;
  return loopWindowSeconds(comp)!.end;
}
