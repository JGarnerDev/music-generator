import { describe, expect, it } from "vitest";
import { formatKey, guessKey, relativeOf } from "./key-guess";
import { parseKey } from "./transcribe";
import { pitchToMidi } from "./theory";

const midis = (...pitches: string[]): number[] => pitches.map(pitchToMidi);

describe("guessKey", () => {
  it("hears a C major scale as C major", () => {
    const guess = guessKey(midis("C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"));
    expect(guess.tonic).toBe("C");
    expect(guess.mode).toBe("major");
    expect(guess.fit).toBe(1);
  });

  it("hears the same notes as A minor when the phrase sits on A", () => {
    // Identical pitch content to the line above — only the gravity differs.
    const guess = guessKey(midis("A3", "C4", "E4", "G4", "F4", "E4", "D4", "A3"));
    expect(guess.tonic).toBe("A");
    expect(guess.mode).toBe("minor");
  });

  it("follows the accidentals into a distant key", () => {
    const guess = guessKey(midis("Eb4", "F4", "G4", "Ab4", "Bb4", "C5", "D5", "Eb5"));
    expect(guess.tonic).toBe("Eb");
    expect(guess.mode).toBe("major");
  });

  it("hears a minor phrase with its flat third", () => {
    const guess = guessKey(midis("D4", "E4", "F4", "G4", "A4", "Bb4", "C5", "D5"));
    expect(guess.mode).toBe("minor");
    expect(guess.tonic).toBe("D");
  });

  it("always offers the relative key as the alternative", () => {
    const guess = guessKey(midis("C4", "E4", "G4"));
    expect(guess.alternative).toEqual({ tonic: "A", mode: "minor" });
  });

  it("reports a chromatic phrase as a poor fit", () => {
    const chromatic = guessKey(midis("C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4"));
    expect(chromatic.fit).toBeLessThan(0.8);
  });

  it("reports a diatonic phrase as a perfect fit", () => {
    expect(guessKey(midis("A3", "B3", "C4", "D4", "E4")).fit).toBe(1);
  });

  it("is octave-blind", () => {
    const low = guessKey(midis("C3", "E3", "G3", "C3"));
    const high = guessKey(midis("C6", "E6", "G6", "C6"));
    expect(formatKey(low)).toBe(formatKey(high));
  });

  it("answers an empty phrase rather than throwing", () => {
    expect(guessKey([])).toMatchObject({ tonic: "C", mode: "major", fit: 0 });
  });

  it("always returns a key parseKey accepts", () => {
    for (const midi of [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]) {
      const guess = guessKey([midi, midi + 7, midi + 3]);
      expect(() => parseKey(formatKey(guess))).not.toThrow();
      expect(() => parseKey(formatKey(guess.alternative))).not.toThrow();
    }
  });
});

describe("relativeOf", () => {
  it("pairs a major key with the minor a third below", () => {
    expect(relativeOf({ tonic: "C", mode: "major" })).toEqual({ tonic: "A", mode: "minor" });
    expect(relativeOf({ tonic: "G", mode: "major" })).toEqual({ tonic: "E", mode: "minor" });
  });

  it("pairs a minor key with the major a third above", () => {
    expect(relativeOf({ tonic: "A", mode: "minor" })).toEqual({ tonic: "C", mode: "major" });
    expect(relativeOf({ tonic: "F", mode: "minor" })).toEqual({ tonic: "Ab", mode: "major" });
  });

  it("round-trips", () => {
    const key = { tonic: "D", mode: "minor" };
    expect(relativeOf(relativeOf(key))).toEqual(key);
  });
});

describe("formatKey", () => {
  it("writes what a player would say", () => {
    expect(formatKey({ tonic: "C", mode: "major" })).toBe("C");
    expect(formatKey({ tonic: "A", mode: "minor" })).toBe("A minor");
  });
});
