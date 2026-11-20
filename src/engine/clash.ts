/**
 * Clash audit — the held notes that will sound sour, found before the render.
 *
 * Two things made a piece's guitars sound "slightly out of tune" without any
 * tuning being wrong, and both are visible in the notes:
 *
 * - **A rub** — a held melody note a semitone from the chord's root or fifth.
 *   Those two are what the rhythm guitar's power chord and the bass actually
 *   sound, so a note a half step off either is a minor second (or a flat nine)
 *   against a loud, distorted, sustained interval. A passing sixteenth gets away
 *   with it; an eighth or longer is heard as a wrong note.
 * - **A pair clash** — two lead lines a second, a tritone or a major seventh
 *   apart while both sound. Twin leads are meant to be thirds, fourths and
 *   octaves; anything else between them is heard as one of them being off.
 *
 * A minor seventh is not flagged (it is a normal dominant colour), and the
 * chord's third is not a rub anchor (a 9th or 11th over a power chord is
 * colour, not a clash). It is a report, not a gate: a deliberate rub is
 * allowed, it just has to be on purpose.
 *
 * Pure. `scripts/build-song.ts` prints it after every build.
 */
import { Chord, Note as TonalNote } from "tonal";
import type { Note } from "./composition";
import type { ChordSpan } from "./harmony";
import { COMMON_TIME, beatsPerBar, notationToSeconds, type Meter } from "@utils/timing";
import { pitchToMidi } from "./theory";

/** A chord span that knows which section it belongs to, for the report. */
export interface LabelledSpan extends ChordSpan {
  section?: string;
}

/**
 * A section's `chords` array as beat spans — one entry per bar, an array entry
 * splitting its bar evenly. `startBar` places it in the piece.
 */
export function chordSpans(
  chords: readonly (string | readonly string[])[],
  startBar: number,
  meter: Meter = COMMON_TIME,
  section?: string,
): LabelledSpan[] {
  const bar = beatsPerBar(meter);
  const spans: LabelledSpan[] = [];
  chords.forEach((entry, i) => {
    const parts = typeof entry === "string" ? [entry] : entry;
    parts.forEach((symbol, j) => {
      const start = (startBar + i) * bar + (j * bar) / parts.length;
      spans.push({
        start,
        end: start + bar / parts.length,
        symbol,
        ...(section ? { section } : {}),
      });
    });
  });
  return spans;
}

export interface Clash {
  kind: "rub" | "pair";
  /** Beats from the start of the piece. */
  at: number;
  section?: string;
  chord: string;
  /** The note (or `upper/lower` for a pair) that clashes. */
  pitch: string;
  detail: string;
}

export interface ClashOptions {
  meter?: Meter;
  /** Shortest note worth reporting, in beats. Default 0.5 — an eighth. */
  minBeats?: number;
}

/** Interval classes that read as a wrong note between two lead lines. */
const PAIR_CLASHES = new Set([1, 2, 6, 11]);

/**
 * Every rub in each line, and every pair clash between lines, in time order.
 * `lines` are the parts that carry the tune — a lead and its twin.
 */
export function findClashes(
  spans: readonly LabelledSpan[],
  lines: readonly (readonly Note[])[],
  opts: ClashOptions = {},
): Clash[] {
  const meter = opts.meter ?? COMMON_TIME;
  const minBeats = opts.minBeats ?? 0.5;
  const bar = beatsPerBar(meter);
  const timed = lines.map((notes) =>
    notes.map((n) => {
      const at = beatsOf(String(n.time), bar);
      return {
        at,
        end: at + notationToSeconds(n.duration, 60, meter),
        midi: pitchToMidi(n.pitch),
        pitch: n.pitch,
      };
    }),
  );
  const spanAt = (beat: number) => spans.find((s) => beat >= s.start - 0.02 && beat < s.end - 0.02);
  const clashes: Clash[] = [];

  for (const line of timed) {
    for (const n of line) {
      if (n.end - n.at < minBeats - 1e-6) continue;
      const span = spanAt(n.at);
      if (!span) continue;
      const rubbed = anchorsOf(span.symbol).find(({ chroma }) => {
        const d = (((n.midi - chroma) % 12) + 12) % 12;
        return d === 1 || d === 11;
      });
      // One line per sounding pitch class: a twin an octave under the lead rubs
      // in exactly the same way and is the same fix, not a second clash.
      const echo = clashes.some(
        (c) =>
          c.kind === "rub" &&
          Math.abs(c.at - n.at) < 0.05 &&
          (((pitchToMidi(c.pitch) - n.midi) % 12) + 12) % 12 === 0,
      );
      if (rubbed && !echo) {
        clashes.push({
          kind: "rub",
          at: n.at,
          section: span.section,
          chord: span.symbol,
          pitch: n.pitch,
          detail: `a semitone from the chord's ${rubbed.role} (${rubbed.name})`,
        });
      }
    }
  }

  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length; b++) {
      for (const x of timed[a]!) {
        for (const y of timed[b]!) {
          const overlap = Math.min(x.end, y.end) - Math.max(x.at, y.at);
          if (overlap < minBeats - 1e-6) continue;
          const ic = Math.abs(x.midi - y.midi) % 12;
          if (!PAIR_CLASHES.has(ic)) continue;
          const at = Math.max(x.at, y.at);
          const span = spanAt(at);
          const [hi, lo] = x.midi >= y.midi ? [x, y] : [y, x];
          clashes.push({
            kind: "pair",
            at,
            section: span?.section,
            chord: span?.symbol ?? "?",
            pitch: `${hi.pitch}/${lo.pitch}`,
            detail: `the two lines are ${INTERVAL_NAMES[ic]} apart`,
          });
        }
      }
    }
  }
  return clashes.sort((p, q) => p.at - q.at);
}

/** One line per clash, `section bar:beat  pitch over chord — why`. */
export function formatClash(c: Clash, meter: Meter = COMMON_TIME): string {
  const bar = beatsPerBar(meter);
  const where = `${Math.floor(c.at / bar)}:${+(c.at % bar).toFixed(2)}`;
  return `${(c.section ?? "").padEnd(16)} ${where.padEnd(7)} ${c.pitch} over ${c.chord} — ${c.detail}`;
}

const INTERVAL_NAMES: Record<number, string> = {
  1: "a semitone",
  2: "a whole step",
  6: "a tritone",
  11: "a major seventh",
};

function anchorsOf(symbol: string): { role: string; name: string; chroma: number }[] {
  const notes = Chord.get(symbol).notes;
  if (notes.length === 0) return [];
  const root = TonalNote.chroma(notes[0]!) ?? 0;
  const fifth = notes.find((n) => ((TonalNote.chroma(n) ?? 0) - root + 12) % 12 === 7);
  return [
    { role: "root", name: notes[0]!, chroma: root },
    ...(fifth ? [{ role: "fifth", name: fifth, chroma: TonalNote.chroma(fifth) ?? 0 }] : []),
  ];
}

function beatsOf(time: string, bar: number): number {
  const [b = 0, q = 0, s = 0] = time.split(":").map(Number);
  return b * bar + q + s / 4;
}
