import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition";
import {
  DEFAULT_VELOCITY,
  VELOCITY_STEPS,
  attachBends,
  buildTake,
  pressesToDetected,
  stepVelocity,
  summarizeTake,
  takeSlug,
  takeToComposition,
  validateTake,
  type BendGesture,
  type KeyPress,
  type Take,
} from "./take";

/** A press at a beat, one beat long, at 120 BPM — where a beat is 500 ms. */
function press(midi: number, beat: number, beats = 1): KeyPress {
  return { midi, downMs: beat * 500, upMs: (beat + beats) * 500, velocity: DEFAULT_VELOCITY };
}

const BASE = {
  name: "scratch",
  bpm: 120,
  key: "Am",
  instrument: "piano" as const,
  recordedAt: "2026-09-18T00:00:00.000Z",
};

describe("pressesToDetected", () => {
  it("turns a held key into a note of that length", () => {
    const [note] = pressesToDetected([press(60, 0, 2)]);
    expect(note).toMatchObject({ midi: 60, startSeconds: 0, durationSeconds: 1 });
  });

  it("measures from the downbeat, not from the first note", () => {
    // Played a beat late: the rest at the front is part of the idea.
    const [note] = pressesToDetected([press(60, 2)], { startMs: 500 });
    expect(note!.startSeconds).toBeCloseTo(0.5);
  });

  it("drops a fumbled key too short to be a note", () => {
    const fumble: KeyPress = { midi: 61, downMs: 0, upMs: 5, velocity: 0.8 };
    expect(pressesToDetected([fumble])).toEqual([]);
  });

  it("drops anything played before the downbeat rather than moving it", () => {
    expect(pressesToDetected([press(60, 0)], { startMs: 2000 })).toEqual([]);
  });

  it("carries velocity through as amplitude", () => {
    const [note] = pressesToDetected([{ midi: 60, downMs: 0, upMs: 500, velocity: 0.4 }]);
    expect(note!.amplitude).toBe(0.4);
  });

  it("sorts by time so a chord comes back low to high", () => {
    const notes = pressesToDetected([press(67, 0), press(60, 0), press(64, 0)]);
    expect(notes.map((n) => n.midi)).toEqual([60, 64, 67]);
  });
});

describe("stepVelocity", () => {
  it("walks the steps", () => {
    expect(stepVelocity(0.6, 1)).toBe(0.8);
    expect(stepVelocity(0.6, -1)).toBe(0.4);
  });

  it("stops at the ends", () => {
    expect(stepVelocity(VELOCITY_STEPS[0]!, -1)).toBe(VELOCITY_STEPS[0]);
    expect(stepVelocity(VELOCITY_STEPS.at(-1)!, 1)).toBe(VELOCITY_STEPS.at(-1));
  });

  it("snaps a value that is between steps", () => {
    expect(stepVelocity(0.75, 1)).toBe(1);
  });
});

describe("buildTake", () => {
  it("puts a quarter-note on the grid as four sixteenths", () => {
    const take = buildTake({ ...BASE, presses: [press(60, 0)] });
    expect(take.notes).toEqual([{ step: 0, lengthSteps: 4, midi: 60, velocity: 0.8 }]);
  });

  it("keeps a held chord held", () => {
    // The default that differs from the guitar path: three keys down together
    // are three notes, not one note cutting off the next.
    const take = buildTake({ ...BASE, presses: [press(60, 0, 4), press(64, 0, 4), press(67, 0, 4)] });
    expect(take.notes).toHaveLength(3);
    for (const note of take.notes) expect(note.lengthSteps).toBe(16);
  });

  it("cuts notes at the next onset when asked to", () => {
    const take = buildTake({
      ...BASE,
      monophonic: true,
      presses: [press(60, 0, 4), press(64, 1, 1)],
    });
    expect(take.notes[0]!.lengthSteps).toBe(4);
  });

  it("snaps to the grid it is given", () => {
    // A note played a shade early lands on the beat on a quarter grid.
    const early: KeyPress = { midi: 60, downMs: 1400, upMs: 1900, velocity: 0.8 };
    const take = buildTake({ ...BASE, grid: 1, presses: [early] });
    expect(take.notes[0]!.step).toBe(12);
  });

  it("refuses a performance with nothing in it", () => {
    expect(() => buildTake({ ...BASE, presses: [] })).toThrow(/nothing was played/);
  });

  it("refuses a key it cannot parse, before writing anything", () => {
    expect(() => buildTake({ ...BASE, key: "H sharp", presses: [press(60, 0)] })).toThrow();
  });

  it("records what it was played on", () => {
    const take = buildTake({ ...BASE, instrument: "pluck", voice: "sitar-jawari", presses: [press(60, 0)] });
    expect(take).toMatchObject({ instrument: "pluck", voice: "sitar-jawari", grid: 4, monophonic: false });
  });
});

describe("reading a take back", () => {
  const take = buildTake({ ...BASE, presses: [press(60, 0), press(64, 1), press(67, 2), press(72, 3)] });

  it("summarises in degrees of the key it was played in", () => {
    const summary = summarizeTake(take);
    expect(summary).toContain("A minor");
    expect(summary).toContain("degrees");
  });

  it("still summarises when the key is unusable", () => {
    const broken: Take = { ...take, key: "nonsense" };
    expect(summarizeTake(broken)).toContain("pitches");
  });

  it("becomes a one-track composition at the take's tempo", () => {
    const comp = takeToComposition(take, { name: "lioness-motif" });
    expect(comp.name).toBe("lioness-motif");
    expect(comp.bpm).toBe(120);
    expect(comp.tracks).toHaveLength(1);
    expect(comp.tracks[0]!.notes).toHaveLength(4);
  });

  it("lets the emitted piece choose a different instrument from the one played", () => {
    const comp = takeToComposition(take, { instrument: "lead", voice: "molten" });
    expect(comp.tracks[0]).toMatchObject({ instrument: "lead", voice: "molten" });
  });

  it("drops the played voice when the instrument changes under it", () => {
    // Caught a real one: a piano take emitted onto `lead` kept `soft-triangle`,
    // which is a piano preset, and the render died looking for it.
    const played = buildTake({ ...BASE, instrument: "piano", voice: "soft-triangle", presses: [press(60, 0)] });
    expect(takeToComposition(played, { instrument: "lead" }).tracks[0]!.voice).toBeUndefined();
  });

  it("keeps the played voice when the instrument stays the same", () => {
    const played = buildTake({ ...BASE, instrument: "piano", voice: "soft-triangle", presses: [press(60, 0)] });
    expect(takeToComposition(played).tracks[0]!.voice).toBe("soft-triangle");
  });
});

describe("validateTake", () => {
  const good = buildTake({ ...BASE, presses: [press(60, 0)] });

  it("passes a take it just built", () => {
    expect(validateTake(good)).toEqual([]);
  });

  it("catches an empty performance on disk", () => {
    expect(validateTake({ ...good, notes: [] })).toContain("notes is empty — nothing was played");
  });

  it("catches a bad tempo, grid and key", () => {
    const issues = validateTake({ ...good, bpm: 0, grid: 3, key: "Q" });
    expect(issues).toHaveLength(3);
  });

  it("refuses something that is not an object at all", () => {
    expect(validateTake(null)).toEqual(["take must be an object"]);
    expect(validateTake("a take")).toEqual(["take must be an object"]);
  });

  it("names the note that is wrong", () => {
    const issues = validateTake({ ...good, notes: [{ step: 0, midi: 60, lengthSteps: 0 }] });
    expect(issues[0]).toContain("notes[0]");
  });
});

describe("takeSlug", () => {
  it("makes a filename out of what the player typed", () => {
    expect(takeSlug("Lioness Motif ")).toBe("lioness-motif");
    expect(takeSlug("take #2 — tavern!")).toBe("take-2-tavern");
  });
});

describe("attachBends", () => {
  // One bar at 120 BPM: a sixteenth is 125 ms, a beat is 500 ms.
  const notes = [
    { step: 0, lengthSteps: 4, midi: 60, velocity: 0.8 },
    { step: 4, lengthSteps: 4, midi: 64, velocity: 0.8 },
  ];
  const at = (ms: number, semitones = 2, releasedMs?: number): BendGesture =>
    releasedMs === undefined ? { atMs: ms, semitones } : { atMs: ms, semitones, releasedMs };

  it("leaves the notes alone when nothing was bent", () => {
    expect(attachBends(notes, [], { bpm: 120 })).toEqual(notes);
  });

  it("gives the bend to the note sounding under it", () => {
    const [first, second] = attachBends(notes, [at(600)], { bpm: 120 });
    expect(first!.bend).toBeUndefined();
    expect(second!.bend).toMatchObject({ semitones: 2 });
  });

  it("records how far into the note the bend started", () => {
    // 250 ms into a 500 ms note is halfway.
    const [first] = attachBends(notes, [at(250)], { bpm: 120 });
    expect(first!.bend!.at).toBeCloseTo(0.5);
  });

  it("marks a bend that came back before the note ended", () => {
    const [first] = attachBends(notes, [at(100, 2, 300)], { bpm: 120 });
    expect(first!.bend!.release).toBe(true);
  });

  it("does not mark a release that happened after the note stopped", () => {
    const [first] = attachBends(notes, [at(100, 2, 900)], { bpm: 120 });
    expect(first!.bend!.release).toBeUndefined();
  });

  it("drops a bend played into silence rather than moving it to a note", () => {
    const bent = attachBends(notes, [at(4000)], { bpm: 120 });
    expect(bent.every((note) => note.bend === undefined)).toBe(true);
  });

  it("keeps the first bend when a note is bent twice", () => {
    const [first] = attachBends(notes, [at(100, 2), at(300, -2)], { bpm: 120 });
    expect(first!.bend!.semitones).toBe(2);
  });

  it("gives a bend under a chord to the top note", () => {
    const chord = [
      { step: 0, lengthSteps: 8, midi: 60, velocity: 0.8 },
      { step: 0, lengthSteps: 8, midi: 67, velocity: 0.8 },
    ];
    const bent = attachBends(chord, [at(200)], { bpm: 120 });
    expect(bent[0]!.bend).toBeUndefined();
    expect(bent[1]!.bend).toMatchObject({ semitones: 2 });
  });

  it("gives a bend to the note that started most recently", () => {
    const overlapping = [
      { step: 0, lengthSteps: 16, midi: 48, velocity: 0.8 },
      { step: 4, lengthSteps: 4, midi: 72, velocity: 0.8 },
    ];
    const bent = attachBends(overlapping, [at(600)], { bpm: 120 });
    expect(bent[0]!.bend).toBeUndefined();
    expect(bent[1]!.bend).toBeDefined();
  });

  it("clamps a bend that starts too late to travel", () => {
    // Released: two travels of 0.3 have to fit, so it can start no later than 0.4.
    const [first] = attachBends(notes, [at(460, 2, 480)], { bpm: 120 });
    expect(first!.bend!.at).toBeLessThanOrEqual(0.4);
  });

  it("leaves room for one travel when the bend is never released", () => {
    const [first] = attachBends(notes, [at(490)], { bpm: 120 });
    expect(first!.bend!.at).toBeLessThanOrEqual(0.7);
  });

  it("writes bends a composition will actually accept", () => {
    // The arithmetic `validateComposition` enforces is `at + travels * over <= 1`,
    // and a *performed* bend arrives with no idea how long its note was. Every
    // landing spot across a note, held and released, has to come out valid.
    for (const ms of [0, 60, 120, 240, 360, 480, 499]) {
      for (const release of [undefined, ms + 40, 10_000]) {
        const [first] = attachBends(notes, [at(ms, 2, release)], { bpm: 120 });
        const bend = first!.bend!;
        const travels = bend.release ? 2 : 1;
        expect(bend.at! + travels * 0.3).toBeLessThanOrEqual(1);
      }
    }
  });

  it("measures the gesture from the downbeat, like the notes", () => {
    const [first] = attachBends(notes, [at(1250)], { bpm: 120, startMs: 1000 });
    expect(first!.bend!.at).toBeCloseTo(0.5);
  });

  it("carries a bend down as a negative travel", () => {
    const [first] = attachBends(notes, [at(100, -2)], { bpm: 120 });
    expect(first!.bend!.semitones).toBe(-2);
  });
});

describe("the key when nobody stated one", () => {
  const base = { name: "t", bpm: 120, instrument: "piano" as const };

  it("infers it from the notes and says that it did", () => {
    const take = buildTake({
      ...base,
      presses: [press(69, 0), press(72, 1), press(76, 2), press(69, 3)],
    });
    expect(take.key).toBe("A minor");
    expect(take.keyGuessed).toBe(true);
  });

  it("believes a key it was given, and does not flag it", () => {
    const take = buildTake({ ...base, key: "D dorian", presses: [press(62, 0)] });
    expect(take.key).toBe("D dorian");
    expect(take.keyGuessed).toBeUndefined();
  });

  it("offers the relative key in the summary, so the guess can be argued with", () => {
    const take = buildTake({ ...base, presses: [press(69, 0), press(72, 1), press(76, 2)] });
    expect(summarizeTake(take)).toContain("C if that is the wrong end of the pair");
  });

  it("says nothing about the pair when the key was stated", () => {
    const take = buildTake({ ...base, key: "Am", presses: [press(69, 0)] });
    expect(summarizeTake(take)).not.toContain("wrong end of the pair");
  });
});

describe("a take with bends in it", () => {
  const bent = buildTake({
    name: "bendy",
    bpm: 120,
    key: "Am",
    instrument: "lead",
    presses: [press(69, 0), press(72, 1)],
    bends: [{ atMs: 250, semitones: 2, releasedMs: 400 }],
  });

  it("puts the bend on the note that was sounding", () => {
    expect(bent.notes[0]!.bend).toMatchObject({ semitones: 2, release: true });
    expect(bent.notes[1]!.bend).toBeUndefined();
  });

  it("names the bends in the summary", () => {
    expect(summarizeTake(bent)).toContain("bends");
    expect(summarizeTake(bent)).toContain("2 semitones up, released");
  });

  it("carries the bend into the emitted composition", () => {
    const comp = takeToComposition(bent, { name: "bendy" });
    expect(comp.tracks[0]!.notes[0]!.bend).toMatchObject({ semitones: 2 });
    expect(comp.tracks[0]!.notes[1]!.bend).toBeUndefined();
  });

  it("emits a composition the validator passes", () => {
    // Caught a real one: a released bend landing 0.41 into its note wrote
    // `at + 2 * over > 1` and `--emit` refused the piece after the performance
    // was already over.
    const late = buildTake({
      name: "late-bend",
      bpm: 120,
      key: "Am",
      instrument: "lead",
      presses: [press(69, 0)],
      bends: [{ atMs: 460, semitones: 2, releasedMs: 480 }],
    });
    expect(validateComposition(takeToComposition(late))).toEqual([]);
  });

  it("refuses a bend on disk with no semitones", () => {
    const broken = { ...bent, notes: [{ ...bent.notes[0]!, bend: { at: 0.5 } }] };
    expect(validateTake(broken)).toContain("notes[0].bend needs a numeric semitones");
  });
});
