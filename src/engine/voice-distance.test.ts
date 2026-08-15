import { describe, expect, it } from "vitest";
import type { SynthSpec, VoicePreset } from "./voice";
import { compareVoices, convergedPairs, kindOf } from "./voice-distance";

/** The synth every pad fixture starts from — spread it to vary one field. */
const BASE_SYNTH: SynthSpec = {
  kind: "synth",
  oscillator: { type: "sine" },
  envelope: { attack: 0.8, decay: 0.4, sustain: 0.7, release: 3 },
};

/** A minimal valid-shaped pad, as the base every fixture forks from. */
function pad(slug: string, overrides: Partial<VoicePreset> = {}): VoicePreset {
  return {
    instrument: "pad",
    slug,
    title: slug,
    status: "approved",
    synth: BASE_SYNTH,
    body: [{ frequency: 275, q: 3, gain: 4 }],
    ...overrides,
  } as VoicePreset;
}

/** `BASE_SYNTH` with one envelope field changed — the commonest fixture edit. */
function withEnvelope(changes: Partial<SynthSpec["envelope"]>): SynthSpec {
  return { ...BASE_SYNTH, envelope: { ...BASE_SYNTH.envelope, ...changes } };
}

/** The audible axes of one comparison, which is what every assertion is about. */
function audible(a: VoicePreset, b: VoicePreset): string[] {
  return compareVoices(a, b)
    .differences.filter((d) => d.audible)
    .map((d) => d.axis);
}

describe("kindOf", () => {
  it("calls body and a rig's tone controls weak — the lo-fi chain erodes them", () => {
    expect(kindOf("body")).toBe("weak");
    expect(kindOf("amp.toneStack.mid", 1, 2)).toBe("weak");
    expect(kindOf("amp.presence.gain", 1, 2)).toBe("weak");
    expect(kindOf("amp.cab", 4000, 6000)).toBe("weak");
  });

  it("judges envelopes, rates and levels by ratio", () => {
    expect(kindOf("synth.envelope.decay", 0.4, 0.8)).toBe("ratio");
    expect(kindOf("tremolo.rate", 7, 9)).toBe("ratio");
    expect(kindOf("breath.level", 0.05, 0.1)).toBe("ratio");
    expect(kindOf("section.players", 3, 6)).toBe("ratio");
  });

  it("splits the kit by gesture versus EQ", () => {
    expect(kindOf("kit.noise.snare.decay", 0.1, 0.2)).toBe("ratio");
    expect(kindOf("kit.levels.kick", 0.6, 1)).toBe("ratio");
    expect(kindOf("kit.membrane.kick.pitch", "C1", "G0")).toBe("pitch");
    expect(kindOf("kit.noise.snare.hz", 1400, 1900)).toBe("weak");
    expect(kindOf("kit.noise.snare.q", 0.9, 1.6)).toBe("weak");
  });

  it("treats a waveform or a synth kind as categorical", () => {
    expect(kindOf("synth.oscillator.type", "sine", "sawtooth")).toBe("categorical");
    expect(kindOf("synth.kind", "synth", "fm")).toBe("categorical");
    expect(kindOf("kit.noise.hat.type", "white", "pink")).toBe("categorical");
  });

  it("ignores maxPolyphony — a render budget, not a sound", () => {
    expect(kindOf("synth.maxPolyphony", 4, 8)).toBe("ignored");
  });

  it("defaults an unclassified field to ratio or categorical, never to weak", () => {
    expect(kindOf("somethingNew", 1, 2)).toBe("ratio");
    expect(kindOf("somethingNew", "a", "b")).toBe("categorical");
  });
});

describe("compareVoices — magnitude", () => {
  it("discounts a nudge that nobody can hear", () => {
    const a = pad("a");
    const b = pad("b", { synth: withEnvelope({ sustain: 0.65 }) });
    expect(audible(a, b)).toEqual([]);
    expect(compareVoices(a, b).converged).toBe(true);
  });

  it("counts a change of half again — the just-noticeable ratio", () => {
    const a = pad("a");
    const b = pad("b", { synth: withEnvelope({ release: 4.5 }) });
    expect(audible(a, b)).toEqual(["synth.envelope.release"]);
  });

  it("discounts a doubling of two milliseconds — the absolute floor", () => {
    const a = pad("a", { synth: withEnvelope({ attack: 0.002 }) });
    const b = pad("b", { synth: withEnvelope({ attack: 0.004 }) });
    expect(audible(a, b)).toEqual([]);
  });

  it("counts a semitone of kit tuning as nothing and a minor third as a drum", () => {
    const kit = (pitch: string) =>
      ({
        instrument: "drums",
        slug: pitch,
        title: pitch,
        status: "approved",
        kit: {
          levels: { kick: 1 },
          membrane: { kick: { pitch, decay: 0.4 } },
          noise: {},
        },
      }) as unknown as VoicePreset;
    expect(audible(kit("C1"), kit("B0"))).toEqual([]);
    expect(audible(kit("C1"), kit("A0"))).toEqual(["kit.membrane.kick.pitch"]);
  });
});

describe("compareVoices — axes", () => {
  it("flags a pair that differs only in body — the string-bed/mens-choir failure", () => {
    const result = compareVoices(
      pad("string-bed"),
      pad("mens-choir", { body: [{ frequency: 460, q: 3, gain: 6 }] }),
    );
    expect(result.converged).toBe(true);
    expect(result.differences.map((d) => d.axis)).toEqual(["body"]);
  });

  it("clears a pair separated in time by a tremolo", () => {
    const result = compareVoices(
      pad("string-bed"),
      pad("string-tremolo", { tremolo: { rate: 7.5, depth: 0.5 } }),
    );
    expect(result.converged).toBe(false);
    // One side has no tremolo at all, so the whole block is the difference.
    expect(audible(pad("string-bed"), pad("t", { tremolo: { rate: 7.5, depth: 0.5 } }))).toEqual([
      "tremolo",
    ]);
  });

  it("descends into a block both voices carry", () => {
    expect(
      audible(
        pad("slow-bow", { tremolo: { rate: 5, depth: 0.5 } }),
        pad("fast-bow", { tremolo: { rate: 9, depth: 0.5 } }),
      ),
    ).toEqual(["tremolo.rate"]);
  });

  it("clears a pair on a different waveform, however small the other numbers", () => {
    const a = pad("saw");
    const b = pad("tri", { synth: { ...BASE_SYNTH, oscillator: { type: "triangle" } } });
    expect(audible(a, b)).toEqual(["synth.oscillator.type"]);
  });

  it("ignores prose, tags and process fields", () => {
    const result = compareVoices(
      pad("a", { tags: ["one"], notes: "why", summary: "pick me", status: "draft" }),
      pad("b", { tags: ["two"], notes: "different", summary: "pick me instead" }),
    );
    expect(result.differences).toEqual([]);
    expect(result.converged).toBe(true);
  });

  it("ignores a polyphony difference outright", () => {
    const a = pad("a");
    const b = pad("b", { synth: { ...BASE_SYNTH, maxPolyphony: 12 } });
    expect(compareVoices(a, b).differences).toEqual([]);
  });

  it("treats an identical pair as converged — a duplicate is the extreme case", () => {
    expect(compareVoices(pad("a"), pad("b")).converged).toBe(true);
  });

  it("names both voices by their full id", () => {
    const result = compareVoices(pad("a"), pad("b"));
    expect([result.a, result.b]).toEqual(["pad/a", "pad/b"]);
  });
});

describe("convergedPairs", () => {
  it("only pairs voices within one instrument", () => {
    const bassy = { ...pad("twin"), instrument: "bass" } as VoicePreset;
    expect(convergedPairs([pad("twin"), bassy])).toEqual([]);
  });

  it("returns every converged pair in a group and nothing else", () => {
    const found = convergedPairs([
      pad("a"),
      pad("b", { body: [{ frequency: 460, q: 3, gain: 6 }] }),
      pad("c", { tremolo: { rate: 7.5, depth: 0.5 } }),
    ]);
    expect(found.map((p) => [p.a, p.b])).toEqual([["pad/a", "pad/b"]]);
  });

  it("is empty when every voice differs audibly", () => {
    const found = convergedPairs([
      pad("a"),
      pad("b", { tremolo: { rate: 7, depth: 0.5 } }),
      pad("c", { breath: { level: 0.05, hz: 3000 } }),
    ]);
    expect(found).toEqual([]);
  });
});
