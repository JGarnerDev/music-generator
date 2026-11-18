import { describe, expect, it } from "vitest";
import { LEGATO_GLIDE, legatoRuns, type LegatoNote } from "./legato";

const note = (start: number, midi: number, legato = false, duration = 0.1): LegatoNote => ({
  start,
  duration,
  midi,
  legato,
});

describe("legatoRuns", () => {
  it("leaves picked notes alone", () => {
    expect(legatoRuns([note(0, 60), note(0.1, 62)])).toEqual([]);
  });

  it("folds a tap and two pull-offs into one held note with stepped pitch", () => {
    // Eruption shape: picked E, tapped up an octave, pulled off to B, then G#.
    const [run] = legatoRuns([note(0, 64), note(0.1, 76, true), note(0.2, 71, true), note(0.3, 68, true)]);
    expect(run).toMatchObject({ head: 0, members: [1, 2, 3] });
    expect(run!.duration).toBeCloseTo(0.4);
    expect(run!.points).toEqual([
      { time: 0, cents: 0 },
      { time: expect.closeTo(0.1 - LEGATO_GLIDE, 9), cents: 0 },
      { time: expect.closeTo(0.1, 9), cents: 1200 },
      { time: expect.closeTo(0.2 - LEGATO_GLIDE, 9), cents: 1200 },
      { time: expect.closeTo(0.2, 9), cents: 700 },
      { time: expect.closeTo(0.3 - LEGATO_GLIDE, 9), cents: 700 },
      { time: expect.closeTo(0.3, 9), cents: 400 },
    ]);
  });

  it("starts a new run at the next picked note", () => {
    const runs = legatoRuns([note(0, 64), note(0.1, 67, true), note(0.2, 64), note(0.3, 67, true)]);
    expect(runs.map((r) => [r.head, r.members])).toEqual([
      [0, [1]],
      [2, [3]],
    ]);
  });

  it("reads time, not array order", () => {
    const [run] = legatoRuns([note(0.1, 67, true), note(0, 64)]);
    expect(run).toMatchObject({ head: 1, members: [0] });
  });

  it("hammers onto the top of a chord", () => {
    const [run] = legatoRuns([note(0, 52), note(0, 59), note(0.2, 61, true)]);
    expect(run).toMatchObject({ head: 1, members: [2] });
    expect(run!.points.at(-1)!.cents).toBe(200);
  });

  it("picks a legato note with nothing before it", () => {
    expect(legatoRuns([note(0, 64, true), note(0.1, 66)])).toEqual([]);
  });

  it("lasts until the longest-ringing note in it ends", () => {
    const [run] = legatoRuns([note(0, 64, false, 1), note(0.1, 66, true, 0.1)]);
    expect(run!.duration).toBeCloseTo(1);
  });
});
