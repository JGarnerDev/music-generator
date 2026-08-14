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
  /** What this sound is for and why it works. The archive is made of these. */
  notes?: string;
  /** Override the instrument's default audition étude. See `./probe`. */
  probe?: string;
  /** Pitched voices. Required for everything except `drums`. */
  synth?: SynthSpec;
  /** Guitar rig. `pluck` and `lead` only. */
  amp?: AmpSpec;
  /** Percussion. `drums` only. */
  kit?: KitSpec;
}

const INSTRUMENTS: ReadonlySet<string> = new Set<string>(INSTRUMENT_NAMES);
const STATUSES: ReadonlySet<string> = new Set<string>(VOICE_STATUSES);
const KINDS: ReadonlySet<string> = new Set<string>(SYNTH_KINDS);

/** Instruments that own a guitar amp. The rest would be ruined by one. */
export const AMPED_INSTRUMENTS = ["pluck", "lead"] as const;
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
  for (const field of ["approvedAt", "forkedFrom", "notes", "probe"] as const) {
    if (v[field] !== undefined && typeof v[field] !== "string") {
      push(field, "must be a string");
    }
  }
  if (v.tags !== undefined && !isStringArray(v.tags)) {
    push("tags", "must be an array of strings");
  }

  const isDrums = instrument === "drums";
  if (isDrums) {
    if (v.synth !== undefined) push("synth", "a drums voice is a kit, not a synth");
    validateKit(v.kit, push);
  } else {
    if (v.kit !== undefined) push("kit", `only a drums voice has a kit, not "${String(instrument)}"`);
    validateSynth(v.synth, push);
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
