/**
 * The blend resolver: layer palettes into one concrete `MusicalDirection` the
 * composer can render. This is where "samurai duel" becomes real — an `emotion`
 * (key + feeling) blended with a `genre` (groove) and a `timbre` (sound), plus any
 * future descriptive kind. Pure: palettes in, direction out, no fs/audio, so it
 * unit-tests and stays deterministic.
 *
 * The rules (kept small and documented in docs/palette-authoring.md):
 *   - Exactly one `emotion` — it is the only kind carrying tonality, so it fixes
 *     tonic + scale. Zero or many is an error (ambiguous key).
 *   - Tempo: intersect every layer's range; if layers disagree with no overlap,
 *     the later (more specific) layer wins.
 *   - Progressions: a non-emotion layer's progressions (a genre's harmonic
 *     vocabulary) override the emotion's; otherwise use the emotion's. Among
 *     several, the last (most specific) wins.
 *   - Subtypes: `withAncestors` expands a `parent:` chain into layers, ancestors
 *     first, so a subtype states only its deltas and inherits the rest.
 *   - Groove: the last layer stating one wins, taken whole (never lane-merged).
 *   - Instruments: merge every layer's list in blend order, keep known voices,
 *     dedupe. Pick a sustained `padVoice` + a `leadVoice` for the two tracks.
 *   - Signal: concat every layer's fx chain (timbres), then nudge the lo-fi
 *     settings so a timbre audibly changes the render.
 */
import { isEmotionPalette, type Palette, type GenericFrontmatter } from "./palette";
import {
  PITCHED_INSTRUMENTS,
  type InstrumentName,
  type LoFiSettings,
} from "./composition";
import type { Groove } from "./groove";

/** Read a palette's optional structured hints regardless of its kind. */
const hints = (p: Palette): GenericFrontmatter => p.frontmatter as GenericFrontmatter;

export interface MusicalDirection {
  tonic: string;
  scale: string;
  tempo: [number, number];
  /** Candidate roman-numeral progressions to draw from. */
  progressions: string[][];
  /** Sustained harmony track voice. */
  padVoice: InstrumentName;
  /** Chords + melody track voice. */
  leadVoice: InstrumentName;
  /** Full merged voice set (provenance + room for future tracks). */
  instruments: InstrumentName[];
  /** The beat, from the most specific layer that states one. Absent = no drums. */
  groove?: Groove;
  /** Ordered fx/processing hints gathered from timbre layers. */
  signal: string[];
  /** Lo-fi chain, emotion baseline nudged by the signal hints. */
  lofi: LoFiSettings;
  /** Palette slugs in blend order. */
  slugs: string[];
}

export class BlendError extends Error {}

/**
 * Expand each selected palette into its `parent:` lineage, ancestors first
 * (`desert-rock` → `[rock, desert-rock]`), deduped and order-preserving. This is
 * what makes a subtype a *delta*: the parent layers first, the child's own fields
 * override it, and anything the child leaves out is inherited.
 *
 * `all` is the registry to resolve parent slugs against. An unresolvable parent is
 * skipped rather than thrown — the loader already rejects those, and blend stays
 * usable with a partial set. Cycles terminate on the first repeat.
 */
export function withAncestors(selected: Palette[], all: Palette[]): Palette[] {
  const bySlug = new Map(all.map((p) => [p.frontmatter.slug, p]));
  const out: Palette[] = [];
  const emitted = new Set<string>();

  for (const palette of selected) {
    const chain: Palette[] = [];
    const seen = new Set<string>();
    let cursor: Palette | undefined = palette;
    while (cursor && !seen.has(cursor.frontmatter.slug)) {
      seen.add(cursor.frontmatter.slug);
      chain.unshift(cursor); // ancestors end up first
      const parent: string | undefined = cursor.frontmatter.parent;
      cursor = parent ? bySlug.get(parent) : undefined;
    }
    for (const link of chain) {
      if (emitted.has(link.frontmatter.slug)) continue;
      emitted.add(link.frontmatter.slug);
      out.push(link);
    }
  }
  return out;
}

// Pitched only: `drums` is never a melodic voice, and a palette that lists it
// means "this music has a beat" — which is what `groove` says, properly.
const KNOWN_VOICES = new Set<string>(PITCHED_INSTRUMENTS);
const LEAD_PREFERENCE: InstrumentName[] = ["piano", "epiano", "pluck"];

/** Blend a set of palettes (in layer order) into one `MusicalDirection`. */
export function blendPalettes(palettes: Palette[]): MusicalDirection {
  const emotions = palettes.filter(isEmotionPalette);
  if (emotions.length !== 1) {
    throw new BlendError(
      `blend needs exactly one emotion palette, got ${emotions.length}` +
        (emotions.length > 1
          ? ` (${emotions.map((p) => p.frontmatter.slug).join(", ")}) — pick one key`
          : " — an emotion supplies the tonality"),
    );
  }
  const emotion = emotions[0]!.frontmatter;
  const tonality = emotion.tonality;

  const tempo = resolveTempo(palettes);
  const progressions = resolveProgressions(palettes, emotion.progressions);
  const instruments = mergeInstruments(palettes);
  const signal = mergeSignal(palettes);

  return {
    tonic: tonality.tonic,
    scale: tonality.scale,
    tempo,
    progressions,
    instruments,
    padVoice: instruments.find((i) => i === "pad") ?? "pad",
    leadVoice: LEAD_PREFERENCE.find((v) => instruments.includes(v)) ?? "piano",
    groove: resolveGroove(palettes),
    signal,
    lofi: deriveLofi(signal),
    slugs: palettes.map((p) => p.frontmatter.slug),
  };
}

/**
 * The beat comes from the last layer that states one — same "later is more
 * specific" rule as tempo and progressions, so `--with rock,desert-rock` swings
 * the way the subtype says and a timbre layered on top changes nothing.
 *
 * Grooves are taken whole rather than merged lane-by-lane: half of one genre's
 * kick against another's hats is not a third genre, it's mush.
 */
function resolveGroove(palettes: Palette[]): Groove | undefined {
  let resolved: Groove | undefined;
  for (const p of palettes) {
    const g = hints(p).groove;
    if (g && Object.keys(g.patterns).length > 0) resolved = g;
  }
  return resolved;
}

/** Intersect every layer's tempo range; on an empty overlap the later layer wins. */
function resolveTempo(palettes: Palette[]): [number, number] {
  let range: [number, number] | undefined;
  for (const p of palettes) {
    const t = hints(p).tempo;
    if (!t) continue;
    if (!range) {
      range = [t[0], t[1]];
      continue;
    }
    const lo = Math.max(range[0], t[0]);
    const hi = Math.min(range[1], t[1]);
    range = lo <= hi ? [lo, hi] : [t[0], t[1]]; // no overlap → later layer wins
  }
  return range ?? [70, 90];
}

/**
 * A non-emotion layer's progressions override the emotion's; else use emotion's.
 * With several such layers the **last** one wins — same "later is more specific"
 * principle as tempo, and what makes a subtype work: `withAncestors` puts the
 * parent before the child, so the child's progressions override the parent's.
 */
function resolveProgressions(palettes: Palette[], fallback: string[][]): string[][] {
  let resolved: string[][] | undefined;
  for (const p of palettes) {
    if (p.frontmatter.kind === "emotion") continue;
    const prog = hints(p).progressions;
    if (prog && prog.length > 0) resolved = prog;
  }
  return resolved ?? fallback;
}

/** Merge every layer's instruments in order, keep known voices, dedupe. */
function mergeInstruments(palettes: Palette[]): InstrumentName[] {
  const seen: InstrumentName[] = [];
  for (const p of palettes) {
    for (const inst of hints(p).instruments ?? []) {
      if (KNOWN_VOICES.has(inst) && !seen.includes(inst as InstrumentName)) {
        seen.push(inst as InstrumentName);
      }
    }
  }
  return seen.length > 0 ? seen : ["piano", "pad"];
}

/** Concat every layer's signal chain in blend order, dedupe. */
function mergeSignal(palettes: Palette[]): string[] {
  const seen: string[] = [];
  for (const p of palettes) {
    for (const fx of hints(p).signal ?? []) {
      if (!seen.includes(fx)) seen.push(fx);
    }
  }
  return seen;
}

/**
 * A lo-fi baseline nudged by signal keywords so a timbre audibly changes the
 * render. Warm/vinyl default; drive darkens + adds wobble, ambience adds reverb.
 */
function deriveLofi(signal: string[]): LoFiSettings {
  const lofi: LoFiSettings = { vinyl: true, wobble: 0.15, lowpassHz: 2600, reverb: 0.3 };
  const has = (re: RegExp) => signal.some((s) => re.test(s));
  if (has(/drive|dist|crush|fuzz|sag/i)) {
    lofi.lowpassHz = 2000; // grit reads darker
    lofi.wobble = Math.max(lofi.wobble!, 0.2);
  }
  if (has(/tape|wobble|chorus|phaser|vibrato/i)) lofi.wobble = Math.max(lofi.wobble!, 0.25);
  if (has(/reverb|plate|hall|space|echo|delay/i)) lofi.reverb = Math.max(lofi.reverb!, 0.45);
  return lofi;
}
