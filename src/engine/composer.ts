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
import type { Composition, InstrumentName, Note, Track } from "./composition";
import { blendPalettes, type MusicalDirection } from "./blend";
import { grooveNotes, grooveBars, type Groove, type SwingUnit } from "./groove";
import { approachNotes, arpLine, bassPatternFromKick, compLine } from "./parts";
import { figureLine, validateFigure, type Figure } from "./figure";
import { chooseKnobs, registerBand, tempoFor, type Knobs } from "./knobs";
import { buildForm, formBars, type FormName, type FormSection } from "./form";
import { HOUSE_LEANS, humanize } from "./humanize";
import {
  chordPitches,
  fitToBand,
  pitchToMidi,
  scaleLadder,
  transpose,
  voiceLead,
} from "./theory";
import { sixteenthsToNotation, stepsPerBar, type Meter } from "@utils/timing";
import { makeRng, pick, seedFromString, type Rng } from "@utils/random";

export interface ComposeOptions {
  /** Extra entropy so one mood can yield different takes ("give me another"). */
  seed?: string;
  /** Override the auto-derived composition name. */
  name?: string;
  /**
   * The knobs to build with. Omitted, they are chosen from the mood — see
   * `knobs.ts`. Pass a partial to override just the ones you mean, which is what
   * `compose --figure` / `--register` do.
   */
  knobs?: Partial<Knobs>;
  /**
   * How much piece to write. `sample` (the default) states a phrase and restates
   * it — a few moving bars to check in with, which is this repo's first
   * principle. `song` puts an intro in front and a B section with its own
   * harmony in the middle. See `form.ts`.
   */
  form?: FormName;
}

/**
 * How the harmony is played, picked from how busy the kit is (see `feelFor`).
 * Each is a step string in the palettes' groove notation, so the whole table
 * reads as drum-machine patterns — which is what it is.
 */
interface Feel {
  /** Chord rhythm. The single most genre-defining choice here. */
  comp: string;
  /** Where the melody's notes land within a bar, in sixteenths. */
  phrase: number[];
  /** Whether the restatement adds a moving arpeggio on top. */
  arp: boolean;
}

const FEELS: Record<"open" | "backbeat" | "driving", Feel> = {
  // No kit at all: nothing to lock to, so the harmony sustains and the melody
  // takes its time. Ambient, solo piano, a drumless emotion palette.
  open: { comp: "X...............", phrase: [0, 6, 8], arp: false },
  // A moderate kit: chords answer on the backbeat, the way a comping hand does.
  backbeat: { comp: "....X.......X...", phrase: [0, 4, 8, 12], arp: true },
  // A busy kit: the chords push off the beat and the melody syncopates with them.
  driving: { comp: "..x...x...x...x.", phrase: [0, 3, 6, 10], arp: true },
};

/**
 * Stretch or trim a step string to exactly one bar of the piece's meter.
 *
 * The `FEELS` table is written in 4/4 because that is what reads clearly, but a
 * lane whose length doesn't divide the bar rotates against the barline forever —
 * the same thing `validateGroove` rejects in a palette. Repeating then cutting
 * keeps the feel's *character* (where its hits sit inside a beat) while making
 * it fit: a 3/4 backbeat loses the fourth-beat answer it has nowhere to put.
 */
function fitPattern(pattern: string, perBar: number): string {
  if (pattern.length === perBar) return pattern;
  return pattern.repeat(Math.ceil(perBar / pattern.length)).slice(0, perBar);
}

/** The feel's phrase positions that actually land inside a bar of this meter. */
function fitPhrase(phrase: number[], perBar: number): number[] {
  const inside = phrase.filter((step) => step < perBar);
  return inside.length > 0 ? inside : [0];
}

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
  const meter = dir.meter;
  const perBar = stepsPerBar(meter);

  // The knobs first, before any bars are written — which is the rule
  // `docs/variety.md` states and nothing used to enforce.
  const knobs: Knobs = { ...chooseKnobs(mood, rng, meter), ...opts.knobs };

  const bpm = tempoFor(knobs.tempo, dir.tempo, rng);

  // The layout, before any note is written. `sample` states a phrase and
  // restates it; `song` puts an intro in front and a **B section with different
  // harmony** in the middle, which is the difference between a verse played
  // twice and a piece. See `form.ts`.
  const sections = buildForm({
    form: opts.form ?? "sample",
    progressions: dir.progressions,
    tonic,
    scale,
    rng,
  });
  const chords = sections.flatMap((s) => s.chords);
  const finalBar = formBars(sections);
  const feel = feelFor(dir, perBar);

  // One voice-led chain across the whole form, so each section flows out of the
  // one before it instead of jumping back to root position at every seam.
  const voicings: string[][] = [];
  for (const chord of chords) voicings.push(voiceLead(chord, voicings.at(-1) ?? null, 3));

  const swing = { swing: dir.groove?.swing, swingUnit: dir.groove?.swingUnit, meter };
  const bass = bassFor(knobs, sections, chords, dir.groove, swing);

  // The pad holds the harmony an octave below the comping, so the two voices
  // occupy different registers instead of doubling each other into mud.
  const pad = compLine({
    startBar: 0,
    voicings: voicings.map((v) => v.map((p) => transpose(p, -12))),
    pattern: `X${".".repeat(perBar - 1)}`,
    intensity: 0.55,
    meter,
  });

  const comp = compLine({
    startBar: 0,
    voicings,
    pattern: feel.comp,
    intensity: 0.7,
    maxSustain: perBar / 2,
    ...swing,
  });

  // The broken-chord layer, on the sections that asked for it — an event, not a
  // texture, so it has to be absent somewhere to be heard as arriving.
  const arp = feel.arp
    ? sections
        .filter((s) => s.arp)
        .flatMap((s) =>
          arpLine({
            startBar: s.startBar,
            voicings: voicings
              .slice(s.startBar, s.startBar + s.chords.length)
              .map((v) => v.map((p) => transpose(p, 12))),
            pattern: fitPattern("x.", perBar),
            intensity: 0.5,
            direction: "updown",
            ...swing,
          }),
        )
    : [];

  const melodyLine = melodyFor(dir, voicings, feel, sections, perBar, rng);

  // Played, not placed. Each part gets its own seed and the house lean for its
  // instrument, so no two jitter together and the pad still sits behind the kit.
  //
  // This happens *before* the resolution is written, deliberately: the final
  // chord is the one moment every voice arrives together, and jittering it apart
  // turns an arrival into a stumble. The same goes for the closing crash.
  const seed = `${mood}|${opts.seed ?? ""}`;
  const perform = (
    notes: Note[],
    part: string,
    lean: number,
    lock?: string,
  ): Note[] => humanize(notes, { seed: `${seed}|${part}`, lean, lock, meter });

  // The bass shares the kit's lock: it was written on the kick's own rhythm, and
  // letting the two drift apart by a few milliseconds would undo exactly the
  // tightness that pattern exists to get.
  const rhythmSection = `${seed}|rhythm-section`;
  const parts = {
    drums: perform(grooveFor(dir, sections), "drums", HOUSE_LEANS.drums, rhythmSection),
    bass: perform(bass, "bass", HOUSE_LEANS.bass, rhythmSection),
    pad: perform(pad, "pad", HOUSE_LEANS.pad),
    comp: perform(comp, "comp", HOUSE_LEANS[dir.leadVoice] ?? 0),
    arp: perform(arp, "arp", HOUSE_LEANS[dir.leadVoice] ?? 0),
    melody: perform(melodyLine, "melody", HOUSE_LEANS[dir.melodyVoice] ?? HOUSE_LEANS.lead),
  };
  const drums = [...parts.drums, ...closingAccents(dir, finalBar)];

  const tonicVoicing = voiceLead(chords[0]!, voicings.at(-1) ?? null, 3);
  resolveOn(finalBar, tonic, tonicVoicing, bandOf(knobs), parts);

  const lead = dir.leadVoice;
  return {
    name: opts.name ?? deriveName(mood, dir.slugs[0] ?? "piece"),
    bpm,
    key: `${tonic} ${scale}`,
    // Only written when it isn't 4/4: the field is the exception, and a piece
    // that states the default reads as though the meter were a decision.
    ...(perBar === stepsPerBar() ? {} : { meter }),
    palettes: dir.slugs,
    lofi: dir.lofi,
    tracks: tracksOf([
      // The kit takes no signal chain: a timbre describing a fuzzed guitar amp
      // has nothing to say about a snare, and running one over the drums is how
      // a mix turns to mud.
      { instrument: "drums", gain: 0.8, notes: drums },
      { instrument: "bass", gain: 0.9, notes: parts.bass, ...fxFor(dir, "bass") },
      { instrument: dir.padVoice, gain: 0.35, notes: parts.pad, pan: -0.2, ...fxFor(dir, dir.padVoice) },
      { instrument: lead, gain: 0.55, notes: parts.comp, pan: 0.25, ...fxFor(dir, lead) },
      { instrument: lead, gain: 0.45, notes: parts.arp, pan: -0.35, ...fxFor(dir, lead) },
      // The top line gets its own voice: on a guitar blend that is the lead rig
      // rather than the rhythm one, which is a different sound, not a louder one.
      { instrument: dir.melodyVoice, gain: 0.85, notes: parts.melody, ...fxFor(dir, dir.melodyVoice) },
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
function feelFor(dir: MusicalDirection, perBar: number): Feel {
  const feel = baseFeel(dir);
  return {
    ...feel,
    comp: fitPattern(feel.comp, perBar),
    phrase: fitPhrase(feel.phrase, perBar),
  };
}

function baseFeel(dir: MusicalDirection): Feel {
  const groove = dir.groove;
  if (!groove) return FEELS.open;

  const bars = Math.max(1, grooveBars(groove, dir.meter));
  const hits = (["kick", "snare"] as const).reduce((n, piece) => {
    const lane = groove.patterns[piece] ?? "";
    return n + [...lane].filter((c) => c !== ".").length;
  }, 0);
  return hits / bars >= 6 ? FEELS.driving : FEELS.backbeat;
}

/**
 * The bottom, played on the section's chosen **figure** rather than on the one
 * pattern this path used to have.
 *
 * This is what "the compose path can't reach the knobs" meant. `figureLine` is
 * the same builder a plan-built loop uses, so the fast path gets the whole
 * rhythm shelf, the register knob (roots are folded into the band the scene
 * chose, not a fixed eight semitones) and split-bar harmony — a bar of the
 * restatement changing chord half way through, which is most of what stops a
 * four-bar loop being predicted two bars ahead.
 *
 * The figure changes at the restatement, because a lap that never changes its
 * rhythmic cell is a drum machine left running.
 *
 * What it does **not** do is throw away the kick lock. A bass on its own rhythm
 * against a busy kick reads as two records playing, so with a kit present the
 * statement still plays the kick's own pattern — unless a scene word asked for a
 * cell by name, in which case the scene wins. Either way the restatement takes a
 * shelf figure, so there is a change to hear.
 */
function bassFor(
  knobs: Knobs,
  sections: readonly FormSection[],
  chords: string[],
  groove: Groove | undefined,
  swing: { swing?: number; swingUnit?: SwingUnit; meter: Meter },
): Note[] {
  const band = bandOf(knobs);
  const fit = (chord: string) => fitToBand(chordPitches(chord, 2)[0]!, band);
  const roots: (string | string[])[] = chords.map(fit);

  // One split bar per repeating section: the next chord arrives early, so a
  // restatement is heard as a variation rather than as the same bars again.
  if (knobs.splitBars) {
    for (const s of sections) {
      if (s.role !== "restate" && s.role !== "B") continue;
      const at = s.startBar + 1;
      if (at + 1 < chords.length) roots[at] = [fit(chords[at]!), fit(chords[at + 1]!)];
    }
  }

  const approaches = approachNotes(roots.map(firstRoot), null, roots.map(lastRoot));

  // With a kit present the statement plays the kick's own rhythm unless a scene
  // word named a cell — see the note above.
  const kickCell = knobs.figureFromScene ? undefined : kickFigure(groove, swing.meter);

  return sections.flatMap((s) => {
    const chosen = knobs.figures[s.figure] ?? knobs.figures[0]!;
    const figure = s.figure === 0 ? (kickCell ?? chosen) : chosen;
    const to = s.startBar + s.chords.length;
    return figureLine(figure, {
      startBar: s.startBar,
      roots: roots.slice(s.startBar, to),
      approaches: approaches.slice(s.startBar, to),
      accent: 0.8 + s.intensity * 0.15,
      ghost: 0.7,
      ...swing,
    });
  });
}

/**
 * The kick lane as a figure, so the bass can be built by the same machinery as
 * a named cell while still landing exactly where the kit does.
 *
 * Two corrections, carried over from `bassPatternFromKick`: ghost notes are
 * dropped (a bass can't articulate them and they turn to mud down there) and the
 * downbeat is always struck, because a kick pattern that starts late leaves the
 * bar with no bottom at all. Returns undefined when there is no kit to lock to,
 * or when the kick's own length isn't a whole bar of this meter.
 */
function kickFigure(groove: Groove | undefined, meter: Meter): Figure | undefined {
  const kick = groove?.patterns.kick;
  if (!kick) return undefined;
  const steps = bassPatternFromKick(kick);
  const figure: Figure = {
    steps,
    resolution: 4,
    secondary: -0.07,
    chordOn: "Xx",
    summary: "The kit's own kick, played as the bass.",
  };
  return validateFigure(figure, meter).length === 0 ? figure : undefined;
}

/** The register knob as a MIDI band — where every root in the piece is folded. */
function bandOf(knobs: Knobs): [number, number] {
  return registerBand(knobs.register).map(pitchToMidi) as [number, number];
}

/** First / last root sounding in a bar — a split bar is approached out of its second. */
function firstRoot(entry: string | string[]): string {
  return Array.isArray(entry) ? entry[0]! : entry;
}
function lastRoot(entry: string | string[]): string {
  return Array.isArray(entry) ? entry.at(-1)! : entry;
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
  sections: readonly FormSection[],
  perBar: number,
  rng: Rng,
): Note[] {
  const ladder = scaleLadder(dir.tonic, dir.scale, ...MELODY_OCTAVES);
  const motif = makeMotif(feel.phrase, rng);
  const answer = motif.map((n) => ({ ...n, degree: -n.degree }));
  const notes: Note[] = [];
  let cursor = Math.floor(ladder.length / 2);

  // Which section each bar belongs to, so the tune knows where it is: an intro
  // has no melody over it at all, and an answering section turns the motif's
  // contour upside down instead of wandering somewhere new.
  const sectionOf: FormSection[] = [];
  for (const s of sections) for (const _ of s.chords) sectionOf.push(s);

  voicings.forEach((voicing, bar) => {
    const section = sectionOf[bar];
    if (!section?.melody) return;
    const figure = section.invert ? answer : motif;
    const tones = new Set(voicing.map(pitchClass));
    const anchor = nearestIndex(ladder, tones, cursor);

    figure.forEach(({ step, degree }, i) => {
      const index = clamp(anchor + degree, 0, ladder.length - 1);
      const next = figure[i + 1]?.step ?? perBar;
      notes.push({
        time: barTime(bar, step),
        pitch: ladder[index]!,
        // Notes ring to the next one but never across the bar line, so the
        // phrase re-articulates on every chord.
        duration: sixteenthsToNotation(Math.min(next - step, perBar - step), dir.meter),
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
  band: [number, number],
  voices: { pad: Note[]; bass: Note[]; melody: Note[] },
): void {
  // Folded into the same band as every other root: a resolution an octave away
  // from the line that led to it is heard as a wrong note, not as an arrival.
  voices.bass.push({
    time: `${bar}:0:0`,
    pitch: fitToBand(`${tonic}2`, band),
    duration: "1m",
    velocity: 0.8,
  });
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
function grooveFor(dir: MusicalDirection, sections: readonly FormSection[]): Note[] {
  if (!dir.groove) return [];
  const meter = dir.meter;
  // One span per section so each can be played at its own weight — but one
  // continuous phrase as far as fills are concerned, which is what the offset
  // carries. Without it a phrase rendered in several spans never reaches a fill.
  return sections.flatMap((s) =>
    grooveNotes(dir.groove!, {
      startBar: s.startBar,
      bars: s.chords.length,
      intensity: s.intensity,
      meter,
      phraseOffset: s.startBar,
    }),
  );
}

/**
 * The crash and downbeat kick that close the piece. Kept out of the performed
 * groove because they land *with* the resolution chord, and a crash a few
 * milliseconds off the chord it is marking sounds like a mistake rather than
 * like a drummer.
 */
function closingAccents(dir: MusicalDirection, finalBar: number): Note[] {
  if (!dir.groove) return [];
  return [
    { time: `${finalBar}:0:0`, pitch: "crash", duration: "2n", velocity: 0.6 },
    { time: `${finalBar}:0:0`, pitch: "kick", duration: "16n", velocity: 0.8 },
  ];
}

/**
 * The signal chain a track carries, if the blend resolved one.
 *
 * Applied to the pitched voices, not to everything: a timbre is a statement
 * about an instrument, and a chain built for a guitar amp does the drums no
 * favours. The composer's parts are all voices the blend chose, so any of them
 * is fair game — but `drums` never asks.
 *
 * Returns a spread-able partial so a piece with no timbre writes no `fx` key at
 * all, and the JSON stays as small as the piece is simple.
 */
function fxFor(dir: MusicalDirection, instrument: InstrumentName): { fx?: string[] } {
  if (dir.signal.length === 0 || instrument === "drums") return {};
  return { fx: dir.signal };
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
