/**
 * Turning a played recording into notes the composer can read.
 *
 * The pipeline is: a detector hears the WAV and emits `DetectedNote`s (pitch,
 * when, how long, how loud) → this module cleans them, works out where the grid
 * is, quantizes onto it, and hands back both composition `Note`s and the scale
 * degrees that make the idea transposable. **Everything here is pure**: the
 * detector, the tfjs model and the WAV decoding live in `scripts/transcribe.ts`,
 * because none of that is testable and all of this is.
 *
 * Two things this deliberately does not attempt:
 *
 * - **Triplets and swing.** The grid is sixteenths. A shuffled take quantizes to
 *   straight sixteenths and loses its lilt; that is a known loss, and the fix is
 *   to state the feel in words and let the render's `swing` put it back, not to
 *   guess a tuplet from noisy onsets.
 * - **Polyphony as harmony.** Simultaneous notes survive as simultaneous notes,
 *   but nothing here names a chord. Voicings come back from the detector too
 *   mushy to trust, and a wrong chord symbol is worse than none.
 */
import { COMMON_TIME, type Meter, sixteenthsToNotation, sixteenthsToTransport, stepsPerBar } from "../utils/timing";
import type { Composition, InstrumentName, Note } from "./composition";
import { canonicalMode, midiToPitch, modeFamily, pitchToMidi, scaleNotes } from "./theory";

/**
 * One note as the detector heard it — continuous time, no grid, no key.
 *
 * This is our own shape rather than the detector library's, so swapping the
 * detector is a change to one adapter in the script instead of a change to the
 * engine.
 */
export interface DetectedNote {
  midi: number;
  startSeconds: number;
  durationSeconds: number;
  /** Detected loudness, 0..1. Becomes velocity, which is where the accents live. */
  amplitude: number;
}

/** A note placed on the sixteenth grid. `step` and `lengthSteps` count sixteenths. */
export interface QuantizedNote {
  step: number;
  lengthSteps: number;
  midi: number;
  velocity: number;
}

/** How far a detected note is allowed to be from a grid line, as a fraction of one step. */
export interface CleanOptions {
  /** Shorter than this is a detector blip, not a note. */
  minDurationSeconds?: number;
  /** Quieter than this is string noise or a neighbouring string ringing. */
  minAmplitude?: number;
  /**
   * Playable MIDI range. Defaults to a guitar's, E2–E6, which is the cheapest
   * filter for the detector's one systematic error: octave doubling, where a
   * strong harmonic is reported as its own note far above the fretboard.
   */
  midiRange?: [low: number, high: number];
  /** Two hits of the same pitch closer than this may be one note the detector split. */
  mergeGapSeconds?: number;
  /**
   * How much louder than its predecessor a same-pitch hit may be and still count
   * as a continuation of it. Above this it was plucked again — see `cleanDetected`.
   */
  mergeSwellRatio?: number;
  /** Notes this short are candidates for being a smear of the note beside them. */
  blipSeconds?: number;
  /** How many times longer the neighbour must be before a blip is discarded. */
  blipRatio?: number;
}

const CLEAN_DEFAULTS: Required<CleanOptions> = {
  minDurationSeconds: 0.045,
  minAmplitude: 0.2,
  midiRange: [40, 88],
  mergeGapSeconds: 0.03,
  mergeSwellRatio: 1.05,
  blipSeconds: 0.12,
  blipRatio: 2,
};

/**
 * Drop what the detector got wrong and glue back what it split, then sort into
 * playing order.
 *
 * The merge step matters more than the filters. A ringing note is routinely
 * reported as two or three consecutive events at the same pitch — the attack,
 * then its tail — and left alone those become a rearticulated triplet the player
 * never played.
 *
 * But proximity alone cannot make the call, because a note re-plucked exactly
 * where the last one stopped ringing looks identical in time. **Amplitude is
 * what separates them**: a tail is quieter than the attack it came from, and a
 * new pluck is not. So a same-pitch hit within `mergeGapSeconds` is folded in
 * only when it is no louder than what it follows. Without this the second of two
 * repeated notes disappears — which is how it was found.
 *
 * That leaves the blips the amplitude rule lets through: a smeared attack
 * reported as a 90 ms scrap immediately before the note proper, and a scrap of
 * ring after a long one has already decayed. Both are short events sitting
 * against a same-pitch note many times their length, which nothing a player does
 * looks like — a real run of repeated notes is a run of *similar* lengths. So the
 * last pass drops any note under `blipSeconds` that touches a same-pitch
 * neighbour at least `blipRatio` times longer.
 */
export function cleanDetected(notes: readonly DetectedNote[], options: CleanOptions = {}): DetectedNote[] {
  const { minDurationSeconds, minAmplitude, midiRange, mergeGapSeconds, mergeSwellRatio, blipSeconds, blipRatio } = {
    ...CLEAN_DEFAULTS,
    ...options,
  };
  const [low, high] = midiRange;

  const kept = notes
    .filter(
      (n) =>
        Number.isFinite(n.startSeconds) &&
        n.durationSeconds >= minDurationSeconds &&
        n.amplitude >= minAmplitude &&
        n.midi >= low &&
        n.midi <= high,
    )
    .sort((a, b) => a.startSeconds - b.startSeconds || a.midi - b.midi);

  // `decay` is the amplitude of the last piece absorbed, not of the attack: a
  // long note arrives as a chain of ever-quieter tails, and each link has to be
  // judged against the one before it. Compared against the attack instead, a
  // re-pluck at half the original volume looks like just another tail.
  const merged: Array<{ note: DetectedNote; decay: number }> = [];
  for (const note of kept) {
    const prior = merged.find(
      ({ note: m, decay }) =>
        m.midi === note.midi &&
        note.startSeconds - (m.startSeconds + m.durationSeconds) <= mergeGapSeconds &&
        note.amplitude <= decay * mergeSwellRatio,
    );
    if (!prior) {
      merged.push({ note: { ...note }, decay: note.amplitude });
      continue;
    }
    const end = Math.max(
      prior.note.startSeconds + prior.note.durationSeconds,
      note.startSeconds + note.durationSeconds,
    );
    prior.note.durationSeconds = end - prior.note.startSeconds;
    prior.decay = note.amplitude;
  }
  const notesOnly = merged.map(({ note }) => note);
  // The blip pass runs last, so a long note has already been assembled from its
  // tails before anything is measured against its length.
  const touches = (a: DetectedNote, b: DetectedNote) =>
    Math.max(a.startSeconds - (b.startSeconds + b.durationSeconds), b.startSeconds - (a.startSeconds + a.durationSeconds)) <=
    blipSeconds;

  return notesOnly
    .filter(
      (note) =>
        note.durationSeconds >= blipSeconds ||
        !notesOnly.some(
          (other) =>
            other !== note &&
            other.midi === note.midi &&
            other.durationSeconds >= note.durationSeconds * blipRatio &&
            touches(note, other),
        ),
    )
    .sort((a, b) => a.startSeconds - b.startSeconds || a.midi - b.midi);
}

/** How well a set of onsets lines up with a grid, and where that grid starts. */
export interface GridFit {
  /** Seconds to subtract from every onset to put the grid on zero. */
  offsetSeconds: number;
  /** Mean distance to the nearest grid line, as a fraction of one step: 0 perfect, 0.5 worst. */
  error: number;
}

/**
 * Where the grid sits under a set of onsets, given a tempo.
 *
 * The candidate offsets are the onsets themselves (mod one step) rather than a
 * swept range: the best offset always puts *some* note exactly on a line, so
 * searching the notes is both exact and free of a resolution parameter. A count-
 * in that drifts, or a first note played a hair early, therefore costs nothing —
 * the grid latches onto the notes that agree with each other, not onto the first.
 */
export function fitGrid(onsetSeconds: readonly number[], bpm: number): GridFit {
  if (onsetSeconds.length === 0) throw new Error("need at least one onset to fit a grid");
  if (!(bpm > 0)) throw new Error(`bpm must be positive, got ${bpm}`);
  // No meter parameter: the grid is sixteenths at any time signature, and a
  // sixteenth is 60/bpm/4 seconds whether four of them make a beat in 4/4 or in
  // 7/8. The meter only groups steps into bars, which happens after this.
  const stepSeconds = 60 / bpm / 4;

  let best: GridFit = { offsetSeconds: 0, error: Infinity };
  for (const candidate of onsetSeconds) {
    const offset = ((candidate % stepSeconds) + stepSeconds) % stepSeconds;
    let total = 0;
    for (const onset of onsetSeconds) {
      const shifted = (onset - offset) / stepSeconds;
      total += Math.abs(shifted - Math.round(shifted));
    }
    const error = total / onsetSeconds.length;
    if (error < best.error) best = { offsetSeconds: offset, error };
  }
  return best;
}

export interface TempoEstimate {
  bpm: number;
  /** 0..1, from how tightly the onsets sit on the winning grid. Below ~0.6, distrust it. */
  confidence: number;
  offsetSeconds: number;
}

/**
 * Guess the tempo from the onsets alone.
 *
 * **A guess, and the weakest link in the chain** — pass `--tempo` and play to a
 * click instead whenever you can. Grid fit cannot distinguish a tempo from its
 * double: every onset that lands on a sixteenth at 90 lands on an eighth at 180,
 * with identical error. So near-ties are broken toward `preferBpm`, which is why
 * a genuinely fast piece may come back at half speed with the note values
 * doubled. That is the same music, notated differently, and it stays the same
 * music after transposition — which is the only property this pipeline needs.
 */
export function estimateTempo(
  onsetSeconds: readonly number[],
  options: { range?: [number, number]; preferBpm?: number; tolerance?: number } = {},
): TempoEstimate | null {
  const { range = [55, 200], preferBpm = 100, tolerance = 1.05 } = options;
  if (onsetSeconds.length < 4) return null;

  const scored: Array<{ bpm: number } & GridFit> = [];
  for (let bpm = range[0]; bpm <= range[1]; bpm += 0.5) {
    scored.push({ bpm, ...fitGrid(onsetSeconds, bpm) });
  }
  const bestError = Math.min(...scored.map((s) => s.error));
  // Everything within `tolerance` of the best fit is musically the same reading;
  // among those, the one nearest `preferBpm` is the one a human would count.
  const contenders = scored.filter((s) => s.error <= bestError * tolerance + 1e-9);
  const winner = contenders.reduce((a, b) =>
    Math.abs(Math.log2(b.bpm / preferBpm)) < Math.abs(Math.log2(a.bpm / preferBpm)) ? b : a,
  );
  return {
    bpm: Math.round(winner.bpm * 2) / 2,
    confidence: Math.max(0, 1 - winner.error * 4),
    offsetSeconds: winner.offsetSeconds,
  };
}

export interface QuantizeOptions {
  bpm: number;
  meter?: Meter;
  /** Grid coarseness in steps per beat: 4 sixteenths, 2 eighths, 1 quarters. */
  grid?: 1 | 2 | 4;
  /** Seconds to subtract before quantizing. Omitted means fit the grid to the notes. */
  offsetSeconds?: number;
  /**
   * Truncate every note at the next onset. On for a melody, which is what this
   * is for — a guitar's notes ring past where the player stopped thinking of
   * them, and left alone that sustain reads as a held chord.
   */
  monophonic?: boolean;
}

/**
 * Put cleaned notes on the grid.
 *
 * Whole *bars* of lead-in are dropped so a take with a count-in starts at bar 0,
 * but the position **within** the bar is kept: a phrase that begins on the "and"
 * of 4 is a pickup, and moving it to the downbeat would be rewriting the idea
 * rather than transcribing it.
 */
export function quantizeNotes(notes: readonly DetectedNote[], options: QuantizeOptions): QuantizedNote[] {
  const { bpm, meter = COMMON_TIME, grid = 4, offsetSeconds, monophonic = true } = options;
  if (!(bpm > 0)) throw new Error(`bpm must be positive, got ${bpm}`);
  if (notes.length === 0) return [];

  const sixteenthSeconds = 60 / bpm / 4;
  const coarseness = 4 / grid; // sixteenths per grid line: 1, 2 or 4
  const offset = offsetSeconds ?? fitGrid(notes.map((n) => n.startSeconds), bpm).offsetSeconds;

  const snap = (seconds: number) => Math.round((seconds - offset) / sixteenthSeconds / coarseness) * coarseness;

  const placed = notes
    .map((note) => {
      const step = snap(note.startSeconds);
      const end = snap(note.startSeconds + note.durationSeconds);
      return {
        step,
        lengthSteps: Math.max(coarseness, end - step),
        midi: note.midi,
        velocity: Math.round(Math.min(1, Math.max(0.2, note.amplitude)) * 100) / 100,
      };
    })
    .sort((a, b) => a.step - b.step || a.midi - b.midi);

  const perBar = stepsPerBar(meter);
  const leadInBars = Math.floor(placed[0]!.step / perBar);
  const shift = leadInBars * perBar;
  for (const note of placed) note.step -= shift;

  if (monophonic) {
    for (let i = 0; i < placed.length - 1; i++) {
      const gap = placed[i + 1]!.step - placed[i]!.step;
      if (gap > 0) placed[i]!.lengthSteps = Math.min(placed[i]!.lengthSteps, gap);
    }
  }
  return placed.filter((n) => n.step >= 0 && n.lengthSteps >= 1);
}

/**
 * Quantized notes → the `Note[]` a composition track carries.
 *
 * `key` only chooses enharmonic spelling: the same MIDI number comes back as
 * `Bb4` in F minor and `A#4` in B minor. It sounds identical either way — but the
 * JSON is read by humans, and a tune spelled against its key is hard to read.
 */
export function toTrackNotes(notes: readonly QuantizedNote[], meter: Meter = COMMON_TIME, key?: Key): Note[] {
  const spell = pitchSpeller(key);
  return notes.map((n) => ({
    time: sixteenthsToTransport(n.step, meter),
    pitch: spell(n.midi),
    duration: sixteenthsToNotation(n.lengthSteps, meter),
    velocity: n.velocity,
  }));
}

export interface CompositionOptions {
  /** File slug and the piece's name — the two are the same thing in this library. */
  name: string;
  bpm: number;
  key: Key;
  meter?: Meter;
  /** Defaults to `lead`: a transcribed take is a top line, not a rhythm part. */
  instrument?: InstrumentName;
  voice?: string;
  tags?: string[];
}

/**
 * A transcription as a playable composition — one track, one voice, the notes as
 * quantized.
 *
 * Deliberately bare. A leitmotif is a phrase, not an arrangement
 * ([`docs/library.md`](../../docs/library.md)), and this one has the additional
 * job of being *checkable*: the user plays it back against their own recording to
 * confirm the transcription is right, and anything added here — a second voice, a
 * pad, a lo-fi bed — is something they would have to listen past to hear whether
 * the notes are correct. Arrange it after it has been confirmed, not before.
 */
export function toComposition(notes: readonly QuantizedNote[], options: CompositionOptions): Composition {
  const { name, bpm, key, meter = COMMON_TIME, instrument = "lead", voice, tags } = options;
  if (notes.length === 0) throw new Error("toComposition: no notes to write");
  if (!(bpm > 0)) throw new Error(`bpm must be positive, got ${bpm}`);

  return {
    name,
    bpm,
    key: `${key.tonic} ${key.mode}`,
    // 4/4 is the default the player assumes, so writing it adds a field that says
    // nothing; anything else is load-bearing and must be stated.
    ...(meter[0] === COMMON_TIME[0] && meter[1] === COMMON_TIME[1] ? {} : { meter }),
    ...(tags && tags.length > 0 ? { tags } : {}),
    tracks: [
      {
        instrument,
        ...(voice ? { voice } : {}),
        notes: toTrackNotes(notes, meter, key),
      },
    ],
  };
}

/**
 * MIDI → pitch name, spelled the way the key writes it.
 *
 * The seven notes of the key take the key's own spelling, so D minor's sixth is
 * `Bb` and B minor's is `B`. Everything else — the chromatic passing tones —
 * falls back to whichever accidental the key already leans on, which is the best
 * available guess and never wrong by more than a name.
 */
function pitchSpeller(key?: Key): (midi: number) => string {
  if (!key) return (midi) => midiToPitch(midi);
  const scale = scaleNotes(key.tonic, key.mode);
  const byPitchClass = new Map(scale.map((name) => [pitchToMidi(`${name}0`) % 12, name]));
  const fallback = scale.filter((n) => n.includes("b")).length > scale.filter((n) => n.includes("#")).length
    ? "flats"
    : "sharps";

  return (midi) => {
    const name = byPitchClass.get(midi % 12);
    if (!name) return midiToPitch(midi, fallback);
    // The letter fixes the octave number, and Cb/B# straddle the boundary — so
    // try the neighbours and keep the spelling that is actually this pitch.
    const natural = Math.floor(midi / 12) - 1;
    for (const octave of [natural, natural + 1, natural - 1]) {
      const candidate = `${name}${octave}`;
      try {
        if (pitchToMidi(candidate) === midi) return candidate;
      } catch {
        // not a pitch at that octave; try the next
      }
    }
    return midiToPitch(midi, fallback);
  };
}

/** A tonal centre: what `1` means, and which seven notes are the home ones. */
export interface Key {
  tonic: string;
  /** A mode name `theory.canonicalMode` accepts — "minor", "dorian", "phrygian-dominant". */
  mode: string;
}

/**
 * Parse the shorthand a player says out loud: `Am`, `A minor`, `C`, `D dorian`,
 * `Bb mixolydian`. A bare letter is major, a trailing `m` is minor.
 */
export function parseKey(input: string): Key {
  const text = input.trim();
  if (!text) throw new Error("empty key");
  const m = /^([A-Ga-g][#b]?)\s*(.*)$/.exec(text);
  if (!m) throw new Error(`not a key: "${input}"`);
  const tonic = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
  const rest = m[2]!.trim().toLowerCase();
  const mode = canonicalMode(rest === "" ? "major" : rest === "m" ? "minor" : rest.replace(/\s+/g, "-"));
  modeFamily(mode); // throws, listing what is supported — better here than four steps downstream
  return { tonic, mode };
}

/**
 * The twelve chromatic degrees by semitones above the tonic.
 *
 * Flats throughout rather than a mode-aware spelling, because these are read as
 * *functions* and the flat names are the ones players say: `b3` is the minor
 * third whether the key writes it Eb or D#, and `b5` is the blue note in every
 * key there is.
 */
const DEGREE_BY_SEMITONE = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"] as const;

/** A note named by its function in a key rather than by its pitch. */
export interface Degree {
  /** `1`, `b3`, `5` — the scale degree, chromatic where it has to be. */
  name: string;
  /** Octaves above the reference tonic: 0 is the phrase's home octave, 1 the one above. */
  octave: number;
  /** False for the notes outside the key — the blue notes, the chromatic passing tones. */
  inScale: boolean;
}

/**
 * Name every note by its function in a key.
 *
 * **This is the step that makes a recording reusable.** Absolute pitches are
 * stuck in whatever key the guitar happened to be in; degrees are the idea
 * itself, and can be written into a piece in any key without the tune breaking
 * against the chords under it.
 *
 * Octaves count from the tonic at or below the lowest note in the phrase, so a
 * melody that never leaves one octave reports octave 0 throughout regardless of
 * which octave it was played in.
 */
export function degreesOf(midis: readonly number[], key: Key): Degree[] {
  if (midis.length === 0) return [];
  const tonicPc = pitchToMidi(`${key.tonic}0`) % 12;
  const scalePcs = new Set(scaleNotes(key.tonic, key.mode).map((n) => pitchToMidi(`${n}0`) % 12));

  const lowest = Math.min(...midis);
  // The reference tonic: the highest tonic that is still at or below the phrase.
  const reference = lowest - (((lowest - tonicPc) % 12) + 12) % 12;

  return midis.map((midi) => {
    const semitones = (((midi - tonicPc) % 12) + 12) % 12;
    return {
      name: DEGREE_BY_SEMITONE[semitones]!,
      octave: Math.floor((midi - reference) / 12),
      inScale: scalePcs.has(midi % 12),
    };
  });
}

/** Render a degree the way it is written in a summary: `b3`, `5^` an octave up, `6v` an octave down. */
export function formatDegree(degree: Degree): string {
  if (degree.octave === 0) return degree.name;
  const marker = degree.octave > 0 ? "^" : "v";
  return degree.name + marker.repeat(Math.min(Math.abs(degree.octave), 3));
}
