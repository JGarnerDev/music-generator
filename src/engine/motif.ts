/**
 * Quoting a leitmotif — taking a theme written once and playing it inside
 * another piece, in that piece's key, at that piece's tempo, at a chosen bar.
 *
 * `docs/library.md` promises "written once, quoted wherever the character shows
 * up", and until this existed the `motifs:` field delivered only half of that: a
 * link that answered *where does this theme appear* but never actually put the
 * theme anywhere. A label, in other words. This is the other half.
 *
 * Quoting is transposition plus placement, and both are less obvious than they
 * look:
 *
 * - **Transposition is by interval, not by pitch class.** Moving every note to
 *   the new tonic's octave would flatten the tune's contour into one octave.
 *   The motif's own tonic is read from its `key`, the host's from its, and the
 *   whole theme moves by the distance between them — so the shape survives.
 * - **Time is relative to the quote, not to the motif's own timeline.** A motif
 *   written at bar 0 quoted at bar 24 has to have every note moved 24 bars, and
 *   in the *host's* meter, which need not be the one it was written in.
 *
 * What this deliberately does **not** do is transplant the motif's harmony or
 * its instrument. A quote is a melody recognised over whatever is already
 * playing; splicing in the original's pad is copying the piece, not quoting the
 * theme.
 *
 * Pure and deterministic → unit tested.
 */
import type { Composition, Note, Track } from "./composition";
import { pitchToMidi, transpose } from "./theory";
import { COMMON_TIME, stepsPerBar, type Meter } from "@utils/timing";

export interface QuoteOptions {
  /** Bar of the host piece the quote begins on. */
  atBar: number;
  /**
   * Key of the host piece, `"D minor"` or just `"D"` — the motif is moved by
   * the interval between its own tonic and this one.
   */
  key: string;
  /** The host's time signature, which the quoted bars are placed in. Default 4/4. */
  meter?: Meter;
  /**
   * Semitones to shift on top of the key change. `-12` quotes the theme an
   * octave down, which is the classic way to say the same thing more darkly.
   */
  octaveShift?: number;
  /**
   * Scale every quoted velocity. A quote usually sits *under* the host's own
   * material — it is a reference, not the tune. Default 0.8.
   */
  intensity?: number;
  /**
   * Which tracks of the motif to take. Defaults to the ones carrying the tune —
   * see `carriesTheTune`.
   */
  tracks?: (track: Track) => boolean;
}

export class MotifError extends Error {}

/**
 * The tracks that are the *theme* rather than the arrangement around it.
 *
 * `drums`, `bass` and `pad` are accompaniment by role in this repo: the kit, the
 * bottom and the sustained harmony bed. Quoting them doesn't quote the idea, it
 * copies the original's staging on top of a piece that already has its own —
 * two basses, two pads, and a theme no more recognisable for it.
 */
const ACCOMPANIMENT = new Set(["drums", "bass", "pad"]);

export function carriesTheTune(track: Track): boolean {
  return !ACCOMPANIMENT.has(track.instrument);
}

/**
 * The theme, moved into a host piece's key and onto a host piece's timeline.
 *
 * Returns tracks rather than notes because a motif may be more than one voice
 * (a tune and its counter-line), and flattening them would put two independent
 * melodies on one instrument.
 */
export function quoteMotif(motif: Composition, opts: QuoteOptions): Track[] {
  const {
    atBar,
    key,
    meter = COMMON_TIME,
    octaveShift = 0,
    intensity = 0.8,
    tracks = carriesTheTune,
  } = opts;
  if (!Number.isInteger(atBar) || atBar < 0) {
    throw new MotifError(`quote bar must be a non-negative integer, got ${atBar}`);
  }

  const semitones = intervalBetween(tonicOf(motif.key), tonicOf(key)) + octaveShift;
  const perBar = stepsPerBar(meter);
  const sourcePerBar = stepsPerBar(motif.meter ?? COMMON_TIME);

  // A theme written entirely on a pad is still a theme; falling back to every
  // pitched track keeps the filter a default rather than a rule.
  const chosen = motif.tracks.filter(tracks);
  const source = chosen.length > 0 ? chosen : motif.tracks.filter((t) => t.instrument !== "drums");

  return source.map((track) => ({
    ...track,
    notes: track.notes.map((note) => quoteNote(note, semitones, atBar, sourcePerBar, perBar, intensity)),
  }));
}

function quoteNote(
  note: Note,
  semitones: number,
  atBar: number,
  sourcePerBar: number,
  perBar: number,
  intensity: number,
): Note {
  // Read in the motif's meter and written in the host's, so a theme written in
  // 3/4 quoted into a 4/4 piece keeps its rhythm rather than its bar lines.
  const at = atBar * perBar + toSixteenths(note.time, sourcePerBar);
  return {
    ...note,
    time: fromSixteenths(at, perBar),
    pitch: transpose(note.pitch, semitones),
    velocity: round(Math.max(0.02, Math.min(1, (note.velocity ?? 0.7) * intensity)), 3),
  };
}

/**
 * The tonic of a `key` string: `"D minor"` → `"D"`, `"Bb phrygian-dominant"` →
 * `"Bb"`. Only the tonic matters here — a quote moves by interval, and the mode
 * is the host's business.
 */
export function tonicOf(key: string): string {
  const tonic = key.trim().split(/\s+/)[0];
  if (!tonic) throw new MotifError(`key has no tonic: "${key}"`);
  return tonic;
}

/**
 * Semitones from one tonic to another, taking the **shorter way round**.
 *
 * A to G is two semitones down rather than ten up: quoting a theme should move
 * it as little as possible, because a motif dragged up nine semitones to reach a
 * key a minor third below is no longer in the register it was written for.
 */
function intervalBetween(from: string, to: string): number {
  const a = pitchToMidi(`${from}4`);
  const b = pitchToMidi(`${to}4`);
  const raw = (b - a) % 12;
  const up = (raw + 12) % 12;
  return up > 6 ? up - 12 : up;
}

/** "bar:beat:sixteenth" → absolute sixteenths. */
function toSixteenths(time: string, perBar: number): number {
  const [bar = "0", beat = "0", sixteenth = "0"] = time.split(":");
  return Number(bar) * perBar + Number(beat) * 4 + Number(sixteenth);
}

function fromSixteenths(at: number, perBar: number): string {
  const bar = Math.floor(at / perBar);
  const withinBar = at - bar * perBar;
  const beat = Math.floor(withinBar / 4);
  return `${bar}:${beat}:${round(withinBar - beat * 4, 4)}`;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
