import { describe, it, expect } from "vitest";
import { wrapTail, secondsToSamples } from "./loop";

const chan = (values: number[]) => Float32Array.from(values);

describe("wrapTail", () => {
  it("returns exactly one lap", () => {
    const [out] = wrapTail({ channels: [chan([1, 2, 3, 4, 5, 6, 7])], loopSamples: 4 });
    expect(out).toHaveLength(4);
  });

  it("folds the overhang onto the head", () => {
    // body [1,1,1,1] + tail [0.5,0.25] lands on samples 0 and 1
    const [out] = wrapTail({
      channels: [chan([1, 1, 1, 1, 0.5, 0.25])],
      loopSamples: 4,
      peak: 0,
    });
    expect(Array.from(out!)).toEqual([1.5, 1.25, 1, 1]);
  });

  it("leaves a buffer with no overhang untouched", () => {
    const [out] = wrapTail({ channels: [chan([0.1, 0.2, 0.3])], loopSamples: 3, peak: 0 });
    expect(out![0]).toBeCloseTo(0.1);
    expect(out![1]).toBeCloseTo(0.2);
    expect(out![2]).toBeCloseTo(0.3);
  });

  it("wraps overhang longer than the loop more than once", () => {
    // loop of 2; tail covers samples 2..5, so index 0 gets 2+4 and index 1 gets 3+5
    const [out] = wrapTail({
      channels: [chan([0, 0, 1, 2, 4, 8])],
      loopSamples: 2,
      peak: 0,
    });
    expect(Array.from(out!)).toEqual([5, 10]);
  });

  it("handles each channel independently", () => {
    const [left, right] = wrapTail({
      channels: [chan([1, 0, 0.5]), chan([0, 1, 0.25])],
      loopSamples: 2,
      peak: 0,
    });
    expect(Array.from(left!)).toEqual([1.5, 0]);
    expect(Array.from(right!)).toEqual([0.25, 1]);
  });

  it("limits uniformly when folding pushes the mix over peak", () => {
    const [out] = wrapTail({ channels: [chan([0.9, 0.4, 0.9])], loopSamples: 2, peak: 1 });
    // folded head would be 1.8; everything scales by 1/1.8, preserving the ratio
    expect(out![0]).toBeCloseTo(1);
    expect(out![1]).toBeCloseTo(0.4 / 1.8);
  });

  it("does not touch a mix that stays under peak", () => {
    const [out] = wrapTail({ channels: [chan([0.5, 0.1, 0.2])], loopSamples: 2, peak: 1 });
    expect(out![0]).toBeCloseTo(0.7);
    expect(out![1]).toBeCloseTo(0.1);
  });

  it("rejects a non-positive or fractional loop length", () => {
    expect(() => wrapTail({ channels: [chan([1])], loopSamples: 0 })).toThrow(/positive integer/);
    expect(() => wrapTail({ channels: [chan([1])], loopSamples: 1.5 })).toThrow(/positive integer/);
  });

  it("rejects a buffer shorter than the loop", () => {
    expect(() => wrapTail({ channels: [chan([1, 2])], loopSamples: 4 })).toThrow(/shorter than/);
  });
});

describe("secondsToSamples", () => {
  it("rounds to a whole sample", () => {
    expect(secondsToSamples(1, 44100)).toBe(44100);
    expect(secondsToSamples(102.4, 44100)).toBe(4515840);
    expect(secondsToSamples(0.0000113, 44100)).toBe(0);
  });

  it("rejects a bad sample rate", () => {
    expect(() => secondsToSamples(1, 0)).toThrow(/sampleRate/);
  });
});
