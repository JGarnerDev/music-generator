/**
 * Arrangement math over a whole composition — pure, so the app can size an
 * offline render (how many seconds of WAV to produce) without touching audio.
 */
import type { Composition } from "./composition";
import { barsBeatsToSeconds, notationToSeconds } from "@utils/timing";

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
