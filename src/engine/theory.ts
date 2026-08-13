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
 * Turn roman numerals into concrete chord symbols for a key. tonal's
 * `Progression.fromRomanNumerals` only yields roots (no chord quality), so we
 * resolve each numeral ourselves.
 *
 * The numeral is read as an *instruction*, not just a scale degree: its case and
 * accidental pick the chord quality, which is what a palette author means when
 * they write `[i, VII, VI, VII]` (an Aeolian descent) or `[i, iv, i, V]` (a
 * harmonic-minor cadence with a major V). Resolving by degree alone loses both —
 * it renders the first as `F Edim Dm Edim` in F major and flattens the second's
 * leading tone. See `resolveNumeral` for the borrowing rule.
 *
 * progressionChords("A", ["i", "VI", "III", "VII"]) -> ["Am", "F", "C", "G"].
 */
export function progressionChords(
  tonic: string,
  romanNumerals: string[],
  scaleType = "minor",
): string[] {
  const triads = diatonicTriads(tonic, scaleType);
  const scale = keyScale(tonic, scaleType);
  const parallel = keyScale(tonic, scaleType === "major" ? "minor" : "major");
  return romanNumerals.map((rn) => resolveNumeral(rn, triads, scale, parallel));
}

/**
 * One numeral → one chord symbol. The rules, in order:
 *
 * - An explicit accidental (`bVII`, `#iv`) moves the root by that many semitones,
 *   keeping the letter name, and the case sets the quality. The author was
 *   explicit; do what they wrote.
 * - An **uppercase** numeral asks for a major triad. If the degree is already
 *   major, use it. If not, the author is borrowing: take the flattened root when
 *   that note exists in the parallel mode (`VII` in C major -> Bb, the Aeolian
 *   b7), and otherwise raise the quality in place (`V` in C minor -> G major, the
 *   harmonic-minor dominant).
 * - A **lowercase** numeral asks for minor, but keeps a diminished degree
 *   diminished — bare lowercase in a minor key conventionally covers ii°, and
 *   jazz's minor ii-V-i wants that half-diminished colour.
 */
function resolveNumeral(
  rn: string,
  triads: string[],
  scale: string[],
  parallel: string[],
): string {
  const parsed = RomanNumeral.get(rn);
  if (parsed.empty) throw new Error(`bad roman numeral: "${rn}"`);
  const diatonic = triads[parsed.step];
  const degreeRoot = scale[parsed.step];
  if (diatonic === undefined || degreeRoot === undefined) {
    throw new Error(`roman numeral out of range: "${rn}"`);
  }

  if (parsed.alt !== 0) {
    return chordSymbol(alter(degreeRoot, parsed.alt), parsed.major ? "major" : "minor");
  }

  const quality = triadQuality(diatonic);
  if (parsed.major) {
    if (quality === "major") return diatonic;
    const borrowed = alter(degreeRoot, -1);
    // Borrow from the parallel mode only when that mode actually has the note —
    // otherwise the numeral means "same degree, raised third" (a major V in minor).
    const root = parallel.includes(borrowed) ? borrowed : degreeRoot;
    return chordSymbol(root, "major");
  }
  if (quality === "diminished") return diatonic;
  return chordSymbol(degreeRoot, "minor");
}

/** Move a pitch class by semitones while keeping its letter name (B -> Bb, not A#). */
function alter(pitchClass: string, semitones: number): string {
  const step = semitones < 0 ? "-1A" : "1A"; // augmented unison: same letter, new accidental
  let out = pitchClass;
  for (let i = 0; i < Math.abs(semitones); i++) out = Note.transpose(out, step);
  return out;
}

function chordSymbol(root: string, quality: "major" | "minor"): string {
  return quality === "major" ? root : `${root}m`;
}

/** Read a triad symbol's quality back off its suffix ("Bdim" -> diminished). */
function triadQuality(symbol: string): "major" | "minor" | "diminished" | "augmented" {
  if (symbol.endsWith("dim")) return "diminished";
  if (symbol.endsWith("aug")) return "augmented";
  if (symbol.endsWith("m")) return "minor";
  return "major";
}

/** Diatonic triads of a key, indexed by scale degree (0 = tonic). */
function diatonicTriads(tonic: string, scaleType: string): string[] {
  if (scaleType === "minor") return Key.minorKey(tonic).natural.triads as string[];
  if (scaleType === "major") return Key.majorKey(tonic).triads as string[];
  throw new Error(`progressionChords supports major/minor keys, got "${scaleType}"`);
}

/** Pitch classes of a key's scale, indexed by degree. */
function keyScale(tonic: string, scaleType: string): string[] {
  if (scaleType === "minor") return Key.minorKey(tonic).natural.scale as string[];
  if (scaleType === "major") return Key.majorKey(tonic).scale as string[];
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

/**
 * Which idiom a progression is written in, read off the case of its tonic numeral
 * (`[i, VII, VI]` -> minor, `[I, vi, ii, V]` -> major). Returns null when the
 * progression never states a tonic, so callers can treat it as idiom-agnostic.
 */
export function progressionIdiom(numerals: string[]): "major" | "minor" | null {
  for (const rn of numerals) {
    const parsed = RomanNumeral.get(rn);
    if (!parsed.empty && parsed.step === 0) return parsed.major ? "major" : "minor";
  }
  return null;
}

/**
 * Narrow a candidate list to the progressions written in the key's own idiom.
 *
 * Numerals resolve as written (see `progressionChords`), so a genre's major-idiom
 * turnaround landing on a minor emotion yields a Picardy tonic — `lofi`'s
 * `[I, vi, ii, V]` in A minor gives `A Fm Bdim E`. Genres usually ship both
 * variants; this picks the one that fits instead of leaving it to the dice.
 * Falls back to the full list when nothing matches, so a genre with a single
 * idiom still composes.
 */
export function progressionsInIdiom(progressions: string[][], scaleType: string): string[][] {
  const matching = progressions.filter((p) => {
    const idiom = progressionIdiom(p);
    return idiom === null || idiom === scaleType;
  });
  return matching.length > 0 ? matching : progressions;
}

/** Transpose a pitch by a number of semitones. transpose("A3", 12) -> "A4". */
export function transpose(pitch: string, semitones: number): string {
  const interval = Note.fromMidi((Note.midi(pitch) ?? 0) + semitones);
  return interval;
}
