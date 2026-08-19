/**
 * Clock formatting for the transport: seconds → `m:ss`.
 *
 * Its own util because "how long is this" shows up in three places that must
 * agree — the scrub bar's elapsed and total readouts, and the cue list's
 * duration column. A cue reading 1:05 in one place and 65s in another is the
 * kind of small inconsistency you only notice while trying to hit a beat.
 */

/**
 * `m:ss`, or `h:mm:ss` past an hour. Negative, NaN and Infinity all become
 * `0:00`: a clock in a live tool must always render something a glance can read.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
