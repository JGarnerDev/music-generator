/**
 * Signal chains — a timbre's `signal: [...]` turned into an ordered list of
 * effects an audio graph can actually build.
 *
 * A timbre palette has always described its chain in words: `[variac-sag,
 * overdrive, plate-reverb, slap-echo]`. Until now those words reached the render
 * only through `blend.ts:deriveLofi`, which regex-matched them into four
 * numbers on one shared bus — so `fuzz` and `plate-reverb` and `amp-cabinet` all
 * collapsed into "a bit darker, a bit wetter", and every track got the same bit.
 * The prose was doing the work the audio wasn't.
 *
 * This is the missing half: token → a declarative `EffectSpec`, in the order the
 * author wrote them, per track. **Order is the instrument** — sag before drive is
 * a valve amp browning out, drive before sag is a compressor on a fuzz pedal, and
 * they do not sound alike. `src/app/audio/effects.ts` builds Tone nodes from these
 * specs; keeping the decisions here means the chain is pure and testable and the
 * browser file stays thin.
 *
 * Unknown tokens are **not** an error. A timbre is prose first: `hard-double-track`
 * and `dry` describe a recording decision, and an author should be able to write
 * what they mean without waiting for an implementation. `unknownSignal` lists
 * them so a CLI can say which words are currently only words.
 */

/** One effect in a chain, as data. `src/app/audio/effects.ts` turns these into nodes. */
export type EffectSpec =
  /** Waveshaping distortion — the amount is Tone's 0..1 curve parameter. */
  | { kind: "distortion"; amount: number }
  /** Downward compression. `ratio` high and `threshold` low is a squeeze. */
  | { kind: "compress"; threshold: number; ratio: number; attack: number; release: number }
  /** A fixed filter — cabinet voicing, a band limit, a tone control. */
  | { kind: "filter"; type: "lowpass" | "highpass" | "bandpass"; frequency: number; q?: number }
  /** A filter that moves on its own, for the classic sweep. */
  | { kind: "autofilter"; frequency: number; base: number; octaves: number; depth: number }
  /** Convolution-style ambience, built from a generated impulse. */
  | { kind: "reverb"; decay: number; wet: number }
  /** A discrete echo. `time` is in seconds. */
  | { kind: "delay"; time: number; feedback: number; wet: number }
  /** Detuned doubling for width. */
  | { kind: "chorus"; frequency: number; depth: number; wet: number }
  /** Pitch wobble — tape wow and flutter. */
  | { kind: "wobble"; frequency: number; depth: number }
  /** Sample-rate/bit-depth reduction. */
  | { kind: "bitcrush"; bits: number }
  /** Stereo widening by short delay on one side. */
  | { kind: "widen"; amount: number };

/**
 * What each token means, in audio.
 *
 * Chosen to be *recognisable* rather than accurate: the point of `fuzz` is that
 * a listener says "fuzz", so it is a hard curve into a band limit rather than a
 * transistor model. Where two tokens are near-synonyms they are listed
 * separately anyway, because a palette author writing `slap-echo` should not have
 * to know it is a delay with particular numbers.
 */
const TOKENS: Record<string, EffectSpec[]> = {
  // --- drive ---------------------------------------------------------------
  overdrive: [{ kind: "distortion", amount: 0.35 }],
  drive: [{ kind: "distortion", amount: 0.3 }],
  distortion: [{ kind: "distortion", amount: 0.55 }],
  fuzz: [
    // Hard curve, then a tight band: fuzz is as much about what it *removes* as
    // about what it adds — the extremes go, and what is left buzzes.
    { kind: "distortion", amount: 0.85 },
    { kind: "filter", type: "highpass", frequency: 160 },
    { kind: "filter", type: "lowpass", frequency: 3800 },
  ],
  "solid-state-clip": [
    { kind: "distortion", amount: 0.7 },
    { kind: "filter", type: "highpass", frequency: 200 },
  ],
  "tape-saturation": [
    { kind: "compress", threshold: -18, ratio: 3, attack: 0.01, release: 0.2 },
    { kind: "distortion", amount: 0.12 },
  ],
  "variac-sag": [
    // The supply voltage dipping on a hard hit: the attack ducks and blooms back.
    { kind: "compress", threshold: -20, ratio: 4, attack: 0.004, release: 0.25 },
  ],
  compression: [{ kind: "compress", threshold: -20, ratio: 4, attack: 0.01, release: 0.15 }],
  bitcrush: [{ kind: "bitcrush", bits: 6 }],

  // --- voicing / filters ---------------------------------------------------
  "amp-cabinet": [
    // A guitar speaker is a bandpass with steep shoulders; this is most of why
    // a distorted DI sounds like a wasp and a miked cab doesn't.
    { kind: "filter", type: "highpass", frequency: 90 },
    { kind: "filter", type: "lowpass", frequency: 5000 },
  ],
  pickup: [{ kind: "filter", type: "highpass", frequency: 120 }],
  "band-limit": [
    { kind: "filter", type: "highpass", frequency: 220 },
    { kind: "filter", type: "lowpass", frequency: 3200 },
  ],
  lowpass: [{ kind: "filter", type: "lowpass", frequency: 2600 }],
  highpass: [{ kind: "filter", type: "highpass", frequency: 120 }],
  "lowpass-sweep": [
    { kind: "autofilter", frequency: 0.15, base: 320, octaves: 3.5, depth: 0.8 },
  ],
  wah: [{ kind: "autofilter", frequency: 1.6, base: 420, octaves: 2.4, depth: 0.9 }],

  // --- ambience ------------------------------------------------------------
  reverb: [{ kind: "reverb", decay: 2.2, wet: 0.28 }],
  "plate-reverb": [{ kind: "reverb", decay: 2.6, wet: 0.32 }],
  "spring-reverb": [{ kind: "reverb", decay: 1.6, wet: 0.3 }],
  "hall-reverb": [{ kind: "reverb", decay: 4, wet: 0.4 }],
  "room-reverb": [{ kind: "reverb", decay: 0.9, wet: 0.22 }],
  "slap-echo": [{ kind: "delay", time: 0.11, feedback: 0.18, wet: 0.22 }],
  "tape-echo": [{ kind: "delay", time: 0.28, feedback: 0.34, wet: 0.28 }],
  delay: [{ kind: "delay", time: 0.25, feedback: 0.3, wet: 0.25 }],
  echo: [{ kind: "delay", time: 0.25, feedback: 0.3, wet: 0.25 }],

  // --- movement and width --------------------------------------------------
  chorus: [{ kind: "chorus", frequency: 1.2, depth: 0.6, wet: 0.35 }],
  phaser: [{ kind: "autofilter", frequency: 0.5, base: 500, octaves: 2, depth: 0.6 }],
  "wow-flutter": [{ kind: "wobble", frequency: 0.6, depth: 0.12 }],
  vibrato: [{ kind: "wobble", frequency: 5, depth: 0.15 }],
  "saw-detune": [{ kind: "chorus", frequency: 0.4, depth: 0.4, wet: 0.3 }],
  "hard-double-track": [{ kind: "widen", amount: 0.02 }],
  widen: [{ kind: "widen", amount: 0.015 }],
};

/**
 * Tokens that are deliberately silent here: they describe a *choice not to
 * process*, or a thing the global lo-fi bed already does. Listing them means
 * `unknownSignal` doesn't nag about words that are working as intended.
 */
const UNDERSTOOD_NO_OP = new Set(["dry", "clean", "vinyl-crackle", "hiss", "noise", "mono"]);

/** Every token that builds something. For CLI help and error messages. */
export const SIGNAL_TOKENS = Object.keys(TOKENS);

/**
 * A timbre's signal words → the effects to build, in order.
 *
 * Tokens are matched exactly rather than fuzzily. `deriveLofi`'s regexes were
 * fuzzy — `/reverb|plate|hall|space|echo|delay/` — which is right for nudging a
 * global mood and wrong for building a chain: `space` would have built a reverb
 * for a palette that only mentioned outer space.
 */
export function signalChain(tokens: readonly string[]): EffectSpec[] {
  return tokens.flatMap((token) => TOKENS[token.toLowerCase()] ?? []);
}

/**
 * The tokens in a chain that no effect implements — still prose, in other words.
 *
 * Not an error, and not a to-do list either: `dry` and `vinyl-crackle` are
 * excluded because they are handled elsewhere or mean "do nothing". What is left
 * is genuinely a word doing nothing, which a palette author is entitled to know.
 */
export function unknownSignal(tokens: readonly string[]): string[] {
  return tokens.filter((t) => {
    const key = t.toLowerCase();
    return TOKENS[key] === undefined && !UNDERSTOOD_NO_OP.has(key);
  });
}

/**
 * Whether the chain asks for no ambience at all.
 *
 * `dry` is a real instruction — `desert-fuzz` ends on it precisely to say "this
 * amp is in a small room and we didn't mic the room". Honouring it means the
 * shared lo-fi reverb has to back off for that track too, or the palette's one
 * distinguishing feature is drowned by a default.
 */
export function isDry(tokens: readonly string[]): boolean {
  return tokens.some((t) => t.toLowerCase() === "dry" || t.toLowerCase() === "clean");
}
