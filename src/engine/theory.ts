/**
 * Music-theory helpers — thin, pure wrappers over tonal. Palettes describe music
 * in human terms ("A minor", ["i","VI","III","VII"]); these functions turn that
 * into concrete pitches a track can play. Pure + deterministic → unit tested.
 */
import { Scale, Chord, Note, Key, RomanNumeral } from "tonal";

/** Notes of a scale as pitch classes, e.g. scaleNotes("A", "minor") -> ["A","B","C",...]. */
export function scaleNotes(tonic: string, type: string): string[] {
  const scale = Scale.get(`${tonic} ${type}`);
  if (scale.empty) throw new Error(`unknown scale: "${tonic} ${type}"`);
  return scale.notes;
}

/**
 * Turn roman numerals into concrete diatonic chord symbols for a key. tonal's
 * `Progression.fromRomanNumerals` only yields roots (no chord quality), so we
 * map each numeral's scale degree onto the key's diatonic triads instead.
 * progressionChords("A", ["i", "VI", "III", "VII"]) -> ["Am", "F", "C", "G"].
 */
export function progressionChords(
  tonic: string,
  romanNumerals: string[],
  scaleType = "minor",
): string[] {
  const triads = diatonicTriads(tonic, scaleType);
  return romanNumerals.map((rn) => {
    const parsed = RomanNumeral.get(rn);
    if (parsed.empty) throw new Error(`bad roman numeral: "${rn}"`);
    const chord = triads[parsed.step];
    if (chord === undefined) throw new Error(`roman numeral out of range: "${rn}"`);
    return chord;
  });
}

/** Diatonic triads of a key, indexed by scale degree (0 = tonic). */
function diatonicTriads(tonic: string, scaleType: string): string[] {
  if (scaleType === "minor") return Key.minorKey(tonic).natural.triads as string[];
  if (scaleType === "major") return Key.majorKey(tonic).triads as string[];
  throw new Error(`progressionChords supports major/minor keys, got "${scaleType}"`);
}

/**
 * Concrete pitches (with octaves) for a chord symbol, voiced upward from a start
 * octave. chordPitches("Am", 3) -> ["A3", "C4", "E4"].
 */
export function chordPitches(chordSymbol: string, startOctave = 3): string[] {
  const chord = Chord.get(chordSymbol);
  if (chord.empty || chord.notes.length === 0) {
    throw new Error(`unknown chord: "${chordSymbol}"`);
  }
  let octave = startOctave;
  let prevChroma = -1;
  return chord.notes.map((pc) => {
    const chroma = Note.chroma(pc) ?? 0;
    // When the pitch class wraps below the previous one, bump the octave so the
    // voicing keeps ascending instead of collapsing.
    if (prevChroma >= 0 && chroma <= prevChroma) octave += 1;
    prevChroma = chroma;
    return `${pc}${octave}`;
  });
}

/** Transpose a pitch by a number of semitones. transpose("A3", 12) -> "A4". */
export function transpose(pitch: string, semitones: number): string {
  const interval = Note.fromMidi((Note.midi(pitch) ?? 0) + semitones);
  return interval;
}
