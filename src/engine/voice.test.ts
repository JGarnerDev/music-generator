import { describe, expect, it } from "vitest";
import { isAmped, SUMMARY_MAX, validateVoice, type VoicePreset } from "./voice";

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

  it("accepts a summary that fits in a table cell", () => {
    expect(validateVoice(synthVoice({ summary: "Fat low end that still moves." }))).toEqual([]);
  });

  it("rejects a summary long enough to become a second notes field", () => {
    const essay = "x".repeat(SUMMARY_MAX + 1);
    expect(paths(validateVoice(synthVoice({ summary: essay })))).toContain("summary");
  });

  it("rejects a multi-line summary — the archive row is one cell", () => {
    expect(paths(validateVoice(synthVoice({ summary: "Fat.\nRound." })))).toContain("summary");
  });

  it("accepts notes of any length — the essay is not in the archive", () => {
    expect(validateVoice(synthVoice({ notes: "y".repeat(4000) }))).toEqual([]);
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

  it("only lets the amped instruments carry an amp", () => {
    expect(paths(validateVoice(synthVoice({ instrument: "piano", amp } as Partial<VoicePreset>)))).toContain("amp");
    expect(validateVoice(synthVoice({ instrument: "lead", amp } as Partial<VoicePreset>))).toEqual([]);
    expect(validateVoice(synthVoice({ amp } as Partial<VoicePreset>))).toEqual([]);
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

  it("accepts the acoustic blocks on a pitched voice", () => {
    const issues = validateVoice(
      synthVoice({
        vibrato: { rate: 5.5, depth: 0.05, drift: 0.4 },
        body: [{ frequency: 275, q: 4, gain: 5 }, { frequency: 460, q: 3, gain: -2 }],
        breath: { level: 0.06, hz: 4200, q: 0.9 },
      } as Partial<VoicePreset>),
    );
    expect(issues).toEqual([]);
  });

  it("keeps the acoustic blocks off a kit, which has no pitch to move", () => {
    const issues = validateVoice(
      kitVoice({ vibrato: { rate: 5, depth: 0.1 }, body: [{ frequency: 275, q: 4, gain: 5 }] }),
    );
    expect(paths(issues)).toEqual(expect.arrayContaining(["vibrato", "body"]));
  });

  it("catches a vibrato depth written in cents", () => {
    const issues = validateVoice(synthVoice({ vibrato: { rate: 5.5, depth: 25 } } as Partial<VoicePreset>));
    expect(paths(issues)).toEqual(["vibrato.depth"]);
  });

  it("caps a body at four resonances, and needs a real one in each", () => {
    const one = { frequency: 300, q: 3, gain: 4 };
    expect(paths(validateVoice(synthVoice({ body: [one, one, one, one, one] } as Partial<VoicePreset>)))).toEqual(["body"]);
    expect(paths(validateVoice(synthVoice({ body: [] } as Partial<VoicePreset>)))).toEqual(["body"]);
    expect(
      paths(validateVoice(synthVoice({ body: [{ frequency: 0, q: 3, gain: "loud" }] } as unknown as Partial<VoicePreset>))),
    ).toEqual(["body[0].frequency", "body[0].gain"]);
  });

  it("lets a body resonance be a notch but not a negative Q", () => {
    expect(validateVoice(synthVoice({ body: [{ frequency: 800, q: 2, gain: -6 }] } as Partial<VoicePreset>))).toEqual([]);
    expect(paths(validateVoice(synthVoice({ body: [{ frequency: 800, q: -2, gain: 6 }] } as Partial<VoicePreset>)))).toEqual([
      "body[0].q",
    ]);
  });

  it("rejects breath louder than the instrument it is meant to sit inside", () => {
    const issues = validateVoice(synthVoice({ breath: { level: 3, hz: 4000 } } as Partial<VoicePreset>));
    expect(paths(issues)).toEqual(["breath.level"]);
  });

  it("accepts a tremolo on a pitched voice", () => {
    expect(validateVoice(synthVoice({ tremolo: { rate: 7.5, depth: 0.5, spread: 90 } } as Partial<VoicePreset>))).toEqual(
      [],
    );
  });

  it("rejects a stroke rate that is a wobble or a buzz", () => {
    expect(paths(validateVoice(synthVoice({ tremolo: { rate: 0.5, depth: 0.5 } } as Partial<VoicePreset>)))).toEqual([
      "tremolo.rate",
    ]);
    expect(paths(validateVoice(synthVoice({ tremolo: { rate: 60, depth: 0.5 } } as Partial<VoicePreset>)))).toEqual([
      "tremolo.rate",
    ]);
  });

  it("catches a tremolo depth written as a percentage", () => {
    const issues = validateVoice(synthVoice({ tremolo: { rate: 8, depth: 50 } } as Partial<VoicePreset>));
    expect(paths(issues)).toEqual(["tremolo.depth"]);
  });

  it("keeps a tremolo off a kit, which has no bow to reverse", () => {
    expect(paths(validateVoice(kitVoice({ tremolo: { rate: 8, depth: 0.5 } })))).toContain("tremolo");
  });

  it("accepts a section on a pitched voice", () => {
    const issues = validateVoice(
      synthVoice({
        instrument: "pad",
        section: { players: 6, detune: 12, timing: 0.03, seats: 0.7, bodyVary: 0.02, vibratoVary: 0.15 },
      } as Partial<VoicePreset>),
    );
    expect(issues).toEqual([]);
  });

  it("rejects a section a player at a time can't be", () => {
    expect(paths(validateVoice(synthVoice({ section: { players: 1, detune: 10, timing: 0.02 } } as Partial<VoicePreset>)))).toEqual([
      "section.players",
    ]);
    expect(
      paths(validateVoice(synthVoice({ section: { players: 6.5, detune: 10, timing: 0.02 } } as Partial<VoicePreset>))),
    ).toEqual(["section.players"]);
    expect(paths(validateVoice(synthVoice({ section: { players: 40, detune: 10, timing: 0.02 } } as Partial<VoicePreset>)))).toEqual(
      ["section.players"],
    );
  });

  it("catches a timing smear written in milliseconds", () => {
    const issues = validateVoice(synthVoice({ section: { players: 4, detune: 10, timing: 30 } } as Partial<VoicePreset>));
    expect(paths(issues)).toEqual(["section.timing"]);
  });

  it("catches section variation amounts written as percentages", () => {
    const issues = validateVoice(
      synthVoice({ section: { players: 4, detune: 10, timing: 0.02, seats: 60, vibratoVary: 12 } } as Partial<VoicePreset>),
    );
    expect(paths(issues)).toEqual(["section.seats", "section.vibratoVary"]);
  });

  it("keeps a section off a kit, which has no players to disagree", () => {
    const issues = validateVoice(kitVoice({ section: { players: 4, detune: 10, timing: 0.02 } }));
    expect(paths(issues)).toContain("section");
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
    expect(isAmped("bass")).toBe(true);
    expect(isAmped("piano")).toBe(false);
    expect(isAmped("drums")).toBe(false);
  });
});
