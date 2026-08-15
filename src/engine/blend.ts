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
import { modeFamily, sameMode } from "./theory";
import { COMMON_TIME, type Meter } from "@utils/timing";

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
  /** The comping voice — the chords in rhythm. */
  leadVoice: InstrumentName;
  /**
   * The top line's voice, which is **not** always the comping one.
   *
   * `pluck` and `lead` are one instrument played two ways (see
   * `composition.ts`), and a solo played on the rhythm tone is the classic puny
   * solo. A guitar timbre therefore comps on `pluck` and sings on `lead`.
   */
  melodyVoice: InstrumentName;
  /** Full merged voice set (provenance + room for future tracks). */
  instruments: InstrumentName[];
  /** The beat, from the most specific layer that states one. Absent = no drums. */
  groove?: Groove;
  /**
   * Time signature, from the last layer that states one. A genre carries this —
   * a waltz is a waltz because of its meter, not its tempo — and it has to be
   * resolved alongside the groove, since the two are counted in the same bars.
   */
  meter: Meter;
  /** Ordered fx/processing hints gathered from timbre layers. */
  signal: string[];
  /** Lo-fi chain, emotion baseline nudged by the signal hints. */
  lofi: LoFiSettings;
  /** Palette slugs in blend order. */
  slugs: string[];
  /**
   * Things about this combination worth saying out loud — a genre whose declared
   * mode fights the emotion's key, say. Not errors: the blend still resolves,
   * and a deliberate clash is a legitimate thing to want. A caller prints them.
   */
  warnings: string[];
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

/** Voices that can state a chord in rhythm, best first. */
const COMP_PREFERENCE: InstrumentName[] = ["piano", "epiano", "pluck"];
/** Voices that can hold a sustained harmony bed, best first. */
const PAD_PREFERENCE: InstrumentName[] = ["pad", "epiano", "piano"];
/** Voices that can carry a top line, best first. */
const MELODY_PREFERENCE: InstrumentName[] = ["lead", "piano", "epiano", "pluck"];

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

  // A timbre outranks everything for voice selection — that is what a timbre
  // *is*, so `--with metal,brown-sound` has to comp on a guitar rather than on
  // a piano the emotion happened to mention first. Failing a timbre, the last
  // layer that names instruments has the most specific say.
  const timbre = voicedLayer(palettes, (p) => p.frontmatter.kind === "timbre");
  const voiced = timbre ?? voicedLayer(palettes) ?? instruments;
  const leadVoice = pickVoice(voiced, instruments, COMP_PREFERENCE) ?? "piano";

  return {
    tonic: tonality.tonic,
    scale: tonality.scale,
    tempo,
    progressions,
    instruments,
    padVoice: padVoiceFor(timbre, instruments),
    leadVoice,
    melodyVoice: melodyVoiceFor(leadVoice, voiced, instruments),
    groove: resolveGroove(palettes),
    meter: resolveMeter(palettes),
    signal,
    lofi: deriveLofi(signal),
    slugs: palettes.map((p) => p.frontmatter.slug),
    warnings: warningsFor(palettes, tonality.scale),
  };
}

/**
 * The instruments named by the **last** layer that names any — the most specific
 * statement about what this piece sounds like. Undefined when no layer says.
 *
 * Deliberately not the merged list: merging answers "what voices are in play",
 * which is provenance, and picking from it lets an emotion's incidental `piano`
 * outrank a timbre whose entire job is to say which instrument this is.
 */
function voicedLayer(
  palettes: Palette[],
  where: (p: Palette) => boolean = () => true,
): InstrumentName[] | undefined {
  let resolved: InstrumentName[] | undefined;
  for (const p of palettes) {
    if (!where(p)) continue;
    const named = (hints(p).instruments ?? []).filter((i): i is InstrumentName =>
      KNOWN_VOICES.has(i),
    );
    if (named.length > 0) resolved = named;
  }
  return resolved;
}

/**
 * Pick one voice for a job, honouring the **layer's own order** first.
 *
 * A palette lists its instruments in the order it means them — `tape` names
 * `[epiano, piano, pad]` because the sound it is describing is a Rhodes through
 * a worn cassette, not a grand piano. Scanning the preference list instead would
 * hand that blend a piano every time, on the strength of a global ranking the
 * author never saw. The preference list is the tie-break, not the rule.
 */
function pickVoice(
  named: InstrumentName[],
  merged: InstrumentName[],
  preference: InstrumentName[],
): InstrumentName | undefined {
  return (
    named.find((v) => preference.includes(v)) ?? preference.find((v) => merged.includes(v))
  );
}

/**
 * The sustained harmony voice.
 *
 * `pad` is the dedicated one, so any layer naming it settles the question — a
 * genre listing `[bass, pluck, piano]` is saying what the band plays, not that
 * the harmony bed should become a piano. A **timbre** does get to say that,
 * because a timbre is a statement about the sound itself: "this piece is a
 * Rhodes" means the bed is a Rhodes.
 */
function padVoiceFor(
  timbre: InstrumentName[] | undefined,
  instruments: InstrumentName[],
): InstrumentName {
  if (timbre) {
    const named = PAD_PREFERENCE.find((v) => timbre.includes(v));
    if (named) return named;
  }
  return PAD_PREFERENCE.find((v) => instruments.includes(v)) ?? "pad";
}

/**
 * Which voice sings the top line.
 *
 * `pluck` and `lead` are the same guitar with two rigs, and a solo played on the
 * rhythm tone is the puny-solo problem `composition.ts` describes. So a piece
 * comping on `pluck` sings on `lead` — even when no palette listed `lead`,
 * because "electric guitar" implies both and no author should have to say it
 * twice.
 */
function melodyVoiceFor(
  leadVoice: InstrumentName,
  voiced: InstrumentName[],
  instruments: InstrumentName[],
): InstrumentName {
  if (voiced.includes("lead")) return "lead";
  if (leadVoice === "pluck") return "lead";
  return pickVoice(voiced, instruments, MELODY_PREFERENCE) ?? leadVoice;
}

/**
 * Combinations worth flagging. Currently one, and it is the honest job for the
 * `mode` field every genre palette declares and nothing has ever read.
 *
 * A genre leaning minor under a major emotion (or the reverse) is not an error —
 * numerals resolve as written, and `progressionsInIdiom` already picks the
 * variant that fits where a genre ships both. What it can't fix is the melody,
 * which is drawn from the *emotion's* scale: with the chords in one idiom and
 * the tune in the other, a passing note rubs against the chord under it. The
 * clash is narrow rather than constant — the melody re-anchors to a chord tone
 * every bar — but it is real, and it is invisible until you hear it.
 */
function warningsFor(palettes: Palette[], scale: string): string[] {
  const family = modeFamily(scale);
  const out: string[] = [];
  for (const p of palettes) {
    if (p.frontmatter.kind === "emotion") continue;
    const mode = hints(p).mode;
    if (!mode || mode === "either") continue;
    // Same mode by any of its names (minor ≡ aeolian) — nothing to say.
    if (sameMode(mode, scale)) continue;

    if (modeFamily(mode) !== family) {
      out.push(
        `${p.frontmatter.slug} leans ${mode} but the key is ${scale}: the chords will follow the ` +
          `genre and the melody the emotion, so passing notes can rub. Pair it with a ` +
          `${modeFamily(mode)}-key emotion, or mean it.`,
      );
      continue;
    }
    // Same family, different mode. Not a clash — but the genre's mode is doing
    // nothing, because the emotion is the sole source of tonality and the
    // numerals resolve against *its* scale. A freygish genre under a plain major
    // emotion loses the one interval it exists for, silently, which is exactly
    // what this field was declared inertly for years without saying.
    out.push(
      `${p.frontmatter.slug} wants ${mode}, but the key is ${scale} and the emotion decides: ` +
        `its numerals will resolve against ${scale}, so the mode's own colour is lost. ` +
        `Use an emotion with "scale: ${mode}" to hear it.`,
    );
  }
  return out;
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
    // The cast is over `fill`, which the schema types as a bare string because
    // zod can't name the shelf's literals. `validateGroove` has already rejected
    // any name that isn't on it, at load, with the shelf printed.
    if (g && Object.keys(g.patterns).length > 0) resolved = g as Groove;
  }
  return resolved;
}

/**
 * The meter comes from the last layer that states one — a bare emotion is 4/4,
 * `--with waltz` is 3/4. Not intersected the way tempo is: two meters have no
 * overlap to take, and a piece is in one of them.
 */
function resolveMeter(palettes: Palette[]): Meter {
  let resolved: Meter | undefined;
  for (const p of palettes) {
    const m = hints(p).meter;
    if (m) resolved = [m[0], m[1]];
  }
  return resolved ?? COMMON_TIME;
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
