/**
 * Part builders — the layers that turn a chord chart into an arrangement.
 *
 * `riff.ts` writes the *driving* parts (gallop, tremolo, power chords) that a
 * hand-written plan asks for by name. These are the everyday ones every piece
 * needs: something holding the bottom, something stating the harmony in rhythm,
 * something moving. The composer builds a whole track out of them instead of
 * emitting one block chord per bar.
 *
 * All three take a **step string** — the same `"X..x..X..x......"` notation the
 * palettes use for grooves (see `docs/grooves.md`), read by the same
 * `stepEvents`. That is deliberate: a bass written on its own grid under a
 * shuffled kit flams on every off-beat, and sharing the reader means sharing the
 * swing. It also means a genre author already knows the syntax.
 *
 * Pure and deterministic → unit tested. Pitch math lives in `theory`.
 */
import type { Note } from "./composition";
import { stepEvents, STEPS_PER_BAR, type StepEvent, type SwingUnit } from "./groove";
import { fitToBand, pitchToMidi, transpose } from "./theory";
import { sixteenthsToNotation } from "@utils/timing";

/**
 * Where a bass line lives: A1..A2. A full octave, so every pitch class has a
 * home in it (a narrower band can't hold them all), and low enough that the part
 * reads as the bottom rather than as a second guitar.
 */
export const BASS_BAND: [number, number] = [33, 45];

/** Fields every part builder shares — the span, the feel, the level. */
interface PartOptions {
  /** First bar the part is written into. */
  startBar: number;
  /** Step string; cycles over the span the way a groove lane does. */
  pattern: string;
  /** Scales every velocity — a quiet verse, a loud chorus. Default 1. */
  intensity?: number;
  /** Swing, matched to the kit's. Default straight. */
  swing?: number;
  swingUnit?: SwingUnit;
  /**
   * Longest a note rings, in sixteenths. Notes otherwise last until the next
   * hit, which is what makes a sparse pattern sound sustained and a busy one
   * sound short without stating a duration per note.
   */
  maxSustain?: number;
}

export interface BassLineOptions extends PartOptions {
  /** Root pitch per bar; the span is one bar per root. */
  roots: string[];
  /** Register the roots are folded into, so the line never jumps octave. */
  band?: [number, number];
  /**
   * Chromatic step into the *next* bar's root, played on that bar's last struck
   * step. The detail that makes a repeated bass figure feel like it is going
   * somewhere. `null`/absent = stay on the root.
   *
   * Only taken when that last hit falls in the bar's final beat, because an
   * approach is heard as a lead-*in*. On a sparse pattern whose last hit lands
   * on beat 2, the same note is just a wrong root held for half a bar.
   */
  approaches?: (string | null)[];
}

/**
 * The bottom: one root per bar, struck on the pattern's steps.
 *
 * Roots are folded into a single octave band rather than played where the chord
 * put them — a bass that follows the chart literally leaps a seventh whenever
 * the progression steps down, and no player does that.
 */
export function bassLine(opts: BassLineOptions): Note[] {
  const { roots, band = BASS_BAND, approaches = [] } = opts;
  const fitted = roots.map((root) => fitToBand(root, band));
  const events = spanEvents(opts, roots.length);

  return events.map(({ event, bar, duration, isBarLast }) => {
    const approach = approaches[bar] ?? null;
    const root = fitted[bar]!;
    const leadsIn = isBarLast && event.step % STEPS_PER_BAR >= STEPS_PER_BAR - 4;
    return {
      time: event.time,
      pitch: leadsIn && approach ? fitToBand(approach, band) : root,
      duration,
      velocity: event.velocity,
    };
  });
}

export interface CompLineOptions extends PartOptions {
  /** Chord voicing per bar (from `theory.voiceLead`); the span is one bar each. */
  voicings: string[][];
  /** How much each voice above the bottom backs off. Default 0.05. */
  spread?: number;
}

/**
 * Comping: the harmony *in rhythm* rather than a block chord on the downbeat.
 *
 * This is the layer that carries a genre. The same four chords stabbed on the
 * off-beats read as reggae, pushed on every eighth as house, and laid down whole
 * as ambient — one voicing list, one pattern string apart.
 */
export function compLine(opts: CompLineOptions): Note[] {
  const { voicings, spread = 0.05 } = opts;
  const events = spanEvents(opts, voicings.length);

  return events.flatMap(({ event, bar, duration }) =>
    (voicings[bar] ?? []).map((pitch, voice) => ({
      time: event.time,
      pitch,
      duration,
      // Upper voices sit under the bottom one so the stack reads as one chord.
      velocity: round(Math.max(0.05, event.velocity - voice * spread), 3),
    })),
  );
}

export interface ArpLineOptions extends PartOptions {
  /** Chord voicing per bar; the arp walks these pitches. */
  voicings: string[][];
  /** `up` climbs the voicing, `down` descends, `updown` turns around at the top. */
  direction?: "up" | "down" | "updown";
}

/**
 * A broken chord: one voicing note per struck step, cycling.
 *
 * The cursor advances per *step*, not per bar, so a three-note triad over a
 * four-hit pattern lands on a different chord tone each bar — the small
 * asymmetry that keeps an arpeggio from sounding like a loop of itself.
 */
export function arpLine(opts: ArpLineOptions): Note[] {
  const { voicings, direction = "up" } = opts;
  const events = spanEvents(opts, voicings.length);
  let cursor = 0;

  return events.flatMap(({ event, bar, duration }) => {
    const order = arpOrder(voicings[bar] ?? [], direction);
    if (order.length === 0) return [];
    const pitch = order[cursor % order.length]!;
    cursor += 1;
    return [{ time: event.time, pitch, duration, velocity: event.velocity }];
  });
}

function arpOrder(voicing: string[], direction: "up" | "down" | "updown"): string[] {
  if (direction === "down") return [...voicing].reverse();
  // The turnaround drops the outer notes on the way back so the top and bottom
  // aren't struck twice in a row.
  if (direction === "updown") return [...voicing, ...voicing.slice(1, -1).reverse()];
  return voicing;
}

/**
 * A bass pattern that locks to the kick.
 *
 * Bass and kick occupying the same beats is most of what "tight" means; a bass
 * on its own rhythm against a busy kick reads as two records playing. So the
 * kick lane *is* the bass part, with two corrections: ghost notes are dropped
 * (a bass can't articulate them and they turn to mud down there) and the
 * downbeat is always struck, because a kick pattern that starts late leaves the
 * bar with no bottom at all.
 *
 * Returns whole bars, so a two-bar kick yields a two-bar bass.
 */
export function bassPatternFromKick(kick: string): string {
  if (kick.length === 0) return "";
  const steps = [...kick].map((c) => (c === "o" ? "." : c));
  if (steps[0] === ".") steps[0] = "x";
  return steps.join("");
}

/**
 * A chromatic step into each following root — the detail that stops a repeated
 * figure sounding like a stuck record. Feed the result to `bassLine`.
 *
 * `wrapTo` is the bar the *last* one approaches. For a loop that is the loop's
 * first bar, because that is what actually follows it on every lap but the
 * first; getting it wrong is audible, since the seam is the bar heard most.
 * `null` (the default) leaves the last bar unapproached — right for a piece that
 * ends rather than wraps.
 */
export function approachNotes(roots: string[], wrapTo: number | null = null): (string | null)[] {
  return roots.map((root, i) => {
    const isLastBar = i === roots.length - 1;
    const nextIndex = isLastBar ? wrapTo : i + 1;
    if (nextIndex === null) return null;
    const next = roots[nextIndex];
    if (next === undefined || next === root) return null;
    // step down onto a lower target, up onto a higher one
    return transpose(next, pitchToMidi(next) < pitchToMidi(root) ? 1 : -1);
  });
}

interface SpanEvent {
  event: StepEvent;
  /** Bar index *within the span* (0-based), for indexing per-bar inputs. */
  bar: number;
  duration: string;
  /** Whether this is the last struck step in its bar. */
  isBarLast: boolean;
}

/**
 * Read a part's pattern across `bars` bars and pre-compute what every builder
 * needs per hit: which bar it belongs to, how long it rings, and whether it is
 * the bar's last hit (where an approach note goes).
 *
 * A note rings until the next hit, capped by `maxSustain`. That gives a
 * one-hit-per-bar pattern a whole-note pad and a sixteenth pattern staccato
 * sixteenths, from the same call.
 */
function spanEvents(opts: PartOptions, bars: number): SpanEvent[] {
  const { startBar, pattern, intensity, swing, swingUnit, maxSustain = STEPS_PER_BAR } = opts;
  if (bars <= 0) return [];
  const events = stepEvents(pattern, { startBar, bars, intensity, swing, swingUnit });
  const spanEnd = bars * STEPS_PER_BAR;

  return events.map((event, i) => {
    const nextStep = events[i + 1]?.step ?? spanEnd;
    const bar = Math.floor(event.step / STEPS_PER_BAR);
    const nextBar = i + 1 < events.length ? Math.floor(events[i + 1]!.step / STEPS_PER_BAR) : -1;
    return {
      event,
      bar,
      duration: sixteenthsToNotation(Math.max(1, Math.min(nextStep - event.step, maxSustain))),
      isBarLast: nextBar !== bar,
    };
  });
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
