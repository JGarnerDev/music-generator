/**
 * Seamless-loop audio surgery.
 *
 * A loop rendered straight from a sequencer is never actually seamless: reverb
 * tails, release envelopes and ringing notes from the last bars spill past the
 * loop point into silence. Play that file on repeat and every lap you hear the
 * decay get chopped and the first bar start dry — a click or a "breath" at the
 * seam, once per lap, forever.
 *
 * The fix is to render *past* the loop end and fold the overhang back onto the
 * head of the buffer, which is exactly what the previous lap's tail would have
 * been doing if the music had really been playing all along. The result is a
 * file whose end runs into its own beginning.
 *
 * Pure Float32Array math, no audio context — so it is unit tested.
 */

export interface WrapTailInput {
  /** Rendered audio, one Float32Array per channel, longer than `loopSamples`. */
  channels: Float32Array[];
  /** Length of one lap in samples. The output is exactly this long. */
  loopSamples: number;
  /**
   * Peak to limit the summed result to, or 0 to skip limiting. Folding adds
   * signal, so a loud mix can exceed 1.0 and clip on export. Default 0.999.
   */
  peak?: number;
}

/**
 * Fold everything after `loopSamples` back onto the start of the buffer and
 * return exactly one lap.
 *
 * Overhang longer than the loop itself wraps repeatedly (a 3-second reverb over
 * a 2-second loop lands on lap 2 as well), which is what an infinitely repeating
 * source would actually sum to.
 */
export function wrapTail({ channels, loopSamples, peak = 0.999 }: WrapTailInput): Float32Array[] {
  if (!Number.isInteger(loopSamples) || loopSamples <= 0) {
    throw new Error(`loopSamples must be a positive integer, got ${loopSamples}`);
  }

  return channels.map((input) => {
    if (input.length < loopSamples) {
      throw new Error(`channel is shorter than the loop (${input.length} < ${loopSamples})`);
    }
    const out = input.slice(0, loopSamples);
    for (let i = loopSamples; i < input.length; i++) {
      out[i % loopSamples]! += input[i]!;
    }
    return peak > 0 ? limit(out, peak) : out;
  });
}

/**
 * Scale the whole buffer down if folding pushed it over `peak`.
 *
 * Uniform gain rather than per-sample clamping: clamping would flatten the peaks
 * into audible distortion, and a loop is heard too many times to hide that.
 */
function limit(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const s of samples) {
    const a = Math.abs(s);
    if (a > max) max = a;
  }
  if (max <= peak || max === 0) return samples;
  const gain = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i]! *= gain;
  return samples;
}

/** Convert seconds to a whole number of samples, for cutting on a sample boundary. */
export function secondsToSamples(seconds: number, sampleRate: number): number {
  if (!(sampleRate > 0)) throw new Error(`sampleRate must be positive, got ${sampleRate}`);
  return Math.round(seconds * sampleRate);
}
