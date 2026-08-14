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
  figureLine,
  isFigureName,
  powerChordFigure,
  validateFigure,
  type FigureRef,
} from "../src/engine/figure";
import { approachNotes } from "../src/engine/parts";
import { grooveNotes, validateGroove, type Groove } from "../src/engine/groove";
import { chordPitches, fitToBand, pitchToMidi, transpose } from "../src/engine/theory";

const BEATS_PER_BAR = 4;
/**
 * Bass roots are fitted into one tight octave so the riff never jumps register.
 * G1–D2 is where the western/metal loops sit; a plan overrides it with `register`,
 * and that override is what makes the *key* audible — inside eight semitones
 * every root folds to the same place and C minor sounds exactly where D minor did.
 */
const DEFAULT_REGISTER: [string, string] = ["G1", "D2"];

type Style =
  | "standoff"
  | "riff"
  | "motor"
  | "kit"
  | "breakdown"
  | "rebuild"
  | "climb"
  | "turnaround";

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
  /** Whistle/bell voice (piano), times relative to the section start. */
  melody?: PlanNote[];
  /** Guitar lead voice, times relative to the section start. */
  lead?: PlanNote[];
}

interface Plan {
  name: string;
  bpm: number;
  key: string;
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
  /** Section id where the loop body begins; everything before it is the intro. */
  loopFrom?: string;
  sections: PlanSection[];
}

/** Everything a style builder needs about its slice of the timeline. */
interface SectionContext {
  section: PlanSection;
  startBar: number;
  /** The figure this section's engine plays, already resolved and checked. */
  figure: FigureRef;
  /**
   * Bass root per bar, fitted to the plan's register. An array entry is a bar
   * split evenly between those roots — the engine follows it hit by hit.
   */
  bassRoots: (string | string[])[];
  /** Same roots an octave up, for the guitar. */
  guitarRoots: (string | string[])[];
  /**
   * One root per bar, for the layers that state a bar at a time — the pad's
   * bell, a breakdown drone, a turnaround stab. A split bar gives its first.
   */
  barRoots: string[];
  /** Chromatic step into the *next* bar's root, per bar. */
  approaches: (string | null)[];
}

/** The roots of one bar: a split bar's list, or the single root that holds it. */
function slicesOf(entry: string | string[]): string[] {
  return Array.isArray(entry) ? entry : [entry];
}

/** How long one chord of a split bar is held. Thirds of a bar have no note value. */
const HELD_DURATION: Record<number, string> = { 1: "1m", 2: "2n", 4: "4n" };
const SIXTEENTHS_PER_BAR = 16;

/**
 * Where each chord of a bar starts and how long it is held — what the *sustained*
 * layers (pad, breakdown drone) need, as against the figure, which places its own
 * hits and only asks which root each one lands on.
 */
function barSlices(entry: string | string[], bar: number): Note[] {
  const pitches = slicesOf(entry);
  const span = SIXTEENTHS_PER_BAR / pitches.length;
  return pitches.map((pitch, i) => {
    const at = i * span;
    const sixteenth = Math.round((at % 4) * 1e4) / 1e4;
    return {
      time: `${bar}:${Math.floor(at / 4)}:${sixteenth}`,
      pitch,
      duration: HELD_DURATION[pitches.length] ?? "4n",
    };
  });
}

/** A bar's roots an octave up, split bar or not. */
function octaveUp(entry: string | string[]): string | string[] {
  return Array.isArray(entry) ? entry.map((p) => transpose(p, 12)) : transpose(entry, 12);
}

/** First and last chord sounding in a bar — what the neighbours' parts key off. */
function firstOf(entry: string | string[]): string {
  return slicesOf(entry)[0]!;
}
function lastOf(entry: string | string[]): string {
  return slicesOf(entry).at(-1)!;
}

/** The voices every section writes into. */
interface Voices {
  pad: Note[];
  bass: Note[];
  rhythm: Note[];
  lead: Note[];
  piano: Note[];
  drums: Note[];
}

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
  if (!plan.voices?.drums) untouched.push("voices.drums — the default kit");
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

  const voices: Voices = { pad: [], bass: [], rhythm: [], lead: [], piano: [], drums: [] };

  let bar = 0;
  for (const section of plan.sections) {
    const span = { start: bar, end: bar + section.chords.length };
    const ctx: SectionContext = {
      section,
      startBar: span.start,
      figure: figureOf(section),
      bassRoots: bassRoots.slice(span.start, span.end),
      guitarRoots: bassRoots.slice(span.start, span.end).map(octaveUp),
      barRoots: bassRoots.slice(span.start, span.end).map(firstOf),
      approaches: approaches.slice(span.start, span.end),
    };
    buildSection(ctx, voices);
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
    ] as Track[]
  )
    .filter((t) => t.notes.length > 0)
    .map((t) => ({
      ...t,
      gain: gainFor(plan, t.instrument, t.gain ?? 1),
      ...voiceFor(plan, t.instrument),
    }));

  return {
    name: plan.name,
    bpm: plan.bpm,
    key: plan.key,
    ...(plan.palettes ? { palettes: plan.palettes } : {}),
    ...(plan.lofi ? { lofi: plan.lofi } : {}),
    ...(loopStartBar === null ? {} : { loop: { startBar: loopStartBar, endBar: bar } }),
    tracks,
  };
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
function figureOf(section: PlanSection): FigureRef {
  const { figure } = section;
  if (figure === undefined) {
    // `motor` means "don't gallop": straight subdivision, root pedalling.
    if (section.style !== "motor") return "gallop";
    return section.subdivision === 4 ? "sixteenth-chug" : "straight-eighths";
  }
  if (typeof figure === "string") {
    if (isFigureName(figure)) return figure;
    console.error(`section "${section.id}": unknown figure "${figure}"`);
    console.error(`  pick one of: ${FIGURE_NAMES.join(", ")}`);
    console.error(`  or see them described with: npm run figures`);
    process.exit(2);
  }
  const issues = validateFigure(figure);
  if (issues.length > 0) {
    console.error(`section "${section.id}": invalid inline figure`);
    for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
    process.exit(2);
  }
  return figure;
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
function sectionDrums(plan: Plan, ctx: SectionContext): Note[] {
  const groove = ctx.section.groove ?? plan.groove;
  if (!groove || ctx.section.drums === false) return [];

  const issues = validateGroove(groove);
  if (issues.length > 0) {
    console.error(`section "${ctx.section.id}": invalid groove`);
    for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
    process.exit(2);
  }
  return grooveNotes(groove, {
    startBar: ctx.startBar,
    bars: ctx.section.chords.length,
    intensity: ctx.section.intensity ?? 1,
  });
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

function buildSection(ctx: SectionContext, voices: Voices): void {
  const builders: Record<Style, (ctx: SectionContext, voices: Voices) => void> = {
    standoff: buildStandoff,
    riff: buildRiff,
    motor: buildMotor,
    kit: buildKit,
    turnaround: buildTurnaround,
    breakdown: buildBreakdown,
    rebuild: buildRebuild,
    climb: buildClimb,
  };
  const build = builders[ctx.section.style];
  if (!build) {
    console.error(`section "${ctx.section.id}": unknown style "${ctx.section.style}"`);
    process.exit(2);
  }
  build(ctx, voices);
  voices.piano.push(...offsetNotes(ctx.section.melody ?? [], ctx.startBar));
  voices.lead.push(...offsetNotes(ctx.section.lead ?? [], ctx.startBar));
}

/** Western intro: choir, tolling bell, no engine — then a two-beat pickup into the riff. */
function buildStandoff(ctx: SectionContext, voices: Voices): void {
  voices.pad.push(...padFor(ctx, 0.3));
  voices.piano.push(...bellFor(ctx, 0.5));

  // Last two beats of the final bar: the gallop fires up and launches the riff.
  const lastBar = ctx.startBar + ctx.bassRoots.length - 1;
  const root = ctx.bassRoots.at(-1)!;
  const approach = ctx.approaches.at(-1) ?? null;
  const pickup = (notes: Note[]) => notes.filter((n) => beatOf(n) >= 2);
  voices.bass.push(
    ...pickup(figureLine(ctx.figure, { startBar: lastBar, roots: [root], approaches: [approach] })),
  );
  voices.rhythm.push(
    ...pickup(
      powerChordFigure(ctx.figure, {
        startBar: lastBar,
        roots: [octaveUp(root)],
        approaches: [approach ? transpose(approach, 12) : null],
      }),
    ),
  );
}

/**
 * The engine at full force: the section's figure in the bass, doubled by power
 * chords an octave up, pad underneath. The *figure* is what makes one of these
 * sections sound unlike another — see `figureOf`.
 */
function buildRiff(ctx: SectionContext, voices: Voices): void {
  buildEngine(ctx, voices, { pad: 0.4, bassGhost: 0.8, rhythmGhost: 0.78 });
}

/**
 * The desert-rock engine: straight eighths (or a sixteenth chug) pedalling the
 * root, guitar in unison an octave up. `riff` gallops and therefore *moves*; this
 * one refuses to, which is the whole style — the weight comes from repetition.
 * The pad sits lower than under `riff` because fuzz and sustained voices fight.
 *
 * The two styles now differ only in dynamics: the figure is the section's to
 * choose, so `motor` is "quieter pad, ghosts a hair up" and the default straight
 * subdivision, not a separate rhythm engine.
 */
function buildMotor(ctx: SectionContext, voices: Voices): void {
  buildEngine(ctx, voices, { pad: 0.26, bassGhost: 0.82, rhythmGhost: 0.8 });
}

/** Bass + doubled power chords + pad, on whatever figure the section picked. */
function buildEngine(
  ctx: SectionContext,
  voices: Voices,
  dyn: { pad: number; bassGhost: number; rhythmGhost: number },
): void {
  voices.pad.push(...padFor(ctx, dyn.pad));
  voices.bass.push(
    ...figureLine(ctx.figure, {
      startBar: ctx.startBar,
      roots: ctx.bassRoots,
      approaches: ctx.approaches,
      ghost: dyn.bassGhost,
    }),
  );
  voices.rhythm.push(
    ...powerChordFigure(ctx.figure, {
      startBar: ctx.startBar,
      roots: ctx.guitarRoots,
      approaches: ctx.approaches.map((a) => (a ? transpose(a, 12) : null)),
      accent: 0.92,
      ghost: dyn.rhythmGhost,
    }),
  );
}

/**
 * Drums alone — the kit intro, the break where the band stops and the drummer
 * doesn't. Writes no pitched voice at all; the section's groove is the section.
 */
function buildKit(_ctx: SectionContext, _voices: Voices): void {}

/** The riff, plus a low piano stab per bar to mark the last section before the wrap. */
function buildTurnaround(ctx: SectionContext, voices: Voices): void {
  buildRiff(ctx, voices);
  ctx.barRoots.forEach((root, i) => {
    voices.piano.push({
      time: `${ctx.startBar + i}:0:0`,
      pitch: transpose(root, 12),
      duration: "4n",
      velocity: 0.55,
    });
  });
}

/** Everything drops out: bell, choir, whistle, space. The contrast that saves the loop. */
function buildBreakdown(ctx: SectionContext, voices: Voices): void {
  voices.pad.push(...padFor(ctx, 0.42));
  voices.piano.push(...bellFor(ctx, 0.55));
  ctx.bassRoots.forEach((entry, i) => {
    for (const note of barSlices(entry, ctx.startBar + i)) {
      voices.bass.push({ ...note, velocity: 0.6 });
    }
  });
}

/** Bass creeps back on eighths, guitar on downbeats, full gallop for the last two bars. */
function buildRebuild(ctx: SectionContext, voices: Voices): void {
  voices.pad.push(...padFor(ctx, 0.4));
  const gallopFrom = ctx.bassRoots.length - 2;

  ctx.bassRoots.forEach((entry, i) => {
    const bar = ctx.startBar + i;
    if (i >= gallopFrom) {
      voices.bass.push(
        ...figureLine(ctx.figure, {
          startBar: bar,
          roots: [entry],
          approaches: [ctx.approaches[i] ?? null],
        }),
      );
      voices.rhythm.push(
        ...powerChordFigure(ctx.figure, {
          startBar: bar,
          roots: [ctx.guitarRoots[i]!],
          approaches: [ctx.approaches[i] ? transpose(ctx.approaches[i]!, 12) : null],
        }),
      );
      return;
    }
    // eighths on the root: motion without the full weight of the gallop yet
    voices.bass.push(
      ...tremoloLine({
        startBar: bar,
        pitches: Array<string>(BEATS_PER_BAR).fill(firstOf(entry)),
        subdivision: 2,
        velocity: 0.7 + i * 0.03,
      }),
    );
    if (i >= 2) {
      const guitarRoot = firstOf(ctx.guitarRoots[i]!);
      voices.rhythm.push(
        { time: `${bar}:0:0`, pitch: guitarRoot, duration: "1m", velocity: 0.6 },
        { time: `${bar}:0:0`, pitch: transpose(guitarRoot, 7), duration: "1m", velocity: 0.55 },
      );
    }
  });
}

/** Tremolo on each chord's fifth, jumping an octave halfway up — the pre-climax lift. */
function buildClimb(ctx: SectionContext, voices: Voices): void {
  buildRiff(ctx, voices);
  const half = Math.ceil(ctx.bassRoots.length / 2);
  const pitches = ctx.bassRoots.flatMap((entry, i) => {
    const fifth = fitToBand(transpose(firstOf(entry), 7), i < half ? [60, 71] : [72, 83]);
    return Array<string>(BEATS_PER_BAR).fill(fifth);
  });
  voices.lead.push(...tremoloLine({ startBar: ctx.startBar, pitches, subdivision: 4, velocity: 0.88 }));
}

/**
 * Held root + fifth — the choir/organ bed under everything. It follows a split
 * bar's chords rather than holding the first one over both, which is the whole
 * point of splitting the bar.
 */
function padFor(ctx: SectionContext, velocity: number): Note[] {
  return ctx.bassRoots.flatMap((entry, i) =>
    barSlices(entry, ctx.startBar + i).flatMap(({ time, pitch, duration }) => {
      const up = transpose(pitch, 12);
      return [
        { time, pitch: up, duration, velocity },
        { time, pitch: transpose(up, 7), duration, velocity: Math.max(0.05, velocity - 0.05) },
      ];
    }),
  );
}

/** A single low toll every other bar — the western bell. */
function bellFor(ctx: SectionContext, velocity: number): Note[] {
  return sustainLine({
    startBar: ctx.startBar,
    pitches: ctx.barRoots.map((root, i) => (i % 2 === 0 ? root : null)),
    velocity,
  });
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

