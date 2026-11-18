/**
 * One instrument, several sounds — a section changing what a track *is*.
 *
 * A plan names one voice per instrument, which is right for a scene loop and
 * wrong for a piece that travels: a main title that states its theme on strings,
 * hands it to a whistle for the quiet verse and a soprano for the peak is one
 * `lead` part in three different hands. The renderer already plays two tracks of
 * one instrument side by side (the twin lead is exactly that), so a change of
 * sound is a change of *track*: each section's notes go to the track for the
 * voice and gain that section asked for.
 *
 * Pure — the CLI resolves and checks slugs, this only routes notes.
 */
import type { Note } from "./composition";

/** What one run of bars sounds like for one instrument. Unset fields inherit. */
export interface SectionSound {
  /** First bar of the run on the piece's timeline. */
  start: number;
  /** One past its last bar. */
  end: number;
  /** Voice slug for these bars. */
  voice?: string;
  /** Track gain for these bars. `0` silences them outright. */
  gain?: number;
}

/** One track's worth of notes: the sound they share and the notes themselves. */
export interface SoundPart {
  voice?: string;
  gain: number;
  notes: Note[];
}

/**
 * Split one instrument's notes into a part per distinct sound.
 *
 * A note belongs to the section its *onset* is in — a chord held across a seam
 * finishes in the hand that struck it, which is what a player would do. Runs
 * asking for the same voice and gain share one track however far apart they
 * are, so a sound that returns at the peak is the same player coming back, not a
 * second one. The plan's own sound comes first; parts with no notes, and parts
 * at gain 0, are dropped.
 */
export function splitBySound(
  notes: readonly Note[],
  sounds: readonly SectionSound[],
  base: { voice?: string; gain: number },
): SoundPart[] {
  const keyOf = (voice: string | undefined, gain: number) => `${voice ?? ""}|${gain}`;
  const parts = new Map<string, SoundPart>();
  parts.set(keyOf(base.voice, base.gain), { ...base, notes: [] });

  for (const note of notes) {
    const bar = barOf(note);
    const run = sounds.find((s) => bar >= s.start && bar < s.end);
    const voice = run?.voice ?? base.voice;
    const gain = run?.gain ?? base.gain;
    const key = keyOf(voice, gain);
    let part = parts.get(key);
    if (!part) {
      part = { ...(voice === undefined ? {} : { voice }), gain, notes: [] };
      parts.set(key, part);
    }
    part.notes.push(note);
  }
  return [...parts.values()].filter((p) => p.notes.length > 0 && p.gain > 0);
}

/** The bar a note starts in, from its `bar:beat:sixteenth` time. */
function barOf(note: Note): number {
  const bar = Number(String(note.time).split(":")[0]);
  return Number.isFinite(bar) ? Math.floor(bar) : 0;
}
