/**
 * Rhythm figures — *which* rhythmic cell a driving part plays, separated from
 * *what pitches* it plays.
 *
 * The riff builders used to hard-code one sixteenth gallop, so every riff bar of
 * every piece was the same figure with a different root and no amount of new
 * harmony made two loops sound unalike. A figure is that cell, named and stated
 * once, in the same step notation the grooves use (see `docs/grooves.md`):
 *
 *   gallop:  "X.oox.ooX.oox.oo"
 *   3+3+2:   "X..x..x.X..x..x."
 *
 * One character per step, `X` accent · `x` the same hit backed off · `o` ghost ·
 * `.` rest. A figure states a whole number of bars and cycles, so a two-bar cell
 * restates itself every other bar the way a two-bar groove does.
 *
 * Two things are derived rather than typed, because typing them is where the
 * errors live:
 *
 * - **Duration** is the gap to the next hit, so a figure is legato by
 *   construction and can't leave a note ringing past its neighbour. `duration`
 *   overrides it where the style is short stabs, not held notes.
 * - **Which hits get a fifth** in power-chord voicing is `chordOn` (the accented
 *   hits by default). Full chords on every fast subdivision turn to mud; the bare
 *   root between them reads as palm-muting.
 *
 * Pure and deterministic → unit tested. `riff.ts` layers the named builders
 * (`gallopLine`, `motorLine`) on top of this.
 */
import type { Note } from "./composition";
import { transpose } from "./theory";

const BEATS_PER_BAR = 4;

/** Accent characters a figure may use. Same vocabulary as a groove lane. */
const HIT_CHARS = "Xxo";

/**
 * Note value per gap, longest-first, per grid resolution. A gap the table
 * doesn't name (5 sixteenths, say) takes the largest value that fits, so an
 * odd figure is slightly detached rather than overlapping its next hit.
 */
const DURATIONS: Record<number, [steps: number, value: string][]> = {
  4: [
    [16, "1m"],
    [12, "2n."],
    [8, "2n"],
    [6, "4n."],
    [4, "4n"],
    [3, "8n."],
    [2, "8n"],
    [1, "16n"],
  ],
  3: [
    [12, "1m"],
    [9, "2n."],
    [6, "2n"],
    [3, "4n"],
    [2, "4t"],
    [1, "8t"],
  ],
};

export interface Figure {
  /** Step string, a whole number of bars long. `X` accent, `x` softer, `o` ghost, `.` rest. */
  steps: string;
  /**
   * Steps per beat. 4 = the sixteenth grid everything else in the repo uses;
   * 3 = eighth-note triplets, which land on fractional sixteenths (`0:0:1.3333`)
   * exactly the way a swung groove step does.
   */
  resolution: 3 | 4;
  /** Velocity delta of an `x` hit against an `X`. Negative. */
  secondary: number;
  /** Fixed duration for every hit, when the style is stabs rather than legato. */
  duration?: string;
  /** Which accent characters get a fifth stacked in power-chord voicing. */
  chordOn: string;
  /** One line: when to reach for this figure. Printed by `npm run figures`. */
  summary: string;
}

/**
 * The shelf. Adding one is a data change, not a code change — which is the
 * point: a section picks a figure by name, so two pieces in the same key at the
 * same tempo can still be different music.
 */
export const FIGURES = {
  gallop: {
    steps: "X.oox.ooX.oox.oo",
    resolution: 4,
    secondary: -0.07,
    chordOn: "Xx",
    summary: "Eighth then two sixteenths per beat. Leans forward, wants the next chord — metal, chase, warpath.",
  },
  "straight-eighths": {
    steps: "X.o.x.o.X.o.x.o.",
    resolution: 4,
    secondary: -0.05,
    chordOn: "Xx",
    summary: "Unvarying eighths pedalling the root. Refuses to move; the force is repetition — desert/stoner rock, krautrock.",
  },
  "sixteenth-chug": {
    steps: "XoooxoooXoooxooo",
    resolution: 4,
    secondary: -0.05,
    chordOn: "Xx",
    summary: "Flat-out sixteenths. The straight-eighths motor doubled — heavier without one new note.",
  },
  "3+3+2": {
    steps: "X..x..x.X..x..x.",
    resolution: 4,
    secondary: -0.07,
    chordOn: "Xx",
    summary: "Tresillo: dotted-eighth, dotted-eighth, eighth. Displaces the accent off the beat every half bar — djent, latin-leaning metal, anything that should feel lopsided.",
  },
  "pushed-eighths": {
    steps: "o.X.o.x.o.X.o.x.",
    resolution: 4,
    secondary: -0.07,
    chordOn: "Xx",
    summary: "Eighths with the weight on the off-beat, downbeats ghosted. The upstroke feel — punk, ska, anything nervy and forward.",
  },
  "half-time-chug": {
    steps: "X.......x.......",
    resolution: 4,
    secondary: -0.07,
    chordOn: "Xx",
    summary: "Two held chords a bar, nothing between them. Halves the apparent tempo without touching BPM — doom, sludge, a breakdown that still has weight.",
  },
  "four-on-floor-stab": {
    steps: "X...x...X...x...",
    resolution: 4,
    secondary: -0.07,
    duration: "8n",
    chordOn: "Xx",
    summary: "Short quarter-note stabs, gaps left open. Drives without filling the bar — disco-leaning rock, anything where the kit needs room.",
  },
  "triplet-canter": {
    steps: "X.ox.oX.ox.o",
    resolution: 3,
    secondary: -0.07,
    chordOn: "Xx",
    summary: "Long-short on an eighth-triplet grid. The galloping-horse figure — cavalry, spaghetti-western chase, classic NWOBHM.",
  },
} as const satisfies Record<string, Figure>;

export type FigureName = keyof typeof FIGURES;

/** Every figure name, for CLI help and error messages. */
export const FIGURE_NAMES = Object.keys(FIGURES) as FigureName[];

export function isFigureName(value: unknown): value is FigureName {
  return typeof value === "string" && value in FIGURES;
}

/**
 * A figure off the shelf by name, or one written inline. Inline is for the cell
 * a single piece needs and nothing else will reuse; anything you reach for twice
 * belongs in `FIGURES`.
 */
export type FigureRef = FigureName | Figure;

export interface FigureOptions {
  /** Bar the pattern starts on; roots advance one bar each. */
  startBar: number;
  /**
   * Root pitch per bar, e.g. `["D2", "C2", "Bb1", "A1"]`.
   *
   * An entry may instead be an array, which splits *that bar* evenly between its
   * roots: `["D2", ["Bb1", "C2"]]` changes chord on the half bar. Chord changes
   * that only ever land on the barline are the other half of why a loop is
   * predicted two bars ahead, so this is the cheap fix for it — the figure
   * itself is unchanged, only which root each hit lands on.
   */
  roots: (string | string[])[];
  /**
   * Pitch played on the last hit of a bar, per bar index. A chromatic step into
   * the next root is what makes a repeated figure feel like it is going
   * somewhere. `null`/absent = keep the root.
   */
  approaches?: (string | null)[];
  /** Velocity of an `X` hit. */
  accent?: number;
  /** Velocity of an `o` hit. */
  ghost?: number;
}

/** One hit of a figure, resolved from its step string. */
interface Hit {
  /** Step index within the whole (possibly multi-bar) pattern. */
  step: number;
  char: string;
  /** Steps until the next hit, wrapping — the note's length. */
  gap: number;
}

/**
 * Play a figure on one root per bar — the engine of a driving track.
 *
 * The figure cycles over the roots, so a one-bar cell restates on every new
 * chord and a two-bar cell states its second half against the second chord.
 */
export function figureLine(figure: FigureRef, opts: FigureOptions): Note[] {
  return struckNotes(figure, opts).map(({ note }) => note);
}

/**
 * A figure voiced as power chords: root + fifth on the hits `chordOn` names,
 * root alone on the rest.
 *
 * Dropping the fifth from the fast notes is how the part is actually played —
 * full chords on every sixteenth turn to mud, and the bare root reads as tighter
 * palm-muting. No third, so the mode is carried by the melody.
 */
export function powerChordFigure(figure: FigureRef, opts: FigureOptions): Note[] {
  const { chordOn } = figureFor(figure);
  const struck = struckNotes(figure, opts);
  const voiced = new Set(struck.filter(({ char }) => chordOn.includes(char)).map(({ note }) => note));
  return withFifths(
    struck.map(({ note }) => note),
    (note) => voiced.has(note),
  );
}

/**
 * The figure played on one root per bar, each note still carrying the accent
 * character it came from — which is what the power-chord voicing reads.
 *
 * The figure cycles over the roots, so a one-bar cell restates on every new
 * chord and a two-bar cell states its second half against the second chord.
 */
function struckNotes(ref: FigureRef, opts: FigureOptions): { note: Note; char: string }[] {
  const figure = figureFor(ref);
  const { startBar, roots, approaches = [], accent = 0.95, ghost = 0.8 } = opts;
  const stepsPerBar = BEATS_PER_BAR * figure.resolution;
  const cycleBars = figure.steps.length / stepsPerBar;
  const hits = hitsOf(figure);
  const struck: { note: Note; char: string }[] = [];

  roots.forEach((entry, i) => {
    const bar = startBar + i;
    const approach = approaches[i] ?? null;
    const offset = (i % cycleBars) * stepsPerBar;
    const inBar = hits.filter((h) => h.step >= offset && h.step < offset + stepsPerBar);
    // an array entry splits the bar evenly; a plain pitch is one slice of a whole bar
    const slices = Array.isArray(entry) ? entry : [entry];
    const sliceSteps = stepsPerBar / slices.length;

    inBar.forEach((hit, index) => {
      const isLast = index === inBar.length - 1;
      const stepInBar = hit.step - offset;
      const root = slices[Math.min(slices.length - 1, Math.floor(stepInBar / sliceSteps))]!;
      // a note may not ring through a chord change inside the bar
      const gap =
        slices.length === 1 ? hit.gap : Math.min(hit.gap, sliceSteps - (stepInBar % sliceSteps));
      struck.push({
        char: hit.char,
        note: {
          time: hitTime(bar, stepInBar, figure.resolution),
          pitch: isLast && approach ? approach : root,
          duration: figure.duration ?? durationFor(gap, figure.resolution),
          velocity: velocityFor(hit.char, accent, ghost, figure.secondary),
        },
      });
    });
  });

  return struck;
}

/** Stack a fifth over the notes `voiced` picks, memoising the interval math. */
export function withFifths(notes: Note[], voiced: (note: Note) => boolean): Note[] {
  const fifths = new Map<string, string>();
  const fifthOf = (root: string): string => {
    let f = fifths.get(root);
    if (f === undefined) {
      f = transpose(root, 7);
      fifths.set(root, f);
    }
    return f;
  };

  return notes.flatMap((note) => {
    if (!voiced(note)) return [note];
    return [
      note,
      { ...note, pitch: fifthOf(note.pitch), velocity: (note.velocity ?? 0.9) - 0.05 },
    ];
  });
}

/**
 * Validate a figure definition. Exported so a hand-written figure (a palette
 * field, a plan) fails where it is written rather than as silent wrong rhythm
 * eight bars in.
 */
export function validateFigure(input: unknown): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (typeof input !== "object" || input === null) {
    return [{ path: "figure", message: "must be an object" }];
  }
  const f = input as Record<string, unknown>;
  const resolution = f.resolution;
  if (resolution !== 3 && resolution !== 4) {
    issues.push({ path: "figure.resolution", message: "must be 3 (triplets) or 4 (sixteenths)" });
  }
  if (typeof f.steps !== "string" || f.steps.length === 0) {
    issues.push({ path: "figure.steps", message: "must be a non-empty step string" });
    return issues;
  }
  if (!/^[.xXo]+$/.test(f.steps)) {
    issues.push({ path: "figure.steps", message: 'may only use "X", "x", "o" and "."' });
  }
  if (![...f.steps].some((c) => HIT_CHARS.includes(c))) {
    issues.push({ path: "figure.steps", message: "must have at least one hit" });
  }
  if (resolution === 3 || resolution === 4) {
    const stepsPerBar = BEATS_PER_BAR * resolution;
    if (f.steps.length % stepsPerBar !== 0) {
      issues.push({
        path: "figure.steps",
        message: `length must be a multiple of ${stepsPerBar} (one bar at resolution ${resolution}), got ${f.steps.length}`,
      });
    }
  }
  return issues;
}

function figureFor(ref: FigureRef): Figure {
  if (typeof ref !== "string") {
    const issues = validateFigure(ref);
    if (issues.length > 0) {
      throw new Error(`invalid inline figure: ${issues.map((i) => i.message).join("; ")}`);
    }
    return ref;
  }
  const figure: Figure | undefined = FIGURES[ref];
  if (!figure) {
    throw new Error(`unknown figure "${ref}" — pick one of: ${FIGURE_NAMES.join(", ")}`);
  }
  return figure;
}

/** Every struck step of a figure, each carrying the gap to the next one. */
function hitsOf(figure: Figure): Hit[] {
  const steps = [...figure.steps];
  const struck = steps
    .map((char, step) => ({ char, step }))
    .filter(({ char }) => HIT_CHARS.includes(char));

  return struck.map(({ char, step }, i) => {
    // the pattern cycles, so the last hit's gap runs into the next repeat
    const next = struck[i + 1]?.step ?? struck[0]!.step + steps.length;
    return { step, char, gap: next - step };
  });
}

/**
 * "bar:beat:sixteenth" for a step. At resolution 3 the sixteenth is fractional —
 * `0:0:1.3333` — which is the same thing a swung groove step emits.
 */
function hitTime(bar: number, stepInBar: number, resolution: 3 | 4): string {
  const beat = Math.floor(stepInBar / resolution);
  const sixteenth = ((stepInBar % resolution) * 4) / resolution;
  return `${bar}:${beat}:${round(sixteenth, 4)}`;
}

function durationFor(gap: number, resolution: 3 | 4): string {
  const table = DURATIONS[resolution]!;
  const fit = table.find(([steps]) => steps <= gap) ?? table.at(-1)!;
  return fit[1];
}

function velocityFor(char: string, accent: number, ghost: number, secondary: number): number {
  if (char === "o") return ghost;
  return char === "x" ? accent + secondary : accent;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
