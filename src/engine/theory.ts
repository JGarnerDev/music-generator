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
 * A scale as concrete ascending pitches — the ladder a stepwise melody climbs.
 *
 * The subtlety is the octave number. Naming every pitch class in one octave
 * (`F4 G4 A4 Bb4 C4 D4 E4`) looks right and is not: C4 sits *below* F4, so a
 * melody stepping "up" the list drops a seventh in the middle of every scale.
 * Only C major hides the bug. The octave advances where the scale passes back
 * through C, because that is where scientific pitch notation increments it.
 *
 * The wrap is decided on the **letter**, not the chroma: `Cb` sounds a semitone
 * below `C` but is still a C, so `Cb4` is the octave above `Bb3` by name even
 * though its chroma (11) says otherwise. Eb minor is the scale that catches it.
 *
 * `scaleLadder("F", "major", 4, 4)` -> F4 G4 A4 Bb4 C5 D5 E5.
 */
export function scaleLadder(
  tonic: string,
  scaleType: string,
  loOctave: number,
  hiOctave: number,
): string[] {
  const pitchClasses = scaleNotes(tonic, scaleType);
  const tonicStep = letterStep(tonic);
  const ladder: string[] = [];

  for (let octave = loOctave; octave <= hiOctave; octave++) {
    for (const pc of pitchClasses) {
      const wrapped = letterStep(pc) < tonicStep;
      ladder.push(`${pc}${octave + (wrapped ? 1 : 0)}`);
    }
  }
  return ladder;
}

/** Letter index of a pitch class, C=0 … B=6 — what the octave number counts. */
function letterStep(pitchClass: string): number {
  const step = Note.get(pitchClass).step;
  if (step === undefined) throw new Error(`not a pitch class: "${pitchClass}"`);
  return step;
}

/**
 * The same chord, revoiced to sit near where the last one was — the difference
 * between a pianist and a machine.
 *
 * `chordPitches` always builds root-position upward from a fixed octave, so
 * `Am → F` drops the whole hand a third and every chord change is heard as a
 * leap. Real voice leading keeps common tones where they are and moves the rest
 * by a step. This tries each inversion (and its octave neighbours), scores it by
 * how far the voices travel from `previous`, and keeps the cheapest.
 *
 * The *distance* is what's minimised, not the register: `startOctave` only
 * anchors the very first chord, when there is no previous voicing to move from.
 */
export function voiceLead(
  chordSymbol: string,
  previous: string[] | null,
  startOctave = 3,
): string[] {
  const base = chordPitches(chordSymbol, startOctave);
  if (previous === null || previous.length === 0) return base;

  const prevMidi = previous.map(pitchToMidi);
  let best = base;
  let bestCost = Infinity;

  // Every rotation of the chord, in every octave that could plausibly be near
  // the previous voicing. Small search: 3-4 notes × 3 octaves.
  for (let rotation = 0; rotation < base.length; rotation++) {
    const rotated = rotate(base, rotation);
    for (const shift of [-12, 0, 12]) {
      const candidate = rotated.map((p) => transpose(p, shift));
      const cost = voicingDistance(candidate.map(pitchToMidi), prevMidi);
      // Ties go to the earlier candidate, which keeps the result deterministic
      // and prefers the less-inverted voicing.
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * Total semitone travel from one voicing to the next, each note costed against
 * its nearest neighbour in the previous chord. Nearest-neighbour rather than
 * index-to-index because the chords may not have the same number of voices, and
 * a held common tone should cost nothing whichever position it moved to.
 */
function voicingDistance(candidate: number[], previous: number[]): number {
  return candidate.reduce((sum, note) => {
    const nearest = Math.min(...previous.map((p) => Math.abs(p - note)));
    return sum + nearest;
  }, 0);
}

/** Rotate a voicing up: the bottom note moves an octave above the top. */
function rotate(pitches: string[], by: number): string[] {
  let out = pitches;
  for (let i = 0; i < by; i++) {
    const [lowest, ...rest] = out;
    out = [...rest, transpose(lowest!, 12)];
  }
  return out;
}

/** MIDI number of a pitch, throwing on anything that isn't one. */
export function pitchToMidi(pitch: string): number {
  const n = Note.midi(pitch);
  if (n === null) throw new Error(`not a pitch: "${pitch}"`);
  return n;
}

/**
 * Shift a pitch by whole octaves until it sits inside a MIDI band, keeping its
 * pitch class — how a bass line stays in one register while its roots wander.
 *
 * A band narrower than an octave can't hold every pitch class; there the result
 * lands just under `low` rather than looping forever. Give bands an octave of
 * room and this doesn't come up.
 */
export function fitToBand(pitch: string, [low, high]: [number, number]): string {
  if (low > high) throw new Error(`empty band: [${low}, ${high}]`);
  let p = pitch;
  while (pitchToMidi(p) < low) p = transpose(p, 12);
  while (pitchToMidi(p) > high) p = transpose(p, -12);
  return p;
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
