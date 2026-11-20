import { describe, expect, it } from "vitest";
import { CHOKE_FLOOR, chokeNotes } from "./choke";

describe("chokeNotes", () => {
  it("keeps the full release when nothing follows", () => {
    expect(chokeNotes([{ start: 0, duration: 0.5 }], 0.8)).toEqual([
      { duration: 0.5, release: 0.8 },
    ]);
  });

  it("keeps the full release when the next onset is further away than the tail", () => {
    const out = chokeNotes(
      [
        { start: 0, duration: 0.5 },
        { start: 2, duration: 0.5 },
      ],
      0.8,
    );
    expect(out[0]).toEqual({ duration: 0.5, release: 0.8 });
  });

  it("shortens the tail so it ends at the next onset", () => {
    const out = chokeNotes(
      [
        { start: 0, duration: 0.5 },
        { start: 0.7, duration: 0.5 },
      ],
      0.8,
    );
    expect(out[0]!.duration).toBe(0.5);
    expect(out[0]!.release).toBeCloseTo(0.2);
  });

  it("never goes below the floor, so a legato line does not click", () => {
    const out = chokeNotes(
      [
        { start: 0, duration: 0.25 },
        { start: 0.25, duration: 0.25 },
      ],
      0.8,
    );
    expect(out[0]).toEqual({ duration: 0.25, release: CHOKE_FLOOR });
  });

  it("cuts a note written to hold past the next onset", () => {
    const out = chokeNotes(
      [
        { start: 0, duration: 2 },
        { start: 0.5, duration: 0.5 },
      ],
      0.8,
    );
    expect(out[0]).toEqual({ duration: 0.5, release: CHOKE_FLOOR });
  });

  it("does not let the notes of one chord choke each other", () => {
    const out = chokeNotes(
      [
        { start: 0, duration: 0.5 },
        { start: 0.004, duration: 0.5 }, // humanized fifth, a few ms late
        { start: 1, duration: 0.5 },
      ],
      0.3,
    );
    expect(out[0]).toEqual({ duration: 0.5, release: 0.3 });
    expect(out[1]).toEqual({ duration: 0.5, release: 0.3 });
  });

  it("chokes every note of a chord at the next chord", () => {
    const out = chokeNotes(
      [
        { start: 0, duration: 0.5 },
        { start: 0, duration: 0.5 },
        { start: 0.55, duration: 0.5 },
        { start: 0.55, duration: 0.5 },
      ],
      0.3,
    );
    expect(out[0]!.release).toBeCloseTo(0.05);
    expect(out[1]!.release).toBeCloseTo(0.05);
    expect(out[2]!.release).toBe(0.3);
  });

  it("does not depend on input order", () => {
    const out = chokeNotes(
      [
        { start: 1, duration: 0.5 },
        { start: 0, duration: 0.5 },
      ],
      0.8,
    );
    expect(out[1]!.release).toBeCloseTo(0.5);
    expect(out[0]!.release).toBe(0.8);
  });
});
