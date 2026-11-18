import { describe, expect, it } from "vitest";
import { wrapLoopPosition } from "./loop-position";

describe("wrapLoopPosition", () => {
  it("is modulo when the whole file loops", () => {
    expect(wrapLoopPosition(25, 10)).toBeCloseTo(5);
  });

  it("plays the intro once, then wraps inside the body", () => {
    // 30s intro, 100s body: 140s in is 10s into the second lap of the body.
    expect(wrapLoopPosition(20, 130, 30)).toBeCloseTo(20);
    expect(wrapLoopPosition(129, 130, 30)).toBeCloseTo(129);
    expect(wrapLoopPosition(140, 130, 30)).toBeCloseTo(40);
    expect(wrapLoopPosition(330, 130, 30)).toBeCloseTo(30);
  });

  it("is 0 for nothing loaded", () => {
    expect(wrapLoopPosition(5, 0)).toBe(0);
  });
});
