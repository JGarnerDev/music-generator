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
import {
  gallopLine,
  motorLine,
  powerChordGallop,
  powerChordMotor,
  sustainLine,
  tremoloLine,
} from "../src/engine/riff";
import { approachNotes } from "../src/engine/parts";
import { grooveNotes, validateGroove, type Groove } from "../src/engine/groove";
import { chordPitches, fitToBand, transpose } from "../src/engine/theory";

const BEATS_PER_BAR = 4;
/** Bass roots are fitted into one tight octave so the riff never jumps register. */
const BASS_BAND: [number, number] = [31, 38]; // G1..D2

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
  chords: string[];
  /** Override the plan's beat for this section (a half-time chorus, a new kit). */
  groove?: Groove;
  /** `false` drops the kit for this section — a breakdown is defined by its silence. */
  drums?: boolean;
  /** Scales the kit's dynamics here: 0.6 for a verse, 1 for the chorus. */
  intensity?: number;
  /** `motor` only — hits per beat: 2 = straight eighths, 4 = a sixteenth chug. */
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
  /** Bass root per bar, already fitted to `BASS_BAND`. */
  bassRoots: string[];
  /** Same roots an octave up, for the guitar. */
  guitarRoots: string[];
  /** Chromatic step into the *next* bar's root, per bar. */
  approaches: (string | null)[];
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
  const bassRoots = bars.map((chord) => fitToBand(rootOf(chord), BASS_BAND));
  // The last bar approaches the *loop start*, not the intro — that is the bar
  // that actually follows it on every lap but the first.
  const approaches = approachNotes(bassRoots, loopStartBar);

  const voices: Voices = { pad: [], bass: [], rhythm: [], lead: [], piano: [], drums: [] };

  let bar = 0;
  for (const section of plan.sections) {
    const span = { start: bar, end: bar + section.chords.length };
    const ctx: SectionContext = {
      section,
      startBar: span.start,
      bassRoots: bassRoots.slice(span.start, span.end),
      guitarRoots: bassRoots.slice(span.start, span.end).map((r) => transpose(r, 12)),
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
    .map((t) => ({ ...t, ...voiceFor(plan, t.instrument) }));

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
  voices.bass.push(...pickup(gallopLine({ startBar: lastBar, roots: [root], approaches: [approach] })));
  voices.rhythm.push(
    ...pickup(
      powerChordGallop({
        startBar: lastBar,
        roots: [transpose(root, 12)],
        approaches: [approach ? transpose(approach, 12) : null],
      }),
    ),
  );
}

/** The engine at full force: gallop bass doubled by power chords, pad underneath. */
function buildRiff(ctx: SectionContext, voices: Voices): void {
  voices.pad.push(...padFor(ctx, 0.4));
  voices.bass.push(
    ...gallopLine({ startBar: ctx.startBar, roots: ctx.bassRoots, approaches: ctx.approaches }),
  );
  voices.rhythm.push(
    ...powerChordGallop({
      startBar: ctx.startBar,
      roots: ctx.guitarRoots,
      approaches: ctx.approaches.map((a) => (a ? transpose(a, 12) : null)),
      accent: 0.92,
      ghost: 0.78,
    }),
  );
}

/**
 * The desert-rock engine: straight eighths (or a sixteenth chug) pedalling the
 * root, guitar in unison an octave up. `riff` gallops and therefore *moves*; this
 * one refuses to, which is the whole style — the weight comes from repetition.
 * The pad sits lower than under `riff` because fuzz and sustained voices fight.
 */
function buildMotor(ctx: SectionContext, voices: Voices): void {
  const subdivision = ctx.section.subdivision ?? 2;
  voices.pad.push(...padFor(ctx, 0.26));
  voices.bass.push(
    ...motorLine({
      startBar: ctx.startBar,
      roots: ctx.bassRoots,
      approaches: ctx.approaches,
      subdivision,
    }),
  );
  voices.rhythm.push(
    ...powerChordMotor({
      startBar: ctx.startBar,
      roots: ctx.guitarRoots,
      approaches: ctx.approaches.map((a) => (a ? transpose(a, 12) : null)),
      subdivision,
      accent: 0.92,
      ghost: 0.8,
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
  ctx.bassRoots.forEach((root, i) => {
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
  ctx.bassRoots.forEach((root, i) => {
    voices.bass.push({
      time: `${ctx.startBar + i}:0:0`,
      pitch: root,
      duration: "1m",
      velocity: 0.6,
    });
  });
}

/** Bass creeps back on eighths, guitar on downbeats, full gallop for the last two bars. */
function buildRebuild(ctx: SectionContext, voices: Voices): void {
  voices.pad.push(...padFor(ctx, 0.4));
  const gallopFrom = ctx.bassRoots.length - 2;

  ctx.bassRoots.forEach((root, i) => {
    const bar = ctx.startBar + i;
    if (i >= gallopFrom) {
      voices.bass.push(
        ...gallopLine({ startBar: bar, roots: [root], approaches: [ctx.approaches[i] ?? null] }),
      );
      voices.rhythm.push(
        ...powerChordGallop({
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
        pitches: Array<string>(BEATS_PER_BAR).fill(root),
        subdivision: 2,
        velocity: 0.7 + i * 0.03,
      }),
    );
    if (i >= 2) {
      const guitarRoot = ctx.guitarRoots[i]!;
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
  const pitches = ctx.bassRoots.flatMap((root, i) => {
    const fifth = fitToBand(transpose(root, 7), i < half ? [60, 71] : [72, 83]);
    return Array<string>(BEATS_PER_BAR).fill(fifth);
  });
  voices.lead.push(...tremoloLine({ startBar: ctx.startBar, pitches, subdivision: 4, velocity: 0.88 }));
}

/** Held root + fifth per bar — the choir/organ bed under everything. */
function padFor(ctx: SectionContext, velocity: number): Note[] {
  return sustainLine({
    startBar: ctx.startBar,
    pitches: ctx.bassRoots.map((root) => {
      const up = transpose(root, 12);
      return [up, transpose(up, 7)];
    }),
    velocity,
  });
}

/** A single low toll every other bar — the western bell. */
function bellFor(ctx: SectionContext, velocity: number): Note[] {
  return sustainLine({
    startBar: ctx.startBar,
    pitches: ctx.bassRoots.map((root, i) => (i % 2 === 0 ? root : null)),
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

