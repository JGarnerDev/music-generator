/**
 * Tempo that changes inside a piece — a section that pushes, a rally that
 * accelerates into the peak, a turnaround that eases back to the loop's tempo.
 *
 * A composition's `bpm` is the tempo at bar 0; `tempo` lists changes after it.
 * Each change is either a **step** (the new tempo from that bar on) or a
 * **ramp** (glide from the previous change and arrive at this tempo on this
 * bar). Ramps are linear in *time*. The renderer's transport follows them as
 * one tempo step per sixteenth (see `RAMP_STAIR_BEATS`), landing exactly on
 * this map at every stair — and the loop file is cut at the sample this map
 * predicts, so the two must agree or the seam clicks.
 *
 * Note times stay in bars and beats. Only the conversion to seconds reads this,
 * so a piece written at one tempo plays at another without a note moving.
 *
 * Pure: the app turns `automation()` into transport calls.
 */
import { COMMON_TIME, beatsPerBar, notationToSeconds, type Meter } from "../utils/timing";

export interface TempoChange {
  /** Bar the change lands on. */
  bar: number;
  bpm: number;
  /** Glide here from the previous change instead of jumping on the barline. */
  ramp?: boolean;
}

/**
 * How long each stair of a ramp lasts, in beats. Tone's transport has a
 * `linearRampToValueAtTime` of its own, and it is broken: inside a ramp its
 * tick solver can put the next tick before the clock started, and the
 * scheduling loop throws and stops the rest of the ramp — in a long render that
 * was a whole section of silence with no error printed. Steps work, so a ramp
 * is sent as steps.
 */
export const RAMP_STAIR_BEATS = 0.25;

/** One stretch of the timeline with a constant or linearly gliding tempo. */
interface Segment {
  beat: number;
  seconds: number;
  /** Tempo at the segment's start and end — equal for a constant stretch. */
  from: number;
  to: number;
  /** Length in beats; Infinity for the last stretch. */
  beats: number;
}

/**
 * A transport instruction: hold `bpm` from `seconds`. `ramp` is always false
 * from `automation()` (ramps arrive as stairs); it stays so a caller that
 * glides is still expressible.
 */
export interface TempoEvent {
  seconds: number;
  bpm: number;
  ramp: boolean;
}

export interface TempoMap {
  /** Seconds from bar 0 to a position counted in quarter-note beats. */
  secondsAtBeat(beat: number): number;
  /** The tempo sounding at a beat. */
  bpmAtBeat(beat: number): number;
  /** `"bars:beats:sixteenths"` → seconds. */
  secondsAt(time: string): number;
  /** How long a note written at `time` with length `notation` rings, in seconds. */
  durationSeconds(time: string, notation: string): number;
  /**
   * The automation that makes a transport follow this map, for a render that
   * starts `offsetSeconds` into the piece: times are relative to that start,
   * and the first event holds whatever tempo is sounding there.
   */
  automation(offsetSeconds?: number): TempoEvent[];
  /** True when the piece never changes tempo. */
  readonly constant: boolean;
}

/** Beats elapsed `t` seconds into a segment. */
function beatsInto(seg: Segment, t: number): number {
  if (seg.from === seg.to) return (t * seg.from) / 60;
  const span = (120 * seg.beats) / (seg.from + seg.to);
  return (seg.from * t + ((seg.to - seg.from) * t * t) / (2 * span)) / 60;
}

/** Seconds into a segment at which `x` beats have elapsed — the inverse of `beatsInto`. */
function secondsInto(seg: Segment, x: number): number {
  if (seg.from === seg.to) return (60 * x) / seg.from;
  const span = (120 * seg.beats) / (seg.from + seg.to);
  const a = (seg.to - seg.from) / (2 * span);
  return (-seg.from + Math.sqrt(seg.from * seg.from + 4 * a * 60 * x)) / (2 * a);
}

function segmentLength(seg: Segment): number {
  return seg.from === seg.to
    ? (60 * seg.beats) / seg.from
    : (120 * seg.beats) / (seg.from + seg.to);
}

export function tempoMap(comp: {
  bpm: number;
  tempo?: readonly TempoChange[];
  meter?: Meter;
}): TempoMap {
  const meter = comp.meter ?? COMMON_TIME;
  const perBar = beatsPerBar(meter);
  // Stable sort: two changes on one bar keep their written order, so a ramp can
  // arrive on a barline and a step can leave it.
  const changes = [...(comp.tempo ?? [])]
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => a.bar - b.bar || a.i - b.i);

  const segments: Segment[] = [];
  let beat = 0;
  let seconds = 0;
  let bpm = comp.bpm;
  for (const change of changes) {
    const at = change.bar * perBar;
    const beats = at - beat;
    if (beats > 0) {
      const seg = { beat, seconds, from: bpm, to: change.ramp ? change.bpm : bpm, beats };
      segments.push(seg);
      seconds += segmentLength(seg);
      beat = at;
    }
    bpm = change.bpm;
  }
  segments.push({ beat, seconds, from: bpm, to: bpm, beats: Infinity });

  const segmentAtBeat = (b: number): Segment => {
    for (let i = segments.length - 1; i >= 0; i--) if (b >= segments[i]!.beat) return segments[i]!;
    return segments[0]!;
  };
  const segmentAtSeconds = (s: number): Segment => {
    for (let i = segments.length - 1; i >= 0; i--)
      if (s >= segments[i]!.seconds) return segments[i]!;
    return segments[0]!;
  };

  const secondsAtBeat = (b: number): number => {
    const seg = segmentAtBeat(b);
    return seg.seconds + secondsInto(seg, b - seg.beat);
  };
  const bpmAtSeconds = (s: number): number => {
    const seg = segmentAtSeconds(s);
    if (seg.from === seg.to) return seg.from;
    return seg.from + ((seg.to - seg.from) * (s - seg.seconds)) / segmentLength(seg);
  };
  const beatOf = (time: string): number => notationBeats(time, perBar);

  return {
    constant:
      segments.every((s) => s.from === s.to) && new Set(segments.map((s) => s.from)).size === 1,
    secondsAtBeat,
    bpmAtBeat: (b) => bpmAtSeconds(secondsAtBeat(b)),
    secondsAt: (time) => secondsAtBeat(beatOf(time)),
    durationSeconds(time, notation) {
      const start = beatOf(time);
      // At 60 bpm a second is a beat, so this is the note's length in beats.
      const length = notationToSeconds(notation, 60, meter);
      return secondsAtBeat(start + length) - secondsAtBeat(start);
    },
    automation(offsetSeconds = 0) {
      // Every change as a step in piece time. A ramp becomes a staircase, one
      // stair per sixteenth, each stair's tempo chosen so it lasts exactly as
      // long as that sixteenth does on the map — so transport and map agree on
      // every sixteenth, and in between are off by well under a millisecond.
      const steps: { seconds: number; bpm: number }[] = [];
      for (const seg of segments) {
        if (seg.from === seg.to) {
          steps.push({ seconds: seg.seconds, bpm: seg.from });
          continue;
        }
        for (let b = 0; b < seg.beats - 1e-9; b += RAMP_STAIR_BEATS) {
          const at = secondsAtBeat(seg.beat + b);
          const stair = Math.min(RAMP_STAIR_BEATS, seg.beats - b);
          const length = secondsAtBeat(seg.beat + b + stair) - at;
          steps.push({ seconds: at, bpm: (60 * stair) / length });
        }
      }

      // Hold whatever stair is sounding at the seek point, then the rest after it.
      let held = steps[0]!.bpm;
      for (const step of steps) if (step.seconds <= offsetSeconds + 1e-9) held = step.bpm;
      const events: TempoEvent[] = [{ seconds: 0, bpm: held, ramp: false }];
      for (const step of steps) {
        const at = step.seconds - offsetSeconds;
        if (at > 1e-9) events.push({ seconds: at, bpm: step.bpm, ramp: false });
      }
      return events;
    },
  };
}

/** `"bars:beats:sixteenths"` → quarter-note beats from bar 0. */
function notationBeats(time: string, perBar: number): number {
  const parts = time.trim().split(":");
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) {
    throw new Error(`invalid transport time: "${time}"`);
  }
  const [bars = 0, beats = 0, sixteenths = 0] = parts.map(Number);
  return bars * perBar + beats + sixteenths / 4;
}

/** Problems with a composition's `tempo` list, as `[path, message]` pairs. */
export function tempoIssues(tempo: unknown): [string, string][] {
  if (!Array.isArray(tempo)) return [["tempo", "must be an array of { bar, bpm, ramp? }"]];
  const issues: [string, string][] = [];
  tempo.forEach((c, i) => {
    const path = `tempo[${i}]`;
    if (typeof c !== "object" || c === null) {
      issues.push([path, "must be an object"]);
      return;
    }
    const { bar, bpm, ramp } = c as Record<string, unknown>;
    if (typeof bar !== "number" || !Number.isInteger(bar) || bar < 0) {
      issues.push([`${path}.bar`, "must be a non-negative integer"]);
    }
    if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) {
      issues.push([`${path}.bpm`, "must be a positive number"]);
    }
    if (ramp !== undefined && typeof ramp !== "boolean")
      issues.push([`${path}.ramp`, "must be a boolean"]);
  });
  return issues;
}

/** A section's place on the timeline and what it asks of the tempo. */
export interface SectionTempo {
  start: number;
  end: number;
  /** Tempo from the section's first bar. Omitted = keep whatever is sounding. */
  bpm?: number;
  /** Glide from the section's opening tempo to this one, arriving on its last barline. */
  rampTo?: number;
}

/**
 * Sections' `bpm`/`rampTo` → a composition's `tempo` list after the piece's
 * opening `bpm`. A ramp is anchored on its section's first bar even when the
 * tempo didn't change there, because a ramp glides from the *previous* change
 * — without the anchor it would start sections earlier.
 */
export function sectionTempoChanges(bpm: number, sections: readonly SectionTempo[]): TempoChange[] {
  const changes: TempoChange[] = [];
  let current = bpm;
  for (const s of sections) {
    const opening = s.bpm ?? current;
    const anchor = s.rampTo !== undefined && s.rampTo !== opening;
    if (opening !== current || (anchor && changes.at(-1)?.bar !== s.start)) {
      if (!(s.start === 0 && opening === bpm)) changes.push({ bar: s.start, bpm: opening });
    }
    current = opening;
    if (anchor) {
      changes.push({ bar: s.end, bpm: s.rampTo!, ramp: true });
      current = s.rampTo!;
    }
  }
  return changes;
}
