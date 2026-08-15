/**
 * Section builders — the arrangement styles a plan names, as pure functions.
 *
 * A section plan says *what happens* ("bars 8–16 are a breakdown"), and these
 * turn that into notes. Each builder is a whole way of scoring the same chords:
 * `riff` is the engine at full force, `breakdown` is what is left when the band
 * stops, `climb` is the tremolo lift before a climax. Choosing between them is
 * the arrangement, and it is the difference between a loop with events in it and
 * a loop that plays the same eight bars for four minutes.
 *
 * They lived inside `scripts/build-song.ts` until they were the largest and most
 * musical thing in the repo with no test around them. Nothing here reads a file,
 * prints, or exits: a builder takes a `SectionContext` and pushes into `Voices`.
 * The CLI keeps the parts that *are* about a file — reading the plan, resolving
 * the register, failing loudly on a typo'd figure.
 *
 * They are deliberately **not** general. The vocabulary is metal and western —
 * gallop, power chords, a tolling bell, a whistle's worth of space — because
 * that is the music the first library was made of. A new idiom wants new
 * builders beside these, not options bolted onto them.
 */
import type { Note } from "./composition";
import { figureLine, powerChordFigure, type FigureRef } from "./figure";
import { sustainLine, tremoloLine } from "./riff";
import { chordPitches, fitToBand, transpose } from "./theory";
import { COMMON_TIME, beatsPerBar, sixteenthsToNotation, stepsPerBar, type Meter } from "@utils/timing";

/** The arrangement styles a plan section may ask for. */
export type Style =
  | "standoff"
  | "riff"
  | "motor"
  | "kit"
  | "breakdown"
  | "rebuild"
  | "climb"
  | "turnaround";

export const STYLES = [
  "standoff",
  "riff",
  "motor",
  "kit",
  "breakdown",
  "rebuild",
  "climb",
  "turnaround",
] as const satisfies readonly Style[];

export function isStyle(value: unknown): value is Style {
  return typeof value === "string" && (STYLES as readonly string[]).includes(value);
}

/** The voices every section writes into, one bucket per track the builder emits. */
export interface Voices {
  pad: Note[];
  bass: Note[];
  rhythm: Note[];
  lead: Note[];
  piano: Note[];
  epiano: Note[];
  drums: Note[];
}

/** An empty set of buckets — what a build starts from. */
export function emptyVoices(): Voices {
  return { pad: [], bass: [], rhythm: [], lead: [], piano: [], epiano: [], drums: [] };
}

/** Everything a style builder needs about its slice of the timeline. */
export interface SectionContext {
  /** The style to play. */
  style: Style;
  /** First bar of the section on the piece's timeline. */
  startBar: number;
  /** The rhythmic cell the engine plays here, already resolved and checked. */
  figure: FigureRef;
  /** Time signature, so every layer counts bars the same way. Default 4/4. */
  meter?: Meter;
  /**
   * Bass root per bar, already fitted to the piece's register. An array entry is
   * a bar split evenly between those roots — the engine follows it hit by hit.
   */
  bassRoots: (string | string[])[];
  /** The same roots an octave up, for the guitar. */
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
export function slicesOf(entry: string | string[]): string[] {
  return Array.isArray(entry) ? entry : [entry];
}

/** First and last chord sounding in a bar — what the neighbours' parts key off. */
export function firstOf(entry: string | string[]): string {
  return slicesOf(entry)[0]!;
}
export function lastOf(entry: string | string[]): string {
  return slicesOf(entry).at(-1)!;
}

/** A bar's roots an octave up, split bar or not. */
export function octaveUp(entry: string | string[]): string | string[] {
  return Array.isArray(entry) ? entry.map((p) => transpose(p, 12)) : transpose(entry, 12);
}

/** One run of bars and the register its bass roots fold into. */
export interface RootGroup {
  /** Chord symbols, one entry per bar; an array entry splits the bar. */
  chords: readonly (string | string[])[];
  /** Low and high MIDI note the roots are folded between. */
  band: [number, number];
}

/**
 * Bass roots per bar, each group folded into its *own* register band.
 *
 * One band for a whole piece is a large part of why a chorus sounds like the
 * verse it followed: inside eight semitones every root folds to the same place,
 * so a section can get louder and busier but it cannot *lift*. Handing a section
 * its own band is the melodic-contour knob — the chorus is up a fifth because
 * its notes are up a fifth, not because the gain moved.
 *
 * Bars come back flat and in order, so everything stacked off them (guitar +12,
 * pad +12/+19, the approach notes between bars) follows the change for free —
 * including across a section seam, where the approach steps into the new band.
 */
export function foldRoots(groups: readonly RootGroup[]): (string | string[])[] {
  return groups.flatMap(({ chords, band }) =>
    chords.map((entry) =>
      Array.isArray(entry) ? entry.map((sym) => fitRoot(sym, band)) : fitRoot(entry, band),
    ),
  );
}

/** Root pitch of a chord symbol, folded into a band. */
function fitRoot(chordSymbol: string, band: [number, number]): string {
  return fitToBand(chordPitches(chordSymbol, 2)[0]!, band);
}

/**
 * Where each chord of a bar starts and how long it is held — what the *sustained*
 * layers (pad, breakdown drone) need, as against the figure, which places its own
 * hits and only asks which root each one lands on.
 *
 * The held length is the bar divided by how many chords share it, named back as
 * notation. One chord holds `1m` whatever the meter; two in a bar of 3/4 get a
 * dotted quarter each rather than the half note a 4/4 bar would hand them.
 */
export function barSlices(
  entry: string | string[],
  bar: number,
  meter: Meter = COMMON_TIME,
): Note[] {
  const pitches = slicesOf(entry);
  const span = stepsPerBar(meter) / pitches.length;
  return pitches.map((pitch, i) => {
    const at = i * span;
    const sixteenth = Math.round((at % 4) * 1e4) / 1e4;
    return {
      time: `${bar}:${Math.floor(at / 4)}:${sixteenth}`,
      pitch,
      duration: sixteenthsToNotation(Math.max(1, Math.floor(span)), meter),
    };
  });
}

/** Dispatch one section onto its builder. Throws on a style that isn't one. */
export function buildSection(ctx: SectionContext, voices: Voices): void {
  const build = BUILDERS[ctx.style];
  if (!build) {
    throw new Error(`unknown section style "${ctx.style}" — pick one of: ${STYLES.join(", ")}`);
  }
  build(ctx, voices);
}

const BUILDERS: Record<Style, (ctx: SectionContext, voices: Voices) => void> = {
  standoff: buildStandoff,
  riff: buildRiff,
  motor: buildMotor,
  kit: buildKit,
  turnaround: buildTurnaround,
  breakdown: buildBreakdown,
  rebuild: buildRebuild,
  climb: buildClimb,
};

/** Western intro: choir, tolling bell, no engine — then a two-beat pickup into the riff. */
export function buildStandoff(ctx: SectionContext, voices: Voices): void {
  const meter = ctx.meter ?? COMMON_TIME;
  voices.pad.push(...padFor(ctx, 0.3));
  voices.piano.push(...bellFor(ctx, 0.5));

  // Last two beats of the final bar: the gallop fires up and launches the riff.
  const lastBar = ctx.startBar + ctx.bassRoots.length - 1;
  const root = ctx.bassRoots.at(-1)!;
  const approach = ctx.approaches.at(-1) ?? null;
  const from = beatsPerBar(meter) - 2;
  const pickup = (notes: Note[]) => notes.filter((n) => beatOf(n) >= from);
  voices.bass.push(
    ...pickup(
      figureLine(ctx.figure, { startBar: lastBar, roots: [root], approaches: [approach], meter }),
    ),
  );
  voices.rhythm.push(
    ...pickup(
      powerChordFigure(ctx.figure, {
        startBar: lastBar,
        roots: [octaveUp(root)],
        approaches: [approach ? transpose(approach, 12) : null],
        meter,
      }),
    ),
  );
}

/**
 * The engine at full force: the section's figure in the bass, doubled by power
 * chords an octave up, pad underneath. The *figure* is what makes one of these
 * sections sound unlike another.
 */
export function buildRiff(ctx: SectionContext, voices: Voices): void {
  buildEngine(ctx, voices, { pad: 0.4, bassGhost: 0.8, rhythmGhost: 0.78 });
}

/**
 * The desert-rock engine: straight eighths (or a sixteenth chug) pedalling the
 * root, guitar in unison an octave up. `riff` gallops and therefore *moves*; this
 * one refuses to, which is the whole style — the weight comes from repetition.
 * The pad sits lower than under `riff` because fuzz and sustained voices fight.
 *
 * The two styles now differ only in dynamics: the figure is the section's to
 * choose, so `motor` is "quieter pad, ghosts a hair up" and a straight default
 * subdivision, not a separate rhythm engine.
 */
export function buildMotor(ctx: SectionContext, voices: Voices): void {
  buildEngine(ctx, voices, { pad: 0.26, bassGhost: 0.82, rhythmGhost: 0.8 });
}

/** Bass + doubled power chords + pad, on whatever figure the section picked. */
function buildEngine(
  ctx: SectionContext,
  voices: Voices,
  dyn: { pad: number; bassGhost: number; rhythmGhost: number },
): void {
  const meter = ctx.meter ?? COMMON_TIME;
  voices.pad.push(...padFor(ctx, dyn.pad));
  voices.bass.push(
    ...figureLine(ctx.figure, {
      startBar: ctx.startBar,
      roots: ctx.bassRoots,
      approaches: ctx.approaches,
      ghost: dyn.bassGhost,
      meter,
    }),
  );
  voices.rhythm.push(
    ...powerChordFigure(ctx.figure, {
      startBar: ctx.startBar,
      roots: ctx.guitarRoots,
      approaches: ctx.approaches.map((a) => (a ? transpose(a, 12) : null)),
      accent: 0.92,
      ghost: dyn.rhythmGhost,
      meter,
    }),
  );
}

/**
 * Drums alone — the kit intro, the break where the band stops and the drummer
 * doesn't. Writes no pitched voice at all; the section's groove is the section.
 */
export function buildKit(_ctx: SectionContext, _voices: Voices): void {}

/** The riff, plus a low piano stab per bar to mark the last section before the wrap. */
export function buildTurnaround(ctx: SectionContext, voices: Voices): void {
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
export function buildBreakdown(ctx: SectionContext, voices: Voices): void {
  voices.pad.push(...padFor(ctx, 0.42));
  voices.piano.push(...bellFor(ctx, 0.55));
  ctx.bassRoots.forEach((entry, i) => {
    for (const note of barSlices(entry, ctx.startBar + i, ctx.meter)) {
      voices.bass.push({ ...note, velocity: 0.6 });
    }
  });
}

/** Bass creeps back on eighths, guitar on downbeats, full figure for the last two bars. */
export function buildRebuild(ctx: SectionContext, voices: Voices): void {
  const meter = ctx.meter ?? COMMON_TIME;
  const perBar = beatsPerBar(meter);
  voices.pad.push(...padFor(ctx, 0.4));
  const engineFrom = ctx.bassRoots.length - 2;

  ctx.bassRoots.forEach((entry, i) => {
    const bar = ctx.startBar + i;
    if (i >= engineFrom) {
      voices.bass.push(
        ...figureLine(ctx.figure, {
          startBar: bar,
          roots: [entry],
          approaches: [ctx.approaches[i] ?? null],
          meter,
        }),
      );
      voices.rhythm.push(
        ...powerChordFigure(ctx.figure, {
          startBar: bar,
          roots: [ctx.guitarRoots[i]!],
          approaches: [ctx.approaches[i] ? transpose(ctx.approaches[i]!, 12) : null],
          meter,
        }),
      );
      return;
    }
    // eighths on the root: motion without the full weight of the engine yet
    voices.bass.push(
      ...tremoloLine({
        startBar: bar,
        pitches: Array<string>(perBar).fill(firstOf(entry)),
        subdivision: 2,
        velocity: 0.7 + i * 0.03,
        meter,
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
export function buildClimb(ctx: SectionContext, voices: Voices): void {
  const meter = ctx.meter ?? COMMON_TIME;
  buildRiff(ctx, voices);
  const half = Math.ceil(ctx.bassRoots.length / 2);
  const pitches = ctx.bassRoots.flatMap((entry, i) => {
    const fifth = fitToBand(transpose(firstOf(entry), 7), i < half ? [60, 71] : [72, 83]);
    return Array<string>(beatsPerBar(meter)).fill(fifth);
  });
  voices.lead.push(
    ...tremoloLine({ startBar: ctx.startBar, pitches, subdivision: 4, velocity: 0.88, meter }),
  );
}

/**
 * Held root + fifth — the choir/organ bed under everything. It follows a split
 * bar's chords rather than holding the first one over both, which is the whole
 * point of splitting the bar.
 */
export function padFor(ctx: SectionContext, velocity: number): Note[] {
  return ctx.bassRoots.flatMap((entry, i) =>
    barSlices(entry, ctx.startBar + i, ctx.meter).flatMap(({ time, pitch, duration }) => {
      const up = transpose(pitch, 12);
      return [
        { time, pitch: up, duration, velocity },
        { time, pitch: transpose(up, 7), duration, velocity: Math.max(0.05, velocity - 0.05) },
      ];
    }),
  );
}

/** A single low toll every other bar — the western bell. */
export function bellFor(ctx: SectionContext, velocity: number): Note[] {
  return sustainLine({
    startBar: ctx.startBar,
    pitches: ctx.barRoots.map((root, i) => (i % 2 === 0 ? root : null)),
    velocity,
  });
}

function beatOf(note: Note): number {
  return Number(note.time.split(":")[1] ?? 0);
}
