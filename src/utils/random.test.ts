import { describe, it, expect } from "vitest";
import { makeRng, randInt, pick, seedFromString } from "./random";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = makeRng(1);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});

describe("randInt", () => {
  it("stays within inclusive bounds", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const v = randInt(rng, 3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});

describe("pick", () => {
  it("returns an element from the array", () => {
    const rng = makeRng(9);
    const items = ["a", "b", "c"] as const;
    expect(items).toContain(pick(rng, items));
  });
  it("throws on empty", () => {
    expect(() => pick(makeRng(1), [])).toThrow();
  });
});

describe("seedFromString", () => {
  it("is stable for the same string", () => {
    expect(seedFromString("sad dog scene")).toBe(seedFromString("sad dog scene"));
  });
  it("differs for different strings", () => {
    expect(seedFromString("sad")).not.toBe(seedFromString("happy"));
  });
});
