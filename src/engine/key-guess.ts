/**
 * What key was that in?
 *
 * Exists because the keys bench stopped asking. A player sitting at a keyboard
 * knows what they are playing without naming it, and a form field demanding
 * "Am" before a note has been struck is a question asked at the worst possible
 * moment. The notes answer it themselves well enough.
 *
 * The method is the cheap one and it is chosen deliberately: score each of the
 * 24 keys by how much of what was played belongs to it, weighting the notes
 * that actually define a key. It is not Krumhansl — no listener experiments, no
 * profile constants — because the input here is a phrase of eight notes, not a
 * movement, and at that length the elaborate methods are guessing too.
 *
 * **The tie it cannot break is real.** A minor and C major contain identical
 * notes; nothing in the pitch content separates them, and only the phrase's
 * gravity does. So the tonic-and-fifth weighting and the first/last note bonus
 * decide it, and `alternative` always carries the relative key — because when
 * this is wrong, that is what it is wrong about, and saying so is more useful
 * than a confidence number.
 */
import { scaleNotes } from "./theory";
import type { Key } from "./transcribe";
import { pitchClassOf } from "./keys";

/** Tonics tried, spelled the way a player would say them. */
const TONICS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** The two modes guessed between. A phrase in dorian will come back as its nearest of these. */
const MODES = ["major", "minor"] as const;

export interface KeyGuess extends Key {
  /**
   * The relative major/minor — the same seven notes, the other tonic.
   *
   * Always present, because it is always the runner-up: this is the one
   * distinction the notes cannot make, and a reader who disagrees with the
   * guess is nearly always reaching for exactly this.
   */
  alternative: Key;
  /** How much of what was played fits, 0..1. Below ~0.8 the phrase is chromatic. */
  fit: number;
}

/**
 * Weight per pitch class, relative to the tonic.
 *
 * The tonic and the fifth are what establish a key; the third is what tells the
 * two modes apart, which is why it is worth more than the notes either side of
 * it. Everything else in the scale counts once, and everything outside it counts
 * against — a phrase full of notes a key does not contain is not in that key,
 * however many of its scale tones it also happens to use.
 */
const DEGREE_WEIGHT: Record<number, number> = { 0: 3, 7: 2, 3: 1.5, 4: 1.5 };
const IN_SCALE = 1;
const OUT_OF_SCALE = -1.5;

/**
 * The key a phrase is most likely in.
 *
 * Returns C major for an empty phrase rather than throwing: the caller is a
 * recording that may have captured nothing, and a default key is a better
 * failure than an exception in the middle of saving a take.
 */
export function guessKey(midis: readonly number[]): KeyGuess {
  const fallback: KeyGuess = {
    tonic: "C",
    mode: "major",
    alternative: { tonic: "A", mode: "minor" },
    fit: 0,
  };
  if (midis.length === 0) return fallback;

  const played = midis.map((midi) => ((midi % 12) + 12) % 12);
  // The first and last notes carry the phrase's gravity — this is the whole
  // tiebreaker between a key and its relative, so it is deliberately small
  // enough not to outvote the pitch content and large enough to decide a draw.
  const edges = [played[0]!, played[played.length - 1]!];

  let best: { key: Key; score: number; inScale: number } | null = null;
  const scores = new Map<string, number>();

  for (const tonic of TONICS) {
    for (const mode of MODES) {
      const classes = new Set(scaleNotes(tonic, mode).map(pitchClassOf));
      const root = pitchClassOf(tonic);
      let score = 0;
      let inScale = 0;
      for (const pc of played) {
        if (!classes.has(pc)) {
          score += OUT_OF_SCALE;
          continue;
        }
        inScale += 1;
        score += DEGREE_WEIGHT[(pc - root + 12) % 12] ?? IN_SCALE;
      }
      for (const pc of edges) if (pc === root) score += 2;

      scores.set(`${tonic} ${mode}`, score);
      if (!best || score > best.score) best = { key: { tonic, mode }, score, inScale };
    }
  }

  const key = best!.key;
  return {
    ...key,
    alternative: relativeOf(key),
    fit: best!.inScale / played.length,
  };
}

/**
 * The relative major or minor: the same notes, the tonic a minor third away.
 *
 * Spelled from the same table the guesser searches, so the answer is always a
 * tonic this module would itself return — no double flats, no B#.
 */
export function relativeOf(key: Key): Key {
  const root = pitchClassOf(key.tonic);
  if (key.mode === "minor") {
    return { tonic: TONICS[(root + 3) % 12]!, mode: "major" };
  }
  return { tonic: TONICS[(root + 9) % 12]!, mode: "minor" };
}

/** `Am`, `C`, `Bb minor` — the shorthand `parseKey` reads back. */
export function formatKey(key: Key): string {
  return key.mode === "major" ? key.tonic : `${key.tonic} ${key.mode}`;
}
