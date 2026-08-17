/**
 * How a transcription *reads*.
 *
 * [`./transcribe`](./transcribe.ts) turns audio into notes; this turns those
 * notes into the paragraph a composer works from. They are separate because the
 * jobs are separate: extraction is about being faithful to what was played,
 * description is about surfacing the handful of facts that decide what to do
 * with it — where the peak is, which bar repeats which, what sits outside the
 * key, how much silence there is.
 *
 * The audience is Claude, who cannot hear the recording. So the summary is the
 * whole interface, and it is written to answer the questions
 * [`../../docs/hooks.md`](../../docs/hooks.md) asks about any phrase, in the
 * order it asks them.
 */
import { COMMON_TIME, type Meter, stepsPerBar } from "../utils/timing";
import { midiToPitch } from "./theory";
import { degreesOf, formatDegree, type Key, type QuantizedNote } from "./transcribe";

/** Everything the summary needs. The shape `scripts/transcribe.ts` assembles. */
export interface TranscriptView {
  name: string;
  bpm: number;
  meter?: Meter;
  key?: Key;
  notes: readonly QuantizedNote[];
}

/** Notes bucketed by the bar their onset falls in. Empty bars come back empty, not missing. */
export function groupByBar(notes: readonly QuantizedNote[], meter: Meter = COMMON_TIME): QuantizedNote[][] {
  if (notes.length === 0) return [];
  const perBar = stepsPerBar(meter);
  const barCount = Math.floor(Math.max(...notes.map((n) => n.step)) / perBar) + 1;
  const bars: QuantizedNote[][] = Array.from({ length: barCount }, () => []);
  for (const note of notes) bars[Math.floor(note.step / perBar)]!.push(note);
  return bars;
}

/**
 * The rhythm of one bar as a step string: `x` an onset, `-` a note still
 * sounding, `.` silence.
 *
 * Silence is half the information. A bar written `x..x....x.......` is a
 * different idea from `xxxxxxxxxxxxxxxx` in a way no list of pitches shows, and
 * it is the thing a groove has to be built around.
 */
export function rhythmLane(
  notes: readonly QuantizedNote[],
  bar: number,
  meter: Meter = COMMON_TIME,
): string {
  const perBar = stepsPerBar(meter);
  const start = bar * perBar;
  const lane = new Array<string>(perBar).fill(".");
  for (const note of notes) {
    for (let s = note.step; s < note.step + note.lengthSteps; s++) {
      const at = s - start;
      if (at < 0 || at >= perBar) continue;
      lane[at] = s === note.step ? "x" : lane[at] === "." ? "-" : lane[at]!;
    }
  }
  return lane.join("");
}

/** The shape a line traces, and where its high point is. */
export interface Contour {
  /** Index into the notes of the highest pitch — the peak, on its first arrival. */
  peakIndex: number;
  lowIndex: number;
  /** Semitones between the lowest and highest note. */
  rangeSemitones: number;
  shape: "rising" | "falling" | "arch" | "valley" | "wandering" | "static";
}

/**
 * Classify the melodic shape.
 *
 * Only six shapes, deliberately. The value is not a precise curve — the note
 * list already is one — it is a name for the gesture, because "arch, peaking in
 * bar 3" is the sentence that decides where the piece's own peak should go and
 * whether the recording's is being used or wasted.
 */
export function describeContour(midis: readonly number[]): Contour {
  if (midis.length === 0) throw new Error("describeContour: no notes");
  const high = Math.max(...midis);
  const low = Math.min(...midis);
  const peakIndex = midis.indexOf(high);
  const lowIndex = midis.indexOf(low);
  const rangeSemitones = high - low;

  if (rangeSemitones < 2) return { peakIndex, lowIndex, rangeSemitones, shape: "static" };

  const first = midis[0]!;
  const last = midis.at(-1)!;
  const net = last - first;
  const middle = (index: number) => index > 0 && index < midis.length - 1;

  // An arch has to actually come back down, not merely peak somewhere inside.
  if (middle(peakIndex) && high - first >= 3 && high - last >= 3) {
    return { peakIndex, lowIndex, rangeSemitones, shape: "arch" };
  }
  if (middle(lowIndex) && first - low >= 3 && last - low >= 3) {
    return { peakIndex, lowIndex, rangeSemitones, shape: "valley" };
  }
  if (net >= 3) return { peakIndex, lowIndex, rangeSemitones, shape: "rising" };
  if (net <= -3) return { peakIndex, lowIndex, rangeSemitones, shape: "falling" };
  return { peakIndex, lowIndex, rangeSemitones, shape: "wandering" };
}

/** A run of notes with no long rest inside it. */
export interface Phrase {
  startStep: number;
  endStep: number;
  noteCount: number;
  lengthSteps: number;
}

/**
 * Split at every rest of `gapSteps` or more (one beat by default).
 *
 * Phrase lengths are what `docs/variety.md` calls the squareness knob: four bars,
 * four bars, four bars is the default that makes everything sound like everything
 * else, and a recording that breathes in 3 + 5 is worth more than one that
 * doesn't precisely because of that.
 */
export function findPhrases(notes: readonly QuantizedNote[], gapSteps = 4): Phrase[] {
  if (notes.length === 0) return [];
  const sorted = [...notes].sort((a, b) => a.step - b.step);
  const phrases: Phrase[] = [];
  let start = sorted[0]!.step;
  let end = start + sorted[0]!.lengthSteps;
  let count = 1;

  for (const note of sorted.slice(1)) {
    if (note.step - end >= gapSteps) {
      phrases.push({ startStep: start, endStep: end, noteCount: count, lengthSteps: end - start });
      start = note.step;
      end = note.step + note.lengthSteps;
      count = 1;
      continue;
    }
    end = Math.max(end, note.step + note.lengthSteps);
    count++;
  }
  phrases.push({ startStep: start, endStep: end, noteCount: count, lengthSteps: end - start });
  return phrases;
}

/**
 * The whole summary, as the block printed to the terminal and pasted into a
 * conversation.
 *
 * Degrees rather than pitches wherever a key is known, because degrees are the
 * transposable idea and pitches are an accident of how the guitar was tuned that
 * day.
 */
export function summarizeTranscript(view: TranscriptView): string {
  const meter = view.meter ?? COMMON_TIME;
  const { notes, key } = view;
  if (notes.length === 0) return `${view.name} — nothing detected.`;

  const perBar = stepsPerBar(meter);
  const midis = notes.map((n) => n.midi);
  const degrees = key ? degreesOf(midis, key) : undefined;
  const tokens = degrees
    ? degrees.map(formatDegree)
    : midis.map((m) => midiToPitch(m, "sharps"));
  const bars = groupByBar(notes, meter);
  const contour = describeContour(midis);
  const phrases = findPhrases(notes);

  const lines: string[] = [];
  const heading = [
    `${notes.length} notes`,
    `${bars.length} ${bars.length === 1 ? "bar" : "bars"}`,
    key ? `${key.tonic} ${key.mode}` : "key unknown",
    `${view.bpm} BPM`,
    meter.join("/"),
  ].join(" · ");
  lines.push(`${view.name} — ${heading}`, "");
  lines.push(...barGrid(notes, tokens, meter), "");

  // Rhythm as its own block, so repeated bars are visible at a glance.
  const lanes = bars.map((_, bar) => rhythmLane(notes, bar, meter));
  lines.push(`  rhythm    ${lanes.join(" | ")}`);
  const repeats = lanes
    .map((lane, i) => [lane, i] as const)
    .filter(([lane, i]) => i > 0 && lane === lanes[i - 1])
    .map(([, i]) => `bar ${i + 1}`);
  if (repeats.length > 0) lines.push(`            ${repeats.join(", ")} repeat${repeats.length === 1 ? "s" : ""} the bar before`);

  lines.push(`  ${key ? "degrees" : "pitches"}   ${tokens.join(" ")}`);

  const low = midiToPitch(Math.min(...midis), "sharps");
  const high = midiToPitch(Math.max(...midis), "sharps");
  lines.push(`  range     ${low}–${high} (${contour.rangeSemitones} semitones)`);
  lines.push(`  contour   ${describeContourLine(contour, tokens, notes, perBar)}`);
  lines.push(`  phrases   ${describePhrases(phrases, perBar)}`);

  const outside = degrees
    ?.map((d, i) => ({ d, i }))
    .filter(({ d }) => !d.inScale)
    .map(({ d, i }) => `${formatDegree(d)} (bar ${Math.floor(notes[i]!.step / perBar) + 1})`);
  if (outside && outside.length > 0) {
    lines.push(`  outside   ${outside.join(", ")} — the colour, keep ${outside.length === 1 ? "it" : "them"}`);
  }

  const sounding = notes.reduce((sum, n) => sum + n.lengthSteps, 0);
  const total = bars.length * perBar;
  lines.push(`  density   ${notes.length} notes over ${total} steps, ${Math.round((sounding / total) * 100)}% sounding`);

  return lines.join("\n");
}

/** What the confirm checklist needs to know about the run that produced the take. */
export interface ConfirmContext {
  /** The emitted composition's slug — the row to play in the bench. */
  slug: string;
  /** The recording's row, sitting beside it. */
  takeName: string;
  bpm: number;
  bpmSource: "given" | "estimated";
  /** 0..1, when the tempo was estimated. */
  confidence?: number;
  grid: 1 | 2 | 4;
  minAmplitude: number;
  mode: "literal" | "shape";
  hasKey: boolean;
}

/**
 * The listen-and-report step, written as symptoms rather than settings.
 *
 * **This is the part that makes the pipeline trustworthy.** Nothing upstream
 * knows whether it got the take right — the detector has no idea it invented a
 * note, and neither do I, because I cannot hear either the recording or the
 * render. The user can, in about fifteen seconds, and the only thing standing
 * between "that's wrong" and a fix is knowing which knob a given wrongness maps
 * to. So the checklist is indexed by what it *sounds like*, not by flag name.
 *
 * Ordered by likelihood for this particular run: a guessed tempo is the weakest
 * link in the chain (see `estimateTempo`) and goes first when it was guessed,
 * last when it was given.
 *
 * Every line is a `--requantize` fix. That is worth stating plainly: the model
 * runs once per take and everything after it is re-derivable, so a wrong reading
 * costs seconds to correct rather than another minute of transcription. A confirm
 * loop nobody wants to go round twice is not a confirm loop.
 */
export function confirmChecklist(ctx: ConfirmContext): string {
  const amp = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
  const tempo = {
    symptom: "the notes are right but it drifts against the take",
    fix: `--tempo <bpm>`,
    note:
      ctx.bpmSource === "estimated"
        ? `guessed ${ctx.bpm}, confidence ${ctx.confidence ?? "?"} — try half or double it too`
        : `${ctx.bpm} was given, so this is the least likely one`,
  };

  const rows: Array<{ symptom: string; fix: string; note?: string }> = [
    { symptom: "notes it never played, mostly quiet ones", fix: `--min-amplitude ${amp(ctx.minAmplitude + 0.1)}`, note: `${ctx.minAmplitude} now` },
    { symptom: "notes it did play are missing", fix: `--min-amplitude ${amp(ctx.minAmplitude - 0.1)}` },
  ];
  if (ctx.grid > 1) {
    rows.push({ symptom: "rhythm lands on offbeats nobody played", fix: `--grid ${ctx.grid === 4 ? 2 : 1}`, note: "a coarser grid" });
  }
  if (ctx.grid < 4) {
    rows.push({ symptom: "a fast run got flattened into fewer notes", fix: `--grid ${ctx.grid === 1 ? 2 : 4}`, note: "a finer grid" });
  }
  rows.push({ symptom: "two notes at once came out as one", fix: "--polyphonic" });
  rows.push(tempo);
  if (ctx.bpmSource === "estimated") rows.unshift(rows.pop()!);

  const width = Math.max(...rows.map((r) => r.symptom.length));
  const lines = [
    `confirm it — play ${ctx.slug} against ${ctx.takeName} in the bench (npm run dev)`,
    "",
    "  Listen for what is wrong, then re-run with --requantize and the fix beside it.",
    "  Requantizing reuses the saved detector output, so every one of these is instant.",
    "",
    ...rows.map((r) => `  ${r.symptom.padEnd(width)}   ${r.fix}${r.note ? `   (${r.note})` : ""}`),
    "",
  ];

  if (ctx.mode === "shape") {
    lines.push("  Shape mode: the pitches are meant to differ — the take is the reference for the");
    lines.push("  intervals and the rhythm only, so listen to the leaps and the gaps, not the key.");
  }
  if (!ctx.hasKey) {
    lines.push("  No --key was given, so the piece is spelled by guesswork. Pass one and it is");
    lines.push("  spelled against the key, which is also what makes the idea transposable.");
  }
  lines.push("  Everything a step off, or the phrase starting in the wrong bar, is a take problem");
  lines.push("  rather than a flag: re-record with a one-bar count-in (recordings/readme.md).");

  return lines.join("\n");
}

/**
 * One row per bar, a cell per step, `tokens[i]` written where note `i` starts.
 *
 * Shared with the shape summary, which draws the same grid with intervals in the
 * cells instead of degrees — the picture is the point, and it should be the same
 * picture in both modes.
 */
export function barGrid(
  notes: readonly QuantizedNote[],
  tokens: readonly string[],
  meter: Meter = COMMON_TIME,
): string[] {
  const perBar = stepsPerBar(meter);
  const width = Math.max(...tokens.map((t) => t.length), 1) + 1;
  const indexOf = new Map(notes.map((n, i) => [n, i]));
  return groupByBar(notes, meter).map((barNotes, bar) => {
    const cells = new Array<string>(perBar).fill(".");
    for (const note of barNotes) cells[note.step - bar * perBar] = tokens[indexOf.get(note)!]!;
    const grid = cells.map((c) => c.padEnd(width)).join("").trimEnd();
    return `  bar ${String(bar + 1).padStart(2)}  |${grid}`;
  });
}

/** The contour as a sentence, with the peak located by token and bar. */
export function describeContourLine(
  contour: Contour,
  tokens: readonly string[],
  notes: readonly QuantizedNote[],
  perBar: number,
): string {
  const peakBar = Math.floor(notes[contour.peakIndex]!.step / perBar) + 1;
  const where = `peak ${tokens[contour.peakIndex]} in bar ${peakBar}`;
  const shape: Record<Contour["shape"], string> = {
    rising: "rises and stays up",
    falling: "falls away",
    arch: "climbs and comes back down",
    valley: "dips and recovers",
    wandering: "circles without committing",
    static: "sits still",
  };
  return `${shape[contour.shape]} — ${where}`;
}

/** Phrase lengths as bars where they are whole and beats where they aren't. */
export function describePhrases(phrases: readonly Phrase[], perBar: number): string {
  const lengths = phrases.map((p) => {
    const bars = p.lengthSteps / perBar;
    if (Number.isInteger(bars)) return `${bars} bar${bars === 1 ? "" : "s"}`;
    // Beats, to one decimal only when it isn't whole. A phrase of "6 beats" that
    // is really 6.25 is the kind of rounding that makes a seam not line up.
    const beats = p.lengthSteps / 4;
    return `${Number.isInteger(beats) ? beats : beats.toFixed(2).replace(/0$/, "")} beats`;
  });
  const square = phrases.length > 1 && new Set(lengths).size === 1;
  return `${lengths.join(" + ")}${square ? " — square, so a piece built on it needs its asymmetry elsewhere" : ""}`;
}
