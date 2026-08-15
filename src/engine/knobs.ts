/**
 * Scene words → the knobs that decide whether two pieces sound alike.
 *
 * `docs/variety.md` established the knobs and the rule "choose before you write
 * bars". It could not make anyone *follow* it: the choosing happened by feel,
 * once, in conversation, and by the fourth loop the feel had a house style. This
 * module is that checklist as code — the user's own words pick the rhythmic
 * cell, the register, the tempo within the palette's band and where the harmony
 * moves, so the same scene gets the same answer and a *different* scene reliably
 * gets a different one.
 *
 * It is a **lean**, not a lookup. A word contributes candidates; the seeded rng
 * picks among what the whole phrase suggested, so "frantic rooftop chase" and
 * "slow funeral procession" cannot land on the same figure, while two chases can
 * still differ from each other. Words nothing matches fall back to the neutral
 * shelf rather than to one hard-coded default.
 *
 * Pure and deterministic in (mood, seed) → unit tested. What the knobs *do* is
 * `composer.ts`'s business; this only decides what they are.
 */
import { FIGURES, FIGURE_NAMES, figureFitsMeter, type FigureName } from "./figure";
import { pick, type Rng } from "@utils/random";
import { COMMON_TIME, type Meter } from "@utils/timing";

/**
 * Where the bass sits, as a pitch band the roots fold into.
 *
 * The default was eight semitones wide, which folds every key into the same
 * eight notes — a D minor descent and a C minor descent came out at the same
 * pitches, and the *key* stopped being audible. These are all at least an
 * octave so the progression keeps its real shape.
 */
export const REGISTERS = {
  subterranean: ["C1", "C2"],
  low: ["E1", "E2"],
  mid: ["G1", "G2"],
  high: ["C2", "C3"],
} as const satisfies Record<string, readonly [string, string]>;

export type RegisterName = keyof typeof REGISTERS;

/** Where in the palette's tempo range to sit. */
export type TempoLean = "slow" | "mid" | "fast";

/** What a scene word leans toward. Every field optional — a word says what it knows. */
interface Lean {
  figure?: FigureName[];
  register?: RegisterName[];
  tempo?: TempoLean;
  /** Whether the harmony should move inside a bar rather than only on barlines. */
  restless?: boolean;
}

/**
 * The mapping, keyed by scene word. Matching is on **stems**, so "chase" catches
 * "chasing" and "chased" and "battle" catches "battles".
 *
 * Stemming rather than a plain substring test, because substrings match across
 * word boundaries and get it wrong in both directions: "chasing" does not
 * contain "chase" and so would miss, while "sleeping" contains "deep" and so
 * would drop the piece an octave for no reason.
 *
 * Deliberately small and legible: this is a table a human argues with, not a
 * model. A word belongs here when it changes what the music *does*, not merely
 * how it feels — "sad" is the emotion palette's job and is absent on purpose.
 */
const SCENE_WORDS: Record<string, Lean> = {
  // --- speed and pressure ---------------------------------------------------
  chase: { figure: ["gallop", "sixteenth-chug"], tempo: "fast", restless: true },
  frantic: { figure: ["sixteenth-chug", "pushed-eighths"], tempo: "fast", restless: true },
  panic: { figure: ["sixteenth-chug", "pushed-eighths"], tempo: "fast", restless: true },
  urgent: { figure: ["gallop", "pushed-eighths"], tempo: "fast" },
  race: { figure: ["sixteenth-chug", "gallop"], tempo: "fast" },
  flee: { figure: ["gallop", "pushed-eighths"], tempo: "fast", restless: true },
  battle: { figure: ["gallop", "3+3+2"], tempo: "fast", register: ["low"] },
  fight: { figure: ["gallop", "sixteenth-chug"], tempo: "fast", register: ["low"] },
  war: { figure: ["gallop", "triplet-canter"], tempo: "fast", register: ["low"] },
  ambush: { figure: ["3+3+2", "pushed-eighths"], tempo: "fast", restless: true },
  storm: { figure: ["sixteenth-chug", "gallop"], tempo: "fast", restless: true },

  // --- weight and stillness -------------------------------------------------
  slow: { figure: ["half-time-chug", "straight-eighths"], tempo: "slow" },
  heavy: { figure: ["half-time-chug"], tempo: "slow", register: ["subterranean"] },
  doom: { figure: ["half-time-chug"], tempo: "slow", register: ["subterranean"] },
  funeral: { figure: ["half-time-chug", "six-eight-stab"], tempo: "slow", register: ["low"] },
  dirge: { figure: ["half-time-chug", "six-eight-stab"], tempo: "slow", register: ["low"] },
  vast: { figure: ["half-time-chug", "straight-eighths"], tempo: "slow" },
  drift: { figure: ["half-time-chug"], tempo: "slow" },
  calm: { figure: ["half-time-chug", "four-on-floor-stab"], tempo: "slow" },
  quiet: { figure: ["half-time-chug"], tempo: "slow", register: ["mid"] },
  still: { figure: ["half-time-chug"], tempo: "slow" },
  sleep: { figure: ["six-eight-stab", "half-time-chug"], tempo: "slow" },
  lullaby: { figure: ["six-eight-stab"], tempo: "slow", register: ["high"] },

  // --- gait -----------------------------------------------------------------
  ride: { figure: ["triplet-canter", "gallop"] },
  horse: { figure: ["triplet-canter"] },
  cavalry: { figure: ["triplet-canter"] },
  march: { figure: ["four-on-floor-stab", "straight-eighths"] },
  procession: { figure: ["four-on-floor-stab", "six-eight-stab"], tempo: "slow" },
  waltz: { figure: ["waltz-oom-pah", "waltz-drive"] },
  dance: { figure: ["four-on-floor-stab", "pushed-eighths"] },
  jig: { figure: ["jig-lilt"], tempo: "fast" },
  sail: { figure: ["jig-lilt", "six-eight-stab"] },
  sea: { figure: ["jig-lilt", "six-eight-stab"] },
  swagger: { figure: ["3+3+2", "twelve-eight-shuffle"] },
  strut: { figure: ["3+3+2", "four-on-floor-stab"] },
  shuffle: { figure: ["twelve-eight-shuffle"] },

  // --- character ------------------------------------------------------------
  desert: { figure: ["straight-eighths"], register: ["low"] },
  hypnotic: { figure: ["straight-eighths"] },
  ritual: { figure: ["straight-eighths", "six-eight-stab"], tempo: "slow" },
  machine: { figure: ["sixteenth-chug", "straight-eighths"] },
  lopsided: { figure: ["3+3+2"], restless: true },
  nervous: { figure: ["pushed-eighths"], restless: true },
  drunk: { figure: ["twelve-eight-shuffle", "3+3+2"] },
  cave: { register: ["subterranean"], tempo: "slow" },
  underground: { register: ["subterranean"] },
  deep: { register: ["subterranean"] },
  giant: { register: ["subterranean"], tempo: "slow" },
  sky: { register: ["high"] },
  bright: { register: ["high"] },
  music: { register: ["high"] }, // "music box"
  child: { register: ["high"] },
  tavern: { figure: ["jig-lilt", "twelve-eight-shuffle"], restless: true },
};

/** The knobs a piece is built with, all chosen rather than defaulted. */
export interface Knobs {
  /** The rhythmic cell each section plays. Index 0 is the statement. */
  figures: FigureName[];
  /** Band the bass roots fold into. */
  register: RegisterName;
  /** Where in the palette's tempo range to sit. */
  tempo: TempoLean;
  /** Whether a bar of the restatement splits between two chords. */
  splitBars: boolean;
  /**
   * Whether a scene word actually asked for `figures[0]`, as against it being
   * drawn from the shelf because nothing matched.
   *
   * The composer reads this to decide whether to override the kick: with a kit
   * present, the bass playing the kick's own rhythm is most of what "tight"
   * means, and that is worth keeping unless the scene said otherwise.
   */
  figureFromScene: boolean;
  /** Which scene words were recognised — printed so the choice is auditable. */
  matched: string[];
}

/** How many distinct cells a piece gets. Statement and restatement, at least. */
const SECTIONS = 2;

/**
 * Choose the knobs for a scene.
 *
 * `meter` narrows the figure shelf to the cells that state a whole bar of it, so
 * a 3/4 scene cannot be handed a sixteen-step gallop. Everything is drawn from
 * `rng`, so a seed change is a *different* take rather than a different piece.
 */
export function chooseKnobs(mood: string, rng: Rng, meter: Meter = COMMON_TIME): Knobs {
  const stems = new Set(words(mood).map(stem));
  const matched = Object.keys(SCENE_WORDS).filter((word) => stems.has(stem(word)));
  const leans = matched.map((word) => SCENE_WORDS[word]!);

  const fits = (name: FigureName) => figureFitsMeter(name, meter);
  const suggested = leans.flatMap((l) => l.figure ?? []).filter(fits);
  const shelf = FIGURE_NAMES.filter(fits);
  if (shelf.length === 0) {
    throw new Error(`no figure states a whole bar of ${meter[0]}/${meter[1]}`);
  }
  const candidates = suggested.length > 0 ? suggested : shelf;

  // A different cell per section is the point — "vary between sections, not just
  // between pieces". Falling back to the whole shelf when the scene only
  // suggested one keeps the contrast rather than repeating the suggestion.
  const figures: FigureName[] = [];
  for (let i = 0; i < SECTIONS; i++) {
    const unused = candidates.filter((f) => !figures.includes(f));
    const from = unused.length > 0 ? unused : shelf.filter((f) => !figures.includes(f));
    figures.push(pick(rng, from.length > 0 ? from : shelf));
  }

  const registers = leans.flatMap((l) => l.register ?? []);
  const tempos = leans.map((l) => l.tempo).filter((t): t is TempoLean => t !== undefined);

  return {
    figures,
    register: registers.length > 0 ? pick(rng, registers) : pick(rng, REGISTER_NAMES),
    tempo: tempos.length > 0 ? pick(rng, tempos) : "mid",
    // A scene nobody called restless still splits a bar sometimes: chord changes
    // that only ever land on the barline are half of why a loop is predictable.
    splitBars: leans.some((l) => l.restless) || rng() < 0.35,
    figureFromScene: suggested.length > 0,
    matched,
  };
}

const REGISTER_NAMES = Object.keys(REGISTERS) as RegisterName[];

/** The words of a mood, lowercased, punctuation dropped. */
function words(mood: string): string[] {
  return mood.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/**
 * A crude English stem: drop one inflectional ending, then a trailing `e`.
 *
 * `chase`/`chasing`/`chased` all land on `chas`, which is all this needs — the
 * table is fifty hand-written words, not a corpus, so anything cleverer would
 * cost more than it could possibly buy.
 */
function stem(word: string): string {
  const trimmed = word.replace(/(ing|ed|es|s)$/, "");
  return (trimmed.length >= 3 ? trimmed : word).replace(/e$/, "");
}

/** The pitch band a register name stands for. */
export function registerBand(name: RegisterName): [string, string] {
  const [low, high] = REGISTERS[name];
  return [low, high];
}

/**
 * A BPM inside `[min, max]` for a tempo lean. The bands overlap slightly so a
 * "slow" chase and a "fast" lament aren't separated by a cliff no palette meant.
 */
export function tempoFor(lean: TempoLean, [min, max]: [number, number], rng: Rng): number {
  const span = max - min;
  const window: Record<TempoLean, [number, number]> = {
    slow: [0, 0.4],
    mid: [0.25, 0.75],
    fast: [0.6, 1],
  };
  const [lo, hi] = window[lean];
  return Math.round(min + span * (lo + rng() * (hi - lo)));
}

/** One line per knob, for a CLI to print. The choice has to be reviewable. */
export function describeKnobs(knobs: Knobs): string[] {
  const [low, high] = registerBand(knobs.register);
  return [
    `figures  ${knobs.figures.join(" → ")}  (${FIGURES[knobs.figures[0]!].summary.split(".")[0]})`,
    `register ${knobs.register} (${low}–${high})`,
    `tempo    ${knobs.tempo} of the palette's range`,
    `harmony  ${knobs.splitBars ? "moves inside the bar" : "changes on the barline"}`,
    `from     ${knobs.matched.length > 0 ? knobs.matched.join(", ") : "(no scene word matched — chosen at random, not defaulted)"}`,
  ];
}
