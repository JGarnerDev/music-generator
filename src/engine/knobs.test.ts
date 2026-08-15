import { describe, it, expect } from "vitest";
import { REGISTERS, chooseKnobs, describeKnobs, registerBand, tempoFor } from "./knobs";
import { figureFitsMeter } from "./figure";
import { pitchToMidi } from "./theory";
import { makeRng, seedFromString } from "@utils/random";

const rngFor = (seed: string) => makeRng(seedFromString(seed));
const knobsFor = (mood: string, seed = "s") => chooseKnobs(mood, rngFor(seed));

describe("chooseKnobs", () => {
  it("is deterministic in (mood, seed)", () => {
    expect(knobsFor("a rooftop chase")).toEqual(knobsFor("a rooftop chase"));
  });

  it("gives a different take on a different seed", () => {
    const takes = ["1", "2", "3", "4", "5"].map((s) => JSON.stringify(knobsFor("a scene", s)));
    expect(new Set(takes).size).toBeGreaterThan(1);
  });

  it("lets the scene pick the cell — a chase and a funeral cannot collide", () => {
    const chase = knobsFor("a rooftop chase");
    const funeral = knobsFor("a slow funeral procession");
    expect(chase.figures[0]).not.toBe(funeral.figures[0]);
    expect(chase.tempo).toBe("fast");
    expect(funeral.tempo).toBe("slow");
  });

  it("puts a cave low and a lullaby high", () => {
    expect(knobsFor("deep in a cave").register).toBe("subterranean");
    expect(knobsFor("a lullaby").register).toBe("high");
  });

  it("matches inside longer words, so 'chasing' is still a chase", () => {
    expect(knobsFor("chasing the cart").matched).toContain("chase");
  });

  it("varies the cell between sections rather than restating it", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const { figures } = knobsFor("a rooftop chase", seed);
      expect(figures).toHaveLength(2);
      expect(figures[0], seed).not.toBe(figures[1]);
    }
  });

  it("says when nothing matched, instead of quietly defaulting", () => {
    const knobs = knobsFor("zzzz qqqq");
    expect(knobs.matched).toEqual([]);
    expect(knobs.figureFromScene).toBe(false);
    // Still a real choice, not one hard-coded cell every time.
    expect(knobs.figures[0]).toBeTruthy();
  });

  it("never lands on a random default across many unmatched moods", () => {
    const chosen = new Set(
      Array.from({ length: 30 }, (_, i) => knobsFor("zzzz", String(i)).figures[0]),
    );
    expect(chosen.size).toBeGreaterThan(1);
  });

  it("only offers cells that state a whole bar of the meter", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const { figures } = chooseKnobs("a waltz in the ballroom", rngFor(seed), [3, 4]);
      for (const figure of figures) expect(figureFitsMeter(figure, [3, 4]), figure).toBe(true);
    }
  });

  it("throws rather than guessing when no cell fits the meter", () => {
    expect(() => chooseKnobs("anything", rngFor("s"), [5, 4])).toThrow(/no figure states/);
  });
});

describe("registers", () => {
  it("is at least an octave wide, so a key keeps its shape", () => {
    for (const name of Object.keys(REGISTERS) as (keyof typeof REGISTERS)[]) {
      const [low, high] = registerBand(name);
      expect(pitchToMidi(high) - pitchToMidi(low), name).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("tempoFor", () => {
  it("stays inside the palette's range", () => {
    const rng = rngFor("t");
    for (const lean of ["slow", "mid", "fast"] as const) {
      for (let i = 0; i < 20; i++) {
        const bpm = tempoFor(lean, [60, 78], rng);
        expect(bpm).toBeGreaterThanOrEqual(60);
        expect(bpm).toBeLessThanOrEqual(78);
      }
    }
  });

  it("puts slow below fast", () => {
    const slow = tempoFor("slow", [60, 180], rngFor("a"));
    const fast = tempoFor("fast", [60, 180], rngFor("a"));
    expect(slow).toBeLessThan(fast);
  });

  it("copes with a range of one tempo", () => {
    expect(tempoFor("fast", [120, 120], rngFor("a"))).toBe(120);
  });
});

describe("describeKnobs", () => {
  it("names every knob, so the choice can be argued with", () => {
    const lines = describeKnobs(knobsFor("a rooftop chase")).join("\n");
    expect(lines).toMatch(/figures/);
    expect(lines).toMatch(/register/);
    expect(lines).toMatch(/tempo/);
    expect(lines).toMatch(/harmony/);
    expect(lines).toMatch(/chase/);
  });

  it("admits when it chose at random", () => {
    expect(describeKnobs(knobsFor("zzzz")).join("\n")).toMatch(/no scene word matched/);
  });
});
