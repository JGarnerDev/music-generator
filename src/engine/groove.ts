/**
 * Groove: step-sequencer notation → drum notes.
 *
 * A genre *is* its beat far more than it is its chords — house, reggae and funk
 * can share a progression and still be unmistakable. So the pattern belongs in
 * the palette next to the tempo, written the way a drum machine shows it:
 *
 *   kick:  "X..x..X..x......"
 *   snare: "....X.......X..."
 *   hat:   "x.o.x.o.x.o.x.o."
 *
 * One character per sixteenth, sixteen per bar. `X` accent, `x` normal, `o`
 * ghost, `.` rest. Lanes are independent, so a 32-char hat pattern cycles over a
 * 16-char kick the way two loops of different length do on hardware — that is a
 * feature, not a mistake to validate away.
 *
 * The step reader (`stepEvents`) is exported because pitched parts want the same
 * notation and, more importantly, the *same swing*: a bass written on its own
 * grid under a shuffled kit flams on every off-beat. See `parts.ts`.
 *
 * Pure and deterministic → unit tested. Nothing here touches audio; the kit that
 * makes the sounds lives in `src/app/drums.ts`.
 */
import { type Note, type DrumPiece, isDrumPiece } from "./composition";

/** Steps in one bar of 4/4 at sixteenth resolution. */
export const STEPS_PER_BAR = 16;
const STEPS_PER_BEAT = 4;

/** Velocity per accent level. The kit balances pieces; this is dynamics only. */
const ACCENT_VELOCITY = { X: 0.95, x: 0.7, o: 0.35 } as const;

type StepChar = keyof typeof ACCENT_VELOCITY | ".";

/** How long each piece rings. Open cymbals sustain; everything else is a hit. */
const PIECE_DURATION: Partial<Record<DrumPiece, string>> = {
  "open-hat": "8n",
  ride: "8n",
  crash: "2n",
};
const DEFAULT_DURATION = "16n";

/**
 * Which off-beat the swing delays. `8n` swings the eighths — the jazz/boom-bap
 * shuffle you hear in a ride or a hat playing straight eighths. `16n` swings the
 * sixteenths, which is the tighter funk/garage feel. Getting this wrong is
 * silent: an eighth-note hat pattern under 16th swing has no note on a swung
 * step at all, so it plays dead straight.
 */
export type SwingUnit = "8n" | "16n";

export interface Groove {
  /**
   * How far the off-beats land late: 0 is dead straight, 1 is a full triplet
   * shuffle (the swung note becoming the last of a triplet). Past that it stops
   * reading as swing and starts reading as a mistake, so the range stops there.
   */
  swing?: number;
  /** Which subdivision the swing applies to. Default `16n`. */
  swingUnit?: SwingUnit;
  /** Kit piece → step string. Lanes cycle independently over the bar count. */
  patterns: Partial<Record<DrumPiece, string>>;
}

export interface GrooveIssue {
  path: string;
  message: string;
}

export interface GrooveNotesOptions {
  /** First bar the pattern is written into. */
  startBar: number;
  /** How many bars to fill. Lanes repeat to cover it. */
  bars: number;
  /** Scales every velocity, for a quieter verse or a louder chorus. Default 1. */
  intensity?: number;
}

/** One struck step: where it lands and how hard. What a lane reduces to. */
export interface StepEvent {
  /** Transport time, "bar:beat:sixteenth", swing already applied. */
  time: string;
  /** 0..1, from the step's accent character scaled by `intensity`. */
  velocity: number;
  /** Absolute step index from `startBar`, for callers that need the position. */
  step: number;
}

export interface StepEventOptions {
  startBar: number;
  bars: number;
  /** Scales every velocity. Default 1. */
  intensity?: number;
  /** 0 straight … 1 full triplet shuffle. Default 0. */
  swing?: number;
  /** Which subdivision the swing applies to. Default `16n`. */
  swingUnit?: SwingUnit;
}

/**
 * Read one step string into timed events across `bars` bars.
 *
 * The lane is an endless cycle of its own length, so a two-bar pattern over a
 * one-bar span states only its first half, and a one-bar pattern over four bars
 * repeats — which is what lets a two-bar snare and a one-bar kick coexist
 * without either lane knowing about the other.
 */
export function stepEvents(pattern: string, opts: StepEventOptions): StepEvent[] {
  const { startBar, bars, intensity = 1, swingUnit } = opts;
  if (pattern.length === 0) return [];
  const swing = clampUnit(opts.swing ?? 0);
  const swingPeriod = swingUnit === "8n" ? 4 : 2;
  const steps = [...pattern] as StepChar[];
  const events: StepEvent[] = [];

  for (let step = 0; step < bars * STEPS_PER_BAR; step++) {
    const char = steps[step % steps.length]!;
    const level = ACCENT_VELOCITY[char as keyof typeof ACCENT_VELOCITY];
    if (level === undefined) continue; // "." and anything else = rest

    events.push({
      time: stepTime(startBar, step, swing, swingPeriod),
      velocity: round(clampUnit(level * intensity), 3),
      step,
    });
  }
  return events;
}

/**
 * Render a groove into drum notes across `bars` bars.
 *
 * Each lane is read as an endless cycle of its own length, so a two-bar snare
 * over a one-bar kick states itself every other bar without either lane knowing
 * about the other.
 */
export function grooveNotes(groove: Groove, opts: GrooveNotesOptions): Note[] {
  const { startBar, bars, intensity = 1 } = opts;
  const notes: Note[] = [];

  for (const [piece, pattern] of Object.entries(groove.patterns)) {
    if (!pattern) continue;
    const duration = PIECE_DURATION[piece as DrumPiece] ?? DEFAULT_DURATION;
    const events = stepEvents(pattern, {
      startBar,
      bars,
      intensity,
      swing: groove.swing,
      swingUnit: groove.swingUnit,
    });
    for (const { time, velocity } of events) {
      notes.push({ time, pitch: piece, duration, velocity });
    }
  }

  // Lane order is object order; sorting by time keeps the JSON readable and makes
  // the output independent of how the palette author listed the pieces.
  return notes.sort((a, b) => a.time.localeCompare(b.time, "en", { numeric: true }));
}

/**
 * Absolute step index → "bar:beat:sixteenth", with the swing delay applied.
 *
 * A step is an off-beat when it sits halfway through a swing period (step 1 of
 * every 2 for sixteenth swing, step 2 of every 4 for eighth swing). It moves
 * late by `swing * period/6` steps, which is exactly a triplet's worth at
 * `swing: 1` for either resolution.
 */
function stepTime(startBar: number, step: number, swing: number, swingPeriod: number): string {
  const bar = startBar + Math.floor(step / STEPS_PER_BAR);
  const withinBar = step % STEPS_PER_BAR;
  const beat = Math.floor(withinBar / STEPS_PER_BEAT);
  const sixteenth = withinBar % STEPS_PER_BEAT;
  const offBeat = withinBar % swingPeriod === swingPeriod / 2;
  const swung = offBeat ? sixteenth + (swing * swingPeriod) / 6 : sixteenth;
  return `${bar}:${beat}:${round(swung, 4)}`;
}

/**
 * Validate a groove parsed from untrusted frontmatter. Returns issues; empty
 * means valid. Pattern length must be a whole number of bars — a 15-char lane is
 * a typo, not a polymeter, and it would rotate against the bar line forever.
 */
export function validateGroove(input: unknown): GrooveIssue[] {
  const issues: GrooveIssue[] = [];
  if (typeof input !== "object" || input === null) {
    return [{ path: "groove", message: "must be an object" }];
  }
  const g = input as Record<string, unknown>;

  if (g.swing !== undefined && !isUnit(g.swing)) {
    issues.push({ path: "groove.swing", message: "must be a number in 0..1" });
  }
  if (g.swingUnit !== undefined && g.swingUnit !== "8n" && g.swingUnit !== "16n") {
    issues.push({ path: "groove.swingUnit", message: 'must be "8n" or "16n"' });
  }
  if (typeof g.patterns !== "object" || g.patterns === null) {
    issues.push({ path: "groove.patterns", message: "must be an object of piece → step string" });
    return issues;
  }

  const entries = Object.entries(g.patterns as Record<string, unknown>);
  if (entries.length === 0) {
    issues.push({ path: "groove.patterns", message: "must name at least one kit piece" });
  }
  for (const [piece, pattern] of entries) {
    const path = `groove.patterns.${piece}`;
    if (!isDrumPiece(piece)) issues.push({ path, message: `unknown drum piece "${piece}"` });
    if (typeof pattern !== "string") {
      issues.push({ path, message: "must be a step string" });
      continue;
    }
    if (!/^[.xXo]+$/.test(pattern)) {
      issues.push({ path, message: 'step string may only use "X", "x", "o" and "."' });
    }
    if (pattern.length % STEPS_PER_BAR !== 0) {
      issues.push({
        path,
        message: `length must be a multiple of ${STEPS_PER_BAR} (one bar), got ${pattern.length}`,
      });
    }
  }
  return issues;
}

/** Longest lane in bars — how much music the groove states before it repeats. */
export function grooveBars(groove: Groove): number {
  const lengths = Object.values(groove.patterns)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p) => Math.ceil(p.length / STEPS_PER_BAR));
  return lengths.length === 0 ? 0 : Math.max(...lengths);
}

function isUnit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

function clampUnit(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
