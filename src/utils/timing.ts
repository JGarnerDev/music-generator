/**
 * Pure timing math. The browser uses Tone.js for scheduling, but we need our
 * *own* tested conversions to compute render length, validate arrangements, and
 * reason about time without a live audio context.
 *
 * Supported note notation (Tone.js subset):
 *   "1n" whole, "2n" half, "4n" quarter, "8n" eighth, "16n" sixteenth, "32n"
 *   trailing "." = dotted (x1.5), trailing "t" = triplet (x2/3)
 *   "Nm" = N measures (N bars of the current meter)
 * Transport time: "bars:beats:sixteenths", e.g. "2:1:2".
 *
 * **A beat is always a quarter note**, whatever the meter says — the same
 * convention Tone's transport uses, and the reason `4n` means one beat in 6/8
 * as much as in 4/4. What a meter changes is how many of them fit in a bar.
 */

/**
 * A time signature, `[beats, unit]` — `[3, 4]` is three quarters, `[6, 8]` six
 * eighths. Only the bar *length* is derived from it; the pulse a listener feels
 * (two dotted quarters in 6/8) is a matter of where the groove puts its accents,
 * which is the groove's job and not arithmetic.
 */
export type Meter = [beats: number, unit: number];

/** 4/4 — what a piece is in when it doesn't say. */
export const COMMON_TIME: Meter = [4, 4];

/**
 * Quarter-note beats in one bar: `numerator × 4 / denominator`.
 *
 * 4/4 → 4, 3/4 → 3, 6/8 → 3, 12/8 → 6, 7/8 → 3.5. The half-beat is not a bug —
 * 7/8 really is three and a half quarters — and it stays exact because the
 * sixteenth grid below it (14 steps) is still whole.
 */
export function beatsPerBar(meter: Meter = COMMON_TIME): number {
  const [beats, unit] = meter;
  return (beats * 4) / unit;
}

/**
 * Sixteenth-note steps in one bar — the length of a groove lane or a figure at
 * resolution 4. 4/4 → 16, 3/4 → 12, 6/8 → 12, 12/8 → 24, 5/4 → 20.
 */
export function stepsPerBar(meter: Meter = COMMON_TIME): number {
  return beatsPerBar(meter) * 4;
}

export interface MeterIssue {
  path: string;
  message: string;
}

/**
 * Validate a meter parsed from untrusted JSON/frontmatter. Empty list means
 * valid.
 *
 * The unit must be a power of two because it names a note value, and the bar has
 * to come out to a whole number of sixteenths — everything downstream (grooves,
 * figures, the step reader) counts in them, and a bar of 13.5 steps would rotate
 * against the barline forever the way a 15-char groove lane would.
 */
export function validateMeter(input: unknown): MeterIssue[] {
  if (!Array.isArray(input) || input.length !== 2) {
    return [{ path: "meter", message: "must be a [beats, unit] pair, e.g. [3, 4]" }];
  }
  const [beats, unit] = input as unknown[];
  const issues: MeterIssue[] = [];
  if (typeof beats !== "number" || !Number.isInteger(beats) || beats < 1) {
    issues.push({ path: "meter[0]", message: "beats must be a positive integer" });
  }
  if (typeof unit !== "number" || ![1, 2, 4, 8, 16, 32].includes(unit)) {
    issues.push({ path: "meter[1]", message: "unit must be a note value: 1, 2, 4, 8, 16 or 32" });
  }
  if (issues.length > 0) return issues;
  const steps = stepsPerBar([beats as number, unit as number]);
  if (!Number.isInteger(steps)) {
    issues.push({
      path: "meter",
      message: `bar must be a whole number of sixteenths, got ${steps} — try doubling both numbers`,
    });
  }
  return issues;
}

export function secondsPerBeat(bpm: number): number {
  if (!(bpm > 0)) throw new Error(`bpm must be positive, got ${bpm}`);
  return 60 / bpm;
}

/**
 * Convert a note-value notation to seconds at a given tempo.
 *
 * Only `Nm` reads the meter: a measure is however many beats the bar holds,
 * where `4n` is one beat in any meter.
 */
export function notationToSeconds(notation: string, bpm: number, meter: Meter = COMMON_TIME): number {
  const spb = secondsPerBeat(bpm);
  // unit: n = plain note value, t = triplet of that value, m = measures
  const m = /^(\d+)(n|t|m)(\.)?$/.exec(notation.trim());
  if (!m) throw new Error(`unsupported duration notation: "${notation}"`);
  const value = Number(m[1]);
  const unit = m[2];
  const dotted = m[3] === ".";

  let beats: number;
  if (unit === "m") {
    beats = value * beatsPerBar(meter);
  } else {
    if (value === 0) throw new Error(`invalid note value: "${notation}"`);
    beats = 4 / value; // 4n -> 1 beat, 8n -> 0.5, 1n -> 4
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
  [16, "1n"],
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
 *
 * Whole bars come out as `Nm` so a held chord stays held when the meter changes;
 * everything else takes the longest plain note value that fits. In 3/4 that
 * makes a bar `1m` (12 steps) where in 4/4 it is `1m` (16) — the same word for
 * the same musical length, which is the point of writing it that way.
 */
export function sixteenthsToNotation(sixteenths: number, meter: Meter = COMMON_TIME): string {
  const n = Math.floor(sixteenths);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`length must be at least one sixteenth, got ${sixteenths}`);
  }
  const perBar = stepsPerBar(meter);
  if (n % perBar === 0) return `${n / perBar}m`;
  return NOTATION_BY_SIXTEENTHS.find(([len]) => len <= n)![1];
}

/**
 * A step index on the sixteenth grid → the `"bars:beats:sixteenths"` transport
 * time a `Note` carries. The inverse of reading that string: anything that
 * thinks in steps — a step sequencer, a quantized transcription — has to write
 * one of these to become a note.
 *
 * Beats are quarter notes, so a bar's steps divide by 4 into beats and the
 * remainder is the sixteenth. In 7/8 (14 steps) the last beat is a half beat,
 * which surfaces here as a bar whose highest beat index is 3 with only two
 * sixteenths under it — correct, and the reason this reads `stepsPerBar` rather
 * than assuming 16.
 */
export function sixteenthsToTransport(step: number, meter: Meter = COMMON_TIME): string {
  if (!Number.isInteger(step) || step < 0) {
    throw new Error(`step must be a non-negative integer, got ${step}`);
  }
  const perBar = stepsPerBar(meter);
  const bar = Math.floor(step / perBar);
  const within = step - bar * perBar;
  return `${bar}:${Math.floor(within / 4)}:${within % 4}`;
}

/** Convert "bars:beats:sixteenths" transport time to seconds. Missing parts = 0. */
export function barsBeatsToSeconds(time: string, bpm: number, meter: Meter = COMMON_TIME): number {
  const parts = time.trim().split(":");
  if (parts.length === 0 || parts.length > 3) {
    throw new Error(`invalid transport time: "${time}"`);
  }
  const [bars = "0", beats = "0", sixteenths = "0"] = parts;
  for (const p of [bars, beats, sixteenths]) {
    if (!/^\d+(\.\d+)?$/.test(p)) throw new Error(`invalid transport time: "${time}"`);
  }
  const totalBeats =
    Number(bars) * beatsPerBar(meter) + Number(beats) + Number(sixteenths) / 4;
  return totalBeats * secondsPerBeat(bpm);
}
