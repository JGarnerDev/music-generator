/**
 * Voice presets — the sound of an instrument, as data.
 *
 * A composition says *what* is played; a voice says *what it sounds like*. They
 * are separate files because they change on different clocks: a song is written
 * once and edited a lot, while "our bass tone" is decided once, carefully, and
 * then reused by every song after it. Keeping the tone in `voices/` means it can
 * be auditioned, refined and approved on its own — see [`docs/voices.md`](../../docs/voices.md).
 *
 * The folder is the instrument: `voices/bass/round-thumb.json` is a bass, the
 * same way a composition's kind is its folder. One field can't then disagree
 * with where the file actually lives.
 *
 * This module is the contract only — types plus validation, pure and tested.
 * `src/app/instruments.ts` turns a preset into Tone nodes;
 * [`./voice-library`](./voice-library.ts) organises a folder of them.
 */
import { INSTRUMENT_NAMES, type InstrumentName, type ValidationIssue } from "./composition";

/**
 * Where a voice is in its life. `draft` is being worked on and may change under
 * you; `approved` is one you signed off on and songs can rely on. Refining an
 * approved voice means forking it to a new slug rather than editing it, so a
 * song rendered last month still means what it meant then.
 */
export const VOICE_STATUSES = ["draft", "approved"] as const;
export type VoiceStatus = (typeof VOICE_STATUSES)[number];

/** ADSR, in seconds except `sustain`, which is a level in 0..1. */
export interface EnvelopeSpec {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** The synth's filter envelope — the "a plucked string darkens as it rings" part. */
export interface FilterEnvelopeSpec extends EnvelopeSpec {
  baseFrequency: number;
  octaves: number;
  exponent?: number;
}

/**
 * Which Tone voice class the preset is built on. Deliberately a short list: each
 * one is a different *kind* of sound generator, and adding one is a change to
 * `instruments.ts` as well as to this union.
 */
export const SYNTH_KINDS = ["synth", "fm", "mono"] as const;
export type SynthKind = (typeof SYNTH_KINDS)[number];

export interface SynthSpec {
  kind: SynthKind;
  oscillator: {
    /** Tone oscillator type, e.g. `"triangle"`, `"fatsawtooth"`. */
    type: string;
    /** Oscillators per voice, for the `fat*` types. */
    count?: number;
    /** Detune spread in cents across those oscillators. */
    spread?: number;
  };
  envelope: EnvelopeSpec;
  /** `mono` only: the per-voice filter the filter envelope sweeps. */
  filter?: { type: string; rolloff?: number; Q?: number };
  /** `mono` only. */
  filterEnvelope?: FilterEnvelopeSpec;
  /** `fm` only: modulator/carrier frequency ratio. */
  harmonicity?: number;
  /** `fm` only: how hard the modulator drives the carrier. */
  modulationIndex?: number;
  /**
   * Simultaneous voices. Both a musical cap (a guitar has six strings) and the
   * dominant render cost in a dense part — every allocated voice keeps running
   * whether or not it is sounding. Capped further by the render quality profile.
   */
  maxPolyphony?: number;
}

/**
 * A guitar amp, block by block, in signal order:
 * tighten → sag → preamp → tone stack → power amp → cab → width → slap echo.
 * The order is the instrument; the same blocks rearranged are a different one.
 * `src/app/instruments.ts` documents why each block is where it is.
 */
export interface AmpSpec {
  /** Gain into the preamp — more here is more saturation, not more volume. */
  input: number;
  /** High-pass *before* the drive, so low strings don't intermodulate into mud. */
  tighten: number;
  sag: { threshold: number; ratio: number };
  preamp: number;
  toneStack: { low: number; mid: number; high: number };
  /** Speaker roll-off in Hz. Fizz above the cab is the biggest tell of a fake guitar. */
  cab: number;
  presence: { frequency: number; gain: number };
  /** Haas spread, 0..1. Wide reads as "rhythm"; near-centre reads as "lead". */
  width: number;
  slap: { delayTime: number; wet: number };
  /** Output sum — the voice's level before the track gain says anything. */
  sum: number;
}

/**
 * The three blocks that separate an acoustic instrument from a synth playing the
 * same notes. All optional, all pitched-only, and all of them are *physics the
 * oscillator-plus-filter chain cannot express* rather than extra flavour:
 *
 * - `vibrato` — the pitch of a real note is never still.
 * - `body` — a resonating box has fixed formants that stay put while the note
 *   moves through them. A filter that tracks the note is the opposite of one.
 * - `breath` — bow scrape, reed hiss, the plectrum. Every acoustic onset starts
 *   with something inharmonic.
 *
 * A voice with none of them is unchanged, which is why every preset written
 * before these existed still renders exactly as it did.
 */

/**
 * Pitch movement. `depth` is Tone's 0..1, not cents, because the delay-line
 * modulation it drives is not a clean cents figure — 0.05 is about a violinist's
 * hand, 0.2 is a Leslie.
 *
 * `drift` wanders the depth slowly (0..1 of it, at a fraction of `rate`). A
 * vibrato locked to one rate and one width is a modulation wheel; a player's is
 * never twice the same. Onset delay — vibrato arriving after the note — is
 * deliberately absent: it is per-note, and a `PolySynth` has no per-voice pitch
 * input for an LFO to reach.
 */
export interface VibratoSpec {
  /** Hz. Roughly 4.5–7 for a string player, slower for a wind.  */
  rate: number;
  /** 0..1. */
  depth: number;
  /** 0..1 of `depth` that wanders. Omitted means a dead-steady width. */
  drift?: number;
}

/**
 * One fixed resonance of the instrument's body. Several in series are the box:
 * a violin's air mode near 275 Hz, its main body near 460, the bridge hill up at
 * 2–3 kHz. Frequencies are absolute and never track the note being played —
 * that immobility is exactly what the ear reads as a physical object.
 */
export interface ResonanceSpec {
  frequency: number;
  /** Peaking-filter Q. High and narrow is a strong, small resonator. */
  q: number;
  /** dB. Negative is legal: a body has anti-resonances too. */
  gain: number;
}

/**
 * Re-bowing: the bow reversing several times a second on one written note.
 *
 * This is an *articulation*, not an effect, and it is the one cue no choir, no
 * organ and no pad can imitate — which is exactly why it is here. A held string
 * chord and a held vocal chord differ only in spectrum, and a lo-fi chain erodes
 * spectrum; a tremolando differs in **time**, and nothing erodes that.
 *
 * It is amplitude modulation, so it is deliberately not a gate: `depth` is how
 * much of the signal the bow change removes, and at 1.0 the note stops dead
 * between strokes, which is a machine gun rather than a section. Real re-bowing
 * never reaches zero because the string is still ringing when the bow turns.
 *
 * In a `section` each player re-bows at their own rate, so the strokes never
 * line up — the difference between a shimmer and a tremolo pedal across the
 * whole desk. It sits *before* `body` and `breath` in the chain, which is the
 * modelling and not an ordering convenience: the box is excited by whatever the
 * bow is doing, and the rosin scrape is gated by the instrument's own envelope,
 * so every stroke gets its own scratch. That per-stroke scrape is most of what
 * makes this read as bowing rather than as a volume knob being waggled.
 */
export interface TremoloSpec {
  /** Bow strokes per second. 6–10 is a tremolando; under 4 is a wobble. */
  rate: number;
  /** 0..1 removed at the turn of the bow. 0.4–0.6 is a section; 1.0 is a gate. */
  depth: number;
  /** Stereo phase spread of the modulation, in degrees. Widens a lone player. */
  spread?: number;
}

/**
 * The noise in the sound. Bandpassed, then gated by the instrument's own
 * amplitude via an envelope follower — so it arrives with the note, tracks how
 * hard it was played, and stops when the note does, without needing to know
 * anything about note events.
 */
export interface BreathSpec {
  /** How much of it there is, relative to the instrument. 0.02–0.15 is plenty. */
  level: number;
  /** Bandpass centre. Bow scrape lives high (3–6 kHz); a reed sits lower. */
  hz: number;
  /** Bandpass Q. Wide is air, narrow is a whistle. */
  q?: number;
  /** Follower response in seconds. Short tracks the attack; long is a swell. */
  attack?: number;
  /** Follower release in seconds. */
  release?: number;
}

/**
 * Many players on one line — a section rather than a soloist.
 *
 * A section is not a solo voice turned up, and it is not a detuned oscillator
 * stack either. What the ear uses to count players is **decorrelation**: every
 * player has their own intonation, their own vibrato hand, their own instant of
 * attack, their own box, and their own seat. A `fat` oscillator gives one player
 * several pitches with a single envelope, a single vibrato phase and a single
 * onset, which is why every unison-detune string patch sounds like one large
 * synthesiser instead of sixteen small violins.
 *
 * So this block builds `players` copies of the *whole* voice — synth, vibrato,
 * body, breath — each one varied, and sums them. The cost is linear: eight
 * players is eight times the polyphony, which is the dominant render cost per
 * `quality.ts`. That is the honest price of the effect, and rendering is offline
 * with no deadline to miss. `src/engine/section.ts` decides who differs by how
 * much; `src/app/instruments.ts` builds the nodes.
 *
 * Because every player is a real detuned instrument, the per-player oscillator
 * should be a plain waveform rather than a `fat` one — the spread is already
 * there, and paying for it twice is only expensive.
 */
export interface SectionSpec {
  /** How many players. 3 already reads as a section; past 8 you are buying render time. */
  players: number;
  /** Total intonation spread in cents, distributed across the desk. 6–20 is a section; 40 is out of tune. */
  detune: number;
  /**
   * Seconds of attack smear. Nobody plays *early* — the written time is the
   * first player in, and the rest arrive inside this window, which is what makes
   * a section's onset soft without a slower envelope.
   */
  timing: number;
  /** Stereo width of the seating, 0..1. 0 is a section recorded in mono. */
  seats?: number;
  /** How much each player's body resonances differ, 0..1 of their frequency. Two violins are not the same box. */
  bodyVary?: number;
  /**
   * How much the players' *periodic gestures* differ, 0..1 — vibrato rate and
   * depth, and the tremolo stroke rate. One knob for both because they are one
   * fact about a desk: hands are not synchronised. Two identical rates beat
   * against each other at a fixed audible period, which is a chorus pedal for
   * vibrato and a tremolo pedal for bowing.
   */
  vibratoVary?: number;
  /** How much bow effort differs between players, 0..1 of velocity. */
  effortVary?: number;
}

/** One drum piece's level, relative to the rest of the kit. */
export type KitLevels = Record<string, number>;

/**
 * The kit, as data. Membrane pieces are pitched thumps (tuning is what separates
 * a kick from a floor tom); noise pieces are filtered bursts where cutoff plus
 * decay is the whole character.
 */
export interface MembranePiece {
  pitch: string;
  decay: number;
  /** How fast the pitch sweep collapses. Short = click, long = boom. */
  pitchDecay?: number;
  /** Octaves the sweep falls through. */
  octaves?: number;
}

export interface NoisePiece {
  /** Bandpass centre. A snare needs body as much as snap, so this is not a high-pass. */
  hz: number;
  decay: number;
  type: "white" | "pink";
  /** Bandpass Q — narrow reads as tuned/metallic, wide as a splash. */
  q?: number;
}

export interface KitSpec {
  levels: KitLevels;
  membrane: Record<string, MembranePiece>;
  noise: Record<string, NoisePiece>;
  /**
   * The tone layered under the snare's rattle — a burst on its own is a hi-hat
   * pitched down. `level` multiplies the snare's own level, so moving the snare
   * in the mix takes its body with it.
   */
  snareBody?: MembranePiece & { level: number };
}

export interface VoicePreset {
  instrument: InstrumentName;
  /** kebab-case id, unique within the instrument. Matches the filename. */
  slug: string;
  title: string;
  status: VoiceStatus;
  /** The voice a track gets when it names none. At most one per instrument. */
  default?: boolean;
  /** ISO date stamped by `npm run voice:approve`. */
  approvedAt?: string;
  /** `<instrument>/<slug>` this was forked from, so a lineage is readable. */
  forkedFrom?: string;
  /** Free-form labels — what it's for, what it sounds like. */
  tags?: string[];
  /**
   * One line: when would I pick this over its neighbours. The archive is made
   * of these, so it stays a table you can read in one screen.
   *
   * Capped at {@link SUMMARY_MAX} on purpose — see `notes` for why the two
   * fields exist.
   */
  summary?: string;
  /**
   * Why this sound is built the way it is: which numbers matter and what
   * happens either side of them.
   *
   * **Deliberately not in the archive.** This is the fork brief — you want it
   * for the one voice you are about to fork, and never for the other forty,
   * whereas `summary` is what every song needs from every voice. Keeping both
   * in the index made choosing a sound cost as much as designing one.
   */
  notes?: string;
  /** Override the instrument's default audition étude. See `./probe`. */
  probe?: string;
  /** Pitched voices. Required for everything except `drums`. */
  synth?: SynthSpec;
  /** Pitch movement. Pitched instruments only. */
  vibrato?: VibratoSpec;
  /** Fixed body resonances, in series. Pitched instruments only. */
  body?: ResonanceSpec[];
  /** Follower-gated noise. Pitched instruments only. */
  breath?: BreathSpec;
  /** Re-bowing. Pitched instruments only. */
  tremolo?: TremoloSpec;
  /** Many players instead of one. Pitched instruments only; multiplies render cost. */
  section?: SectionSpec;
  /** Guitar rig. `pluck` and `lead` only. */
  amp?: AmpSpec;
  /** Percussion. `drums` only. */
  kit?: KitSpec;
}

/**
 * How long a voice's `summary` may be — one table cell, not a paragraph.
 *
 * 140 is enough for "what it is, and when to pick it over the one next to it"
 * and not enough for "and here is why the detune is 22 cents".
 */
export const SUMMARY_MAX = 140;

const INSTRUMENTS: ReadonlySet<string> = new Set<string>(INSTRUMENT_NAMES);
const STATUSES: ReadonlySet<string> = new Set<string>(VOICE_STATUSES);
const KINDS: ReadonlySet<string> = new Set<string>(SYNTH_KINDS);

/**
 * Instruments that own a guitar amp. The rest would be ruined by one.
 *
 * `bass` is on the list because a fuzz bass is not a bass with a distortion
 * knob — it is a bass played through a guitar rig, which is a different chain
 * (drive before the tone stack, a speaker roll-off, a cab bump) and not
 * something a filter envelope can imitate. A bass preset with no `amp` block is
 * still a plain synth bass, so nothing that existed before this changed.
 */
export const AMPED_INSTRUMENTS = ["pluck", "lead", "bass"] as const;
const AMPED: ReadonlySet<string> = new Set<string>(AMPED_INSTRUMENTS);

export function isAmped(instrument: InstrumentName): boolean {
  return AMPED.has(instrument);
}

/**
 * Structural validation for a preset parsed from untrusted JSON. Same shape as
 * `validateComposition`: a list of issues, empty meaning valid.
 *
 * The checks that matter are the cross-field ones — a `drums` voice with a
 * `synth` block, or a piano with an `amp` — because those are silent at render
 * time (the block is simply ignored) and silence is the bug an ear can't place.
 */
export function validateVoice(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (typeof input !== "object" || input === null) {
    push("$", "voice must be an object");
    return issues;
  }
  const v = input as Record<string, unknown>;

  const instrument = v.instrument;
  if (!INSTRUMENTS.has(instrument as string)) {
    push("instrument", `unknown instrument "${String(instrument)}"`);
  }
  if (typeof v.slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) {
    push("slug", "must be kebab-case, e.g. \"round-thumb\"");
  }
  if (typeof v.title !== "string" || v.title.trim() === "") {
    push("title", "must be a non-empty string");
  }
  if (!STATUSES.has(v.status as string)) {
    push("status", `must be one of: ${VOICE_STATUSES.join(", ")}`);
  }
  for (const field of ["default"] as const) {
    if (v[field] !== undefined && typeof v[field] !== "boolean") {
      push(field, "must be a boolean");
    }
  }
  for (const field of ["approvedAt", "forkedFrom", "notes", "probe", "summary"] as const) {
    if (v[field] !== undefined && typeof v[field] !== "string") {
      push(field, "must be a string");
    }
  }
  if (typeof v.summary === "string") {
    // The cap is the feature. Without it `summary` becomes a second `notes`
    // within a year and the archive is 50 kB again — a one-row-per-voice index
    // only stays cheap if a row cannot grow.
    if (v.summary.length > SUMMARY_MAX) {
      push("summary", `must be ${SUMMARY_MAX} characters or fewer (got ${v.summary.length}) — the long version belongs in notes`);
    }
    if (/[\r\n]/.test(v.summary)) push("summary", "must be a single line — it is a table cell");
  }
  if (v.tags !== undefined && !isStringArray(v.tags)) {
    push("tags", "must be an array of strings");
  }

  const isDrums = instrument === "drums";
  if (isDrums) {
    if (v.synth !== undefined) push("synth", "a drums voice is a kit, not a synth");
    validateKit(v.kit, push);
    // A kit is a set of one-shots with no pitch to move and no note long enough
    // to breathe, so these blocks would be built and never heard.
    for (const field of ["vibrato", "body", "breath", "tremolo", "section"] as const) {
      if (v[field] !== undefined) push(field, `a drums voice has no ${field}`);
    }
  } else {
    if (v.kit !== undefined) push("kit", `only a drums voice has a kit, not "${String(instrument)}"`);
    validateSynth(v.synth, push);
    if (v.vibrato !== undefined) validateVibrato(v.vibrato, push);
    if (v.body !== undefined) validateBody(v.body, push);
    if (v.breath !== undefined) validateBreath(v.breath, push);
    if (v.tremolo !== undefined) validateTremolo(v.tremolo, push);
    if (v.section !== undefined) validateSection(v.section, push);
  }

  if (v.amp !== undefined && !AMPED.has(instrument as string)) {
    push("amp", `only ${AMPED_INSTRUMENTS.join("/")} run through an amp`);
  }
  if (v.amp !== undefined) validateAmp(v.amp, push);

  return issues;
}

type Push = (path: string, message: string) => void;

function validateSynth(synth: unknown, push: Push): void {
  if (typeof synth !== "object" || synth === null) {
    push("synth", "must be an object");
    return;
  }
  const s = synth as Record<string, unknown>;
  if (!KINDS.has(s.kind as string)) {
    push("synth.kind", `must be one of: ${SYNTH_KINDS.join(", ")}`);
  }
  const osc = s.oscillator as Record<string, unknown> | undefined;
  if (typeof osc !== "object" || osc === null || typeof osc.type !== "string") {
    push("synth.oscillator.type", "must be a string, e.g. \"fatsawtooth\"");
  } else {
    for (const field of ["count", "spread"] as const) {
      if (osc[field] !== undefined && !isFinitePositive(osc[field], true)) {
        push(`synth.oscillator.${field}`, "must be a non-negative number");
      }
    }
  }
  validateEnvelope(s.envelope, "synth.envelope", push);
  if (s.filterEnvelope !== undefined) {
    validateEnvelope(s.filterEnvelope, "synth.filterEnvelope", push);
    const fe = s.filterEnvelope as Record<string, unknown>;
    if (!isFinitePositive(fe.baseFrequency)) {
      push("synth.filterEnvelope.baseFrequency", "must be a positive number");
    }
    if (!isFinitePositive(fe.octaves)) {
      push("synth.filterEnvelope.octaves", "must be a positive number");
    }
  }
  if (s.maxPolyphony !== undefined && !isFinitePositive(s.maxPolyphony)) {
    push("synth.maxPolyphony", "must be a positive number");
  }
}

function validateEnvelope(envelope: unknown, path: string, push: Push): void {
  if (typeof envelope !== "object" || envelope === null) {
    push(path, "must be an object with attack/decay/sustain/release");
    return;
  }
  const e = envelope as Record<string, unknown>;
  for (const stage of ["attack", "decay", "sustain", "release"] as const) {
    if (!isFinitePositive(e[stage], true)) push(`${path}.${stage}`, "must be a non-negative number");
  }
  if (typeof e.sustain === "number" && e.sustain > 1) {
    push(`${path}.sustain`, "is a level in 0..1, not a time");
  }
}

function validateVibrato(vibrato: unknown, push: Push): void {
  if (typeof vibrato !== "object" || vibrato === null) {
    push("vibrato", "must be an object with rate/depth");
    return;
  }
  const v = vibrato as Record<string, unknown>;
  if (!isFinitePositive(v.rate)) push("vibrato.rate", "must be a positive number of Hz");
  if (!isFinitePositive(v.depth, true)) push("vibrato.depth", "must be a non-negative number");
  // Tone reads depth as 0..1 of its delay line; a cents value handed to it
  // straight is silent nonsense rather than an error, which is the worst kind.
  if (typeof v.depth === "number" && v.depth > 1) {
    push("vibrato.depth", "is a 0..1 amount, not cents");
  }
  if (v.drift !== undefined) {
    if (!isFinitePositive(v.drift, true) || (v.drift as number) > 1) {
      push("vibrato.drift", "must be a number in 0..1");
    }
  }
}

/** Four resonators is already a box; past that it is an EQ curve drawn by hand. */
const MAX_RESONANCES = 4;

function validateBody(body: unknown, push: Push): void {
  if (!Array.isArray(body)) {
    push("body", "must be an array of resonances");
    return;
  }
  if (body.length === 0) push("body", "must have at least one resonance, or be omitted");
  if (body.length > MAX_RESONANCES) {
    push("body", `at most ${MAX_RESONANCES} resonances — more is an EQ, not a body`);
  }
  body.forEach((resonance, i) => {
    if (typeof resonance !== "object" || resonance === null) {
      push(`body[${i}]`, "must be an object with frequency/q/gain");
      return;
    }
    const r = resonance as Record<string, unknown>;
    if (!isFinitePositive(r.frequency)) push(`body[${i}].frequency`, "must be a positive number of Hz");
    if (!isFinitePositive(r.q)) push(`body[${i}].q`, "must be a positive number");
    // Gain is the one field that is legitimately negative: a body has notches.
    if (typeof r.gain !== "number" || !Number.isFinite(r.gain)) {
      push(`body[${i}].gain`, "must be a number of dB");
    }
  });
}

function validateBreath(breath: unknown, push: Push): void {
  if (typeof breath !== "object" || breath === null) {
    push("breath", "must be an object with level/hz");
    return;
  }
  const b = breath as Record<string, unknown>;
  if (!isFinitePositive(b.level, true)) push("breath.level", "must be a non-negative number");
  if (typeof b.level === "number" && b.level > 1) {
    push("breath.level", "is a level in 0..1 — noise louder than the instrument is not an instrument");
  }
  if (!isFinitePositive(b.hz)) push("breath.hz", "must be a positive number of Hz");
  for (const field of ["q", "attack", "release"] as const) {
    if (b[field] !== undefined && !isFinitePositive(b[field])) {
      push(`breath.${field}`, "must be a positive number");
    }
  }
}

/** Hz. Under this it is a wobble; over it the strokes fuse into a buzz pitch. */
const MIN_TREMOLO_RATE = 2;
const MAX_TREMOLO_RATE = 16;

function validateTremolo(tremolo: unknown, push: Push): void {
  if (typeof tremolo !== "object" || tremolo === null) {
    push("tremolo", "must be an object with rate/depth");
    return;
  }
  const t = tremolo as Record<string, unknown>;
  if (
    !isFinitePositive(t.rate) ||
    (t.rate as number) < MIN_TREMOLO_RATE ||
    (t.rate as number) > MAX_TREMOLO_RATE
  ) {
    push("tremolo.rate", `must be ${MIN_TREMOLO_RATE}–${MAX_TREMOLO_RATE} strokes per second`);
  }
  if (!isFinitePositive(t.depth, true) || (t.depth as number) > 1) {
    push("tremolo.depth", "is an amount in 0..1, not a percentage");
  }
  if (t.spread !== undefined && (!isFinitePositive(t.spread, true) || (t.spread as number) > 180)) {
    push("tremolo.spread", "must be a stereo phase spread in degrees, 0–180");
  }
}

/**
 * Two players is a duet, and the cost is linear in players — past eight you are
 * paying render minutes for a difference the ear stopped counting at about five.
 */
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
/** Cents. A section is players who agree; past this they are players who don't. */
const MAX_DETUNE = 50;
/** Seconds. Beyond this the smear stops being an onset and starts being a flam. */
const MAX_TIMING = 0.15;

function validateSection(section: unknown, push: Push): void {
  if (typeof section !== "object" || section === null) {
    push("section", "must be an object with players/detune/timing");
    return;
  }
  const s = section as Record<string, unknown>;
  if (!Number.isInteger(s.players) || (s.players as number) < MIN_PLAYERS || (s.players as number) > MAX_PLAYERS) {
    push("section.players", `must be a whole number of players, ${MIN_PLAYERS}–${MAX_PLAYERS}`);
  }
  if (!isFinitePositive(s.detune, true) || (s.detune as number) > MAX_DETUNE) {
    push("section.detune", `must be a spread in cents, 0–${MAX_DETUNE}`);
  }
  if (!isFinitePositive(s.timing, true) || (s.timing as number) > MAX_TIMING) {
    push("section.timing", `must be a smear in seconds, 0–${MAX_TIMING}`);
  }
  // All the variation amounts are fractions of something else, so a value above
  // 1 is a unit mix-up (cents, Hz, percent) rather than an extreme setting.
  for (const field of ["seats", "bodyVary", "vibratoVary", "effortVary"] as const) {
    if (s[field] === undefined) continue;
    if (!isFinitePositive(s[field], true) || (s[field] as number) > 1) {
      push(`section.${field}`, "must be an amount in 0..1");
    }
  }
}

function validateAmp(amp: unknown, push: Push): void {
  if (typeof amp !== "object" || amp === null) {
    push("amp", "must be an object");
    return;
  }
  const a = amp as Record<string, unknown>;
  for (const field of ["input", "tighten", "preamp", "cab", "width", "sum"] as const) {
    if (!isFinitePositive(a[field], true)) push(`amp.${field}`, "must be a non-negative number");
  }
  if (typeof a.width === "number" && a.width > 1) {
    push("amp.width", "is a stereo spread in 0..1");
  }
  for (const [field, keys] of [
    ["sag", ["threshold", "ratio"]],
    ["toneStack", ["low", "mid", "high"]],
    ["presence", ["frequency", "gain"]],
    ["slap", ["delayTime", "wet"]],
  ] as const) {
    const block = a[field] as Record<string, unknown> | undefined;
    if (typeof block !== "object" || block === null) {
      push(`amp.${field}`, `must be an object with ${keys.join("/")}`);
      continue;
    }
    for (const key of keys) {
      if (typeof block[key] !== "number" || !Number.isFinite(block[key])) {
        push(`amp.${field}.${key}`, "must be a number");
      }
    }
  }
}

function validateKit(kit: unknown, push: Push): void {
  if (typeof kit !== "object" || kit === null) {
    push("kit", "must be an object");
    return;
  }
  const k = kit as Record<string, unknown>;
  const levels = k.levels as Record<string, unknown> | undefined;
  if (typeof levels !== "object" || levels === null) {
    push("kit.levels", "must be an object of piece → level");
    return;
  }
  for (const [piece, level] of Object.entries(levels)) {
    if (!isFinitePositive(level, true)) push(`kit.levels.${piece}`, "must be a non-negative number");
  }
  // A piece that is voiced but has no level (or the reverse) is silent or
  // unbalanced with nothing in the render to say so.
  for (const field of ["membrane", "noise"] as const) {
    const block = k[field] as Record<string, unknown> | undefined;
    if (typeof block !== "object" || block === null) {
      push(`kit.${field}`, "must be an object of piece → voicing");
      continue;
    }
    for (const piece of Object.keys(block)) {
      if (!(piece in levels)) push(`kit.${field}.${piece}`, `has no kit.levels.${piece}`);
    }
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFinitePositive(value: unknown, allowZero = false): value is number {
  return typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
}
