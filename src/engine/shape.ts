/**
 * A melody with the accidents removed.
 *
 * A transcription is faithful to one take: this pitch, this tempo, this tuning.
 * Most of that is not the idea. The guitar was in whatever key it was in, the
 * take was at whatever tempo the player counted, and neither fact should follow
 * the tune into a piece written six months later in D minor at 78 BPM.
 *
 * What survives is **intervals and rhythm**: the leap that makes the hook a hook,
 * the rest that makes it breathe, the note that is held twice as long as its
 * neighbours. That is a `MelodicShape`, and it is what `--mode shape` prints.
 *
 * The pair to read together is [`./transcript`](./transcript.ts) — same notes,
 * described absolutely. Use literal when the recording *is* the part and it will
 * be quoted; use shape when the recording is a demonstration of a gesture that
 * has to be rewritten in the piece's own key and register.
 */
import { COMMON_TIME, type Meter, stepsPerBar } from "../utils/timing";
import { type Key, type QuantizedNote } from "./transcribe";
import { pitchToMidi, scaleNotes } from "./theory";
import {
  barGrid,
  describeContour,
  describeContourLine,
  describePhrases,
  findPhrases,
  rhythmLane,
} from "./transcript";

/** One note said in relative terms: how far from the last one, in pitch and in time. */
export interface ShapeNote {
  /** Semitones from the previous note. 0 on the first note, which has nothing to be relative to. */
  interval: number;
  /** Steps from the previous onset. 0 on the first note. A rest shows up here as a large gap. */
  gapSteps: number;
  lengthSteps: number;
  velocity: number;
}

/** A melody stripped to what transposes: intervals, rhythm, and where the phrase starts in its bar. */
export interface MelodicShape {
  notes: ShapeNote[];
  /**
   * Where the first note sits inside its bar. Nonzero means a pickup, and a pickup
   * is part of the idea — dropping it moves the hook onto the downbeat and makes it
   * a different hook.
   */
  startStep: number;
  /** First onset to last release. */
  lengthSteps: number;
}

/** Strip a quantized take down to its shape. */
export function toShape(notes: readonly QuantizedNote[]): MelodicShape {
  if (notes.length === 0) return { notes: [], startStep: 0, lengthSteps: 0 };
  const sorted = [...notes].sort((a, b) => a.step - b.step || a.midi - b.midi);
  const first = sorted[0]!;
  const end = Math.max(...sorted.map((n) => n.step + n.lengthSteps));

  return {
    notes: sorted.map((note, i) => {
      const prior = sorted[i - 1];
      return {
        interval: prior ? note.midi - prior.midi : 0,
        gapSteps: prior ? note.step - prior.step : 0,
        lengthSteps: note.lengthSteps,
        velocity: note.velocity,
      };
    }),
    startStep: first.step,
    lengthSteps: end - first.step,
  };
}

export interface ApplyShapeOptions {
  /** MIDI pitch of the first note. Everything else follows from the intervals. */
  rootMidi: number;
  /** Step of the first note. Defaults to the shape's own, which keeps a pickup a pickup. */
  startStep?: number;
  /**
   * Snap every pitch into this key. Without it the intervals come out exact, which
   * is faithful to the take but only safe at the octave — see `applyShape`.
   */
  key?: Key;
}

/**
 * Write a shape back out as notes, rooted wherever the piece needs it.
 *
 * Exact semitone intervals are the honest reading of what was played, and they
 * are also the reason a transposed melody stops fitting: a phrase built on the
 * minor third of A lands on a note outside the scale when it is moved to C, and
 * the chords underneath make that audible immediately. So pass `key` and the
 * pitches are snapped into it — the shape survives, each note is playable over
 * the harmony, and only the odd interval is bent by a semitone to get there.
 *
 * Each note is placed from the *unsnapped* running line, so the snapping cannot
 * accumulate: bending one note into the scale never drags the rest of the phrase
 * off pitch behind it.
 */
export function applyShape(shape: MelodicShape, options: ApplyShapeOptions): QuantizedNote[] {
  const { rootMidi, startStep = shape.startStep, key } = options;
  const snap = key ? scaleSnapper(key) : undefined;

  const out: QuantizedNote[] = [];
  let exact = rootMidi;
  let step = startStep;
  for (const [i, note] of shape.notes.entries()) {
    if (i > 0) {
      exact += note.interval;
      step += note.gapSteps;
    }
    out.push({
      step,
      lengthSteps: note.lengthSteps,
      midi: snap ? snap(exact, note.interval) : exact,
      velocity: note.velocity,
    });
  }
  return out;
}

/**
 * Nearest pitch in the key, ties broken in the direction the line was already
 * travelling — a leap upward that lands between two scale tones should carry on
 * up rather than turn around, which is the difference between a shape kept and a
 * shape flattened.
 */
function scaleSnapper(key: Key): (midi: number, direction: number) => number {
  const pcs = new Set(scaleNotes(key.tonic, key.mode).map((n) => pitchToMidi(`${n}0`) % 12));
  return (midi, direction) => {
    const order = direction < 0 ? [0, -1, 1, -2, 2, -3, 3] : [0, 1, -1, 2, -2, 3, -3];
    for (const offset of order) {
      const candidate = midi + offset;
      if (pcs.has(((candidate % 12) + 12) % 12)) return candidate;
    }
    return midi; // unreachable for any real scale: no gap of seven semitones exists
  };
}

/** `+3`, `-5`, `0` — signed so a glance reads the direction, not just the size. */
export function formatInterval(semitones: number): string {
  return semitones > 0 ? `+${semitones}` : String(semitones);
}

export interface ShapeView {
  name: string;
  meter?: Meter;
  shape: MelodicShape;
}

/**
 * The shape as the block printed by `--mode shape`.
 *
 * Deliberately says nothing about tempo, key or pitch — not because they are
 * unknown but because naming them invites reusing them, and the whole point of
 * this mode is a gesture that gets rewritten. Steps are the time unit throughout,
 * and a step is a fraction of a beat at any tempo.
 */
export function summarizeShape(view: ShapeView): string {
  const meter = view.meter ?? COMMON_TIME;
  const { shape } = view;
  if (shape.notes.length === 0) return `${view.name} — nothing to shape.`;

  const perBar = stepsPerBar(meter);
  // Lay the shape back onto a grid at an arbitrary root purely so it can be drawn;
  // nothing absolute survives into the text.
  const placed = applyShape(shape, { rootMidi: 0 });
  const tokens = shape.notes.map((n, i) => (i === 0 ? "0" : formatInterval(n.interval)));
  const contour = describeContour(placed.map((n) => n.midi));
  const bars = Math.floor(Math.max(...placed.map((n) => n.step)) / perBar) + 1;

  const lines: string[] = [];
  lines.push(
    `${view.name} — shape only · ${shape.notes.length} notes · ${bars} ${bars === 1 ? "bar" : "bars"} · ${meter.join("/")}`,
    "",
  );
  lines.push(...barGrid(placed, tokens, meter), "");

  const lanes = Array.from({ length: bars }, (_, bar) => rhythmLane(placed, bar, meter));
  lines.push(`  rhythm    ${lanes.join(" | ")}`);
  lines.push(`  intervals ${tokens.slice(1).join(" ") || "—"}`);
  lines.push(`  lengths   ${shape.notes.map((n) => n.lengthSteps).join(" ")} steps`);
  lines.push(`  span      ${contour.rangeSemitones} semitones`);
  // The peak is located by position, not by token: "peak +5" would name the leap
  // that arrives at the high note rather than the high note itself.
  const positions = shape.notes.map((_, i) => `note ${i + 1}`);
  lines.push(`  contour   ${describeContourLine(contour, positions, placed, perBar)}`);
  lines.push(`  phrases   ${describePhrases(findPhrases(placed), perBar)}`);
  if (shape.startStep > 0) {
    lines.push(`  pickup    starts ${shape.startStep} step${shape.startStep === 1 ? "" : "s"} into the bar — keep it there`);
  }
  lines.push(`  rewrite   root it anywhere; snap to the piece's key so the leaps stay legal`);

  return lines.join("\n");
}
