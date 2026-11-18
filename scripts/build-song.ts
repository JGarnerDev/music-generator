/**
 * Expand a section plan into a full composition JSON.
 *   npm run song:build -- --plan plans/high-noon-warpath.json
 *
 * A game loop is minutes long and mostly mechanical: the same gallop restated on
 * a new root, bar after bar. Writing that by hand is thousands of lines of JSON
 * nobody can review. A plan says *what happens* — sections, chords, a style per
 * section, the melodies — and this expands it into notes via the tested `riff`
 * builders. Edit the plan, rebuild, re-audition.
 *
 * Named flags only (repo convention: no positional arguments).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { Command } from "commander";
import { COMPOSITION_KINDS, isCompositionKind } from "../src/engine/library";
import {
  PITCHED_INSTRUMENTS,
  validateComposition,
  type Composition,
  type InstrumentName,
  type LoFiSettings,
  type Note,
  type Track,
} from "../src/engine/composition";
import {
  FIGURE_NAMES,
  figureFitsMeter,
  isFigureName,
  validateFigure,
  type FigureName,
  type FigureRef,
} from "../src/engine/figure";
import { approachNotes } from "../src/engine/parts";
import {
  HARMONY_INTERVAL_NAMES,
  harmonize,
  isHarmonyInterval,
  type HarmonyInterval,
} from "../src/engine/harmony";
import { grooveNotes, validateGroove, type Groove } from "../src/engine/groove";
import { pitchToMidi } from "../src/engine/theory";
import { COMMON_TIME, beatsPerBar, validateMeter, type Meter } from "../src/utils/timing";
import { chordSpans, findClashes, formatClash, type LabelledSpan } from "../src/engine/clash";
import { HOUSE_LEANS, humanize } from "../src/engine/humanize";
import { splitBySound, type SectionSound } from "../src/engine/section-sound";
import { offsetNotes, planBendIssues, withoutBends, type PlanNote } from "../src/engine/plan-note";
import { sectionTempoChanges, tempoMap, type TempoChange } from "../src/engine/tempo";
import {
  STYLES,
  buildSection,
  emptyVoices,
  firstOf,
  foldRoots,
  isStyle,
  lastOf,
  octaveUp,
  type SectionContext,
  type Style,
  type Voices,
} from "../src/engine/sections";

/**
 * Bass roots are fitted into one tight octave so the riff never jumps register.
 * G1–D2 is where the western/metal loops sit; a plan overrides it with `register`,
 * and that override is what makes the *key* audible — inside eight semitones
 * every root folds to the same place and C minor sounds exactly where D minor did.
 */
const DEFAULT_REGISTER: [string, string] = ["G1", "D2"];


interface PlanSection {
  id: string;
  style: Style;
  note?: string;
  /**
   * One entry per bar. A plain symbol holds the bar; an **array splits the bar
   * evenly** — `["Am", ["Bb", "C"], "Am"]` changes chord on the half of bar 2,
   * and four entries change it on every beat.
   *
   * Section length is this array's length, so phrases don't have to be eight
   * bars: write six, ten, or a two-bar tag. Sections that are all 8 bars with a
   * change on every barline are the reason a loop is predicted two bars ahead.
   */
  chords: (string | string[])[];
  /** Override the plan's beat for this section (a half-time chorus, a new kit). */
  groove?: Groove;
  /**
   * Override the plan's register for this section — `["C2", "C3"]` for a chorus
   * that sits a fifth above the verse it followed.
   *
   * This is the contour knob. A section can already change its figure, its kit
   * and its density, but with one band for the whole piece it cannot change
   * *pitch*: the roots fold back into the same eight semitones and the chorus
   * arrives at the same place the verse was. Everything stacks off these roots,
   * so moving the band moves the guitar and pad with it.
   */
  register?: [string, string];
  /** `false` drops the kit for this section — a breakdown is defined by its silence. */
  drums?: boolean;
  /** Scales the kit's dynamics here: 0.6 for a verse, 1 for the chorus. */
  intensity?: number;
  /**
   * The rhythmic cell the engine plays here — a name off the shelf in
   * `src/engine/figure.ts` (`npm run figures` lists them) or a figure written
   * inline. This is the knob that stops two pieces in the same key at the same
   * tempo being the same song, so vary it *between sections* as well as between
   * plans. Default: the gallop, or the `subdivision` motor for a `motor` section.
   */
  figure?: FigureRef;
  /** `motor` only — shorthand for a figure: 2 = straight eighths, 4 = a sixteenth chug. */
  subdivision?: 2 | 4;
  /** The written top line, times relative to the section start. Plays on the plan's `melodyOn` (default piano). */
  melody?: PlanNote[];
  /** Guitar lead voice, times relative to the section start. */
  lead?: PlanNote[];
  /**
   * The second guitar for this section, when the plan declares a `twinLead`.
   *
   * - omitted — derived from this section's `melody` at the plan's interval
   * - `false` — one guitar here. The twin is worth more when it is withheld
   *   somewhere, so a verse in unison makes the chorus arrive in harmony
   * - notes — written out, for counterpoint that diverges and returns rather
   *   than running parallel. Parallel everywhere is one instrument with a
   *   chorus pedal on it
   */
  harmony?: PlanNote[] | false;
  /**
   * Override the twin's distance for this section. Moving it is how the second
   * guitar marks a section rather than tagging along in it: thirds under a
   * verse, fifths under the solo's held notes, fourths over the last chorus.
   */
  harmonyInterval?: HarmonyInterval | number;
  /** Override the twin's side for this section — the harmony crossing above the tune is a lift. */
  harmonyBelow?: boolean;
  /**
   * A different sound for these bars, `{ "lead": "wood-flute", "twin": "violin-arco" }`
   * — the same part handed to another player. Each sound becomes its own track
   * (see `src/engine/section-sound.ts`); `twin` names the second lead's voice.
   * Unnamed instruments keep the plan's voice.
   */
  voices?: Partial<Record<SoundKey, string>>;
  /** Track gain for these bars, over the plan's `gains`. `0` silences a part here. */
  gains?: Partial<Record<SoundKey, number>>;
  /**
   * Tempo from this section's first bar, held until a later section states
   * another. A step on the barline — the section *is* faster, rather than
   * getting there. See [`src/engine/tempo.ts`](../src/engine/tempo.ts).
   */
  bpm?: number;
  /**
   * Glide from the section's opening tempo to this one, arriving on its last
   * barline: a rally that accelerates into the peak, a turnaround that eases
   * back to the loop's tempo so the seam doesn't lurch.
   */
  rampTo?: number;
}

/** A part a section can re-voice: an instrument, the twin lead, or a part's double (`pluck2`). */
type SoundKey = InstrumentName | "twin" | `${DoubledPart}2`;

/** Parts that can be double-tracked. */
type DoubledPart = "pluck" | "pad" | "bass";
const DOUBLED_PARTS: readonly DoubledPart[] = ["pluck", "pad", "bass"];

/**
 * A second player on the same part — the record-making trick of tracking the
 * rhythm guitar twice and panning the takes apart. Same notes, its own voice,
 * level, side and humanize seed, so the two takes drift against each other
 * instead of summing into one louder mono part. A section re-voices it as
 * `voices.pluck2` and drops it with `gains.pluck2: 0`.
 */
interface Double {
  /** Voice slug in `voices/<part>/`. Default: the part's own voice. */
  voice?: string;
  /** Gain for the double. Default: the part's gain. */
  gain?: number;
  /** Stereo position of the double. Default -0.6. */
  pan?: number;
  /** Stereo position of the original, so the pair sits apart. Default 0.6. */
  pairPan?: number;
}

/**
 * The second lead: a whole track, not a setting on the first.
 *
 * A harmony guitar is a different player — its own tone, its own level, its own
 * side of the stereo field — and the two collapse into one thick mono voice if
 * they share those. Panning them apart is most of what makes twin leads read as
 * *two* rather than as one lead that got louder.
 */
interface TwinLead {
  /** `third` (the default), `fourth`, `fifth`, `sixth`, or raw scale steps. */
  interval?: HarmonyInterval | number;
  /** Run the second line under the melody instead of over it. */
  below?: boolean;
  /**
   * Mode the harmony stays inside. Default: read off the plan's `key`. State it
   * when the tune is modal — an E dorian chorus harmonised against E aeolian
   * flattens the raised sixth that the chorus is *about*.
   */
  scale?: string;
  /** Voice slug in `voices/lead/`. Default: the same voice as the lead. */
  voice?: string;
  /** Gain for the harmony track. Default 0.72 — under the lead, not level with it. */
  gain?: number;
  /** Stereo position of the harmony guitar. Default -0.35. */
  pan?: number;
  /** Stereo position of the *lead* guitar, so the pair sits apart. Default 0.35. */
  leadPan?: number;
  /** Velocity scale applied to the derived line. Default 0.9. */
  velocity?: number;
}

interface Plan {
  name: string;
  bpm: number;
  key: string;
  /**
   * Campaign slug, copied onto the built piece (see `Composition.campaign`). It
   * lives in the plan because anything patched into the generated file is
   * erased by the next build.
   */
  campaign?: string;
  /**
   * Time signature, `[3, 4]` for a waltz, `[6, 8]` for a jig. Default 4/4.
   *
   * It changes how long a bar is, so everything counted in bars follows it: the
   * groove lanes become twelve steps rather than sixteen, `1m` holds three beats,
   * and the figures a section may pick narrow to the ones that state a bar of it
   * (`npm run figures -- --meter 3/4`).
   */
  meter?: Meter;
  palettes?: string[];
  lofi?: LoFiSettings;
  /**
   * The kit pattern, in the same step notation the genre palettes use (see
   * `docs/grooves.md`). Stated once here and restated per section only where the
   * beat actually changes — a plan is a description of what happens, and "the
   * drums keep doing what they were doing" is most bars.
   */
  groove?: Groove;
  /**
   * Low and high pitch the bass roots are folded into, `["C1", "G1"]` for heavy
   * and low, `["C2", "G2"]` for frantic. Widen it past an octave and the roots
   * stop folding at all, so the progression keeps its real shape. Everything else
   * is stacked off these roots (guitar +12, pad +12/+19), so this is the piece's
   * whole register in one field. Default `G1`–`D2`.
   *
   * A section overrides it with its own `register` — that is how a chorus gets
   * to sit above its verse rather than merely louder than it.
   */
  register?: [string, string];
  /**
   * Per-track gain, `{ "lead": 0.95, "pad": 0.2 }`, over the builder's defaults.
   * The mix is part of the arrangement — a piece that wants to be all bass and
   * kit should say so here rather than sounding like every other piece.
   */
  gains?: Partial<Record<InstrumentName, number>>;
  /**
   * Which sound each instrument plays, `{ "pad": "mens-choir" }` — the slug of a
   * preset in `voices/<instrument>/`. Stated in the plan rather than patched into
   * the built composition, because the composition is regenerated on every edit
   * and a hand-added `voice` would be lost with it. Omitted instruments keep
   * their default voice.
   */
  voices?: Partial<Record<InstrumentName, string>>;
  /**
   * Which instrument the sections' hand-written `melody` is played on. Default
   * `piano`, which is where every top line landed before this field existed —
   * and the reason a written tune could only ever be a keys voice, however much
   * `lead/lone-whistle` or `lead/harmonica-reed` was the sound the scene wanted.
   *
   * It moves the *written* line only. The engine's own keys decoration — the
   * `standoff`/`breakdown` bell, the `turnaround` stab — is part of those
   * builders' sound rather than the tune, so it stays on the piano either way.
   * Pair it with `voices.<target>`: routing the melody to `lead` without naming
   * a voice gets the default rock lead, which is rarely the intent.
   */
  melodyOn?: Exclude<InstrumentName, "drums">;
  /**
   * Give the piece two lead guitars instead of one.
   *
   * A single lead line is thin in a way gain cannot fix — one voice has no
   * interval to be *in*. Declaring this derives a second line from every
   * section's written `melody` at a fixed diatonic distance (see
   * `src/engine/harmony.ts`) and puts it on its own track, with its own voice,
   * level and pan. A section overrides it with written counterpoint, or drops
   * to one guitar with `"harmony": false`.
   *
   * Only meaningful with `melodyOn`, since it harmonises the *written* tune.
   */
  twinLead?: TwinLead;
  /** Double-track a part — see `Double`. `{ "pluck": { "voice": "chainsaw-chug" } }`. */
  doubles?: Partial<Record<DoubledPart, Double>>;
  /**
   * Play the parts rather than placing them: micro-timing and dynamics, seeded
   * so a rebuild gives the same performance.
   *
   * `true` takes the house feel; an object tunes it. Off by default — the
   * builders place notes exactly, and a piece whose whole point is machine-tight
   * (a motor, a chug) should stay that way. It matters most on a long loop,
   * where the sameness of every repeat is what the ear eventually hears.
   */
  humanize?: boolean | { jitter?: number; dynamics?: number; seed?: string };
  /** Section id where the loop body begins; everything before it is the intro. */
  loopFrom?: string;
  sections: PlanSection[];
}

/** The plan-side half of a section: what the CLI resolves before the builders run. */
interface PlanSectionContext extends SectionContext {
  section: PlanSection;
  /** Bucket the section written `melody` is pushed into — the plan `melodyOn`. */
  melodyInto: keyof Voices;
}


/**
 * Which bucket an instrument's notes go in. Only `pluck` needs saying — the
 * builder has called that bucket `rhythm` since before voices existed, because
 * from a section builder's point of view it is the rhythm part, not a plucked
 * tone. Everything else is its own name.
 */
const BUCKET_OF: Record<Exclude<InstrumentName, "drums">, keyof Voices> = {
  piano: "piano",
  epiano: "epiano",
  pad: "pad",
  bass: "bass",
  pluck: "rhythm",
  lead: "lead",
};

const program = new Command();
program
  .name("build-song")
  .description("Expand a section plan into a composition JSON")
  .requiredOption("--plan <path>", "path to the plan .json")
  .option("--out <path>", "output composition path (default compositions/<kind>/<name>.json)")
  .option(
    "--kind <kind>",
    `library folder to file it under (default: loops when the plan loops, else songs): ${COMPOSITION_KINDS.join(" | ")}`,
  )
  .parse(process.argv);

const { plan: planPath, out, kind } = program.opts<{ plan: string; out?: string; kind?: string }>();
if (kind !== undefined && !isCompositionKind(kind)) {
  console.error(`Unknown --kind "${kind}". Pick one of: ${COMPOSITION_KINDS.join(", ")}.`);
  process.exit(2);
}
const plan = readPlan(resolve(process.cwd(), planPath));
const composition = buildComposition(plan);

const issues = validateComposition(composition);
if (issues.length > 0) {
  console.error(`INVALID — generated composition has ${issues.length} issue(s):`);
  for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
  process.exit(1);
}

// A plan that declares `loopFrom` is scene music; one that doesn't is a piece
// that plays through. Either way the folder it lands in *is* its kind.
const targetKind = kind ?? (composition.loop ? "loops" : "songs");
const outPath = resolve(process.cwd(), out ?? `compositions/${targetKind}/${plan.name}.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(composition, null, 2)}\n`, "utf8");

const noteCount = composition.tracks.reduce((n, t) => n + t.notes.length, 0);
const bars = plan.sections.reduce((n, s) => n + s.chords.length, 0);
console.log(
  `Wrote ${basename(outPath)} — ${bars} bars, ${noteCount} notes` +
    (composition.loop
      ? `, loops ${composition.loop.startBar}–${composition.loop.endBar}`
      : ", one-shot"),
);

reportDefaults(plan, meterOf(plan));
reportClashes(plan, composition, meterOf(plan));

/**
 * Whether the voice a track would get runs through the guitar amp — read off
 * the voice file, since the plan only names a slug. No slug means the
 * instrument's default, as at render time.
 */
function voiceIsAmped(instrument: string, slug: string | undefined): boolean {
  const dir = resolve(process.cwd(), "voices", instrument);
  if (!existsSync(dir)) return false;
  const presets = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as { slug?: string; default?: boolean; amp?: unknown });
  const preset = slug ? presets.find((p) => p.slug === slug) : presets.find((p) => p.default);
  return preset?.amp !== undefined;
}

/**
 * Print the held notes that will sound sour — see `src/engine/clash.ts`.
 *
 * Like the defaults report, a nudge and never an error: a rub can be the point.
 * But a clash nobody chose is the commonest reason a finished render sounds
 * "slightly out of tune", and it is cheaper to read here than to hear after a
 * ten-minute render.
 */
function reportClashes(plan: Plan, built: Composition, meter: Meter): void {
  const spans: LabelledSpan[] = [];
  let bar = 0;
  for (const section of plan.sections) {
    spans.push(...chordSpans(section.chords, bar, meter, section.id));
    bar += section.chords.length;
  }
  const melodyOn = plan.melodyOn ?? "piano";
  const lines = built.tracks
    .filter((t) => t.instrument === melodyOn || t.instrument === "lead")
    .map((t) => t.notes);
  const clashes = findClashes(spans, lines, { meter });
  if (clashes.length === 0) {
    console.log("Clashes: none — no held tune note rubs the chord, and the lead lines never sit a second apart.");
    return;
  }
  const shown = 16;
  // A rub is a minor second against the root or fifth the rhythm section is
  // *sounding*. Through a drive that is a grind; over a clean strum it is far
  // more often a chosen colour — a major seventh, a sharp eleven — so the same
  // list is worded as something to check rather than something to fix.
  const driven = (["pluck", "bass"] as const).some((i) => voiceIsAmped(i, plan.voices?.[i]));
  console.log(
    driven
      ? `
Clashes: ${clashes.length} held note(s) will sound sour over the distorted rhythm section (docs/clashes.md):`
      : `
Clashes: ${clashes.length} held note(s) rub the chord. The rhythm section is clean, so many will be colour` +
          ` (a maj7, a #11) — fix only the ones you didn't mean (docs/clashes.md):`,
  );
  for (const c of clashes.slice(0, shown)) console.log(`  ${formatClash(c, meter)}`);
  if (clashes.length > shown) console.log(`  … ${clashes.length - shown} more`);
}

/**
 * Name the choices this plan didn't make.
 *
 * Every knob here has a default that is *fine*, which is the problem: three of
 * this repo's loops became the same song by taking all of them. A doc can't fire
 * at the moment the choice is skipped; this can. It is a nudge, never an error —
 * a piece is allowed to want the house sound, it just has to mean it.
 */
function reportDefaults(plan: Plan, meter: Meter): void {
  const untouched: string[] = [];

  // Resolved, not stated: a plan that names `gallop` in all four sections has
  // turned the knob and still written one rhythm, which is the thing the knob
  // exists to prevent. Inline figures compare by shape for the same reason.
  const figures = new Set(plan.sections.map((s) => JSON.stringify(figureOf(s, meter))));
  if (figures.size === 1) {
    untouched.push(
      `figure — every section plays ${[...figures][0]!.replaceAll('"', "")}, so the piece has one` +
        " rhythm in it. `npm run figures`",
    );
  }

  if (!plan.register) {
    untouched.push("register — G1–D2, 8 semitones, so this key sounds where every other key did");
  }
  // Contour. Density and volume can rise without the music going anywhere; a
  // section that doesn't move band arrives at the pitches the last one left.
  if (!plan.sections.some((s) => s.register)) {
    untouched.push(
      "register per section — one band throughout, so no section sits above another." +
        ' A chorus lifts by moving: `"register": ["C2", "C3"]`',
    );
  }
  if (!plan.gains) untouched.push("gains — the builder's house mix");
  if (!plan.humanize) {
    untouched.push(
      "humanize — every note lands exactly on its grid position, which is what a long loop eventually sounds like",
    );
  }
  if (!plan.voices?.drums) untouched.push("voices.drums — the default kit");
  // Only worth saying when there is a tune to double: a piece with no written
  // melody has nothing for a second guitar to be in an interval with.
  if (!plan.twinLead && plan.sections.some((s) => s.melody?.length)) {
    untouched.push(
      "twinLead — one lead line, so the top of the arrangement is a single voice." +
        ' Two players: `"twinLead": { "interval": "third" }`',
    );
  }
  if (!plan.melodyOn && plan.sections.some((s) => s.melody?.length)) {
    untouched.push(
      'melodyOn — the tune is on the piano. `npm run voice:find -- --query "<the scene>"`',
    );
  }
  // Phrase length is what the ear counts. Eight bars everywhere is predicted two
  // bars ahead; sections that are merely all the *same* length are the same
  // problem one step weaker, so they get their own weaker line.
  const lengths = plan.sections.map((s) => s.chords.length);
  if (lengths.every((n) => n === 8)) {
    untouched.push("phrase length — every section is 8 bars, which the ear predicts two bars ahead");
  } else if (new Set(lengths).size === 1) {
    untouched.push(
      `phrase length — every section is ${lengths[0]} bars. One phrase of a different length is` +
        " what makes the others land (state three, break the fourth)",
    );
  } else if (lengths.every((n) => n % 4 === 0)) {
    untouched.push("phrase length — every section is a multiple of 4 bars");
  }
  if (!plan.sections.some((s) => s.chords.some((c) => Array.isArray(c)))) {
    untouched.push('chord placement — every change lands on a barline (split a bar: ["Bb", "C"])');
  }

  if (untouched.length === 0) return;
  console.warn(
    `\n${untouched.length} knob(s) left at the default — see docs/variety.md and docs/hooks.md:`,
  );
  for (const line of untouched) console.warn(`  · ${line}`);
  console.warn("Defaults are why the loops sound alike. Fine if deliberate.\n");
}

function readPlan(path: string): Plan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`Could not read/parse ${path}: ${(err as Error).message}`);
    process.exit(2);
  }
  const p = parsed as Plan;
  if (!Array.isArray(p.sections) || p.sections.length === 0) {
    console.error(`${path}: plan needs a non-empty "sections" array`);
    process.exit(2);
  }
  return p;
}

function buildComposition(plan: Plan): Composition {
  const meter = meterOf(plan);
  const loopStartBar = findLoopStart(plan);
  const planBand = bandOf(plan.register ?? DEFAULT_REGISTER, "register");
  const bassRoots = foldRoots(
    plan.sections.map((section) => ({
      chords: section.chords,
      band: section.register
        ? bandOf(section.register, `section "${section.id}": register`)
        : planBand,
    })),
  );
  // The last bar approaches the *loop start*, not the intro — that is the bar
  // that actually follows it on every lap but the first. A bar that changed
  // chord half way through is approached out of its *second* chord.
  const approaches = approachNotes(
    bassRoots.map(firstOf),
    loopStartBar,
    bassRoots.map(lastOf),
  );

  const voices = emptyVoices();
  const melodyInto = melodyBucketOf(plan);
  // The second guitar. Kept beside the buckets rather than in them: `Voices` is
  // the section builders' contract, and a harmony line is a plan-level decision
  // no builder knows about.
  const harmonyNotes: Note[] = [];
  const spans: { section: PlanSection; start: number; end: number }[] = [];

  let bar = 0;
  for (const section of plan.sections) {
    const span = { start: bar, end: bar + section.chords.length };
    spans.push({ section, ...span });
    checkBends(section);
    const ctx: PlanSectionContext = {
      section,
      style: styleOf(section),
      startBar: span.start,
      meter,
      figure: figureOf(section, meter),
      bassRoots: bassRoots.slice(span.start, span.end),
      guitarRoots: bassRoots.slice(span.start, span.end).map(octaveUp),
      barRoots: bassRoots.slice(span.start, span.end).map(firstOf),
      approaches: approaches.slice(span.start, span.end),
      melodyInto,
    };
    buildSection(ctx, voices);
    // The written lines are the plan's, not the builder's — a style says how the
    // engine plays, and the tune over it is the author's either way.
    const melody = offsetNotes(section.melody ?? [], span.start);
    voices[melodyInto].push(...melody);
    voices.lead.push(...offsetNotes(section.lead ?? [], span.start));
    harmonyNotes.push(...sectionHarmony(plan, section, melody, span.start));
    voices.drums.push(...sectionDrums(plan, ctx));
    bar = span.end;
  }

  // Gain staging. The lead is one note at a time competing with a rhythm guitar
  // that is doubled at the fifth *and* reinforced by the bass an octave down, so
  // matching their gains buries it — it has to sit above the rhythm part, not
  // level with it. It also plays the `lead` voice rather than `pluck`: a
  // different rig, not the same rig louder (see `src/app/audio/instruments.ts`).
  const tracks: Track[] = (
    [
      { instrument: "drums", gain: 0.85, notes: voices.drums },
      { instrument: "pad", gain: 0.35, notes: voices.pad },
      { instrument: "bass", gain: 0.95, notes: voices.bass },
      { instrument: "pluck", gain: 0.62, notes: voices.rhythm },
      { instrument: "lead", gain: 0.85, notes: voices.lead },
      { instrument: "piano", gain: 0.8, notes: voices.piano },
      { instrument: "epiano", gain: 0.8, notes: voices.epiano },
    ] as Track[]
  )
    .filter((t) => t.notes.length > 0)
    .flatMap((t) => {
      const base = { ...voiceFor(plan, t.instrument), gain: gainFor(plan, t.instrument, t.gain ?? 1) };
      const double = doubleOf(plan, t.instrument);
      // A section that names its own sound gets its own track — see `section-sound.ts`.
      const parts: Track[] = splitBySound(t.notes, sectionSounds(spans, t.instrument), base).map((part) => ({
        instrument: t.instrument,
        gain: part.gain,
        // Key order kept as it was before sections could re-voice, so a rebuild
        // of an older plan is byte-identical.
        notes: performed(plan, t.instrument, part.notes, meter),
        ...(part.voice === undefined ? {} : { voice: part.voice }),
        ...(t.instrument === "lead" && plan.twinLead
          ? { pan: plan.twinLead.leadPan ?? 0.35 }
          : {}),
        ...(double ? { pan: double.pairPan ?? 0.6 } : {}),
      }));
      if (!double) return parts;
      const key = `${t.instrument as DoubledPart}2` as const;
      const doubled: Track[] = splitBySound(t.notes, sectionSounds(spans, key), {
        voice: double.voice ?? base.voice,
        gain: double.gain ?? base.gain,
      }).map((part) => ({
        instrument: t.instrument,
        gain: part.gain,
        pan: double.pan ?? -0.6,
        ...(part.voice === undefined ? {} : { voice: part.voice }),
        // Its own seed: two takes, not one take copied.
        notes: performed(plan, t.instrument, part.notes, meter, key),
      }));
      return [...parts, ...doubled];
    });

  // Filed directly after the lead, because that is what it is: the same section
  // of the band, one desk over.
  if (harmonyNotes.length > 0) {
    const twinTracks: Track[] = splitBySound(harmonyNotes, sectionSounds(spans, "twin"), {
      ...harmonyVoiceOf(plan),
      gain: plan.twinLead?.gain ?? 0.72,
    }).map((part) => ({
      instrument: "lead",
      gain: part.gain,
      pan: plan.twinLead?.pan ?? -0.35,
      ...(part.voice === undefined ? {} : { voice: part.voice }),
      notes: performed(plan, "lead", part.notes, meter),
    }));
    const leadAt = tracks.map((t) => t.instrument).lastIndexOf("lead");
    tracks.splice(leadAt < 0 ? tracks.length : leadAt + 1, 0, ...twinTracks);
  }

  const tempo = sectionTempoChanges(
    plan.bpm,
    spans.map(({ section, start, end }) => ({ start, end, ...sectionTempoOf(section) })),
  );
  if (loopStartBar !== null && tempo.length > 0) warnTempoSeam(plan, tempo, loopStartBar, bar, meter);

  return {
    name: plan.name,
    bpm: plan.bpm,
    ...(tempo.length > 0 ? { tempo } : {}),
    key: plan.key,
    ...(plan.campaign ? { campaign: plan.campaign } : {}),
    // Written only when it isn't the default, so a 4/4 piece doesn't read as
    // though someone chose 4/4.
    ...(plan.meter ? { meter } : {}),
    ...(plan.palettes ? { palettes: plan.palettes } : {}),
    ...(plan.lofi ? { lofi: plan.lofi } : {}),
    ...(loopStartBar === null ? {} : { loop: { startBar: loopStartBar, endBar: bar } }),
    tracks,
  };
}

/**
 * One track, played rather than placed — when the plan asked for it.
 *
 * Drums and bass share a lock: the bass was written to sit with the kick, and a
 * few milliseconds of independent drift between them is a flam rather than two
 * players. Everything else moves on its own, with the house lean for its voice.
 */
function performed(
  plan: Plan,
  instrument: InstrumentName,
  notes: Note[],
  meter: Meter,
  player: string = instrument,
): Note[] {
  if (!plan.humanize) return notes;
  const tuning = plan.humanize === true ? {} : plan.humanize;
  const seed = tuning.seed ?? plan.name;
  const locked = instrument === "drums" || instrument === "bass";
  return humanize(notes, {
    seed: `${seed}|${player}`,
    lock: locked ? `${seed}|rhythm-section` : undefined,
    lean: HOUSE_LEANS[instrument] ?? 0,
    jitter: tuning.jitter,
    dynamics: tuning.dynamics,
    meter,
  });
}

/** The plan's time signature. A bad one fails here rather than as wrong bar lines. */
function meterOf(plan: Plan): Meter {
  if (!plan.meter) return COMMON_TIME;
  const issues = validateMeter(plan.meter);
  if (issues.length > 0) {
    console.error(`meter: ${JSON.stringify(plan.meter)} is not a time signature`);
    for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
    process.exit(2);
  }
  return [plan.meter[0], plan.meter[1]];
}

/**
 * A band the bass roots fold into, as MIDI numbers. Bad input fails here rather
 * than as a line in the wrong octave. `label` names whose band it is, since a
 * section may state its own.
 */
function bandOf([low, high]: [string, string], label: string): [number, number] {
  const midi = [low, high].map((pitch) => {
    const n = pitchToMidi(pitch);
    if (!Number.isFinite(n)) {
      console.error(`${label}: "${pitch}" is not a pitch (want e.g. "G1", "D2")`);
      process.exit(2);
    }
    return n;
  }) as [number, number];
  if (midi[0] > midi[1]) {
    console.error(`${label}: low "${low}" is above high "${high}"`);
    process.exit(2);
  }
  return midi;
}

/**
 * Each section's own sound for one part — `twin` for the second lead — with
 * slugs and gains checked here, so a typo fails at build time with the section
 * named rather than rendering the default an hour later.
 */
function sectionSounds(
  spans: readonly { section: PlanSection; start: number; end: number }[],
  part: SoundKey,
): SectionSound[] {
  const instrument = (part === "twin" ? "lead" : part.replace(/2$/, "")) as InstrumentName;
  return spans.flatMap(({ section, start, end }) => {
    const voice = section.voices?.[part];
    const gain = section.gains?.[part];
    if (voice === undefined && gain === undefined) return [];
    if (voice !== undefined && !existsSync(resolve(process.cwd(), `voices/${instrument}/${voice}.json`))) {
      console.error(`section "${section.id}": voices.${part}: no such voice "${instrument}/${voice}"`);
      console.error(`  find one with: npm run voice:find -- --instrument ${instrument}`);
      process.exit(2);
    }
    if (gain !== undefined && !(typeof gain === "number" && gain >= 0 && gain <= 2)) {
      console.error(`section "${section.id}": gains.${part}: must be a number in 0..2, got ${JSON.stringify(gain)}`);
      process.exit(2);
    }
    return [{ start, end, ...(voice === undefined ? {} : { voice }), ...(gain === undefined ? {} : { gain }) }];
  });
}

/** The plan's double for a part, checked; undefined when the part isn't doubled. */
function doubleOf(plan: Plan, instrument: InstrumentName): Double | undefined {
  if (!plan.doubles) return undefined;
  for (const key of Object.keys(plan.doubles)) {
    if (!DOUBLED_PARTS.includes(key as DoubledPart)) {
      console.error(`doubles.${key}: only ${DOUBLED_PARTS.join(", ")} can be doubled`);
      process.exit(2);
    }
  }
  const double = plan.doubles[instrument as DoubledPart];
  if (!double) return undefined;
  if (double.voice && !existsSync(resolve(process.cwd(), `voices/${instrument}/${double.voice}.json`))) {
    console.error(`doubles.${instrument}.voice: no such voice "${instrument}/${double.voice}"`);
    process.exit(2);
  }
  return double;
}

/** A section's tempo request, checked so a typo fails with the section named. */
function sectionTempoOf(section: PlanSection): { bpm?: number; rampTo?: number } {
  for (const field of ["bpm", "rampTo"] as const) {
    const value = section[field];
    if (value !== undefined && !(typeof value === "number" && value > 0 && Number.isFinite(value))) {
      console.error(`section "${section.id}": ${field} must be a positive number, got ${JSON.stringify(value)}`);
      process.exit(2);
    }
  }
  return {
    ...(section.bpm === undefined ? {} : { bpm: section.bpm }),
    ...(section.rampTo === undefined ? {} : { rampTo: section.rampTo }),
  };
}

/**
 * A loop that wraps at a different tempo than it starts at lurches on every lap.
 * Warned rather than refused — a deliberate snap back can be the point.
 */
function warnTempoSeam(plan: Plan, tempo: TempoChange[], startBar: number, endBar: number, meter: Meter): void {
  const map = tempoMap({ bpm: plan.bpm, tempo, meter });
  const perBar = beatsPerBar(meter);
  const opening = map.bpmAtBeat(startBar * perBar);
  const closing = map.bpmAtBeat(endBar * perBar - 1e-6);
  if (Math.abs(opening - closing) > 0.5) {
    console.warn(
      `Tempo seam: the loop starts at ${opening.toFixed(1)} bpm but wraps from ${closing.toFixed(1)} — ` +
        `give the last section "rampTo": ${opening.toFixed(0)} unless the snap is the point.`,
    );
  }
}

/** One track's gain: the plan's override, else the builder's staging default. */
function gainFor(plan: Plan, instrument: InstrumentName, fallback: number): number {
  const gain = plan.gains?.[instrument];
  if (gain === undefined) return fallback;
  if (typeof gain !== "number" || !(gain >= 0 && gain <= 2)) {
    console.error(`gains.${instrument}: must be a number in 0..2, got ${JSON.stringify(gain)}`);
    process.exit(2);
  }
  return gain;
}

/**
 * The bucket the written melody lands in. A bad instrument name fails here, at
 * build time, with the shelf printed — the same reason a bad figure name does.
 * `drums` is rejected by name rather than by type so that a plan written by hand
 * gets the explanation instead of a silent `undefined` bucket.
 */
function melodyBucketOf(plan: Plan): keyof Voices {
  const target = plan.melodyOn;
  if (target === undefined) return "piano";
  const bucket = BUCKET_OF[target];
  if (!bucket) {
    console.error(`melodyOn: "${target}" is not a pitched instrument`);
    console.error(`  pick one of: ${PITCHED_INSTRUMENTS.join(" | ")}`);
    process.exit(2);
  }
  return bucket;
}

/**
 * The `voice` field for one track, from the plan's `voices` map. The slug is
 * checked against `voices/` here so a typo fails at build time rather than
 * silently rendering the instrument's default an hour later.
 */
function voiceFor(plan: Plan, instrument: InstrumentName): { voice?: string } {
  const slug = plan.voices?.[instrument];
  if (!slug) return {};
  if (!existsSync(resolve(process.cwd(), `voices/${instrument}/${slug}.json`))) {
    console.error(`voices.${instrument}: no such voice "${instrument}/${slug}"`);
    console.error(`  find one with: npm run voice:find -- --instrument ${instrument}`);
    process.exit(2);
  }
  return { voice: slug };
}

/**
 * The second guitar for one section: written counterpoint, silence, or the
 * melody harmonised.
 *
 * Deriving it only from `melody` (never from `lead`) is deliberate — `lead` is
 * the field for a line that is already its own part, and harmonising a part
 * that was written against the tune gives you a third voice nobody asked for.
 */
function sectionHarmony(
  plan: Plan,
  section: PlanSection,
  melody: Note[],
  startBar: number,
): Note[] {
  const twin = plan.twinLead;
  if (!twin) {
    if (section.harmony !== undefined) {
      console.error(
        `section "${section.id}": "harmony" needs a plan-level "twinLead" — that is where the` +
          " second guitar's voice, level and pan live",
      );
      process.exit(2);
    }
    return [];
  }
  if (section.harmony === false) return [];
  if (Array.isArray(section.harmony)) return offsetNotes(section.harmony, startBar);
  if (melody.length === 0) return [];

  const [tonic, scale] = harmonyKeyOf(plan);
  try {
    // The section's chords go in so the twin follows the harmony, not just the
    // key — see `src/engine/harmony.ts` for the semitone rubs that prevents.
    const meter = meterOf(plan);
    // A bend belongs to a line that is alone — the twin plays the written pitch.
    return harmonize(withoutBends(melody), {
      tonic,
      scale,
      chords: chordSpans(section.chords, startBar, meter),
      beatsPerBar: beatsPerBar(meter),
      interval: harmonyIntervalOf(section.harmonyInterval ?? twin.interval ?? "third"),
      below: section.harmonyBelow ?? twin.below,
      velocity: twin.velocity ?? 0.9,
    });
  } catch (err) {
    console.error(`section "${section.id}": could not harmonise — ${(err as Error).message}`);
    process.exit(2);
  }
}

/**
 * The bends a section wrote, checked before anything is built so a bad one
 * names its section and field — see `src/engine/plan-note.ts`.
 */
function checkBends(section: PlanSection): void {
  const issues = (["melody", "lead"] as const).flatMap((field) =>
    planBendIssues(section[field] ?? [], field),
  );
  if (Array.isArray(section.harmony)) issues.push(...planBendIssues(section.harmony, "harmony"));
  if (issues.length === 0) return;
  console.error(`section "${section.id}": invalid bend`);
  for (const issue of issues) console.error(`  ${issue}`);
  process.exit(2);
}

/** A stated interval, checked here so a typo prints the shelf. */
function harmonyIntervalOf(interval: HarmonyInterval | number): HarmonyInterval | number {
  if (typeof interval === "number" || isHarmonyInterval(interval)) return interval;
  console.error(`harmony interval: unknown interval ${JSON.stringify(interval)}`);
  console.error(`  pick one of: ${HARMONY_INTERVAL_NAMES.join(", ")} — or raw scale steps`);
  process.exit(2);
}

/**
 * Tonic and mode the harmony line stays inside.
 *
 * Read off the plan's `key` ("Em", "D minor", "G", "E dorian") unless
 * `twinLead.scale` says otherwise, which is the field a modal chorus needs: a
 * tune built on the dorian raised sixth, harmonised against aeolian, has that
 * sixth flattened back out by the part that was meant to reinforce it.
 */
function harmonyKeyOf(plan: Plan): [string, string] {
  const match = /^\s*([A-G][#b]?)\s*(.*?)\s*$/.exec(plan.key ?? "");
  if (!match) {
    console.error(`key: "${plan.key}" is not a key (want e.g. "Em", "D minor", "E dorian")`);
    process.exit(2);
  }
  const [, tonic = "C", rest = ""] = match;
  const stated = plan.twinLead?.scale;
  if (stated) return [tonic, stated];
  const quality = rest.toLowerCase();
  if (quality === "" || quality === "maj" || quality === "major") return [tonic, "major"];
  if (quality === "m" || quality === "min" || quality === "minor") return [tonic, "minor"];
  return [tonic, quality];
}

/**
 * The harmony track's voice: the twin's own slug, else whatever the lead plays.
 * Two guitars on one tone is a legitimate choice (it is double-tracking), so the
 * default follows the lead rather than forcing a second decision.
 */
function harmonyVoiceOf(plan: Plan): { voice?: string } {
  const slug = plan.twinLead?.voice;
  if (!slug) return voiceFor(plan, "lead");
  if (!existsSync(resolve(process.cwd(), `voices/lead/${slug}.json`))) {
    console.error(`twinLead.voice: no such voice "lead/${slug}"`);
    console.error("  find one with: npm run voice:find -- --instrument lead");
    process.exit(2);
  }
  return { voice: slug };
}

/**
 * Which rhythmic figure a section's engine plays.
 *
 * A bad name fails here, at build time, with the shelf printed — the alternative
 * is a silently wrong rhythm discovered an hour later in a render.
 */
function figureOf(section: PlanSection, meter: Meter): FigureRef {
  const { figure } = section;
  if (figure === undefined) return defaultFigure(section, meter);
  if (typeof figure === "string") {
    if (!isFigureName(figure)) {
      console.error(`section "${section.id}": unknown figure "${figure}"`);
      console.error(`  pick one of: ${FIGURE_NAMES.join(", ")}`);
      console.error(`  or see them described with: npm run figures`);
      process.exit(2);
    }
    if (!figureFitsMeter(figure, meter)) {
      const fits = FIGURE_NAMES.filter((n) => figureFitsMeter(n, meter));
      console.error(
        `section "${section.id}": figure "${figure}" does not state a bar of ${meter[0]}/${meter[1]}`,
      );
      console.error(`  in this meter: ${fits.join(", ") || "(none — write one inline)"}`);
      process.exit(2);
    }
    return figure;
  }
  const issues = validateFigure(figure, meter);
  if (issues.length > 0) {
    console.error(`section "${section.id}": invalid inline figure`);
    for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
    process.exit(2);
  }
  return figure;
}

/**
 * The cell a section plays when it names none. The gallop is the house default,
 * and `motor` means "don't gallop" — straight subdivision, root pedalling. In a
 * meter neither states a bar of, the first shelf cell that fits stands in, which
 * is a worse choice than naming one and says so.
 */
function defaultFigure(section: PlanSection, meter: Meter): FigureRef {
  const wanted: FigureName =
    section.style !== "motor"
      ? "gallop"
      : section.subdivision === 4
        ? "sixteenth-chug"
        : "straight-eighths";
  if (figureFitsMeter(wanted, meter)) return wanted;

  const fallback = FIGURE_NAMES.find((n) => figureFitsMeter(n, meter));
  if (!fallback) {
    console.error(
      `section "${section.id}": no shelf figure states a bar of ${meter[0]}/${meter[1]} — write one inline`,
    );
    process.exit(2);
  }
  return fallback;
}

/**
 * The kit for one section. A section inherits the plan's groove, overrides it
 * with its own, or drops out entirely with `drums: false`.
 *
 * Lane cycling is per section, not per song: the pattern restarts at each
 * section's first bar so a two-bar groove never lands on its second bar at the
 * top of a chorus. Sections are the phrase boundaries a listener hears, so they
 * are where the pattern should reset.
 */
function sectionDrums(plan: Plan, ctx: PlanSectionContext): Note[] {
  const groove = ctx.section.groove ?? plan.groove;
  if (!groove || ctx.section.drums === false) return [];

  const issues = validateGroove(groove, ctx.meter);
  if (issues.length > 0) {
    console.error(`section "${ctx.section.id}": invalid groove`);
    for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
    process.exit(2);
  }
  return grooveNotes(groove, {
    startBar: ctx.startBar,
    bars: ctx.section.chords.length,
    intensity: ctx.section.intensity ?? 1,
    meter: ctx.meter,
  });
}

/** The section's style, checked here so a typo fails with the shelf printed. */
function styleOf(section: PlanSection): Style {
  if (isStyle(section.style)) return section.style;
  console.error(`section "${section.id}": unknown style "${section.style}"`);
  console.error(`  pick one of: ${STYLES.join(", ")}`);
  process.exit(2);
}

/** Bar index where the named section starts, or null when the plan doesn't loop. */
function findLoopStart(plan: Plan): number | null {
  if (!plan.loopFrom) return null;
  let bar = 0;
  for (const section of plan.sections) {
    if (section.id === plan.loopFrom) return bar;
    bar += section.chords.length;
  }
  console.error(`loopFrom "${plan.loopFrom}" matches no section id`);
  process.exit(2);
}
