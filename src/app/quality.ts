/**
 * Render quality profiles.
 *
 * Auditioning and exporting want different things. An export wants the best
 * audio the graph can make and can take as long as it takes. An audition wants
 * to start soon; it is heard once, through laptop speakers, to answer "is this
 * the right idea".
 *
 * Those were the same render until the bench (`bench.html`) showed
 * `six-gun-shredout` rendering at **0.9× realtime** — slower than playing it —
 * with ~85% of the cost in the two guitar chains, and none of it in the reverb
 * or the kit. The knobs here are the ones that measurement pointed at.
 *
 * Read by `instruments.ts` (voice + amp construction) and `render.ts` (context
 * sample rate). Module-scoped rather than threaded through every signature
 * because the graph builders are deep and this is app glue, not engine logic —
 * but it is only ever set by `withQuality`, which always restores it.
 */

export interface RenderQuality {
  name: string;
  /**
   * Sample rate to render at, or null to match the live context. Halving it
   * halves every per-sample cost in the graph. The guitar cab rolls off hard
   * above ~5 kHz, so 22.05 kHz (Nyquist 11 kHz) costs air on the hats and
   * essentially nothing on the guitars.
   */
  sampleRate: number | null;
  /**
   * Collapse the fat oscillator stacks to a single saw per voice. Measured at
   * 1.2× on `six-gun-shredout` — worth having in an audition, but far less than
   * expected: the guitars dominate the render, and it is not their oscillators
   * that cost, it is the number of voices.
   */
  singleOscillator: boolean;
  /**
   * Voices a guitar `PolySynth` may hold. Each one is a MonoSynth — oscillator,
   * filter, and two envelopes — that keeps running whether or not it is
   * currently sounding, so this is a floor on the cost of a guitar track no
   * matter how sparse the part is.
   */
  maxPolyphony: number;
  /**
   * Players a `section` voice may seat. Each one is a whole extra synth with its
   * own polyphony, so this multiplies the line above: the cost of a section is
   * `players × maxPolyphony` voices. Three is enough to still hear a section
   * while auditioning — the decorrelation cues arrive with the second and third
   * player, and the rest is thickness.
   */
  maxPlayers: number;
  /**
   * Waveshaper oversampling on the preamp. Measured at 0.6% of render time on
   * `six-gun-shredout`, so it stays on everywhere: it is effectively free, and
   * it is the difference between a clipped guitar and an aliased one.
   */
  oversample: "none" | "2x";
}

export const EXPORT_QUALITY: RenderQuality = {
  name: "export",
  sampleRate: null,
  singleOscillator: false,
  maxPolyphony: 16,
  maxPlayers: 8,
  oversample: "2x",
};

export const AUDITION_QUALITY: RenderQuality = {
  name: "audition",
  sampleRate: 22050,
  singleOscillator: true,
  maxPolyphony: 16,
  maxPlayers: 3,
  oversample: "2x",
};

let active: RenderQuality = EXPORT_QUALITY;

export function getQuality(): RenderQuality {
  return active;
}

/**
 * Run `fn` with `quality` active. Synchronous on purpose: the graph must be
 * built inside it, and building is synchronous even though rendering is not.
 */
export function withQuality<T>(quality: RenderQuality, fn: () => T): T {
  const previous = active;
  active = quality;
  try {
    return fn();
  } finally {
    active = previous;
  }
}
