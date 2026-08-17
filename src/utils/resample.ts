/**
 * Getting recorded audio into the shape an analyser wants: one channel, at the
 * rate the model was trained on.
 *
 * Deliberately modest DSP. This exists to feed a pitch detector, not to master a
 * record — the output is measured for *what note it is*, never listened to, so a
 * box-filtered linear resample is sufficient where a polyphase sinc would be
 * ceremony. What it does not skip is the anti-alias filter, because that one
 * shortcut is audible to a detector even when it isn't to a person: see below.
 */

/**
 * Sum channels to one, scaled by channel count.
 *
 * Averaging rather than picking channel 0: a guitar recorded in stereo with a
 * mic and a DI has the note on both, and the DI alone may be the quiet one.
 * Phase cancellation between two mics is a real risk of averaging, but it costs
 * level, not pitch, and level is what `minAmplitude` is for.
 */
export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) throw new Error("downmixToMono: no channels");
  const first = channels[0]!;
  if (channels.length === 1) return first;
  for (const ch of channels) {
    if (ch.length !== first.length) throw new Error("downmixToMono: channel length mismatch");
  }
  const out = new Float32Array(first.length);
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i]!;
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * Resample by linear interpolation, low-passing first when the rate drops.
 *
 * **The filter is the point.** Downsampling 44100 → 22050 without one folds
 * everything above 11 kHz back down into the audible range as inharmonic junk,
 * and a pitch detector reads that junk as notes — phantom partials that arrive
 * as an extra voice nobody played. A moving average is not enough here and was
 * tried: two taps at 44.1 kHz still pass 14 kHz at half amplitude, which aliases
 * to a very audible 8 kHz. Hence a real windowed-sinc.
 *
 * Upsampling skips the filter: there is nothing above the old Nyquist to fold.
 */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!(fromRate > 0) || !(toRate > 0)) throw new Error(`resample: bad rates ${fromRate} → ${toRate}`);
  if (fromRate === toRate) return samples;
  if (samples.length === 0) return samples;

  const ratio = fromRate / toRate;
  // Cut a little under the new Nyquist so the filter's transition band lands in
  // the gap rather than on top of content we want to keep.
  const source = ratio > 1 ? lowPass(samples, fromRate, toRate * 0.45) : samples;
  const outLength = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const frac = position - index;
    const a = source[Math.min(index, source.length - 1)]!;
    const b = source[Math.min(index + 1, source.length - 1)]!;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Blackman-windowed sinc low-pass, applied directly rather than by FFT.
 *
 * 101 taps puts the transition band inside the octave between the cutoff and the
 * old Nyquist and the stopband around -70 dB, which is far below anything a
 * pitch detector will call a note. Direct convolution is O(taps × samples) —
 * about a third of a second for a half-minute take, against the ~60s the model
 * itself costs, so an FFT here would be optimising the wrong end.
 */
export function lowPass(samples: Float32Array, rate: number, cutoffHz: number, taps = 101): Float32Array {
  const n = taps % 2 === 0 ? taps + 1 : taps; // odd, so the filter has a true centre
  const half = (n - 1) / 2;
  const fc = cutoffHz / rate; // cycles per sample

  const kernel = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = i - half;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    const window =
      0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
    kernel[i] = sinc * window;
    sum += kernel[i]!;
  }
  for (let i = 0; i < n; i++) kernel[i]! /= sum; // unity gain at DC

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let acc = 0;
    for (let k = 0; k < n; k++) {
      const at = i + k - half;
      // Clamp at the edges rather than zero-padding: a take that starts loud
      // would otherwise get a click the detector reads as an onset.
      acc += kernel[k]! * samples[at < 0 ? 0 : at >= samples.length ? samples.length - 1 : at]!;
    }
    out[i] = acc;
  }
  return out;
}
