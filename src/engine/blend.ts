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
 *     vocabulary) override the emotion's; otherwise use the emotion's.
 *   - Instruments: merge every layer's list in blend order, keep known voices,
 *     dedupe. Pick a sustained `padVoice` + a `leadVoice` for the two tracks.
 *   - Signal: concat every layer's fx chain (timbres), then nudge the lo-fi
 *     settings so a timbre audibly changes the render.
 */
import { isEmotionPalette, type Palette, type GenericFrontmatter } from "./palette";
import {
  INSTRUMENT_NAMES,
  type InstrumentName,
  type LoFiSettings,
} from "./composition";

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
  /** Ordered fx/processing hints gathered from timbre layers. */
  signal: string[];
  /** Lo-fi chain, emotion baseline nudged by the signal hints. */
  lofi: LoFiSettings;
  /** Palette slugs in blend order. */
  slugs: string[];
}

export class BlendError extends Error {}

const KNOWN_VOICES = new Set<string>(INSTRUMENT_NAMES);
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
    signal,
    lofi: deriveLofi(signal),
    slugs: palettes.map((p) => p.frontmatter.slug),
  };
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

/** A non-emotion layer's progressions override the emotion's; else use emotion's. */
function resolveProgressions(palettes: Palette[], fallback: string[][]): string[][] {
  for (const p of palettes) {
    if (p.frontmatter.kind === "emotion") continue;
    const prog = hints(p).progressions;
    if (prog && prog.length > 0) return prog;
  }
  return fallback;
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
