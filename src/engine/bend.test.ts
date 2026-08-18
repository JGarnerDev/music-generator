import { describe, expect, it } from "vitest";
import { bendAutomation, validateBend, type BendSpec } from "./bend";

const issues = (value: unknown) => {
  const out: { path: string; message: string }[] = [];
  validateBend(value, "bend", (path, message) => out.push({ path, message }));
  return out;
};

/** Cents at a given moment, read off the ramp segments the same way a signal would. */
const centsAt = (points: { time: number; cents: number }[], t: number): number => {
  const i = points.findIndex((p) => p.time >= t);
  if (i <= 0) return points[0]!.cents;
  const a = points[i - 1]!;
  const b = points[i]!;
  if (b.time === a.time) return b.cents;
  return a.cents + ((b.cents - a.cents) * (t - a.time)) / (b.time - a.time);
};

describe("bendAutomation", () => {
  const spec = (over: Partial<BendSpec> = {}): BendSpec => ({ semitones: 2, ...over });

  it("anchors the written pitch at the attack", () => {
    expect(bendAutomation(spec(), 2)[0]).toEqual({ time: 0, cents: 0 });
  });

  it("holds the written pitch until the bend starts", () => {
    const points = bendAutomation(spec({ at: 0.25, over: 0.5 }), 4);
    expect(centsAt(points, 0.9)).toBe(0);
    expect(centsAt(points, 1)).toBe(0);
    expect(centsAt(points, 1.2)).toBeGreaterThan(0);
  });

  it("lands on the target and stays there", () => {
    const points = bendAutomation(spec({ semitones: 2, at: 0.1, over: 0.2 }), 4);
    expect(points[points.length - 1]!.cents).toBeCloseTo(200);
    expect(points[points.length - 1]!.time).toBeCloseTo(1.2);
  });

  it("bends down for negative semitones", () => {
    const points = bendAutomation(spec({ semitones: -1 }), 2);
    expect(points[points.length - 1]!.cents).toBeCloseTo(-100);
  });

  it("returns to the written pitch when released, at the end of the note", () => {
    const points = bendAutomation(spec({ at: 0.1, over: 0.2, release: true }), 4);
    const last = points[points.length - 1]!;
    expect(last.cents).toBeCloseTo(0);
    expect(last.time).toBeCloseTo(4);
    // Held at pitch in between, rather than turning round the moment it arrives.
    expect(centsAt(points, 2)).toBeCloseTo(200);
  });

  it("never runs past the note, however greedy the fractions", () => {
    for (const s of [spec({ at: 0.9, over: 0.9 }), spec({ at: 0.6, over: 0.9, release: true })]) {
      const points = bendAutomation(s, 3);
      expect(points[points.length - 1]!.time).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  it("rises monotonically — a bend never backs up on its way", () => {
    for (const curve of ["guitar", "meend", "linear"] as const) {
      const points = bendAutomation(spec({ curve }), 2);
      const rising = points.every((p, i) => i === 0 || p.cents >= points[i - 1]!.cents - 1e-9);
      expect(rising, curve).toBe(true);
    }
  });

  it("puts the speed where the curve says it is", () => {
    const half = (curve: BendSpec["curve"]) => {
      // Halfway through the travel of a bend with no wait: how far has it got?
      const points = bendAutomation(spec({ at: 0, over: 1, curve }), 2);
      return centsAt(points, 1) / 200;
    };
    // A guitar covers most of the ground early and creeps in; a meend is
    // symmetrical, so its midpoint is the middle.
    expect(half("guitar")).toBeGreaterThan(0.7);
    expect(half("meend")).toBeCloseTo(0.5, 1);
    expect(half("linear")).toBeCloseTo(0.5, 1);
  });

  it("degrades to a flat anchor for a note with no length", () => {
    expect(bendAutomation(spec(), 0)).toEqual([{ time: 0, cents: 0 }]);
  });
});

describe("validateBend", () => {
  it("accepts a bare bend and a full one", () => {
    expect(issues({ semitones: 2 })).toEqual([]);
    expect(issues({ semitones: -1.5, at: 0.2, over: 0.3, release: true, curve: "meend" })).toEqual([]);
  });

  it("rejects a bend that goes nowhere", () => {
    expect(issues({ semitones: 0 })[0]!.path).toBe("bend.semitones");
    expect(issues({})[0]!.path).toBe("bend.semitones");
  });

  it("rejects a bend wider than a hand", () => {
    expect(issues({ semitones: 24 })[0]!.message).toMatch(/±12/);
  });

  it("rejects fractions outside 0..1", () => {
    expect(issues({ semitones: 2, at: 1.5 })[0]!.path).toBe("bend.at");
    expect(issues({ semitones: 2, over: -0.1 })[0]!.path).toBe("bend.over");
  });

  it("rejects an unknown curve", () => {
    expect(issues({ semitones: 2, curve: "whammy" })[0]!.message).toMatch(/guitar, meend, linear/);
  });

  it("rejects fractions that are each legal but do not fit together", () => {
    expect(issues({ semitones: 2, at: 0.6, over: 0.6 })[0]!.path).toBe("bend");
    // The same pair fits without a release and does not with one.
    expect(issues({ semitones: 2, at: 0.2, over: 0.5 })).toEqual([]);
    expect(issues({ semitones: 2, at: 0.2, over: 0.5, release: true })[0]!.path).toBe("bend");
  });

  it("rejects a bend that is not an object", () => {
    expect(issues("up a tone")[0]!.path).toBe("bend");
  });
});
