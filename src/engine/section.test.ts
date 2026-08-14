import { describe, expect, it } from "vitest";
import { planSection, sectionGain } from "./section";
import type { VoicePreset } from "./voice";

const preset = (over: Partial<VoicePreset> = {}): VoicePreset =>
  ({
    instrument: "pad",
    slug: "string-section",
    title: "String section",
    status: "draft",
    synth: {
      kind: "mono",
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.5 },
    },
    section: { players: 6, detune: 12, timing: 0.03 },
    ...over,
  }) as VoicePreset;

describe("planSection", () => {
  it("is empty for a voice with no section", () => {
    expect(planSection(preset({ section: undefined }))).toEqual([]);
  });

  it("seats one plan per player", () => {
    expect(planSection(preset())).toHaveLength(6);
  });

  it("is deterministic for a given voice, and different between voices", () => {
    expect(planSection(preset())).toEqual(planSection(preset()));
    expect(planSection(preset({ slug: "other-section" }))).not.toEqual(planSection(preset()));
  });

  it("spreads intonation across the range without clumping", () => {
    const detunes = planSection(preset()).map((p) => p.detune).sort((a, b) => a - b);
    expect(detunes[0]).toBeCloseTo(-6);
    expect(detunes[detunes.length - 1]!).toBeCloseTo(6);
    // Evenly dealt: every neighbouring pair is the same distance apart, which is
    // what stops two players landing on the same pitch and reading as one.
    const gaps = detunes.slice(1).map((d, i) => d - detunes[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!);
  });

  it("does not correlate intonation with seat", () => {
    // Dealt in order, detune would rise monotonically with the seat and the
    // section would sound like a pitch ramp across the stereo image.
    const detunes = planSection(preset({ section: { players: 8, detune: 14, timing: 0.03 } })).map(
      (p) => p.detune,
    );
    const sorted = [...detunes].sort((a, b) => a - b);
    expect(detunes).not.toEqual(sorted);
  });

  it("never has a player arriving early, and keeps one on the beat", () => {
    const plans = planSection(preset());
    expect(plans[0]!.delay).toBe(0);
    for (const plan of plans) {
      expect(plan.delay).toBeGreaterThanOrEqual(0);
      expect(plan.delay).toBeLessThanOrEqual(0.03);
    }
  });

  it("seats players symmetrically inside the stage width", () => {
    const pans = planSection(preset({ section: { players: 5, detune: 10, timing: 0.02, seats: 0.8 } })).map(
      (p) => p.pan,
    );
    expect(pans[0]).toBeCloseTo(-0.8);
    expect(pans[4]).toBeCloseTo(0.8);
    expect(pans[2]).toBeCloseTo(0);
  });

  it("collapses to mono seating when the section has no width", () => {
    const plans = planSection(preset({ section: { players: 4, detune: 10, timing: 0.02, seats: 0 } }));
    for (const plan of plans) expect(plan.pan).toBeCloseTo(0);
  });

  it("only ever pulls effort back, never past the written dynamic", () => {
    for (const plan of planSection(preset())) {
      expect(plan.effort).toBeLessThanOrEqual(1);
      expect(plan.effort).toBeGreaterThan(0.8);
    }
  });

  it("gives each player their own vibrato when the voice has one", () => {
    const plans = planSection(
      preset({ vibrato: { rate: 5.5, depth: 0.04, drift: 0.4 }, section: { players: 4, detune: 10, timing: 0.02 } }),
    );
    const rates = plans.map((p) => p.vibrato!.rate);
    expect(new Set(rates).size).toBe(4);
    for (const rate of rates) expect(rate).toBeGreaterThan(0);
    // The soloist's drift survives — it is a property of how a hand moves, not
    // of which player is holding the instrument.
    for (const plan of plans) expect(plan.vibrato!.drift).toBe(0.4);
  });

  it("leaves vibrato out entirely when the voice has none", () => {
    for (const plan of planSection(preset())) expect(plan.vibrato).toBeUndefined();
  });

  it("gives each player their own stroke rate, at the score's depth", () => {
    const plans = planSection(
      preset({
        tremolo: { rate: 7.5, depth: 0.5, spread: 90 },
        section: { players: 5, detune: 12, timing: 0.03, vibratoVary: 0.15 },
      }),
    );
    const rates = plans.map((p) => p.tremolo!.rate);
    expect(new Set(rates).size).toBe(5);
    // Spread is double the vibrato variation: bow rates are a shared intention,
    // not a constant of the hand.
    for (const rate of rates) {
      expect(rate).toBeGreaterThan(7.5 * 0.7);
      expect(rate).toBeLessThan(7.5 * 1.3);
    }
    // Depth and spread are the instruction, not the player.
    for (const plan of plans) {
      expect(plan.tremolo!.depth).toBe(0.5);
      expect(plan.tremolo!.spread).toBe(90);
    }
  });

  it("leaves tremolo out entirely when the voice is not bowing that way", () => {
    for (const plan of planSection(preset())) expect(plan.tremolo).toBeUndefined();
  });

  it("scatters body resonances without redesigning the instrument", () => {
    const body = [{ frequency: 275, q: 5, gain: 5 }, { frequency: 460, q: 3.5, gain: 4 }];
    const plans = planSection(preset({ body, section: { players: 4, detune: 10, timing: 0.02, bodyVary: 0.02 } }));
    const airModes = plans.map((p) => p.body![0]!.frequency);
    expect(new Set(airModes).size).toBe(4);
    for (const plan of plans) {
      expect(plan.body![0]!.frequency).toBeGreaterThan(275 * 0.98);
      expect(plan.body![0]!.frequency).toBeLessThan(275 * 1.02);
      // Q and gain are how the instrument was designed; only the wood differs.
      expect(plan.body![0]!.q).toBe(5);
      expect(plan.body![1]!.gain).toBe(4);
    }
  });
});

describe("sectionGain", () => {
  it("sums decorrelated players by power, not by amplitude", () => {
    expect(sectionGain(4)).toBeCloseTo(0.5);
    expect(sectionGain(1)).toBe(1);
  });
});
