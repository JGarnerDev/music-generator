import { describe, expect, it } from "vitest";
import {
  BEND_KEYS,
  BEND_SEMITONES,
  bendDirection,
  DEFAULT_OCTAVE,
  LOWER_MANUAL,
  NOTE_KEYS,
  OCTAVE_RANGE,
  UPPER_MANUAL,
  baseMidi,
  inScale,
  isBlack,
  midiForCode,
  pianoKeys,
  pitchClassOf,
  scalePitchClasses,
  semitoneFor,
  shiftOctave,
} from "./keys";

describe("the layout", () => {
  it("puts Z on the base octave's C", () => {
    expect(midiForCode("KeyZ", 4)).toBe(60);
  });

  it("puts Q an octave above Z", () => {
    expect(midiForCode("KeyQ", 4)! - midiForCode("KeyZ", 4)!).toBe(12);
  });

  it("leaves F and K silent — there is no black note there", () => {
    expect(semitoneFor("KeyF")).toBeUndefined();
    expect(semitoneFor("KeyK")).toBeUndefined();
  });

  it("has no key sounding a note twice within a manual", () => {
    for (const manual of [LOWER_MANUAL, UPPER_MANUAL]) {
      const semitones = manual.map((k) => k.semitone);
      expect(new Set(semitones).size).toBe(semitones.length);
    }
  });

  it("binds every code exactly once across both manuals", () => {
    const codes = NOTE_KEYS.map((k) => k.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("puts the black keys where the black keys are", () => {
    // The row above the home row must land on exactly the accidentals.
    const blacks = LOWER_MANUAL.filter((k) => isBlack(baseMidi(4) + k.semitone)).map((k) => k.label);
    expect(blacks).toEqual(["S", "D", "G", "H", "J", "L", ";"]);
  });

  it("does not bind the arrow keys, which move the hands", () => {
    for (const code of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Escape"]) {
      expect(semitoneFor(code)).toBeUndefined();
    }
  });
});

describe("bending", () => {
  it("bends down with the left index finger and up with the right", () => {
    expect(bendDirection("KeyF")).toBe(-1);
    expect(bendDirection("KeyK")).toBe(1);
  });

  it("bends nothing with a key that is not a bend key", () => {
    expect(bendDirection("KeyZ")).toBeUndefined();
    expect(bendDirection("Space")).toBeUndefined();
  });

  it("only ever uses keys that sound no note", () => {
    for (const code of Object.keys(BEND_KEYS)) expect(semitoneFor(code)).toBeUndefined();
  });

  it("bends a whole step — the gesture, not a detune", () => {
    expect(BEND_SEMITONES).toBe(2);
  });
});

describe("octaves", () => {
  it("counts C4 as 60", () => {
    expect(baseMidi(4)).toBe(60);
  });

  it("stops at the ends rather than wrapping", () => {
    const [low, high] = OCTAVE_RANGE;
    expect(shiftOctave(low, -1)).toBe(low);
    expect(shiftOctave(high, 1)).toBe(high);
    expect(shiftOctave(DEFAULT_OCTAVE, 1)).toBe(DEFAULT_OCTAVE + 1);
  });

  it("keeps the whole upper manual inside MIDI at the top octave", () => {
    const [, high] = OCTAVE_RANGE;
    const top = Math.max(...pianoKeys(high).map((k) => k.midi));
    expect(top).toBeLessThanOrEqual(127);
  });
});

describe("the drawn keyboard", () => {
  it("has one key per pitch, not one per cap", () => {
    const keys = pianoKeys(4);
    expect(new Set(keys.map((k) => k.midi)).size).toBe(keys.length);
  });

  it("carries both caps where the manuals overlap", () => {
    const c5 = pianoKeys(4).find((k) => k.midi === 72)!;
    expect(c5.labels).toEqual([",", "Q"]);
    expect(c5.codes).toEqual(["Comma", "KeyQ"]);
  });

  it("comes back in ascending pitch", () => {
    const midis = pianoKeys(3).map((k) => k.midi);
    expect([...midis].sort((a, b) => a - b)).toEqual(midis);
  });

  it("names the pitch the key sounds", () => {
    expect(pianoKeys(4)[0]).toMatchObject({ midi: 60, pitch: "C4", black: false });
  });

  it("moves with the octave", () => {
    expect(pianoKeys(3)[0]!.midi).toBe(pianoKeys(4)[0]!.midi - 12);
  });

  it("draws every key the hook can trigger", () => {
    const drawn = new Set(pianoKeys(4).flatMap((k) => k.codes));
    for (const binding of NOTE_KEYS) expect(drawn.has(binding.code)).toBe(true);
  });
});

describe("key signatures", () => {
  it("reads accidentals in a note name", () => {
    expect(pitchClassOf("C")).toBe(0);
    expect(pitchClassOf("Bb")).toBe(10);
    expect(pitchClassOf("F#")).toBe(6);
    expect(pitchClassOf("Cb")).toBe(11);
  });

  it("shades the seven notes of A minor and nothing else", () => {
    const classes = scalePitchClasses("A", "minor");
    expect(classes.size).toBe(7);
    expect(inScale(69, classes)).toBe(true); // A
    expect(inScale(70, classes)).toBe(false); // Bb
    expect(inScale(60, classes)).toBe(true); // C
  });

  it("is octave-blind", () => {
    const classes = scalePitchClasses("C", "major");
    expect(inScale(60, classes)).toBe(inScale(72, classes));
  });
});
