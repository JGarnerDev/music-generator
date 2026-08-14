import { describe, expect, it } from "vitest";
import { encodeMp3 } from "./mp3";

/** A second of a quiet sine — real signal, so the encoder has something to chew. */
function tone(seconds: number, sampleRate = 44100, hz = 220): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.4 * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return samples;
}

describe("encodeMp3", () => {
  it("produces an MP3 frame header", () => {
    const bytes = encodeMp3([tone(0.5)], { sampleRate: 44100 });
    expect(bytes.length).toBeGreaterThan(0);
    // Every MP3 frame starts with 11 set bits.
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]! & 0xe0).toBe(0xe0);
  });

  it("encodes stereo", () => {
    const bytes = encodeMp3([tone(0.5), tone(0.5, 44100, 330)], { sampleRate: 44100 });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("is far smaller than the equivalent WAV", () => {
    const seconds = 2;
    const bytes = encodeMp3([tone(seconds), tone(seconds)], { sampleRate: 44100 });
    const wavBytes = 2 * 2 * seconds * 44100; // stereo, 16-bit
    expect(bytes.length).toBeLessThan(wavBytes / 4);
  });

  it("gets bigger at a higher bitrate", () => {
    const samples = [tone(1)];
    const low = encodeMp3(samples, { sampleRate: 44100, bitrateKbps: 64 });
    const high = encodeMp3(samples, { sampleRate: 44100, bitrateKbps: 256 });
    expect(high.length).toBeGreaterThan(low.length);
  });

  it("survives samples outside [-1, 1] instead of wrapping them", () => {
    const hot = Float32Array.from({ length: 4410 }, (_, i) => (i % 2 ? 1.4 : -1.4));
    expect(() => encodeMp3([hot], { sampleRate: 44100 })).not.toThrow();
  });

  it("rejects nonsense input", () => {
    expect(() => encodeMp3([], { sampleRate: 44100 })).toThrow(/no channels/);
    expect(() => encodeMp3([tone(0.1), tone(0.2)], { sampleRate: 44100 })).toThrow(/mismatch/);
    expect(() => encodeMp3([tone(0.1)], { sampleRate: 0 })).toThrow(/sampleRate/);
    const tooMany = [tone(0.1), tone(0.1), tone(0.1)];
    expect(() => encodeMp3(tooMany, { sampleRate: 44100 })).toThrow(/mono or stereo/);
  });
});
