/**
 * Reverb impulse responses as plain data.
 *
 * `Tone.Reverb` builds its IR by spinning up a *second* offline context and
 * rendering decaying noise into it, asynchronously, from its constructor. Inside
 * a render that is three problems at once: the nested render is not awaited (so
 * the convolver can still be empty when the main render starts), it drags the
 * throttled clock loop along with it, and it draws from `Math.random`, so no two
 * renders of the same piece are the same audio.
 *
 * An IR is just decaying noise, so generate it here instead: seeded, synchronous,
 * pure, and testable. Same seed, same reverb, forever.
 */
import { makeRng } from "./random";

export interface ImpulseOptions {
  /** Seconds for the tail to decay to silence. */
  decay: number;
  /** Silent gap before the tail starts, in seconds. */
  preDelay?: number;
  sampleRate: number;
  /** Channel count — 2 gives the stereo decorrelation that reads as width. */
  channels?: number;
  seed?: number;
}

/**
 * Decaying white noise, one Float32Array per channel.
 *
 * Exponential decay rather than linear: a room's energy falls by a fixed
 * *fraction* per unit time, and a linear fade reads as a synthetic swell being
 * turned down rather than as a space. Channels are drawn independently from the
 * same seeded stream, which is what makes the tail stereo instead of a wide
 * mono blur.
 */
export function impulseResponse({
  decay,
  preDelay = 0.01,
  sampleRate,
  channels = 2,
  seed = 1,
}: ImpulseOptions): Float32Array[] {
  if (!(decay > 0)) throw new Error(`impulseResponse: decay must be positive, got ${decay}`);
  if (!(sampleRate > 0)) {
    throw new Error(`impulseResponse: sampleRate must be positive, got ${sampleRate}`);
  }
  if (!Number.isInteger(channels) || channels < 1) {
    throw new Error(`impulseResponse: channels must be a positive integer, got ${channels}`);
  }

  const rng = makeRng(seed);
  const preDelaySamples = Math.floor(Math.max(preDelay, 0) * sampleRate);
  const length = preDelaySamples + Math.ceil(decay * sampleRate);
  // Reach ~-60 dB (inaudible) exactly at `decay`, which is what "a 4 second
  // reverb" is normally taken to mean.
  const k = Math.log(1000) / (decay * sampleRate);

  return Array.from({ length: channels }, () => {
    const out = new Float32Array(length);
    for (let i = preDelaySamples; i < length; i++) {
      out[i] = (rng() * 2 - 1) * Math.exp(-k * (i - preDelaySamples));
    }
    return out;
  });
}
