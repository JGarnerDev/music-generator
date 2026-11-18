/**
 * Where a player is in a buffer that plays an intro once and then repeats the
 * rest — `[0, loopStart)` once, `[loopStart, duration)` forever.
 *
 * With no intro (`loopStart` 0) this is plain modulo, which is what a looping
 * file always did. Pure, so pause, resume and the scrub bar agree on it.
 */
export function wrapLoopPosition(elapsed: number, duration: number, loopStart = 0): number {
  if (!(duration > 0) || elapsed <= 0) return 0;
  if (elapsed < duration) return elapsed;
  const start = Math.min(Math.max(loopStart, 0), duration);
  const body = duration - start;
  if (body <= 0) return duration;
  return start + ((elapsed - start) % body);
}
