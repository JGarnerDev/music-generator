/**
 * Do two voices of the same instrument actually sound like different things?
 *
 * `docs/voices.md` states the rule this module enforces: **two voices separated
 * only by EQ will converge.** `pad/string-bed` and `pad/mens-choir` were built
 * that way and were not tellable apart — not because the difference was small,
 * but because bandwidth is the *first* thing the lo-fi chain takes away, so a
 * few dB of `body` is gone by the time anybody hears it. A difference that
 * survives the chain has to live somewhere the chain does not reach: in **time**
 * (envelopes, tremolo, decays), in **pitch** (oscillator, tuning, vibrato), or
 * in a **second sound source** (breath, section, the kit's noise/membrane split).
 *
 * Two things have to be true for a difference to count, and the second one is
 * the one that is easy to forget:
 *
 * 1. It has to be on an axis the chain does not erode.
 * 2. **It has to be big enough to hear.** A fork changes forty numbers, and a
 *    check that counts `sustain: 0.9 → 0.85` as a separation will report every
 *    pair as distinct and therefore report nothing at all. The first version of
 *    this module did exactly that, and cleared `string-bed`/`mens-choir` — the
 *    pair the doc names as the failure case.
 *
 * So each axis carries a *kind*, and numeric kinds carry a threshold. The
 * thresholds are perceptual rather than statistical: time and frequency are
 * judged by **ratio**, because hearing is logarithmic in both — 20 ms against 30
 * is the same size of change as 200 ms against 300 — and pitch is judged in
 * semitones. They are round numbers chosen to be roughly a just-noticeable
 * difference in a mix, not measured constants, and they are deliberately
 * generous: this exists to shorten the audition list, and a pair it clears
 * wrongly is worse than a pair it flags wrongly.
 *
 * Pure and tested. `scripts/check-voices.ts` is the CLI over it.
 */
import { pitchToMidi } from "./theory";
import type { VoicePreset } from "./voice";

/**
 * How a difference on one axis is judged.
 *
 * - `categorical` — a different *kind* of thing (a saw against a triangle, a
 *   `tremolo` block against none). Any difference at all counts.
 * - `ratio` — a quantity heard logarithmically: seconds, hertz, rates, levels.
 *   Counts once the larger is `RATIO_JND`× the smaller.
 * - `pitch` — a scientific pitch string. Counts at `PITCH_JND` semitones.
 * - `weak` — spectral. The lo-fi chain erodes it, so it never counts on its own
 *   however large it is.
 * - `ignored` — not a property of the sound at all (render budget, prose).
 */
export type AxisKind = "categorical" | "ratio" | "pitch" | "weak" | "ignored";

/**
 * The larger value must be this multiple of the smaller. 1.5 is about where a
 * change in an envelope time or a filter corner stops being a nuance and starts
 * being a different articulation.
 */
export const RATIO_JND = 1.5;

/** Semitones two tuned drums must differ by before they are different drums. */
export const PITCH_JND = 3;

/**
 * Below this, a `ratio` difference is discounted whatever the ratio says. 2 ms
 * against 4 ms is a doubling and is inaudible; without a floor every attack time
 * in the archive would read as a separation.
 */
export const ABSOLUTE_FLOOR = 0.004;

/** One field the two presets disagree about, and whether the disagreement counts. */
export interface AxisDifference {
  /** Dotted path into the preset, e.g. `synth.envelope.decay` or `kit.levels.kick`. */
  axis: string;
  kind: AxisKind;
  /** True when this difference survives the lo-fi chain *and* is big enough to hear. */
  audible: boolean;
  a: unknown;
  b: unknown;
}

/** The verdict on one pair of voices. */
export interface VoiceComparison {
  a: string;
  b: string;
  differences: AxisDifference[];
  /** True when nothing the pair differs on is audible — the thing worth flagging. */
  converged: boolean;
}

/**
 * Axes the lo-fi chain erodes, by path prefix.
 *
 * `body` is the whole reason this module exists. The kit's `hz` and `q` are the
 * same fact for percussion: a snare moved from 1.4 kHz to 1.9 kHz is a different
 * EQ curve on the same burst, where a snare whose decay halves is a different
 * gesture. `amp`'s tone stack, presence and cab are a guitar rig's tone
 * controls — EQ by name.
 */
const WEAK_PREFIXES: readonly string[] = [
  "body",
  "amp.toneStack",
  "amp.presence",
  "amp.cab",
  "synth.filter.type",
  "synth.filter.rolloff",
];

/** Kit leaf names that are EQ rather than gesture. */
const WEAK_KIT_FIELDS: readonly string[] = ["hz", "q"];

/**
 * `maxPolyphony` is a render budget, not a sound — `quality.ts` overrides it for
 * auditions anyway, so two voices differing only there are the same voice.
 */
const IGNORED_PREFIXES: readonly string[] = ["synth.maxPolyphony"];

/** Leaf names that name a *kind* of thing rather than an amount. */
const CATEGORICAL_FIELDS: readonly string[] = ["kind", "type"];

/** Leaf names holding a scientific pitch. */
const PITCH_FIELDS: readonly string[] = ["pitch"];

/**
 * Fields that say nothing about the sound — identity, prose and process. A voice
 * and its own fork differ on all of them by construction, so counting them would
 * mean no pair ever converged and the check would always pass.
 */
const IGNORED_KEYS: ReadonlySet<string> = new Set([
  "instrument",
  "slug",
  "title",
  "status",
  "default",
  "approvedAt",
  "forkedFrom",
  "tags",
  "summary",
  "notes",
  "probe",
]);

/** Numbers this close are the same number — JSON round-trip noise, not design. */
const EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < EPSILON;
  return JSON.stringify(a) === JSON.stringify(b);
}

function startsWithAny(axis: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => axis === p || axis.startsWith(`${p}.`));
}

/**
 * How a difference at this path is judged. Anything unrecognised is `ratio` when
 * both sides are numbers and `categorical` otherwise — the safe default, because
 * a field nobody has classified yet should be able to separate two voices rather
 * than be silently discounted.
 */
export function kindOf(axis: string, a?: unknown, b?: unknown): AxisKind {
  if (startsWithAny(axis, IGNORED_PREFIXES)) return "ignored";
  if (startsWithAny(axis, WEAK_PREFIXES)) return "weak";
  const leaf = axis.split(".").at(-1) ?? "";
  if (axis.startsWith("kit.") && WEAK_KIT_FIELDS.includes(leaf)) return "weak";
  if (PITCH_FIELDS.includes(leaf)) return "pitch";
  if (CATEGORICAL_FIELDS.includes(leaf)) return "categorical";
  if (typeof a === "number" && typeof b === "number") return "ratio";
  return "categorical";
}

/** Whether a difference of this kind, between these two values, is loud enough to hear. */
function isAudible(kind: AxisKind, a: unknown, b: unknown): boolean {
  switch (kind) {
    case "weak":
    case "ignored":
      return false;
    case "categorical":
      return true;
    case "pitch": {
      const [x, y] = [a, b].map((p) => (typeof p === "string" ? pitchToMidi(p) : NaN));
      // An unparseable pitch is a difference we cannot measure, so we keep it.
      if (!Number.isFinite(x!) || !Number.isFinite(y!)) return true;
      return Math.abs(x! - y!) >= PITCH_JND;
    }
    case "ratio": {
      if (typeof a !== "number" || typeof b !== "number") return true;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      if (hi - lo < ABSOLUTE_FLOOR && hi <= 1) return false;
      // A value crossing zero, or arriving from nothing, is a real change.
      if (lo <= 0) return true;
      return hi / lo >= RATIO_JND;
    }
  }
}

/** Walk two presets together, emitting one entry per leaf they disagree on. */
function diffAt(a: unknown, b: unknown, path: string, out: AxisDifference[]): void {
  if (same(a, b)) return;
  if (isRecord(a) && isRecord(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffAt(a[key], b[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }
  const kind = kindOf(path, a, b);
  if (kind === "ignored") return;
  out.push({ axis: path, kind, audible: isAudible(kind, a, b), a, b });
}

/**
 * Compare two presets field by field.
 *
 * Arrays — `body`, in practice — are compared whole rather than element by
 * element. A body is one design decision (this is the box) and reporting four
 * separate resonance differences would drown the audible axes in the output.
 *
 * The same goes for a block one voice has and the other does not: `tremolo`
 * present against `tremolo` absent is reported once, as `tremolo`, rather than
 * as three missing sub-fields. It is one decision, and it is the decision the
 * doc recommends making — so it lands as `categorical` and always counts.
 */
export function compareVoices(a: VoicePreset, b: VoicePreset): VoiceComparison {
  const differences: AxisDifference[] = [];
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (IGNORED_KEYS.has(key)) continue;
    diffAt(left[key], right[key], key, differences);
  }
  differences.sort((x, y) => x.axis.localeCompare(y.axis));
  return {
    a: `${a.instrument}/${a.slug}`,
    b: `${b.instrument}/${b.slug}`,
    differences,
    converged: !differences.some((d) => d.audible),
  };
}

/**
 * Every converged pair within each instrument.
 *
 * Pairs are only formed *within* an instrument: a pad and a bass are never in
 * danger of being confused, and comparing them would produce a report nobody
 * reads. Two voices with no differences at all are also converged — that is a
 * duplicate, the most extreme case of the same problem.
 */
export function convergedPairs(presets: readonly VoicePreset[]): VoiceComparison[] {
  const byInstrument = new Map<string, VoicePreset[]>();
  for (const preset of presets) {
    const bucket = byInstrument.get(preset.instrument);
    if (bucket) bucket.push(preset);
    else byInstrument.set(preset.instrument, [preset]);
  }

  const found: VoiceComparison[] = [];
  for (const group of byInstrument.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const comparison = compareVoices(group[i]!, group[j]!);
        if (comparison.converged) found.push(comparison);
      }
    }
  }
  return found;
}
