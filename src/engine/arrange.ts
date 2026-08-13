/**
 * Arrangement math over a whole composition — pure, so the app can size an
 * offline render (how many seconds of WAV to produce) without touching audio.
 */
import type { Composition } from "./composition";
import { barsBeatsToSeconds, notationToSeconds } from "@utils/timing";

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
  let end = 0;
  for (const track of comp.tracks) {
    for (const note of track.notes) {
      const start = barsBeatsToSeconds(note.time, comp.bpm);
      const dur = notationToSeconds(note.duration, comp.bpm);
      end = Math.max(end, start + dur);
    }
  }
  return end;
}

/**
 * The composition's loop window in seconds, or null when it isn't a looping
 * piece. Bar indices are exact because a bar is a fixed number of beats in 4/4 —
 * that exactness is what lets the exporter cut a loop file on a sample boundary.
 */
export function loopWindowSeconds(comp: Composition): LoopWindow | null {
  if (!comp.loop) return null;
  const start = barsBeatsToSeconds(`${comp.loop.startBar}:0:0`, comp.bpm);
  const end = barsBeatsToSeconds(`${comp.loop.endBar}:0:0`, comp.bpm);
  return { start, end, duration: end - start };
}
