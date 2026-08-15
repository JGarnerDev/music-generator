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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { sustainLine, tremoloLine } from "../src/engine/riff";
import {
  FIGURE_NAMES,
  figureFitsMeter,
  figureLine,
  isFigureName,
  powerChordFigure,
  validateFigure,
  type FigureName,
  type FigureRef,
} from "../src/engine/figure";
import { approachNotes } from "../src/engine/parts";
import { grooveNotes, validateGroove, type Groove } from "../src/engine/groove";
import { chordPitches, fitToBand, pitchToMidi, transpose } from "../src/engine/theory";
import { COMMON_TIME, validateMeter, type Meter } from "../src/utils/timing";
import { HOUSE_LEANS, humanize } from "../src/engine/humanize";
import {
  STYLES,
  buildSection,
  emptyVoices,
  firstOf,
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

/** ["bar:beat:sixteenth", pitch, duration, velocity] — compact enough to read in bulk. */
type PlanNote = [string, string, string, number];

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
}

interface Plan {
  name: string;
  bpm: number;
  key: string;
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

reportDefaults(plan);

/**
 * Name the choices this plan didn't make.
 *
 * Every knob here has a default that is *fine*, which is the problem: three of
 * this repo's loops became the same song by taking all of them. A doc can't fire
 * at the moment the choice is skipped; this can. It is a nudge, never an error —
 * a piece is allowed to want the house sound, it just has to mean it.
 */
function reportDefaults(plan: Plan): void {
  const untouched: string[] = [];
  if (!plan.sections.some((s) => s.figure !== undefined || s.subdivision !== undefined)) {
    untouched.push('figure — every engine section plays the default cell. `npm run figures`');
  }
  if (!plan.register) {
    untouched.push("register — G1–D2, 8 semitones, so this key sounds where every other key did");
  }
  if (!plan.gains) untouched.push("gains — the builder's house mix");
  if (!plan.humanize) {
    untouched.push(
      "humanize — every note lands exactly on its grid position, which is what a long loop eventually sounds like",
    );
  }
  if (!plan.voices?.drums) untouched.push("voices.drums — the default kit");
  if (!plan.melodyOn && plan.sections.some((s) => s.melody?.length)) {
    untouched.push(
      'melodyOn — the tune is on the piano. `npm run voice:find -- --query "<the scene>"`',
    );
  }
  if (plan.sections.every((s) => s.chords.length % 4 === 0)) {
    untouched.push("phrase length — every section is a multiple of 4 bars");
  }
  if (!plan.sections.some((s) => s.chords.some((c) => Array.isArray(c)))) {
    untouched.push('chord placement — every change lands on a barline (split a bar: ["Bb", "C"])');
  }

  if (untouched.length === 0) return;
  console.warn(`\n${untouched.length} knob(s) left at the default — see docs/looping.md:`);
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
  const bars = plan.sections.flatMap((s) => s.chords);
  const loopStartBar = findLoopStart(plan);
  const register = registerOf(plan);
  const fit = (chord: string) => fitToBand(rootOf(chord), register);
  const bassRoots: (string | string[])[] = bars.map((entry) =>
    Array.isArray(entry) ? entry.map(fit) : fit(entry),
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

  let bar = 0;
  for (const section of plan.sections) {
    const span = { start: bar, end: bar + section.chords.length };
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
    voices[melodyInto].push(...offsetNotes(section.melody ?? [], span.start));
    voices.lead.push(...offsetNotes(section.lead ?? [], span.start));
    voices.drums.push(...sectionDrums(plan, ctx));
    bar = span.end;
  }

  // Gain staging. The lead is one note at a time competing with a rhythm guitar
  // that is doubled at the fifth *and* reinforced by the bass an octave down, so
  // matching their gains buries it — it has to sit above the rhythm part, not
  // level with it. It also plays the `lead` voice rather than `pluck`: a
  // different rig, not the same rig louder (see `src/app/instruments.ts`).
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
    .map((t) => ({
      ...t,
      gain: gainFor(plan, t.instrument, t.gain ?? 1),
      ...voiceFor(plan, t.instrument),
      notes: performed(plan, t.instrument, t.notes, meter),
    }));

  return {
    name: plan.name,
    bpm: plan.bpm,
    key: plan.key,
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
): Note[] {
  if (!plan.humanize) return notes;
  const tuning = plan.humanize === true ? {} : plan.humanize;
  const seed = tuning.seed ?? plan.name;
  const locked = instrument === "drums" || instrument === "bass";
  return humanize(notes, {
    seed: `${seed}|${instrument}`,
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

/** The band the bass roots fold into, as MIDI numbers. Bad input fails here. */
function registerOf(plan: Plan): [number, number] {
  const [low, high] = plan.register ?? DEFAULT_REGISTER;
  const midi = [low, high].map((pitch) => {
    const n = pitchToMidi(pitch);
    if (!Number.isFinite(n)) {
      console.error(`register: "${pitch}" is not a pitch (want e.g. "G1", "D2")`);
      process.exit(2);
    }
    return n;
  }) as [number, number];
  if (midi[0] > midi[1]) {
    console.error(`register: low "${low}" is above high "${high}"`);
    process.exit(2);
  }
  return midi;
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

/** Move plan notes (written relative to their section) onto the real timeline. */
function offsetNotes(notes: PlanNote[], startBar: number): Note[] {
  return notes.map(([time, pitch, duration, velocity]) => {
    const [bar = "0", beat = "0", sixteenth = "0"] = time.split(":");
    return { time: `${Number(bar) + startBar}:${beat}:${sixteenth}`, pitch, duration, velocity };
  });
}

function beatOf(note: Note): number {
  return Number(note.time.split(":")[1] ?? 0);
}

/** Root pitch of a chord symbol, with an octave attached so it can be transposed. */
function rootOf(chordSymbol: string): string {
  return chordPitches(chordSymbol, 2)[0]!;
}

