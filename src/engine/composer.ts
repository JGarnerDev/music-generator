/**
 * The composer: palette + mood string + seed → a valid Composition JSON. This is
 * the heart of the tool — it turns "sad dog scene" into a playable piece so no
 * one hand-authors note arrays. Pure + deterministic (same inputs → same song)
 * so takes are reproducible and the whole thing unit-tests without audio.
 *
 * It leans on the tested primitives: `theory` for chords/voicings, `parts` for
 * the layers (bass, comping, arpeggio), `groove` for the kit, `random` for
 * seeded choices. Keep musical *intent* here — what the piece does — and keep
 * note math in those modules.
 *
 * What it writes, and why:
 *   - a **form**: the progression stated twice, the restatement arranged up, then
 *     a tonic bar to land on. One pass through four chords is not a piece.
 *   - a **bass**, locked to the kick where there is one. Without it the render
 *     has no bottom, which was the loudest thing missing.
 *   - **comping**: the harmony in rhythm rather than one block chord per bar.
 *     This is where a genre's feel actually lives.
 *   - a **melody** built from a motif that is restated inverted, so the second
 *     half answers the first instead of wandering somewhere new.
 */
import type { Palette } from "./palette";
import type { Composition, Note, Track } from "./composition";
import { blendPalettes, type MusicalDirection } from "./blend";
import { grooveNotes, grooveBars, STEPS_PER_BAR, type Groove } from "./groove";
import { approachNotes, arpLine, bassLine, bassPatternFromKick, compLine } from "./parts";
import {
  progressionChords,
  progressionsInIdiom,
  chordPitches,
  scaleLadder,
  transpose,
  voiceLead,
} from "./theory";
import { sixteenthsToNotation } from "@utils/timing";
import { makeRng, randInt, pick, seedFromString } from "@utils/random";

export interface ComposeOptions {
  /** Extra entropy so one mood can yield different takes ("give me another"). */
  seed?: string;
  /** Override the auto-derived composition name. */
  name?: string;
}

/**
 * How the harmony is played, picked from how busy the kit is (see `feelFor`).
 * Each is a step string in the palettes' groove notation, so the whole table
 * reads as drum-machine patterns — which is what it is.
 */
interface Feel {
  /** Chord rhythm. The single most genre-defining choice here. */
  comp: string;
  /** Bass pattern used when there is no kick to lock to. */
  bass: string;
  /** Where the melody's notes land within a bar, in sixteenths. */
  phrase: number[];
  /** Whether the restatement adds a moving arpeggio on top. */
  arp: boolean;
}

const FEELS: Record<"open" | "backbeat" | "driving", Feel> = {
  // No kit at all: nothing to lock to, so the harmony sustains and the melody
  // takes its time. Ambient, solo piano, a drumless emotion palette.
  open: { comp: "X...............", bass: "X.......X.......", phrase: [0, 6, 8], arp: false },
  // A moderate kit: chords answer on the backbeat, the way a comping hand does.
  backbeat: { comp: "....X.......X...", bass: "X.......X.......", phrase: [0, 4, 8, 12], arp: true },
  // A busy kit: the chords push off the beat and the melody syncopates with them.
  driving: { comp: "..x...x...x...x.", bass: "X.......X.......", phrase: [0, 3, 6, 10], arp: true },
};

/** Melodic moves, biased toward steps over leaps, with occasional repose. */
const MELODIC_STEPS = [-2, -1, -1, -1, 0, 1, 1, 1, 2] as const;

/** Melody register: two octaves of the scale above the comping. */
const MELODY_OCTAVES: [number, number] = [4, 5];

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
 * Compose a short piece: the direction's progression stated twice, then a tonic
 * bar. Deterministic in (direction, mood, opts). Throws if the direction's scale
 * isn't one `progressionChords` supports.
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
  const pass = progressionChords(tonic, progression, scale);

  // The form: statement, restatement, resolution. The restatement is the same
  // harmony arranged up (see `arp` and the intensity below) — repetition with a
  // change is what a listener hears as structure; four bars and a stop is a demo.
  const chords = [...pass, ...pass];
  const restateFrom = pass.length;
  const finalBar = chords.length;
  const feel = feelFor(dir);

  // One voice-led chain across the whole form, so the restatement flows out of
  // the statement instead of jumping back to root position at the seam.
  const voicings: string[][] = [];
  for (const chord of chords) voicings.push(voiceLead(chord, voicings.at(-1) ?? null, 3));

  const roots = chords.map((chord) => chordPitches(chord, 2)[0]!);
  const swing = { swing: dir.groove?.swing, swingUnit: dir.groove?.swingUnit };

  const bass = bassLine({
    startBar: 0,
    roots,
    pattern: bassPattern(dir.groove, feel),
    approaches: approachNotes(roots),
    ...swing,
  });

  // The pad holds the harmony an octave below the comping, so the two voices
  // occupy different registers instead of doubling each other into mud.
  const pad = compLine({
    startBar: 0,
    voicings: voicings.map((v) => v.map((p) => transpose(p, -12))),
    pattern: "X...............",
    intensity: 0.55,
  });

  const comp = compLine({
    startBar: 0,
    voicings,
    pattern: feel.comp,
    intensity: 0.7,
    maxSustain: STEPS_PER_BAR / 2,
    ...swing,
  });

  // The restatement's extra layer: a broken chord over the top half of the form.
  const arp = feel.arp
    ? arpLine({
        startBar: restateFrom,
        voicings: voicings.slice(restateFrom).map((v) => v.map((p) => transpose(p, 12))),
        pattern: "x.x.x.x.x.x.x.x.",
        intensity: 0.5,
        direction: "updown",
        ...swing,
      })
    : [];

  const melody = melodyFor(dir, voicings, feel, restateFrom, rng);

  const tonicVoicing = voiceLead(chords[0]!, voicings.at(-1) ?? null, 3);
  resolveOn(finalBar, tonic, tonicVoicing, { pad, bass, melody });

  const lead = dir.leadVoice;
  return {
    name: opts.name ?? deriveName(mood, dir.slugs[0] ?? "piece"),
    bpm,
    key: `${tonic} ${scale}`,
    palettes: dir.slugs,
    lofi: dir.lofi,
    tracks: tracksOf([
      { instrument: "drums", gain: 0.8, notes: drumNotes(dir, restateFrom, finalBar) },
      { instrument: "bass", gain: 0.9, notes: bass },
      { instrument: dir.padVoice, gain: 0.35, notes: pad },
      { instrument: lead, gain: 0.55, notes: comp },
      { instrument: lead, gain: 0.45, notes: arp },
      { instrument: lead, gain: 0.85, notes: melody },
    ]),
  };
}

/**
 * How busy the kit is decides how the harmony is played. A genre states its
 * identity in the groove, so reading the feel back off the groove is how a
 * `--with funk` reaches the chords without funk needing to describe them twice.
 *
 * Measured on the kick and snare only: hats are decoration, and counting them
 * would call every genre with a sixteenth hat "driving".
 */
function feelFor(dir: MusicalDirection): Feel {
  const groove = dir.groove;
  if (!groove) return FEELS.open;

  const bars = Math.max(1, grooveBars(groove));
  const hits = (["kick", "snare"] as const).reduce((n, piece) => {
    const lane = groove.patterns[piece] ?? "";
    return n + [...lane].filter((c) => c !== ".").length;
  }, 0);
  return hits / bars >= 6 ? FEELS.driving : FEELS.backbeat;
}

/** The bass follows the kick when there is one; otherwise the feel's own pattern. */
function bassPattern(groove: Groove | undefined, feel: Feel): string {
  const kick = groove?.patterns.kick;
  return kick ? bassPatternFromKick(kick) : feel.bass;
}

/**
 * The tune: a motif stated over the first pass, then **inverted** over the
 * restatement — its contour turned upside down, the oldest trick for making a
 * second phrase answer a first rather than merely follow it.
 *
 * Each bar re-anchors the motif to a chord tone nearest the melody's current
 * position, so the tune agrees with the harmony underneath while still moving
 * stepwise. A pure random walk (what this used to be) does neither.
 */
function melodyFor(
  dir: MusicalDirection,
  voicings: string[][],
  feel: Feel,
  restateFrom: number,
  rng: () => number,
): Note[] {
  const ladder = scaleLadder(dir.tonic, dir.scale, ...MELODY_OCTAVES);
  const motif = makeMotif(feel.phrase, rng);
  const answer = motif.map((n) => ({ ...n, degree: -n.degree }));
  const notes: Note[] = [];
  let cursor = Math.floor(ladder.length / 2);

  voicings.forEach((voicing, bar) => {
    const figure = bar < restateFrom ? motif : answer;
    const tones = new Set(voicing.map(pitchClass));
    const anchor = nearestIndex(ladder, tones, cursor);

    figure.forEach(({ step, degree }, i) => {
      const index = clamp(anchor + degree, 0, ladder.length - 1);
      const next = figure[i + 1]?.step ?? STEPS_PER_BAR;
      notes.push({
        time: barTime(bar, step),
        pitch: ladder[index]!,
        // Notes ring to the next one but never across the bar line, so the
        // phrase re-articulates on every chord.
        duration: sixteenthsToNotation(Math.min(next - step, STEPS_PER_BAR - step)),
        velocity: i === 0 ? 0.62 : 0.5,
      });
      cursor = index;
    });
  });

  return notes;
}

interface MotifNote {
  /** Sixteenth within the bar. */
  step: number;
  /** Scale steps above (or below) the bar's anchor tone. */
  degree: number;
}

/** A short contour over the feel's rhythm — the piece's one melodic idea. */
function makeMotif(phrase: number[], rng: () => number): MotifNote[] {
  let degree = 0;
  return phrase.map((step, i) => {
    if (i > 0) degree += pick(rng, [...MELODIC_STEPS]);
    return { step, degree };
  });
}

/** Index of the nearest ladder entry whose pitch class is in `tones`. */
function nearestIndex(ladder: string[], tones: Set<string>, near: number): number {
  let best = near;
  let bestDistance = Infinity;
  ladder.forEach((pitch, i) => {
    if (!tones.has(pitchClass(pitch))) return;
    const distance = Math.abs(i - near);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}

/**
 * Land on the tonic so the piece resolves instead of stopping mid-phrase. The
 * bass takes the root, the pad the voicing an octave down, the melody the tonic
 * on top — everything arriving together on one downbeat.
 */
function resolveOn(
  bar: number,
  tonic: string,
  voicing: string[],
  voices: { pad: Note[]; bass: Note[]; melody: Note[] },
): void {
  voices.bass.push({ time: `${bar}:0:0`, pitch: `${tonic}2`, duration: "1m", velocity: 0.8 });
  for (const [i, pitch] of voicing.entries()) {
    voices.pad.push({
      time: `${bar}:0:0`,
      pitch: transpose(pitch, -12),
      duration: "1m",
      velocity: Math.max(0.05, 0.5 - i * 0.05),
    });
  }
  voices.melody.push({ time: `${bar}:0:0`, pitch: `${tonic}4`, duration: "1m", velocity: 0.55 });
}

/**
 * The beat, when the blend resolved one — a genre states its groove, an emotion
 * on its own doesn't, so `--palette sad` stays a bare piano piece and
 * `--with lofi` arrives with a kit.
 *
 * The restatement is played a touch harder than the statement: the same trick a
 * drummer uses on a second verse, and the cheapest way to make a repeat sound
 * intentional. The final tonic bar gets a crash and a downbeat kick instead of
 * the pattern — the piece is resolving, and a hat ticking through the last chord
 * makes it sound cut off rather than finished.
 */
function drumNotes(dir: MusicalDirection, restateFrom: number, finalBar: number): Note[] {
  if (!dir.groove) return [];
  return [
    ...grooveNotes(dir.groove, { startBar: 0, bars: restateFrom, intensity: 0.85 }),
    ...grooveNotes(dir.groove, {
      startBar: restateFrom,
      bars: finalBar - restateFrom,
      intensity: 1,
    }),
    { time: `${finalBar}:0:0`, pitch: "crash", duration: "2n", velocity: 0.6 },
    { time: `${finalBar}:0:0`, pitch: "kick", duration: "16n", velocity: 0.8 },
  ];
}

/** Drop the layers that ended up silent — an empty track fails validation. */
function tracksOf(candidates: Track[]): Track[] {
  return candidates.filter((track) => track.notes.length > 0);
}

/** "bar:beat:sixteenth" for a step within a bar. */
function barTime(bar: number, step: number): string {
  return `${bar}:${Math.floor(step / 4)}:${step % 4}`;
}

function pitchClass(pitch: string): string {
  return pitch.replace(/-?\d+$/, "");
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
