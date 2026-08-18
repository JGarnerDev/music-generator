/**
 * Studies: attempts at a musical *concept*, made to be judged.
 *
 * The other two benches ask "is this piece good" and "is this sound good". This
 * one asks a question neither can: **how should we approach a guitar solo at
 * all?** A study is a small rendered attempt at one concept, one of a set that
 * differ on exactly one axis, and the answer is a thumb — so the accumulated
 * verdicts say what this listener actually likes rather than what a palette
 * predicted they would.
 *
 * Three rules make the verdicts mean something:
 *
 * 1. **One axis.** Every attempt in a set shares key, tempo, backing and voices.
 *    If two things change, a thumb cannot say which one it is about.
 * 2. **A fixed shelf.** Concepts and verdict tags are enumerated here, not
 *    invented per study. A free-form reason is a reason that appears once and can
 *    never be counted; a shelf tag said four times is a preference.
 * 3. **Short.** Eight bars. A study you don't want to hear twice teaches nothing
 *    about a piece you'd hear ten times.
 *
 * Pure: no fs, no DOM. The filesystem side is `src/dev/study-store.ts`, the
 * organising rules are `./study-library.ts`, and the prose distilled *out* of the
 * verdicts is `docs/taste.md` — written by hand, because a rule is a judgement.
 */
import {
  validateComposition,
  type Composition,
  type InstrumentName,
  type ValidationIssue,
} from "./composition";

/** Longest a study's `approach` line may be — it is a table cell in the ledger. */
export const APPROACH_MAX = 120;

/**
 * Bars a study should stay under. A nudge in the scripts, not a hard error.
 *
 * The composer's `sample` form lands at nine bars — a phrase, its restatement
 * and a tonic — which is the intended size. The cap sits just above that so it
 * catches a study that has quietly become a *piece* (a `song` form, an expanded
 * plan) without complaining about every set that took the default.
 */
export const STUDY_MAX_BARS = 12;

// ── The concept shelf ───────────────────────────────────────────────────────

/**
 * The families concepts are filed under — the bench's tabs.
 *
 * Grouped rather than listed flat because there are thirty concepts and eight
 * tabs is a bench; thirty is a menu.
 */
export const CONCEPT_GROUPS = [
  "melody",
  "harmony",
  "rhythm",
  "arrangement",
  "form",
  "loop",
  "sound",
] as const;

export type ConceptGroup = (typeof CONCEPT_GROUPS)[number];

export const GROUP_BLURBS: Record<ConceptGroup, string> = {
  melody: "Top lines: what the ear follows and tries to hum back.",
  harmony: "Chords and bass — what is underneath, and where it wants to go.",
  rhythm: "Feel, subdivision and displacement. The fingerprint, not the decoration.",
  arrangement: "Who plays when, how loud, and — mostly — who stays quiet.",
  form: "Sections and their joins: contrast, lift, and how long a phrase runs.",
  loop: "What repeating for ten minutes does to a decision.",
  sound: "Tone choices judged as choices, not as instrument design.",
};

export interface Concept {
  /** Kebab-case slug — the folder under `studies/`. */
  slug: string;
  title: string;
  group: ConceptGroup;
  /** What is actually being decided, and why it is worth four attempts. */
  blurb: string;
  /** Axis names this concept can be varied along. The first is its default. */
  axes: readonly string[];
}

/**
 * The shelf. Fixed on purpose: a concept invented for one study is a concept
 * with one data point forever, and the whole value here is the second time a
 * verdict lands on the same question.
 *
 * Every entry maps to something the repo can actually change — a knob in
 * `knobs.ts`, a field in a composition, or a decision `docs/hooks.md` names and
 * nothing checks. A concept with no lever behind it does not belong here.
 */
export const CONCEPTS: readonly Concept[] = [
  // ── melody ────────────────────────────────────────────────────────────────
  {
    slug: "guitar-solo",
    title: "Guitar solo",
    group: "melody",
    blurb: "A lead break over a held backing. Phrasing and space, not speed.",
    axes: ["phrasing", "contour", "density", "note-choice", "register"],
  },
  {
    slug: "hook",
    title: "Hook cell",
    group: "melody",
    blurb: "The 2–4 bars the piece is named after. One signature: an interval, a rhythm, or a rest.",
    axes: ["note-choice", "phrasing", "contour", "figure"],
  },
  {
    slug: "melodic-contour",
    title: "Melodic contour",
    group: "melody",
    blurb: "Where the single highest note sits, and how the line gets there. Hooks item 4.",
    axes: ["contour", "register", "note-choice"],
  },
  {
    slug: "motif-development",
    title: "Motif development",
    group: "melody",
    blurb: "One cell, restated and altered. What counts as varying it versus replacing it.",
    axes: ["note-choice", "contour", "phrasing"],
  },
  {
    slug: "countermelody",
    title: "Countermelody",
    group: "melody",
    blurb: "A second line under the first that stays subordinate. Where it moves and where it waits.",
    axes: ["interplay", "register", "density"],
  },
  {
    slug: "twin-leads",
    title: "Twin leads",
    group: "melody",
    blurb: "Two lead lines instead of one — harmonised, answering, or trading. Which reading works.",
    axes: ["interplay", "note-choice", "register", "phrasing"],
  },
  {
    slug: "call-response",
    title: "Call and response",
    group: "melody",
    blurb: "Two voices that never share a bar. How wide the gap is, and who answers.",
    axes: ["interplay", "density", "phrasing"],
  },
  {
    slug: "melodic-rest",
    title: "Melodic rest",
    group: "melody",
    blurb: "The silence in a top line. How long a lead can stop before the piece sags.",
    axes: ["density", "phrasing", "entry"],
  },
  {
    slug: "bend-placement",
    title: "Bend placement",
    group: "melody",
    blurb: "Which note of a phrase bends and which stay straight. The arrival, the approach, or the peak.",
    axes: ["gesture", "phrasing", "contour"],
  },
  {
    slug: "bend-width",
    title: "Bend width",
    group: "melody",
    blurb: "How far a bend travels: a half step's ache, a whole tone, a third, or a sitar's fifth.",
    axes: ["gesture", "note-choice"],
  },
  {
    slug: "bend-curve",
    title: "Bend curve",
    group: "melody",
    blurb: "The shape of the travel on identical notes — settling, slow at both ends, or mechanical.",
    axes: ["gesture", "tone"],
  },
  {
    slug: "bend-density",
    title: "Bend density",
    group: "melody",
    blurb: "How many notes of a phrase bend before the line stops standing still anywhere.",
    axes: ["gesture", "density", "phrasing"],
  },

  // ── harmony ───────────────────────────────────────────────────────────────
  {
    slug: "chord-surprise",
    title: "The one surprising chord",
    group: "harmony",
    blurb: "A borrowed chord at the peak — bVI, Neapolitan, secondary dominant. Which, and where.",
    axes: ["note-choice", "contour"],
  },
  {
    slug: "modal-colour",
    title: "Modal colour",
    group: "harmony",
    blurb: "Same root, different mode. Dorian against aeolian against phrygian on one progression.",
    axes: ["note-choice", "register"],
  },
  {
    slug: "harmonic-rhythm",
    title: "Harmonic rhythm",
    group: "harmony",
    blurb: "How fast the chords move — on the barline, split, or held across two.",
    axes: ["harmonic-rate", "figure"],
  },
  {
    slug: "bassline",
    title: "Bassline approach",
    group: "harmony",
    blurb: "Root-lock against walking against a countermelodic bass, over one progression.",
    axes: ["note-choice", "register", "density"],
  },
  {
    slug: "cadence",
    title: "Cadence",
    group: "harmony",
    blurb: "How a phrase ends: landed, left open on the V, or refused entirely.",
    axes: ["resolution", "note-choice"],
  },
  {
    slug: "tonic-withholding",
    title: "Withholding the tonic",
    group: "harmony",
    blurb: "Circling the home chord and arriving late. Hooks item 5, the architectural one.",
    axes: ["resolution", "contour"],
  },

  // ── rhythm ────────────────────────────────────────────────────────────────
  {
    slug: "groove-feel",
    title: "Groove feel",
    group: "rhythm",
    blurb: "The rhythmic cell that becomes the piece's fingerprint. One per section, chosen.",
    axes: ["figure", "tempo", "harmonic-rate"],
  },
  {
    slug: "syncopation",
    title: "Syncopation",
    group: "rhythm",
    blurb: "One displacement, repeated until it is identity. Which push, and how far.",
    axes: ["figure", "phrasing"],
  },
  {
    slug: "drum-fill",
    title: "Drum fill",
    group: "rhythm",
    blurb: "What happens in the bar before a section changes. Announcement or interruption.",
    axes: ["density", "entry", "phrasing"],
  },
  {
    slug: "tempo-feel",
    title: "Tempo within a band",
    group: "rhythm",
    blurb: "The same material at the slow, mid and fast end of one palette's range.",
    axes: ["tempo", "figure"],
  },
  {
    slug: "swing",
    title: "Swing amount",
    group: "rhythm",
    blurb: "Straight against shuffled against triplet. Where the lean stops helping.",
    axes: ["figure", "tempo"],
  },

  // ── arrangement ───────────────────────────────────────────────────────────
  {
    slug: "negative-space",
    title: "Negative space",
    group: "arrangement",
    blurb: "Which tracks drop out and when. Hooks item 6 — usually the whole arrangement.",
    axes: ["density", "entry", "interplay"],
  },
  {
    slug: "texture-layering",
    title: "Texture layering",
    group: "arrangement",
    blurb: "How many parts sound at once before the hook stops being findable.",
    axes: ["density", "register", "interplay"],
  },
  {
    slug: "register-contrast",
    title: "Register contrast",
    group: "arrangement",
    blurb: "Where the parts sit relative to each other. The knob that makes a chorus lift.",
    axes: ["register", "interplay"],
  },
  {
    slug: "dynamic-build",
    title: "Dynamic build",
    group: "arrangement",
    blurb: "Getting louder over eight bars: by parts, by gain, or by subdivision.",
    axes: ["density", "figure", "entry"],
  },
  {
    slug: "intro",
    title: "Intro",
    group: "arrangement",
    blurb: "The first four bars, and how much they give away before the body starts.",
    axes: ["entry", "density", "note-choice"],
  },
  {
    slug: "outro",
    title: "Outro",
    group: "arrangement",
    blurb: "How a one-shot piece stops: landed, faded, cut, or left hanging.",
    axes: ["resolution", "density"],
  },
  {
    slug: "breakdown",
    title: "Breakdown",
    group: "arrangement",
    blurb: "The bars where nearly everything stops. How empty, and for how long.",
    axes: ["density", "entry", "register"],
  },
  {
    slug: "kit-entry",
    title: "Kit entry",
    group: "arrangement",
    blurb: "When the drums arrive — bar 1, bar 5, bar 9 — and what the wait is worth.",
    axes: ["entry", "density"],
  },

  // ── form ──────────────────────────────────────────────────────────────────
  {
    slug: "section-transition",
    title: "Section transition",
    group: "form",
    blurb: "The joint between two sections: elided, gapped, filled, or hard-cut.",
    axes: ["entry", "resolution", "density"],
  },
  {
    slug: "phrase-length",
    title: "Phrase length",
    group: "form",
    blurb: "Six bars, ten bars, or eight with a two-bar tag. Anything but four eights.",
    axes: ["phrasing", "harmonic-rate"],
  },
  {
    slug: "chorus-lift",
    title: "Chorus lift",
    group: "form",
    blurb: "Making the second section sit above the first on three axes, not one.",
    axes: ["register", "density", "figure"],
  },
  {
    slug: "state-three-break-four",
    title: "State three, break the fourth",
    group: "form",
    blurb: "Three repeats and an alteration. Which alteration reads as intent rather than error.",
    axes: ["phrasing", "note-choice", "resolution"],
  },

  // ── loop ──────────────────────────────────────────────────────────────────
  {
    slug: "loop-seam",
    title: "Loop seam",
    group: "loop",
    blurb: "The wrap heard every lap. Whether it feels like motion or like a reset.",
    axes: ["resolution", "note-choice", "entry"],
  },
  {
    slug: "loop-variation",
    title: "Loop variation cycle",
    group: "loop",
    blurb: "What changes every eight bars so a four-minute scene doesn't flatten.",
    axes: ["density", "entry", "figure"],
  },
  {
    slug: "loop-length",
    title: "Loop length",
    group: "loop",
    blurb: "Eight bars against sixteen against thirty-two. Where recognition turns into fatigue.",
    axes: ["phrasing", "harmonic-rate"],
  },

  // ── sound ─────────────────────────────────────────────────────────────────
  {
    slug: "tone-pairing",
    title: "Tone pairing",
    group: "sound",
    blurb: "Two approved voices together. Which pairs read as one instrument and which fight.",
    axes: ["tone", "register", "interplay"],
  },
  {
    slug: "mix-balance",
    title: "Mix balance",
    group: "sound",
    blurb: "Gains and pan across the same parts. How far forward a lead wants to be.",
    axes: ["tone", "density"],
  },
  {
    slug: "lead-tone",
    title: "Lead tone",
    group: "sound",
    blurb: "The same solo through different lead voices. Tone as a compositional choice.",
    axes: ["tone", "register"],
  },
];

const CONCEPTS_BY_SLUG: ReadonlyMap<string, Concept> = new Map(CONCEPTS.map((c) => [c.slug, c]));

export function isConceptSlug(value: unknown): value is string {
  return typeof value === "string" && CONCEPTS_BY_SLUG.has(value);
}

export function conceptOf(slug: string): Concept | undefined {
  return CONCEPTS_BY_SLUG.get(slug);
}

/** Every concept in one group, in shelf order. */
export function conceptsOfGroup(group: ConceptGroup): Concept[] {
  return CONCEPTS.filter((concept) => concept.group === group);
}

// ── The axis shelf ──────────────────────────────────────────────────────────

/**
 * How a set of attempts differs.
 *
 * `knob` axes are ones the engine already turns — the fan-out script can set
 * them itself and the attempts are renderable the moment they are written.
 * `written` axes are decisions no field encodes: phrasing, contour, note choice.
 * There the script writes the shared backing and leaves the varying part to be
 * composed by hand, which is honest about where the judgement actually lives.
 */
export interface StudyAxis {
  name: string;
  kind: "knob" | "written";
  blurb: string;
  /**
   * `knob` axes only: the values to fan out across, in order. Fewer values than
   * attempts asked for means the axis caps the set — three tempo leans is three
   * attempts, not four with a repeat.
   */
  values?: readonly string[];
}

export const STUDY_AXES: readonly StudyAxis[] = [
  {
    name: "register",
    kind: "knob",
    blurb: "The pitch band the roots fold into — the knob a chorus needs.",
    values: ["subterranean", "low", "mid", "high"],
  },
  {
    name: "tempo",
    kind: "knob",
    blurb: "Where in the palette's tempo range the piece sits.",
    values: ["slow", "mid", "fast"],
  },
  {
    name: "figure",
    kind: "knob",
    blurb: "The rhythmic cell each section states. Values are drawn from the figure shelf.",
  },
  {
    name: "harmonic-rate",
    kind: "knob",
    blurb: "Whether the harmony moves inside the bar or only on barlines.",
    values: ["on-the-barline", "split-bars"],
  },
  {
    name: "phrasing",
    kind: "written",
    blurb: "Where notes land and how long they are held. Written, not knobbed.",
  },
  {
    name: "contour",
    kind: "written",
    blurb: "The arc: where the single highest note sits and how the line reaches it.",
  },
  {
    name: "density",
    kind: "written",
    blurb: "How much sounds at once, and how much silence is left around it.",
  },
  {
    name: "note-choice",
    kind: "written",
    blurb: "Which pitches, given the same harmony. Chord tones, colour tones, chromatics.",
  },
  {
    name: "entry",
    kind: "written",
    blurb: "When a part arrives or leaves — the withholding axis.",
  },
  {
    name: "resolution",
    kind: "written",
    blurb: "How tension is paid off, or refused.",
  },
  {
    name: "interplay",
    kind: "written",
    blurb: "How two parts relate: harmonised, answering, trading, or staying out of the way.",
  },
  {
    name: "tone",
    kind: "written",
    blurb: "Which voices play the parts, and how they are balanced.",
  },
  {
    name: "gesture",
    kind: "written",
    blurb: "How a note moves while it sounds: which notes bend, how far, and in what shape.",
  },
];

const AXES_BY_NAME: ReadonlyMap<string, StudyAxis> = new Map(STUDY_AXES.map((a) => [a.name, a]));

export function axisOf(name: string): StudyAxis | undefined {
  return AXES_BY_NAME.get(name);
}

export function isAxisName(value: unknown): value is string {
  return typeof value === "string" && AXES_BY_NAME.has(value);
}

// ── The verdict shelf ───────────────────────────────────────────────────────

/**
 * Facets a verdict tag can be about. The bench groups the chips by these, so a
 * shelf of twenty stays scannable while you are still holding the sound in your
 * head.
 */
export const TAG_FACETS = ["shape", "memory", "surprise", "space", "feel", "pitch", "tone"] as const;

export type TagFacet = (typeof TAG_FACETS)[number];

export interface VerdictTag {
  name: string;
  facet: TagFacet;
  /** What clicking it claims — so two sessions mean the same thing by it. */
  blurb: string;
}

/**
 * The reasons. A thumb says *whether*; a tag says *what about it*, and the tag is
 * the half that can be counted across studies into a rule.
 *
 * Polarity lives in the thumb, not the tag — `breathes` on a thumbs-down means
 * "the space was the only good part", which is exactly the kind of split a
 * one-word verdict would have lost.
 */
export const VERDICT_TAGS: readonly VerdictTag[] = [
  { name: "great-arc", facet: "shape", blurb: "One clear peak, placed late, and the line earns it." },
  { name: "no-peak", facet: "shape", blurb: "Wanders at one altitude — nothing is the high point." },
  { name: "peak-too-early", facet: "shape", blurb: "Arrives at the top and then has nowhere to go." },
  { name: "wrong-register", facet: "shape", blurb: "Sitting in the wrong band against what is under it." },
  { name: "no-lift", facet: "shape", blurb: "The second section should have risen above the first and doesn't." },

  { name: "memorable", facet: "memory", blurb: "Hummable back after one pass." },
  { name: "forgettable", facet: "memory", blurb: "A passage, not a hook — gone by the end." },
  { name: "too-busy-to-hum", facet: "memory", blurb: "Good material buried under too many notes to hold." },

  { name: "predictable", facet: "surprise", blurb: "Confirms everything the ear guessed. Wallpaper." },
  { name: "too-random", facet: "surprise", blurb: "Confirms nothing — the ear stops predicting and disengages." },
  { name: "earned-surprise", facet: "surprise", blurb: "One break, in the right place, and it lands." },
  { name: "surprise-too-loud", facet: "surprise", blurb: "The unexpected thing is louder than the idea it interrupts." },

  { name: "breathes", facet: "space", blurb: "Silence around the hook — the parts are not all playing." },
  { name: "cluttered", facet: "space", blurb: "Everything plays every bar; nothing gets to be the subject." },
  { name: "too-sparse", facet: "space", blurb: "Space with nothing in it. An absence, not tension." },

  { name: "locks-in", facet: "feel", blurb: "The groove has one consistent asymmetry and holds it." },
  { name: "wrong-feel", facet: "feel", blurb: "The subdivision fights the scene." },
  { name: "drags", facet: "feel", blurb: "Slower than the material wants." },
  { name: "rushes", facet: "feel", blurb: "Faster than the material can carry." },
  { name: "doesnt-resolve", facet: "feel", blurb: "Withholds and never pays off." },

  // Pitch that moves *within* notes — bends, and whatever else is added that
  // travels. Separate from `feel` (which is about where notes land) because a
  // line can be rhythmically perfect and still slide around like a bad singer.
  { name: "sings", facet: "pitch", blurb: "The pitch moves like a hand on a string, not like a setting." },
  { name: "mechanical", facet: "pitch", blurb: "It travels, but it reads as automation — no player in it." },
  { name: "seasick", facet: "pitch", blurb: "Too much moving. Nothing stands still long enough to be a note." },
  { name: "undersold", facet: "pitch", blurb: "The gesture is there and too small or too quick to register." },

  { name: "right-tone", facet: "tone", blurb: "The voice is the reason this works." },
  { name: "wrong-tone", facet: "tone", blurb: "Right notes, wrong instrument for them." },
  { name: "thin", facet: "tone", blurb: "Not enough body to carry the part." },
];

const TAG_SET: ReadonlySet<string> = new Set(VERDICT_TAGS.map((tag) => tag.name));

export function isVerdictTag(value: unknown): value is string {
  return typeof value === "string" && TAG_SET.has(value);
}

/** The tags of one facet, in shelf order — how the bench lays out its chips. */
export function tagsOfFacet(facet: TagFacet): VerdictTag[] {
  return VERDICT_TAGS.filter((tag) => tag.facet === facet);
}

export type Thumb = "up" | "down";

export interface Verdict {
  thumb: Thumb;
  /** Shelf tags saying what the thumb is about. May be empty. */
  tags: string[];
  /** Optional free text — the thing no shelf tag covers yet. */
  note?: string;
  /** ISO date the verdict was given. */
  at: string;
}

// ── The study file ──────────────────────────────────────────────────────────

export interface Study {
  /** Concept slug. The folder wins over this field — see `study-library.ts`. */
  concept: string;
  /** Filename without `.json`. The folder wins over this field too. */
  slug: string;
  title: string;
  /**
   * The set this attempt belongs to: the other attempts at the same question,
   * with the same held-constant context. A thumb only means something relative
   * to its siblings, so the set is what the bench groups by.
   */
  set: string;
  /** Which axis the set varies along — a name from `STUDY_AXES`. */
  axis: string;
  /** This attempt's position on that axis, e.g. "high" or "long held bends". */
  variant: string;
  /** One line: what this attempt does differently, in words. */
  approach: string;
  /** The scene words the set was generated from. */
  mood?: string;
  /** One line naming what is held constant, so a stale set is visible. */
  held?: string;
  /**
   * Absent until judged. A study with no verdict is the queue; the bench opens
   * on those.
   */
  verdict?: Verdict;
  /**
   * True while the varying part still has to be written by hand — a `written`
   * axis that the fan-out could only scaffold. Nothing renders a draft.
   */
  draft?: boolean;
  composition: Composition;
}

/**
 * Structural validation for a study parsed from untrusted JSON.
 *
 * The concept, axis and tags are checked against the shelves rather than merely
 * typed: a study filed under a concept that does not exist is a verdict that can
 * never be counted with anything, which is the one failure this whole process
 * exists to avoid.
 */
export function validateStudy(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (typeof input !== "object" || input === null) {
    push("$", "study must be an object");
    return issues;
  }
  const s = input as Record<string, unknown>;

  for (const field of ["slug", "title", "set", "variant", "approach"] as const) {
    if (typeof s[field] !== "string" || (s[field] as string).trim() === "") {
      push(field, "must be a non-empty string");
    }
  }
  if (typeof s.approach === "string" && s.approach.length > APPROACH_MAX) {
    push("approach", `must be ${APPROACH_MAX} characters or fewer — it is a ledger row`);
  }
  if (!isConceptSlug(s.concept)) {
    push("concept", `unknown concept "${String(s.concept)}" — see CONCEPTS in src/engine/study.ts`);
  }
  if (!isAxisName(s.axis)) {
    push("axis", `unknown axis "${String(s.axis)}" — see STUDY_AXES in src/engine/study.ts`);
  }
  for (const field of ["mood", "held"] as const) {
    if (s[field] !== undefined && typeof s[field] !== "string") push(field, "must be a string");
  }
  if (s.draft !== undefined && typeof s.draft !== "boolean") push("draft", "must be a boolean");

  if (s.verdict !== undefined) validateVerdict(s.verdict, push);

  if (s.composition === undefined) {
    push("composition", "must be a composition object");
  } else {
    for (const issue of validateComposition(s.composition)) {
      push(`composition.${issue.path}`, issue.message);
    }
  }

  return issues;
}

function validateVerdict(
  verdict: unknown,
  push: (path: string, message: string) => void,
): void {
  if (typeof verdict !== "object" || verdict === null) {
    push("verdict", "must be an object");
    return;
  }
  const v = verdict as Record<string, unknown>;
  if (v.thumb !== "up" && v.thumb !== "down") push("verdict.thumb", 'must be "up" or "down"');
  if (typeof v.at !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v.at)) {
    push("verdict.at", "must be an ISO date");
  }
  if (!Array.isArray(v.tags)) {
    push("verdict.tags", "must be an array of shelf tags");
  } else {
    v.tags.forEach((tag, i) => {
      if (!isVerdictTag(tag)) {
        push(`verdict.tags[${i}]`, `"${String(tag)}" is not on the tag shelf`);
      }
    });
  }
  if (v.note !== undefined && typeof v.note !== "string") push("verdict.note", "must be a string");
}

/**
 * The composition with everything but the named parts removed.
 *
 * A study is an A/B test, not a piece: anything on the record that isn't the
 * axis is noise the ear has to subtract before it can hear the question. A set
 * fanned out at full arrangement density — drums, pad, two rhythm parts — came
 * back with every attempt thumbed up and not one tag, which is what "I couldn't
 * tell what changed" looks like in a ledger.
 *
 * **The first track of each named instrument, in the original order.** A palette
 * routinely writes an instrument twice (a rhythm comp *and* an arpeggio on the
 * same pluck), and the second is exactly the doubling that hides a layering
 * question. A study that genuinely needs two of one instrument — twin leads —
 * adds its second one afterwards as the varying part, which is the only way the
 * pair is attributable to the axis anyway.
 */
export function stripToParts(comp: Composition, keep: readonly InstrumentName[]): Composition {
  if (keep.length === 0) return comp;
  const wanted = new Set<InstrumentName>(keep);
  const taken = new Set<InstrumentName>();
  const tracks = comp.tracks.filter((track) => {
    if (!wanted.has(track.instrument) || taken.has(track.instrument)) return false;
    taken.add(track.instrument);
    return true;
  });
  return { ...comp, tracks };
}

/** Bars a study's composition occupies, from the last note's bar index. */
export function studyBars(comp: Composition): number {
  let last = 0;
  for (const track of comp.tracks) {
    for (const note of track.notes) {
      const bar = Number.parseInt(note.time.split(":")[0] ?? "0", 10);
      if (Number.isFinite(bar)) last = Math.max(last, bar);
    }
  }
  return last + 1;
}
