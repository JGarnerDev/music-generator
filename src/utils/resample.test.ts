import { describe, it, expect } from "vitest";
import { downmixToMono, resample } from "./resample";

/** A sine at `hz`, `seconds` long, sampled at `rate`. */
function sine(hz: number, seconds: number, rate: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

/** Rough energy of `samples` at `hz` — a one-bin Goertzel, enough to say "is that tone there". */
function energyAt(samples: Float32Array, hz: number, rate: number): number {
  let real = 0;
  let imag = 0;
  for (let i = 0; i < samples.length; i++) {
    real += samples[i]! * Math.cos((2 * Math.PI * hz * i) / rate);
    imag += samples[i]! * Math.sin((2 * Math.PI * hz * i) / rate);
  }
  return Math.hypot(real, imag) / samples.length;
}

describe("downmixToMono", () => {
  it("returns the one channel it is given untouched", () => {
    const mono = new Float32Array([0.1, 0.2]);
    expect(downmixToMono([mono])).toBe(mono);
  });

  it("averages channels rather than picking one", () => {
    const left = new Float32Array([1, 0, 0.5]);
    const right = new Float32Array([0, 1, 0.5]);
    expect(Array.from(downmixToMono([left, right]))).toEqual([0.5, 0.5, 0.5]);
  });

  it("throws on ragged channels and on none", () => {
    expect(() => downmixToMono([new Float32Array(2), new Float32Array(3)])).toThrow(/mismatch/);
    expect(() => downmixToMono([])).toThrow();
  });
});

describe("resample", () => {
  it("is a no-op when the rate is unchanged", () => {
    const samples = sine(440, 0.1, 44100);
    expect(resample(samples, 44100, 44100)).toBe(samples);
  });

  it("produces the expected number of samples", () => {
    expect(resample(new Float32Array(44100), 44100, 22050)).toHaveLength(22050);
    expect(resample(new Float32Array(22050), 22050, 44100)).toHaveLength(44100);
  });

  it("keeps a tone at its own frequency through a halving", () => {
    const out = resample(sine(440, 0.5, 44100), 44100, 22050);
    expect(energyAt(out, 440, 22050)).toBeGreaterThan(0.3);
  });

  it("filters out content above the new Nyquist instead of folding it down", () => {
    // 14 kHz cannot exist at 22050 Hz; unfiltered decimation would alias it to
    // 22050 - 14000 = 8050 Hz and the detector would hear a note that was never played.
    const out = resample(sine(14000, 0.5, 44100), 44100, 22050);
    expect(energyAt(out, 8050, 22050)).toBeLessThan(0.05);
  });

  it("handles empty input and rejects impossible rates", () => {
    expect(resample(new Float32Array(0), 44100, 22050)).toHaveLength(0);
    expect(() => resample(new Float32Array(4), 0, 22050)).toThrow();
    expect(() => resample(new Float32Array(4), 44100, -1)).toThrow();
  });
});
