import { describe, expect, it } from "vitest";
import { isAmped, validateVoice, type VoicePreset } from "./voice";

const synthVoice = (over: Partial<VoicePreset> = {}): unknown => ({
  instrument: "bass",
  slug: "round-thumb",
  title: "Round thumb",
  status: "draft",
  synth: {
    kind: "synth",
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.6 },
  },
  ...over,
});

const amp = {
  input: 1.7,
  tighten: 170,
  sag: { threshold: -16, ratio: 2.5 },
  preamp: 0.5,
  toneStack: { low: -5, mid: 3.5, high: -6 },
  cab: 4400,
  presence: { frequency: 2300, gain: 3.5 },
  width: 0.6,
  slap: { delayTime: 0.075, wet: 0.09 },
  sum: 0.42,
};

const kitVoice = (over: Record<string, unknown> = {}): unknown => ({
  instrument: "drums",
  slug: "house-kit",
  title: "House kit",
  status: "approved",
  kit: {
    levels: { kick: 1, snare: 0.8, hat: 0.32 },
    membrane: { kick: { pitch: "C1", decay: 0.4 } },
    noise: { snare: { hz: 1400, decay: 0.18, type: "white" }, hat: { hz: 7000, decay: 0.04, type: "white" } },
  },
  ...over,
});

const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

describe("validateVoice", () => {
  it("accepts a plain synth voice", () => {
    expect(validateVoice(synthVoice())).toEqual([]);
  });

  it("accepts a guitar voice with an amp", () => {
    expect(
      validateVoice(
        synthVoice({
          instrument: "pluck",
          amp,
          synth: {
            kind: "mono",
            oscillator: { type: "fatsawtooth", count: 2, spread: 10 },
            envelope: { attack: 0.003, decay: 0.3, sustain: 0.55, release: 0.28 },
            filter: { type: "lowpass", rolloff: -12, Q: 1.4 },
            filterEnvelope: {
              attack: 0.002,
              decay: 0.16,
              sustain: 0.32,
              release: 0.4,
              baseFrequency: 380,
              octaves: 3.6,
              exponent: 2,
            },
            maxPolyphony: 16,
          },
        } as Partial<VoicePreset>),
      ),
    ).toEqual([]);
  });

  it("accepts a drum kit", () => {
    expect(validateVoice(kitVoice())).toEqual([]);
  });

  it("rejects a non-object", () => {
    expect(paths(validateVoice(null))).toEqual(["$"]);
    expect(paths(validateVoice("bass"))).toEqual(["$"]);
  });

  it("checks the identity fields", () => {
    const issues = validateVoice({ instrument: "kazoo", slug: "Not Kebab", title: "", status: "maybe" });
    expect(paths(issues)).toEqual(expect.arrayContaining(["instrument", "slug", "title", "status"]));
  });

  it("rejects a synth block on a drums voice, and a kit on anything else", () => {
    expect(paths(validateVoice(kitVoice({ synth: { kind: "synth" } })))).toContain("synth");
    expect(paths(validateVoice(synthVoice({ kit: {} } as Partial<VoicePreset>)))).toContain("kit");
  });

  it("only lets the two guitar voices carry an amp", () => {
    expect(paths(validateVoice(synthVoice({ amp } as Partial<VoicePreset>)))).toContain("amp");
    expect(validateVoice(synthVoice({ instrument: "lead", amp } as Partial<VoicePreset>))).toEqual([]);
  });

  it("catches a sustain written as a time instead of a level", () => {
    const issues = validateVoice(
      synthVoice({
        synth: {
          kind: "synth",
          oscillator: { type: "sine" },
          envelope: { attack: 0.1, decay: 0.2, sustain: 1.5, release: 1 },
        },
      } as Partial<VoicePreset>),
    );
    expect(paths(issues)).toEqual(["synth.envelope.sustain"]);
  });

  it("catches a kit piece that is voiced but has no level", () => {
    const issues = validateVoice(
      kitVoice({
        kit: {
          levels: { kick: 1 },
          membrane: { kick: { pitch: "C1", decay: 0.4 } },
          noise: { snare: { hz: 1400, decay: 0.18, type: "white" } },
        },
      }),
    );
    expect(paths(issues)).toEqual(["kit.noise.snare"]);
  });

  it("catches a missing synth block", () => {
    const { synth: _dropped, ...rest } = synthVoice() as Record<string, unknown>;
    expect(paths(validateVoice(rest))).toContain("synth");
  });

  it("rejects an amp width outside 0..1", () => {
    const issues = validateVoice(
      synthVoice({ instrument: "lead", amp: { ...amp, width: 6 } } as Partial<VoicePreset>),
    );
    expect(paths(issues)).toContain("amp.width");
  });
});

describe("isAmped", () => {
  it("knows which instruments own a guitar rig", () => {
    expect(isAmped("pluck")).toBe(true);
    expect(isAmped("lead")).toBe(true);
    expect(isAmped("piano")).toBe(false);
    expect(isAmped("drums")).toBe(false);
  });
});
