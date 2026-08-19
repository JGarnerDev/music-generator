/**
 * Fader arithmetic: a 0–1 slider position → decibels for the audio graph.
 *
 * Its own util because the mapping is the whole design decision. A slider that
 * sets *gain* linearly is wrong to the ear — half the number is nowhere near
 * half the loudness — so the position is treated as amplitude and converted,
 * which puts the useful part of the travel (roughly -20 dB up to unity) across
 * the top two thirds of the fader where a hand can find it in a dark room.
 */

/** Below this the fader is off, not merely quiet — no audible tail at the bottom. */
const SILENCE = 0.001;

/**
 * Slider position (0–1) → decibels. 1 is unity (0 dB), 0 is silence
 * (`-Infinity`, which every Web Audio gain understands as off). Out-of-range and
 * junk input clamp rather than throw: this feeds a live audio graph.
 */
export function fractionToDb(fraction: number): number {
  if (!Number.isFinite(fraction) || fraction <= SILENCE) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(Math.min(fraction, 1));
}

/** Decibels → slider position, the inverse of `fractionToDb`. */
export function dbToFraction(db: number): number {
  if (!Number.isFinite(db)) return db > 0 ? 1 : 0;
  return Math.min(Math.max(10 ** (db / 20), 0), 1);
}

/** The number beside the fader. Whole percent — nobody wants 71.6% at a table. */
export function formatVolume(fraction: number): string {
  const clamped = Math.min(Math.max(Number.isFinite(fraction) ? fraction : 0, 0), 1);
  return `${Math.round(clamped * 100)}%`;
}
