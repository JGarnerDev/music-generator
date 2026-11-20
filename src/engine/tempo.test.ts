import { describe, expect, it } from "vitest";
import { sectionTempoChanges, tempoIssues, tempoMap } from "./tempo";

describe("tempoMap", () => {
  it("is plain bpm arithmetic when nothing changes", () => {
    const map = tempoMap({ bpm: 120 });
    expect(map.constant).toBe(true);
    expect(map.secondsAt("2:0:0")).toBeCloseTo(4);
    expect(map.durationSeconds("5:1:2", "4n")).toBeCloseTo(0.5);
  });

  it("steps to a new tempo on the barline", () => {
    const map = tempoMap({ bpm: 120, tempo: [{ bar: 1, bpm: 60 }] });
    expect(map.constant).toBe(false);
    expect(map.secondsAt("1:0:0")).toBeCloseTo(2);
    expect(map.secondsAt("2:0:0")).toBeCloseTo(6);
    expect(map.durationSeconds("0:3:0", "2n")).toBeCloseTo(0.5 + 1);
  });

  it("ramps linearly in time, so a glide takes the average tempo's length", () => {
    // 4 beats from 60 to 180 bpm: average 120, so 2 seconds.
    const map = tempoMap({ bpm: 60, tempo: [{ bar: 1, bpm: 180, ramp: true }] });
    expect(map.secondsAt("1:0:0")).toBeCloseTo(2);
    expect(map.bpmAtBeat(4)).toBeCloseTo(180);
    expect(map.secondsAt("2:0:0")).toBeCloseTo(2 + 4 / 3);
    // Halfway in time (1s) only 1.5 of the 4 beats have passed, at 120 bpm.
    expect(map.secondsAtBeat(1.5)).toBeCloseTo(1, 9);
    expect(map.bpmAtBeat(1.5)).toBeCloseTo(120);
  });

  it("lets a ramp arrive and a step leave on the same bar", () => {
    const map = tempoMap({
      bpm: 100,
      tempo: [
        { bar: 2, bpm: 100 },
        { bar: 4, bpm: 140, ramp: true },
        { bar: 4, bpm: 90 },
      ],
    });
    expect(map.bpmAtBeat(16)).toBeCloseTo(90);
    expect(map.bpmAtBeat(15.999)).toBeCloseTo(140, 0);
  });

  it("reads meter for bar length", () => {
    expect(tempoMap({ bpm: 60, meter: [3, 4] }).secondsAt("2:0:0")).toBeCloseTo(6);
  });
});

describe("automation", () => {
  const map = tempoMap({
    bpm: 100,
    tempo: [
      { bar: 2, bpm: 120 },
      { bar: 4, bpm: 160, ramp: true },
      { bar: 4, bpm: 110 },
    ],
  });

  it("is only steps — a ramp arrives as one stair per sixteenth", () => {
    const events = map.automation();
    expect(events.every((e) => !e.ramp)).toBe(true);
    expect(events[0]).toEqual({ seconds: 0, bpm: 100, ramp: false });
    // Bars 2–4 are 8 beats of ramp: 32 stairs, then the step to 110.
    expect(events).toHaveLength(1 + 32 + 1);
    expect(events.at(-1)).toMatchObject({
      seconds: expect.closeTo(map.secondsAt("4:0:0"), 9),
      bpm: 110,
    });
  });

  it("lands every stair on the map, so the transport and the loop cut agree", () => {
    const events = map.automation();
    let beats = 0;
    for (let i = 1; i < events.length - 1; i++) {
      const next = events[i + 1]!.seconds;
      beats += ((next - events[i]!.seconds) * events[i]!.bpm) / 60;
    }
    expect(beats).toBeCloseTo(8, 9);
    expect(events[1]!.bpm).toBeGreaterThan(120);
    expect(events.at(-2)!.bpm).toBeLessThan(160);
  });

  it("starts mid-ramp holding the stair sounding there", () => {
    const offset = map.secondsAt("3:0:0");
    const [first, second] = map.automation(offset);
    expect(first!.seconds).toBe(0);
    expect(first!.bpm).toBeCloseTo(map.bpmAtBeat(12.125), 0);
    expect(second!.seconds).toBeCloseTo(map.secondsAt("3:0:1") - offset, 9);
  });

  it("is one hold when nothing changes", () => {
    expect(tempoMap({ bpm: 90 }).automation(5)).toEqual([{ seconds: 0, bpm: 90, ramp: false }]);
  });
});

describe("tempoIssues", () => {
  it("accepts steps and ramps", () => {
    expect(
      tempoIssues([
        { bar: 4, bpm: 140 },
        { bar: 8, bpm: 150, ramp: true },
      ]),
    ).toEqual([]);
  });
  it("names the bad field", () => {
    expect(tempoIssues([{ bar: 1.5, bpm: 0 }])).toEqual([
      ["tempo[0].bar", "must be a non-negative integer"],
      ["tempo[0].bpm", "must be a positive number"],
    ]);
  });
});

describe("sectionTempoChanges", () => {
  it("is empty when no section moves the tempo", () => {
    expect(
      sectionTempoChanges(120, [
        { start: 0, end: 8 },
        { start: 8, end: 16, bpm: 120 },
      ]),
    ).toEqual([]);
  });

  it("steps at a section that states a new bpm, and carries it on", () => {
    expect(
      sectionTempoChanges(100, [
        { start: 0, end: 4 },
        { start: 4, end: 8, bpm: 120 },
        { start: 8, end: 12 },
      ]),
    ).toEqual([{ bar: 4, bpm: 120 }]);
  });

  it("anchors a ramp on its first bar so it glides across that section only", () => {
    expect(
      sectionTempoChanges(100, [
        { start: 0, end: 4 },
        { start: 4, end: 8, rampTo: 140 },
      ]),
    ).toEqual([
      { bar: 4, bpm: 100 },
      { bar: 8, bpm: 140, ramp: true },
    ]);
  });

  it("lets the next section step off a ramp's arrival", () => {
    expect(
      sectionTempoChanges(100, [
        { start: 0, end: 4, rampTo: 140 },
        { start: 4, end: 8, bpm: 130 },
      ]),
    ).toEqual([
      { bar: 4, bpm: 140, ramp: true },
      { bar: 4, bpm: 130 },
    ]);
  });
});
