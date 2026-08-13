/**
 * Pure timing math for 4/4 music. The browser uses Tone.js for scheduling, but
 * we need our *own* tested conversions to compute render length, validate
 * arrangements, and reason about time without a live audio context.
 *
 * Supported note notation (Tone.js subset):
 *   "1n" whole, "2n" half, "4n" quarter, "8n" eighth, "16n" sixteenth, "32n"
 *   trailing "." = dotted (x1.5), trailing "t" = triplet (x2/3)
 *   "Nm" = N measures (N * 4 beats)
 * Transport time: "bars:beats:sixteenths", e.g. "2:1:2".
 */

const BEATS_PER_MEASURE = 4;

export function secondsPerBeat(bpm: number): number {
  if (!(bpm > 0)) throw new Error(`bpm must be positive, got ${bpm}`);
  return 60 / bpm;
}

/** Convert a note-value notation to seconds at a given tempo. */
export function notationToSeconds(notation: string, bpm: number): number {
  const spb = secondsPerBeat(bpm);
  // unit: n = plain note value, t = triplet of that value, m = measures
  const m = /^(\d+)(n|t|m)(\.)?$/.exec(notation.trim());
  if (!m) throw new Error(`unsupported duration notation: "${notation}"`);
  const value = Number(m[1]);
  const unit = m[2];
  const dotted = m[3] === ".";

  let beats: number;
  if (unit === "m") {
    beats = value * BEATS_PER_MEASURE;
  } else {
    if (value === 0) throw new Error(`invalid note value: "${notation}"`);
    beats = BEATS_PER_MEASURE / value; // 4n -> 1 beat, 8n -> 0.5, 1n -> 4
    if (unit === "t") beats *= 2 / 3; // 4t -> quarter-note triplet
  }
  if (dotted) beats *= 1.5;
  return beats * spb;
}

/**
 * Longest note value that fits in a span of sixteenths, from longest down.
 * Anything not in the table falls back to the largest entry that fits, so an
 * awkward 5-sixteenth gap rings for 4 and leaves a hair of space rather than
 * overlapping the next note.
 */
const NOTATION_BY_SIXTEENTHS: ReadonlyArray<readonly [number, string]> = [
  [16, "1m"],
  [12, "2n."],
  [8, "2n"],
  [6, "4n."],
  [4, "4n"],
  [3, "8n."],
  [2, "8n"],
  [1, "16n"],
];

/**
 * A length in sixteenths → the note notation that fills it. The inverse of
 * `notationToSeconds` for the grid-aligned lengths a step sequencer produces:
 * a part built from step strings knows its durations in steps, but a `Note`
 * carries notation.
 */
export function sixteenthsToNotation(sixteenths: number): string {
  const n = Math.floor(sixteenths);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`length must be at least one sixteenth, got ${sixteenths}`);
  }
  if (n % 16 === 0) return `${n / 16}m`;
  return NOTATION_BY_SIXTEENTHS.find(([len]) => len <= n)![1];
}

/** Convert "bars:beats:sixteenths" transport time to seconds. Missing parts = 0. */
export function barsBeatsToSeconds(time: string, bpm: number): number {
  const parts = time.trim().split(":");
  if (parts.length === 0 || parts.length > 3) {
    throw new Error(`invalid transport time: "${time}"`);
  }
  const [bars = "0", beats = "0", sixteenths = "0"] = parts;
  for (const p of [bars, beats, sixteenths]) {
    if (!/^\d+(\.\d+)?$/.test(p)) throw new Error(`invalid transport time: "${time}"`);
  }
  const totalBeats =
    Number(bars) * BEATS_PER_MEASURE + Number(beats) + Number(sixteenths) / 4;
  return totalBeats * secondsPerBeat(bpm);
}
