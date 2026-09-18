/**
 * The computer keyboard as a piano: which physical key is which semitone, and
 * what the drawn keyboard looks like.
 *
 * Pure and tested because it is a *layout*, and a layout is the kind of thing
 * that looks right in the browser and is wrong by a semitone in the middle of
 * the upper row. Nothing here touches the DOM or Tone — the page reads
 * `pianoKeys()` and draws it, the hook reads `midiForCode()` and triggers it.
 *
 * Keys are identified by `KeyboardEvent.code` — the *physical* key — not by
 * `key`, which is the character the OS layout produces. A piano laid over
 * QWERTY is a shape under the fingers, so the letter printed on the cap is the
 * wrong identity: on an AZERTY board `code` keeps the shape, where `key` would
 * scatter the black notes.
 */
import { midiToPitch, scaleNotes } from "./theory";

/** One physical key and the semitone it sounds, counted from the base octave's C. */
export interface KeyBinding {
  /** `KeyboardEvent.code`. */
  code: string;
  /** What the cap says on a US board — the label the drawn keyboard prints. */
  label: string;
  /** Semitones above the base octave's C. */
  semitone: number;
}

/**
 * The two manuals, in the layout every tracker and DAW has used since Fast
 * Tracker: the home row is the white keys, the row above holds the black ones
 * in the gaps, and the QWERTY row does the same an octave up.
 *
 * The gaps are the point. `KeyD` sits between `KeyX` and `KeyC` the way D# sits
 * between D and E, so the hand learns one shape and it is the shape of a piano.
 * That is also why there is no key where there is no black note — `KeyF` and
 * `KeyK` are deliberately silent, and a layout that filled them in would be a
 * chromatic row of buttons rather than a keyboard.
 */
export const LOWER_MANUAL: readonly KeyBinding[] = [
  { code: "KeyZ", label: "Z", semitone: 0 },
  { code: "KeyS", label: "S", semitone: 1 },
  { code: "KeyX", label: "X", semitone: 2 },
  { code: "KeyD", label: "D", semitone: 3 },
  { code: "KeyC", label: "C", semitone: 4 },
  { code: "KeyV", label: "V", semitone: 5 },
  { code: "KeyG", label: "G", semitone: 6 },
  { code: "KeyB", label: "B", semitone: 7 },
  { code: "KeyH", label: "H", semitone: 8 },
  { code: "KeyN", label: "N", semitone: 9 },
  { code: "KeyJ", label: "J", semitone: 10 },
  { code: "KeyM", label: "M", semitone: 11 },
  { code: "Comma", label: ",", semitone: 12 },
  { code: "KeyL", label: "L", semitone: 13 },
  { code: "Period", label: ".", semitone: 14 },
  { code: "Semicolon", label: ";", semitone: 15 },
  { code: "Slash", label: "/", semitone: 16 },
];

export const UPPER_MANUAL: readonly KeyBinding[] = [
  { code: "KeyQ", label: "Q", semitone: 12 },
  { code: "Digit2", label: "2", semitone: 13 },
  { code: "KeyW", label: "W", semitone: 14 },
  { code: "Digit3", label: "3", semitone: 15 },
  { code: "KeyE", label: "E", semitone: 16 },
  { code: "KeyR", label: "R", semitone: 17 },
  { code: "Digit5", label: "5", semitone: 18 },
  { code: "KeyT", label: "T", semitone: 19 },
  { code: "Digit6", label: "6", semitone: 20 },
  { code: "KeyY", label: "Y", semitone: 21 },
  { code: "Digit7", label: "7", semitone: 22 },
  { code: "KeyU", label: "U", semitone: 23 },
  { code: "KeyI", label: "I", semitone: 24 },
  { code: "Digit9", label: "9", semitone: 25 },
  { code: "KeyO", label: "O", semitone: 26 },
  { code: "Digit0", label: "0", semitone: 27 },
  { code: "KeyP", label: "P", semitone: 28 },
];

/** Every note key, low to high. The two manuals overlap by an octave on purpose. */
export const NOTE_KEYS: readonly KeyBinding[] = [...LOWER_MANUAL, ...UPPER_MANUAL].sort(
  (a, b) => a.semitone - b.semitone || a.code.localeCompare(b.code),
);

const BY_CODE = new Map(NOTE_KEYS.map((binding) => [binding.code, binding]));

/** Semitones above the base octave's C, or nothing if that key plays no note. */
export function semitoneFor(code: string): number | undefined {
  return BY_CODE.get(code)?.semitone;
}

/** The semitone span the two manuals cover, inclusive. */
export const SPAN: readonly [low: number, high: number] = [0, 28];

/**
 * Base octaves the keyboard may sit at, in scientific pitch notation — octave 4
 * puts `Z` on middle C.
 *
 * The ceiling is 7 rather than 8 because the upper manual reaches 28 semitones
 * past the base: from octave 8 the right hand would run off the top of MIDI
 * mid-row, and a keyboard whose upper manual silently does nothing is worse
 * than one that stops.
 */
export const OCTAVE_RANGE: readonly [low: number, high: number] = [0, 7];

/** Middle-C octave: where the keyboard should open. */
export const DEFAULT_OCTAVE = 4;

/** MIDI note of the base octave's C. C4 = 60, the usual scientific-pitch convention. */
export function baseMidi(octave: number): number {
  return (octave + 1) * 12;
}

/** The MIDI note a physical key sounds at this octave, or nothing if it is not a note key. */
export function midiForCode(code: string, octave: number): number | undefined {
  const semitone = semitoneFor(code);
  return semitone === undefined ? undefined : baseMidi(octave) + semitone;
}

/** Move the keyboard by whole octaves, stopping at the ends rather than wrapping. */
export function shiftOctave(octave: number, delta: number): number {
  const [low, high] = OCTAVE_RANGE;
  return Math.min(high, Math.max(low, octave + delta));
}

const BLACK_CLASSES = new Set([1, 3, 6, 8, 10]);

/** Whether a MIDI note is a black key. */
export function isBlack(midi: number): boolean {
  return BLACK_CLASSES.has(((midi % 12) + 12) % 12);
}

/** One drawn key. `codes` is every physical key that sounds it — the manuals overlap. */
export interface PianoKey {
  midi: number;
  /** Scientific pitch name, e.g. `C4`. */
  pitch: string;
  black: boolean;
  /** Cap labels, lower manual first. Both are live; the first is the one to print. */
  labels: string[];
  codes: string[];
  /** Semitones above the base octave's C — the drawn left-to-right position. */
  semitone: number;
}

/**
 * The keyboard to draw, low to high, one entry per sounding pitch.
 *
 * Built from the same table the hook triggers from, so a key that lights up is
 * by construction a key that plays. The two rows that share an octave collapse
 * into one drawn key carrying both labels rather than two keys at one pitch —
 * there is one C5 on a piano.
 */
export function pianoKeys(octave: number): PianoKey[] {
  const base = baseMidi(octave);
  const bySemitone = new Map<number, PianoKey>();
  for (const binding of NOTE_KEYS) {
    const existing = bySemitone.get(binding.semitone);
    if (existing) {
      existing.labels.push(binding.label);
      existing.codes.push(binding.code);
      continue;
    }
    const midi = base + binding.semitone;
    bySemitone.set(binding.semitone, {
      midi,
      pitch: midiToPitch(midi),
      black: isBlack(midi),
      labels: [binding.label],
      codes: [binding.code],
      semitone: binding.semitone,
    });
  }
  return [...bySemitone.values()].sort((a, b) => a.semitone - b.semitone);
}

/**
 * The two keys that bend, and which way.
 *
 * `F` and `K` are the only keys *inside* the home row that sound nothing —
 * they sit where E-F and B-C have no black note between them, so the layout was
 * always going to leave them empty. That makes them the one pair a playing hand
 * can reach without moving: index fingers, already over the row, bending the way
 * a guitarist's does while the other fingers keep the phrase going.
 *
 * Holding one is a pitch wheel, not a per-note effect: everything sounding
 * travels, and a note struck while it is held is struck in the bent key.
 */
export const BEND_KEYS: Readonly<Record<string, -1 | 1>> = { KeyF: -1, KeyK: 1 };

/**
 * How far the wheel goes, in semitones.
 *
 * A whole step, because that is the bend a guitarist means by "the bend" — the
 * blues push of [`docs/bends.md`](../../docs/bends.md). A semitone reads as
 * being out of tune rather than as a gesture, and anything wider needs a hand
 * that can aim it.
 */
export const BEND_SEMITONES = 2;

/** Which way a key bends, or nothing if it is not a bend key. */
export function bendDirection(code: string): -1 | 1 | undefined {
  return BEND_KEYS[code];
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class of a note name, accidentals included, octave ignored. */
export function pitchClassOf(note: string): number {
  const match = /^([A-Ga-g])([#b]*)/.exec(note.trim());
  if (!match) throw new Error(`not a note name: ${note}`);
  const letter = LETTERS[match[1]!.toUpperCase()]!;
  let offset = 0;
  for (const accidental of match[2]!) offset += accidental === "#" ? 1 : -1;
  return (((letter + offset) % 12) + 12) % 12;
}

/**
 * The pitch classes of a key signature, for shading the keys that belong to it.
 *
 * A guide, not a restriction: out-of-key notes still play. Locking the keyboard
 * to a scale would make every take correct and most of them dull, and the one
 * chromatic passing note is usually the reason a phrase was worth keeping.
 */
export function scalePitchClasses(tonic: string, mode: string): Set<number> {
  const classes = new Set<number>();
  for (const note of scaleNotes(tonic, mode)) classes.add(pitchClassOf(note));
  return classes;
}

/** Whether a sounding note belongs to the key the take is being played in. */
export function inScale(midi: number, classes: ReadonlySet<number>): boolean {
  return classes.has(((midi % 12) + 12) % 12);
}
