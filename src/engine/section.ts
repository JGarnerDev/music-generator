/**
 * Who sits where, and who is slightly wrong — the desk plan for a `section`
 * voice.
 *
 * A section reads as many players because no two of them agree, so this module's
 * whole job is deciding *how* they disagree. It is pure and seeded from the
 * voice's own slug: the same voice always produces the same desk, which is what
 * lets a render be repeated and a plan be tested. `src/app/instruments.ts` turns
 * one of these plans into one player's worth of Tone nodes.
 *
 * The shape of the disagreement matters more than its size:
 *
 * - **Intonation is spread, then shuffled.** Players are dealt an even spread of
 *   detunings across the section's range and then reseated at random. Dealing
 *   them in order would put the flat players on one side of the stereo image and
 *   the sharp players on the other, which is not a section — it is a pitch ramp
 *   across the room, and once heard it cannot be unheard.
 * - **Nobody plays early.** The written time is the first player in and everyone
 *   else arrives inside `timing`. Smearing symmetrically around the beat would
 *   drag the section behind the drums by half the window, which reads as a slow
 *   section rather than a wide one.
 * - **Everything else is multiplicative jitter** on the soloist's own numbers,
 *   so a section forked from a good solo voice keeps that voice's character and
 *   only loses its singularity.
 */
import { makeRng, seedFromString } from "@utils/random";
import type { ResonanceSpec, SectionSpec, TremoloSpec, VibratoSpec, VoicePreset } from "./voice";

/** One player's departure from the written part. */
export interface PlayerPlan {
  /** Cents off the written pitch. */
  detune: number;
  /** Seconds after the written time that this player's attack lands. Never negative. */
  delay: number;
  /** Seat, -1 (hard left) to 1 (hard right). */
  pan: number;
  /** Velocity multiplier, ≤ 1 — how hard this player is leaning on it. */
  effort: number;
  /** This player's hand. Absent when the voice has no vibrato at all. */
  vibrato?: VibratoSpec;
  /** This player's bowing arm. Absent when the voice is not tremolando. */
  tremolo?: TremoloSpec;
  /** This player's instrument. Absent when the voice has no body. */
  body?: ResonanceSpec[];
}

const DEFAULTS = {
  seats: 0.6,
  bodyVary: 0.02,
  vibratoVary: 0.12,
  effortVary: 0.1,
} as const;

/**
 * The desk, in seating order: player 0 is on the left, the last is on the right.
 *
 * Seeded from `<instrument>/<slug>` rather than from a random source so that a
 * voice's section is a property of the voice. Re-rendering a piece after an
 * unrelated edit must not quietly reshuffle who was sharp.
 */
export function planSection(preset: VoicePreset): PlayerPlan[] {
  const spec = preset.section;
  if (!spec) return [];
  const rng = makeRng(seedFromString(`${preset.instrument}/${preset.slug}`));
  const n = spec.players;

  const detunings = shuffle(rng, spreadEvenly(n, spec.detune));

  return Array.from({ length: n }, (_, i) => ({
    detune: detunings[i]!,
    // Player 0 is exactly on time so the section has a defined leading edge.
    delay: i === 0 ? 0 : rng() * spec.timing,
    pan: seat(i, n, spec.seats ?? DEFAULTS.seats),
    // Effort only ever reduces: velocity is already the part's dynamic, and a
    // player who is louder than written is a player the mix has to fight.
    effort: 1 - rng() * (spec.effortVary ?? DEFAULTS.effortVary),
    vibrato: preset.vibrato ? varyVibrato(rng, preset.vibrato, spec) : undefined,
    tremolo: preset.tremolo ? varyTremolo(rng, preset.tremolo, spec) : undefined,
    body: preset.body?.length ? varyBody(rng, preset.body, spec) : undefined,
  }));
}

/**
 * `n` values spanning ±`total`/2, evenly. Even rather than random because a
 * random draw clumps: three players landing on nearly the same cents figure
 * sound like one player three times as loud, and the whole point of the spread
 * is that no two pitches coincide.
 */
function spreadEvenly(n: number, total: number): number[] {
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => (i / (n - 1) - 0.5) * total);
}

/** Fisher–Yates, so that seat order carries no information about pitch. */
function shuffle(rng: () => number, items: number[]): number[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Seats spread symmetrically across the stage; one player sits in the middle. */
function seat(i: number, n: number, width: number): number {
  if (n === 1) return 0;
  return (i / (n - 1) - 0.5) * 2 * width;
}

/**
 * This player's hand. Rate varies most: two vibratos at the same rate beat
 * against each other at a fixed, audible period no matter how their depths
 * differ, and that beating is the sound of a chorus pedal rather than a section.
 * Depth varies half as much, because a player with a visibly wider vibrato than
 * the rest steps out of the section and becomes a soloist.
 */
function varyVibrato(rng: () => number, base: VibratoSpec, spec: SectionSpec): VibratoSpec {
  const amount = spec.vibratoVary ?? DEFAULTS.vibratoVary;
  return {
    rate: base.rate * (1 + symmetric(rng) * amount),
    depth: base.depth * (1 + symmetric(rng) * amount * 0.5),
    drift: base.drift,
  };
}

/**
 * This player's bowing arm. Rate is the only thing that varies, and it has to:
 * five players re-bowing at exactly 7.5 Hz is one enormous tremolo pedal across
 * the section, and the strokes landing together is precisely the artefact a
 * tremolando has to avoid. Depth is left alone because it is an instruction from
 * the score — how far the bow lifts is what "tremolando" *means*, and a player
 * doing it half as deep as the rest is a player not doing it.
 *
 * The variation is doubled relative to vibrato. Vibrato rates are a physical
 * constant of the hand and cluster tightly; bow-stroke rates are only a shared
 * intention, and a real desk spreads much further around it.
 */
function varyTremolo(rng: () => number, base: TremoloSpec, spec: SectionSpec): TremoloSpec {
  const amount = (spec.vibratoVary ?? DEFAULTS.vibratoVary) * 2;
  return { ...base, rate: base.rate * (1 + symmetric(rng) * amount) };
}

/**
 * This player's instrument. Only the resonant frequencies move: Q and gain are
 * how a violin is built, and two violins are the same design in different
 * pieces of wood. Small numbers do the work here — 2% is a couple of semitones
 * of body-mode scatter, which is roughly the real spread across a shelf of
 * instruments and is enough to stop the section's formants stacking into one
 * enormous resonance.
 */
function varyBody(rng: () => number, base: ResonanceSpec[], spec: SectionSpec): ResonanceSpec[] {
  const amount = spec.bodyVary ?? DEFAULTS.bodyVary;
  return base.map((resonance) => ({
    ...resonance,
    frequency: resonance.frequency * (1 + symmetric(rng) * amount),
  }));
}

/** A draw in -1..1. */
function symmetric(rng: () => number): number {
  return rng() * 2 - 1;
}

/**
 * Level compensation for summing `n` players.
 *
 * They are decorrelated — different pitches, different onsets, different
 * vibratos — so they sum by *power*, not by amplitude: √n, not n. Dividing by n
 * would leave a section quieter than the soloist it was forked from, and the
 * whole library's gain staging is relative to voices that already sound right.
 */
export function sectionGain(players: number): number {
  return 1 / Math.sqrt(players);
}
