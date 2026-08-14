import { describe, expect, it } from "vitest";
import { impulseResponse } from "./impulse";

const BASE = { decay: 1, sampleRate: 1000, preDelay: 0 };

describe("impulseResponse", () => {
  it("is decay * sampleRate long, plus the pre-delay", () => {
    expect(impulseResponse(BASE)[0]!.length).toBe(1000);
    expect(impulseResponse({ ...BASE, preDelay: 0.1 })[0]!.length).toBe(1100);
  });

  it("leaves the pre-delay silent", () => {
    const [ch] = impulseResponse({ ...BASE, preDelay: 0.05 });
    expect(Array.from(ch!.slice(0, 50))).toEqual(new Array(50).fill(0));
    expect(ch![50]).not.toBe(0);
  });

  it("decays: the tail is far quieter than the head", () => {
    const [ch] = impulseResponse(BASE);
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += ch![i]! ** 2;
      return Math.sqrt(sum / (to - from));
    };
    expect(rms(900, 1000)).toBeLessThan(rms(0, 100) / 100);
  });

  it("stays inside [-1, 1]", () => {
    for (const ch of impulseResponse({ ...BASE, decay: 2, sampleRate: 4000 })) {
      for (const s of ch) expect(Math.abs(s)).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a seed, and different for another", () => {
    const a = impulseResponse({ ...BASE, seed: 7 })[0]!;
    const b = impulseResponse({ ...BASE, seed: 7 })[0]!;
    const c = impulseResponse({ ...BASE, seed: 8 })[0]!;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("decorrelates channels, so the tail is stereo", () => {
    const [left, right] = impulseResponse(BASE);
    expect(Array.from(left!)).not.toEqual(Array.from(right!));
  });

  it("rejects nonsense settings", () => {
    expect(() => impulseResponse({ ...BASE, decay: 0 })).toThrow(/decay/);
    expect(() => impulseResponse({ ...BASE, sampleRate: 0 })).toThrow(/sampleRate/);
    expect(() => impulseResponse({ ...BASE, channels: 0 })).toThrow(/channels/);
  });
});
