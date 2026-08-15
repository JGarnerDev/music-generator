/**
 * Fills — the bar that says a phrase just ended.
 *
 * A groove states one bar and repeats it. That is correct for a groove and it is
 * exactly why a long loop reads as a machine: nothing in four minutes ever marks
 * where a phrase stops. A drummer does that without being asked, and it is the
 * single cheapest thing that makes a repeat sound played rather than looped.
 *
 * A fill is written in the same step notation as a groove and replaces the kit
 * for one bar, so a genre either names one off the shelf below or writes its own
 * lanes. It is not a *variation* on the beat — it is a different bar, which is
 * why substitution rather than layering is the right model: a tom tumble over
 * the top of the original hats is two drummers, not one.
 *
 * Pure and deterministic → unit tested. Where the fills land is `groove.ts`.
 */
import type { DrumPiece } from "./composition";

/** Kit lanes for one bar, same notation as a groove. */
export type FillPatterns = Partial<Record<DrumPiece, string>>;

/**
 * The shelf, written for 4/4. A genre names one, or states its own lanes.
 *
 * Each ends on or just before the barline so the downbeat that follows lands
 * clean — a fill that plays through the barline swallows the very event it
 * exists to announce.
 */
export const FILLS = {
  "snare-roll": {
    snare: "............xxXX",
  },
  "tom-tumble": {
    "tom-hi": "........xx......",
    "tom-mid": "..........xx....",
    "tom-lo": "............xxX.",
  },
  "kick-stutter": {
    kick: "X.......X.X.X.X.",
    snare: "....X...........",
  },
  "half-bar-break": {
    // Silence for half a bar, then a hard answer. The rest is the fill.
    snare: "........X...X.xX",
  },
  "crash-lift": {
    crash: "..............X.",
    snare: "..........x.x...",
    kick: "X.......X.......",
  },
  "ghost-shuffle": {
    snare: "..o.o.x.o.x.oxX.",
    hat: "x...x...x...x...",
  },
} as const satisfies Record<string, FillPatterns>;

export type FillName = keyof typeof FILLS;

export const FILL_NAMES = Object.keys(FILLS) as FillName[];

export function isFillName(value: unknown): value is FillName {
  return typeof value === "string" && value in FILLS;
}

/** A fill off the shelf by name, or one written inline. */
export type FillRef = FillName | FillPatterns;

/** Resolve a reference to its lanes. Throws on a name that isn't on the shelf. */
export function fillPatterns(ref: FillRef): FillPatterns {
  if (typeof ref !== "string") return ref;
  const fill = FILLS[ref];
  if (!fill) {
    throw new Error(`unknown fill "${ref}" — pick one of: ${FILL_NAMES.join(", ")}`);
  }
  return fill;
}

/**
 * Which bars of a span get a fill.
 *
 * Counted from the span's own start, so a section's fill lands at the end of the
 * section's phrase rather than wherever the piece's global bar count happens to
 * fall. `every` of 8 fills bars 7, 15, 23 …
 *
 * `phraseOffset` says how far into a phrase the span *begins*, for a caller that
 * renders one phrase in several calls — the composer plays its statement and
 * restatement separately so it can lift the dynamics, and without the offset an
 * eight-bar phrase split into two four-bar spans would never reach a fill at all.
 *
 * The **last** bar of a span is deliberately eligible: on a loop that is the bar
 * before the wrap, which is the one place a fill most wants to be.
 */
export function fillBars(bars: number, every: number, phraseOffset = 0): number[] {
  if (!Number.isInteger(every) || every < 2) return [];
  const out: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    if ((bar + phraseOffset + 1) % every === 0) out.push(bar);
  }
  return out;
}
