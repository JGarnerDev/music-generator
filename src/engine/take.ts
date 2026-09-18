/**
 * A keyboard performance, from held keys to a file a composer can read.
 *
 * The important thing about this module is how little of it there is. A take is
 * the same journey a guitar recording makes — notes, on a grid, described in
 * degrees — so everything after the capture is
 * [`./transcribe`](./transcribe.ts) and [`./transcript`](./transcript.ts),
 * already written and already tested. What is new is only the front: a key that
 * went down at one millisecond and came up at another *is* a note, exactly,
 * with no detector in between.
 *
 * That exactness is the reason this path is worth having next to `transcribe`
 * rather than folded into it. Audio transcription spends its effort being
 * unsure — octave doubling, string noise, an onset that might be a grace note —
 * and its flags (`--requantize`, `minAmplitude`, the midi range) are all there
 * to argue with a guess. Here there is nothing to argue with: the pitch is the
 * key that was pressed.
 *
 * So the take asks the player for **nothing but a name**. The tempo is whatever
 * the click was set to, the key is inferred from what was played
 * ([`./key-guess`](./key-guess.ts)), and the grid is sixteenths until somebody
 * reading it back says otherwise. Every one of those was a form field once, and
 * every one of them was a question asked at the moment a musical idea was in
 * somebody's hands and leaving.
 */
import { COMMON_TIME, type Meter } from "../utils/timing";
import { DEFAULT_BEND_OVER, type BendSpec } from "./bend";
import type { Composition, InstrumentName } from "./composition";
import { formatKey, guessKey, relativeOf } from "./key-guess";
import {
  type DetectedNote,
  type Key,
  type QuantizedNote,
  parseKey,
  quantizeNotes,
  toComposition,
} from "./transcribe";
import { summarizeTranscript } from "./transcript";

/**
 * One key, from the moment it went down to the moment it came up.
 *
 * Times are milliseconds on a monotonic clock (`performance.now`), not
 * wall-clock — a take is a handful of seconds of *relative* timing, and the
 * system clock is free to step sideways in the middle of one.
 */
export interface KeyPress {
  midi: number;
  downMs: number;
  /** When the key came up. A key still held when recording stopped ends at the stop. */
  upMs: number;
  /** 0..1. The computer keyboard has no velocity sensor — see `DEFAULT_VELOCITY`. */
  velocity: number;
}

/**
 * A bend held down while something was sounding.
 *
 * Recorded as its own gesture rather than as a property of a note because that
 * is what it is at the keyboard: the bend key is a pitch wheel, not part of any
 * one note. Which note ends up carrying it is worked out afterwards, by
 * `attachBends`, from what was actually ringing at the time.
 */
export interface BendGesture {
  /** When the bend key went down. */
  atMs: number;
  /** Where it bent to, in semitones. Negative bends down. */
  semitones: number;
  /** When it came up, if it did before the recording stopped. */
  releasedMs?: number;
}

/**
 * What a key press is worth when nothing says otherwise.
 *
 * A computer keyboard sends no velocity: every note arrives at exactly this
 * value unless the player moved the velocity control between phrases. Left at a
 * flat 1.0 a take renders as a machine, so the default sits back at 0.8 and the
 * page offers four steps — the accents have to be *chosen* here, and a take
 * that wants them played in wants a MIDI controller.
 */
export const DEFAULT_VELOCITY = 0.8;

/** The velocity steps the page offers, soft to hard. */
export const VELOCITY_STEPS: readonly number[] = [0.4, 0.6, 0.8, 1];

/** Move up or down the velocity steps, stopping at the ends. */
export function stepVelocity(velocity: number, delta: number): number {
  const nearest = VELOCITY_STEPS.reduce((best, step) =>
    Math.abs(step - velocity) < Math.abs(best - velocity) ? step : best,
  );
  const at = VELOCITY_STEPS.indexOf(nearest);
  return VELOCITY_STEPS[Math.min(VELOCITY_STEPS.length - 1, Math.max(0, at + delta))]!;
}

/** The shortest a press may be and still count — below this it is a fumbled key, not a note. */
export const MIN_PRESS_MS = 20;

/**
 * Presses as the detector shape the rest of the pipeline consumes.
 *
 * `startMs` is subtracted rather than assumed to be the first press: with a
 * click running, bar 1 begins when the click said so, and a take whose first
 * note lands late is a take with a rest at the front — which is a musical fact
 * worth keeping, not an offset to normalise away.
 */
export function pressesToDetected(
  presses: readonly KeyPress[],
  options: { startMs?: number; minPressMs?: number } = {},
): DetectedNote[] {
  const { startMs = 0, minPressMs = MIN_PRESS_MS } = options;
  return presses
    .filter((press) => press.upMs - press.downMs >= minPressMs)
    .map((press) => ({
      midi: press.midi,
      startSeconds: (press.downMs - startMs) / 1000,
      durationSeconds: (press.upMs - press.downMs) / 1000,
      amplitude: press.velocity,
    }))
    .filter((note) => note.startSeconds >= 0)
    .sort((a, b) => a.startSeconds - b.startSeconds || a.midi - b.midi);
}

/** A note on the grid, and where its pitch travelled if the bend key was down. */
export type TakeNote = QuantizedNote & { bend?: BendSpec };

/** A saved performance: `recordings/keys/<name>.take.json`. */
export interface Take {
  name: string;
  /** ISO timestamp. The only wall-clock time here, and it is metadata. */
  recordedAt: string;
  bpm: number;
  /** `Am`, `D dorian` — what the notes are read against. See `keyGuessed`. */
  key: string;
  /**
   * Whether `key` was inferred from the notes rather than stated by the player.
   *
   * Worth a flag because it changes how much the field is worth believing: a
   * guess is right about the *notes* and can be wrong about which of a relative
   * pair is home. `npm run take:read -- --key <key>` overrides it, and the
   * summary names the alternative so there is something to override it *to*.
   */
  keyGuessed?: boolean;
  meter?: Meter;
  /** What it was played on, so the emitted piece can start from the same sound. */
  instrument: InstrumentName;
  voice?: string;
  /** Grid the notes were snapped to: 4 sixteenths, 2 eighths, 1 quarters. */
  grid: 1 | 2 | 4;
  /**
   * Whether every note was cut at the next onset.
   *
   * Off by default here, and that is the one place this pipeline disagrees with
   * the guitar one. `quantizeNotes` truncates by default because a struck string
   * rings past the phrase and reads as a held chord it never was — but on a
   * keyboard a held chord *is* a held chord. Guessing wrong in this direction
   * silently deletes the harmony, so a keyboard take keeps what was held.
   */
  monophonic: boolean;
  notes: TakeNote[];
}

export interface BuildTakeInput {
  name: string;
  presses: readonly KeyPress[];
  bpm: number;
  /** Omit to infer it from the notes — which is what the bench does. */
  key?: string;
  bends?: readonly BendGesture[];
  meter?: Meter;
  instrument: InstrumentName;
  voice?: string;
  grid?: 1 | 2 | 4;
  monophonic?: boolean;
  /** Clock reading where bar 1 begins — the downbeat the click landed on. */
  startMs?: number;
  recordedAt?: string;
}

/**
 * A finished take from what was played.
 *
 * Throws on an empty performance rather than writing a file with no notes in
 * it: the failure to catch is "the recording did not hear me", and an empty
 * take on disk is that failure wearing a success message.
 */
export function buildTake(input: BuildTakeInput): Take {
  const { grid = 4, monophonic = false, meter = COMMON_TIME, startMs = 0 } = input;
  if (input.key !== undefined) parseKey(input.key); // reject an unusable key here, not four steps later
  const detected = pressesToDetected(input.presses, { startMs });
  if (detected.length === 0) throw new Error("buildTake: nothing was played");
  const quantized = quantizeNotes(detected, { bpm: input.bpm, meter, grid, offsetSeconds: 0, monophonic });
  const notes = attachBends(quantized, input.bends ?? [], { bpm: input.bpm, startMs });
  const guessed = input.key === undefined;

  return {
    name: input.name,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    bpm: input.bpm,
    key: input.key ?? formatKey(guessKey(notes.map((note) => note.midi))),
    ...(guessed ? { keyGuessed: true } : {}),
    meter,
    instrument: input.instrument,
    voice: input.voice,
    grid,
    monophonic,
    notes,
  };
}

/**
 * The deepest a bend may start into its note, as a fraction of it.
 *
 * Not a taste decision — it is the arithmetic `validateComposition` enforces:
 * a bend needs room for its travel, and a *released* bend needs room for two.
 * Past that point there is nothing left of the note to travel across, and a
 * spec that says otherwise is refused at validation rather than rendered.
 *
 * Which matters here more than anywhere else, because this is the one bend in
 * the project a human *performs* rather than writes: a gesture aimed at the
 * next note and played a fraction early lands deep inside the previous one, and
 * it arrives with no idea how long that note was. So it is clamped to the last
 * moment that still fits — a flick at the end of the note it was actually in —
 * rather than dropped or written invalid.
 */
function latestBendStart(released: boolean): number {
  return 1 - (released ? 2 : 1) * DEFAULT_BEND_OVER;
}

/**
 * Give each bend gesture to the note that was sounding under it.
 *
 * Done here, on the grid, rather than while recording, because at the keyboard
 * a bend belongs to no note in particular — the bend key moves everything that
 * is ringing. Afterwards there is exactly one sensible owner: the note that
 * started most recently and is still sounding, which is the one the hand was
 * thinking about. Where two started together, the top one takes it, because a
 * bend under a chord is a melody note being pushed, not the chord sliding.
 *
 * At most one bend per note, and [`docs/bends.md`](../../docs/bends.md)'s rule
 * that one track plays one bent note at a time is honoured by skipping a
 * gesture whose note is already bent — a second bend on the same note is a hand
 * that changed its mind, not two bends.
 */
export function attachBends(
  notes: readonly QuantizedNote[],
  gestures: readonly BendGesture[],
  options: { bpm: number; startMs?: number },
): TakeNote[] {
  const { bpm, startMs = 0 } = options;
  if (gestures.length === 0) return notes.map((note) => ({ ...note }));

  const sixteenth = 60 / bpm / 4;
  const out: TakeNote[] = notes.map((note) => ({ ...note }));

  for (const gesture of gestures) {
    const at = (gesture.atMs - startMs) / 1000;
    let chosen = -1;
    for (let i = 0; i < out.length; i++) {
      const note = out[i]!;
      const start = note.step * sixteenth;
      const end = (note.step + note.lengthSteps) * sixteenth;
      if (at < start || at >= end) continue;
      const best = chosen === -1 ? null : out[chosen]!;
      // Latest onset wins; the top note breaks a tie.
      if (!best || note.step > best.step || (note.step === best.step && note.midi > best.midi)) {
        chosen = i;
      }
    }
    // A bend with nothing under it is a gesture into silence. Dropped, not
    // attached to the nearest note: moving it would invent a bend that was
    // never played over a note that was.
    if (chosen === -1) continue;
    const note = out[chosen]!;
    if (note.bend) continue;

    const start = note.step * sixteenth;
    const length = note.lengthSteps * sixteenth;
    const released =
      gesture.releasedMs !== undefined && (gesture.releasedMs - startMs) / 1000 < start + length;
    const into = Math.min(latestBendStart(released), Math.max(0, (at - start) / length));

    note.bend = {
      semitones: gesture.semitones,
      at: Math.round(into * 100) / 100,
      ...(released ? { release: true } : {}),
    };
  }
  return out;
}

/**
 * The take as the paragraph a composer works from — the same summary a guitar
 * transcription prints, because the question being asked of it is the same one.
 *
 * Two lines are added that a transcription has no need for: which notes bend,
 * and — when the key was inferred rather than stated — what it would be if the
 * guess picked the wrong end of a relative pair.
 */
export function summarizeTake(take: Take): string {
  let key: Key | undefined;
  try {
    key = parseKey(take.key);
  } catch {
    key = undefined; // a summary in pitches beats no summary
  }
  const lines = [
    summarizeTranscript({
      name: take.name,
      bpm: take.bpm,
      meter: take.meter,
      key,
      notes: take.notes,
    }),
  ];

  const bends = take.notes
    .map((note, i) => ({ note, i }))
    .filter(({ note }) => note.bend)
    .map(({ note }) => {
      const semitones = note.bend!.semitones;
      const direction = semitones > 0 ? "up" : "down";
      const back = note.bend!.release ? ", released" : "";
      return `${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? "" : "s"} ${direction}${back}`;
    });
  if (bends.length > 0) lines.push(`  bends     ${bends.join(" · ")}`);

  if (take.keyGuessed && key) {
    lines.push(`  key       guessed from the notes — ${formatKey(relativeOf(key))} if that is the wrong end of the pair`);
  }
  return lines.join("\n");
}

/**
 * The take as a playable piece — one track, the notes as played, bends and all.
 *
 * Moving it onto a *different* instrument drops the voice it was played with.
 * A voice belongs to one instrument — `voices/piano/soft-triangle.json` is not
 * a lead — so carrying the name across names a preset that instrument does not
 * have, and the failure lands twelve minutes into a render rather than here.
 * Naming a `voice` explicitly always wins; that is somebody who knows.
 */
export function takeToComposition(
  take: Take,
  options: { name?: string; instrument?: InstrumentName; voice?: string; tags?: string[] } = {},
): Composition {
  const instrument = options.instrument ?? take.instrument;
  const voice = options.voice ?? (instrument === take.instrument ? take.voice : undefined);
  const composition = toComposition(take.notes, {
    name: options.name ?? take.name,
    bpm: take.bpm,
    key: parseKey(take.key),
    meter: take.meter,
    instrument,
    voice,
    tags: options.tags,
  });

  // `toTrackNotes` maps one written note per quantized note, in order, so the
  // indices line up — but bends are carried over here rather than threaded
  // through `transcribe`, which has no notion of them: a detector cannot hear
  // one, and only a player's hand produces them.
  const track = composition.tracks[0]!;
  take.notes.forEach((note, i) => {
    if (note.bend && track.notes[i]) track.notes[i]!.bend = note.bend;
  });
  return composition;
}

/**
 * Validate a take read off disk. Empty list means usable.
 *
 * Takes are written by the dev server from a page the user is sitting at, so
 * this is not guarding against an attacker — it is guarding against a file that
 * was hand-edited, or written by a version of this code that has since moved.
 */
export function validateTake(input: unknown): string[] {
  const issues: string[] = [];
  if (typeof input !== "object" || input === null) return ["take must be an object"];
  const take = input as Partial<Take>;

  if (typeof take.name !== "string" || take.name.trim() === "") issues.push("name must be a non-empty string");
  if (typeof take.bpm !== "number" || !(take.bpm > 0)) issues.push("bpm must be a positive number");
  if (typeof take.key !== "string") issues.push("key must be a string");
  else {
    try {
      parseKey(take.key);
    } catch (err) {
      issues.push((err as Error).message);
    }
  }
  if (typeof take.instrument !== "string") issues.push("instrument must be a string");
  if (take.grid !== 1 && take.grid !== 2 && take.grid !== 4) issues.push("grid must be 1, 2 or 4");
  if (!Array.isArray(take.notes)) issues.push("notes must be an array");
  else if (take.notes.length === 0) issues.push("notes is empty — nothing was played");
  else {
    take.notes.forEach((note, i) => {
      const bad =
        typeof note?.step !== "number" ||
        typeof note?.midi !== "number" ||
        typeof note?.lengthSteps !== "number" ||
        note.lengthSteps <= 0;
      if (bad) issues.push(`notes[${i}] needs numeric step, midi and a positive lengthSteps`);
      if (note?.bend && typeof note.bend.semitones !== "number") {
        issues.push(`notes[${i}].bend needs a numeric semitones`);
      }
    });
  }
  return issues;
}

/** File-safe slug for a take name. */
export function takeSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
