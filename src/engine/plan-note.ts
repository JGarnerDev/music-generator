/**
 * A plan's note — the compact tuple `song:build` reads in bulk — and the step
 * that puts it on the piece's timeline.
 *
 * `[time, pitch, duration, velocity]`, times relative to the section start. An
 * optional fifth entry is a `bend` (see [`./bend`](./bend.ts)): until it existed,
 * every piece built from a plan — every loop and song — could not bend a note at
 * all, though the renderer had played bends for months. Or it is the string
 * `"legato"`: the note is hammered on, pulled off or tapped rather than picked
 * (see [`./legato`](./legato.ts)) — a note that moves the string cannot bend
 * it too, so one slot holds either.
 *
 * Pure: the CLI owns failing loudly, this only converts and reports.
 */
import type { Note } from "./composition";
import { validateBend, type BendSpec } from "./bend";

export type PlanNote =
  | [time: string, pitch: string, duration: string, velocity: number]
  | [time: string, pitch: string, duration: string, velocity: number, bend: BendSpec]
  | [time: string, pitch: string, duration: string, velocity: number, legato: "legato"];

/** Move plan notes onto the real timeline, `startBar` bars in. A bend or legato rides along. */
export function offsetNotes(notes: readonly PlanNote[], startBar: number): Note[] {
  return notes.map(([time, pitch, duration, velocity, how]) => {
    const [bar = "0", beat = "0", sixteenth = "0"] = time.split(":");
    return {
      time: `${Number(bar) + startBar}:${beat}:${sixteenth}`,
      pitch,
      duration,
      velocity,
      ...(how === undefined ? {} : how === "legato" ? { legato: true } : { bend: how }),
    };
  });
}

/**
 * Problems with the bends in a run of plan notes, as `label[i].bend: message`.
 * Checked at build time so a bad bend names its section rather than surfacing as
 * a validation error on a generated file nobody wrote.
 */
export function planBendIssues(notes: readonly PlanNote[], label: string): string[] {
  const issues: string[] = [];
  notes.forEach((note, i) => {
    const how = note[4];
    if (how === undefined) return;
    if (typeof how === "string") {
      if (how !== "legato") issues.push(`${label}[${i}][4]: "${String(how)}" is not "legato" or a bend`);
      return;
    }
    validateBend(how, `${label}[${i}].bend`, (path, message) => issues.push(`${path}: ${message}`));
  });
  return issues;
}

/**
 * The same notes with any bend removed — for a line derived from a bent one. A
 * legato mark stays: the twin hammers on where the lead does, or the two lines
 * would articulate differently and stop sounding like one part doubled.
 */
export function withoutBends(notes: readonly Note[]): Note[] {
  return notes.map(({ bend: _bend, ...rest }) => rest);
}
