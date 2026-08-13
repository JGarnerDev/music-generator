/**
 * The composer: palette + mood string + seed → a valid Composition JSON. This is
 * the heart of the tool — it turns "sad dog scene" into a playable piece so no
 * one hand-authors note arrays. Pure + deterministic (same inputs → same song)
 * so takes are reproducible and the whole thing unit-tests without audio.
 *
 * It leans on the tested primitives: `theory` for chords/voicings, `random` for
 * seeded choices. Keep musical intent here; keep note math in those modules.
 */
import type { Palette } from "./palette";
import type { Composition, Track } from "./composition";
import { blendPalettes, type MusicalDirection } from "./blend";
import { grooveNotes } from "./groove";
import {
  progressionChords,
  progressionsInIdiom,
  chordPitches,
  scaleNotes,
  transpose,
} from "./theory";
import { makeRng, randInt, pick, seedFromString } from "@utils/random";

export interface ComposeOptions {
  /** Extra entropy so one mood can yield different takes ("give me another"). */
  seed?: string;
  /** Override the auto-derived composition name. */
  name?: string;
}

/**
 * Compose from a single emotion palette. Thin wrapper over `composeFromBlend` — a
 * blend of one layer. Throws (via the blend) if the palette isn't an emotion.
 */
export function composeFromPalette(
  palette: Palette,
  mood: string,
  opts: ComposeOptions = {},
): Composition {
  return composeFromBlend(blendPalettes([palette]), mood, opts);
}

/**
 * Compose a short piece (one pass over the direction's progression, plus a tonic
 * resolution bar) as a pad + lead arrangement. Deterministic in (direction, mood,
 * opts). Throws if the direction's scale isn't one `progressionChords` supports.
 */
export function composeFromBlend(
  dir: MusicalDirection,
  mood: string,
  opts: ComposeOptions = {},
): Composition {
  const { tonic, scale } = dir;
  const rng = makeRng(seedFromString(`${mood}|${opts.seed ?? ""}|${dir.slugs.join("+")}`));

  const [tmin, tmax] = dir.tempo;
  const bpm = randInt(rng, tmin, tmax);
  // Prefer a progression written in the key's own idiom — a genre's major-idiom
  // turnaround over a minor emotion resolves to a Picardy tonic otherwise.
  const progression = pick(rng, progressionsInIdiom(dir.progressions, scale));
  const chords = progressionChords(tonic, progression, scale);

  const pad: Track = { instrument: dir.padVoice, gain: 0.5, notes: [] };
  const lead: Track = { instrument: dir.leadVoice, gain: 0.9, notes: [] };

  // A ladder of concrete scale pitches for a stepwise melody that stays in key.
  const ladder = buildLadder(scaleNotes(tonic, scale), 4, 5);
  let mi = randInt(rng, 0, ladder.length - 1); // melodic cursor

  chords.forEach((chord, bar) => {
    const voicing = chordPitches(chord, 3);
    const root = voicing[0]!;

    // Pad: one sustained root per bar, an octave below the lead voicing.
    pad.notes.push({ time: `${bar}:0`, pitch: transpose(root, -12), duration: "1m", velocity: 0.4 });

    // Lead: the chord on the downbeat as a soft half-note bed.
    for (const [i, pitch] of voicing.entries()) {
      lead.notes.push({ time: `${bar}:0`, pitch, duration: "2n", velocity: i === 0 ? 0.55 : 0.45 });
    }

    // Melody: two stepwise notes answering on beats 2 and 3.
    for (const beat of [2, 3]) {
      mi = clamp(mi + melodicStep(rng), 0, ladder.length - 1);
      lead.notes.push({ time: `${bar}:${beat}`, pitch: ladder[mi]!, duration: "4n", velocity: 0.5 });
    }
  });

  // Land on the tonic so the loop resolves instead of stopping mid-phrase.
  const finalBar = chords.length;
  pad.notes.push({ time: `${finalBar}:0`, pitch: `${tonic}2`, duration: "1m", velocity: 0.4 });
  lead.notes.push({ time: `${finalBar}:0`, pitch: `${tonic}4`, duration: "1m", velocity: 0.5 });

  return {
    name: opts.name ?? deriveName(mood, dir.slugs[0] ?? "piece"),
    bpm,
    key: `${tonic} ${scale}`,
    palettes: dir.slugs,
    lofi: dir.lofi,
    tracks: [...drumTrack(dir, chords.length, finalBar), pad, lead],
  };
}

/**
 * The beat, when the blend resolved one — a genre states its groove, an emotion
 * on its own doesn't, so `--palette sad` stays a bare piano piece and
 * `--with lofi` arrives with a kit.
 *
 * The pattern runs over the progression only. The final tonic bar gets a crash
 * and a downbeat kick instead: the piece is resolving, and a hat pattern ticking
 * through the last chord makes it sound cut off rather than finished.
 */
function drumTrack(dir: MusicalDirection, bars: number, finalBar: number): Track[] {
  if (!dir.groove) return [];
  const notes = grooveNotes(dir.groove, { startBar: 0, bars });
  notes.push(
    { time: `${finalBar}:0:0`, pitch: "crash", duration: "2n", velocity: 0.6 },
    { time: `${finalBar}:0:0`, pitch: "kick", duration: "16n", velocity: 0.8 },
  );
  return [{ instrument: "drums", gain: 0.8, notes }];
}

/** Concrete scale pitches from `loOctave` up to and including `hiOctave`. */
function buildLadder(pitchClasses: string[], loOctave: number, hiOctave: number): string[] {
  const ladder: string[] = [];
  for (let oct = loOctave; oct <= hiOctave; oct++) {
    for (const pc of pitchClasses) ladder.push(`${pc}${oct}`);
  }
  return ladder;
}

/** Small melodic move, biased toward steps over leaps, with occasional repose. */
function melodicStep(rng: () => number): number {
  return pick(rng, [-2, -1, -1, -1, 0, 1, 1, 1, 2]);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Turn a mood string into a stable, filesystem-friendly composition name. */
function deriveName(mood: string, fallbackSlug: string): string {
  const slug = mood
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || fallbackSlug;
}
