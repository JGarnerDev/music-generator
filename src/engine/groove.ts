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
import { FILL_NAMES, fillBars, fillPatterns, isFillName, type FillRef } from "./fill";
import { COMMON_TIME, stepsPerBar, type Meter } from "@utils/timing";

/**
 * Steps in one bar of 4/4 at sixteenth resolution — the default, and what every
 * lane in `palettes/genre/` is written against. A piece in another meter passes
 * its `meter` and every function here counts in `stepsPerBar(meter)` instead:
 * 12 for 3/4 and 6/8, 24 for 12/8.
 */
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
  /**
   * The bar that ends a phrase — a name off the shelf in `fill.ts`, or lanes
   * written inline. It **replaces** the groove for that bar rather than playing
   * over it: a tom tumble on top of the original hats is two drummers.
   */
  fill?: FillRef;
  /**
   * How often the fill lands, in bars. 8 is the usual phrase; 4 is busy, 16 is
   * a long build. Absent (or under 2) means no fills, which is what a groove
   * with no phrase to mark should say.
   */
  fillEvery?: number;
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
  /** Time signature the bars are counted in. Default 4/4. */
  meter?: Meter;
  /**
   * How far into a phrase this span starts, for fill placement — for a caller
   * that renders one phrase in more than one call. Default 0.
   */
  phraseOffset?: number;
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
  /** Time signature the bars are counted in. Default 4/4. */
  meter?: Meter;
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
  const { startBar, bars, intensity = 1, swingUnit, meter = COMMON_TIME } = opts;
  if (pattern.length === 0) return [];
  const swing = clampUnit(opts.swing ?? 0);
  const swingPeriod = swingUnit === "8n" ? 4 : 2;
  const perBar = stepsPerBar(meter);
  const steps = [...pattern] as StepChar[];
  const events: StepEvent[] = [];

  for (let step = 0; step < bars * perBar; step++) {
    const char = steps[step % steps.length]!;
    const level = ACCENT_VELOCITY[char as keyof typeof ACCENT_VELOCITY];
    if (level === undefined) continue; // "." and anything else = rest

    events.push({
      time: stepTime(startBar, step, swing, swingPeriod, perBar),
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
  const { startBar, bars, intensity = 1, meter, phraseOffset = 0 } = opts;
  const swing = { swing: groove.swing, swingUnit: groove.swingUnit };
  const notes: Note[] = [];

  // Which bars the groove doesn't play, because the fill is playing instead.
  const filled = new Set(
    groove.fill && groove.fillEvery ? fillBars(bars, groove.fillEvery, phraseOffset) : [],
  );
  const perBar = stepsPerBar(meter ?? COMMON_TIME);

  for (const [piece, pattern] of Object.entries(groove.patterns)) {
    if (!pattern) continue;
    const duration = PIECE_DURATION[piece as DrumPiece] ?? DEFAULT_DURATION;
    const events = stepEvents(pattern, { startBar, bars, intensity, meter, ...swing });
    for (const { time, velocity, step } of events) {
      if (filled.has(Math.floor(step / perBar))) continue;
      notes.push({ time, pitch: piece, duration, velocity });
    }
  }

  // The fill bars, each read from its own start so the fill states its first bar
  // rather than whatever step of it the phrase happened to reach.
  if (groove.fill) {
    const patterns = fillPatterns(groove.fill);
    for (const bar of filled) {
      for (const [piece, pattern] of Object.entries(patterns)) {
        if (!pattern) continue;
        const duration = PIECE_DURATION[piece as DrumPiece] ?? DEFAULT_DURATION;
        const events = stepEvents(pattern, {
          startBar: startBar + bar,
          bars: 1,
          intensity,
          meter,
          ...swing,
        });
        for (const { time, velocity } of events) {
          notes.push({ time, pitch: piece, duration, velocity });
        }
      }
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
function stepTime(
  startBar: number,
  step: number,
  swing: number,
  swingPeriod: number,
  perBar: number,
): string {
  const bar = startBar + Math.floor(step / perBar);
  const withinBar = step % perBar;
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
export function validateGroove(input: unknown, meter: Meter = COMMON_TIME): GrooveIssue[] {
  const issues: GrooveIssue[] = [];
  const perBar = stepsPerBar(meter);
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
  checkLanes(entries, "groove.patterns", perBar, meter, issues);

  if (g.fillEvery !== undefined) {
    const every = g.fillEvery;
    if (typeof every !== "number" || !Number.isInteger(every) || every < 2) {
      issues.push({
        path: "groove.fillEvery",
        message: "must be a whole number of bars, 2 or more",
      });
    }
    if (g.fill === undefined) {
      issues.push({ path: "groove.fill", message: "required when `fillEvery` is set" });
    }
  }
  if (g.fill !== undefined) {
    if (typeof g.fill === "string") {
      if (!isFillName(g.fill)) {
        issues.push({
          path: "groove.fill",
          message: `unknown fill "${g.fill}" — pick one of: ${FILL_NAMES.join(", ")}`,
        });
      }
    } else if (typeof g.fill === "object" && g.fill !== null) {
      const lanes = Object.entries(g.fill as Record<string, unknown>);
      if (lanes.length === 0) {
        issues.push({ path: "groove.fill", message: "must name at least one kit piece" });
      }
      // A fill is exactly one bar: it marks a phrase end, and a two-bar one
      // would land its second half over the downbeat it exists to announce.
      checkLanes(lanes, "groove.fill", perBar, meter, issues, { exactlyOneBar: true });
    } else {
      issues.push({ path: "groove.fill", message: "must be a fill name or a lane object" });
    }
    if (g.fillEvery === undefined) {
      issues.push({ path: "groove.fillEvery", message: "required when `fill` is set" });
    }
  }
  return issues;
}

/** Shared lane checks for a groove's patterns and a fill's — same notation. */
function checkLanes(
  entries: [string, unknown][],
  base: string,
  perBar: number,
  meter: Meter,
  issues: GrooveIssue[],
  opts: { exactlyOneBar?: boolean } = {},
): void {
  for (const [piece, pattern] of entries) {
    const path = `${base}.${piece}`;
    if (!isDrumPiece(piece)) issues.push({ path, message: `unknown drum piece "${piece}"` });
    if (typeof pattern !== "string") {
      issues.push({ path, message: "must be a step string" });
      continue;
    }
    if (!/^[.xXo]+$/.test(pattern)) {
      issues.push({ path, message: 'step string may only use "X", "x", "o" and "."' });
    }
    if (opts.exactlyOneBar) {
      if (pattern.length !== perBar) {
        issues.push({
          path,
          message: `a fill is one bar — expected ${perBar} steps for ${meter[0]}/${meter[1]}, got ${pattern.length}`,
        });
      }
    } else if (pattern.length % perBar !== 0) {
      issues.push({
        path,
        message: `length must be a multiple of ${perBar} (one bar of ${meter[0]}/${meter[1]}), got ${pattern.length}`,
      });
    }
  }
}

/** Longest lane in bars — how much music the groove states before it repeats. */
export function grooveBars(groove: Groove, meter: Meter = COMMON_TIME): number {
  const perBar = stepsPerBar(meter);
  const lengths = Object.values(groove.patterns)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p) => Math.ceil(p.length / perBar));
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
