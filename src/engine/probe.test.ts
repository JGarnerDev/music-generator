import { describe, expect, it } from "vitest";
import { compositionDurationSeconds } from "./arrange";
import { DRUM_PIECES, INSTRUMENT_NAMES, validateComposition } from "./composition";
import { DEFAULT_PROBES, PROBE_NAMES, probeComposition, probeFor } from "./probe";
import type { VoicePreset } from "./voice";

const preset = (over: Partial<VoicePreset> = {}): VoicePreset =>
  ({ instrument: "bass", slug: "round-thumb", title: "Round thumb", status: "draft", ...over }) as VoicePreset;

describe("probeFor", () => {
  it("gives every instrument an étude", () => {
    for (const instrument of INSTRUMENT_NAMES) {
      expect(probeFor(preset({ instrument })).notes.length).toBeGreaterThan(0);
    }
  });

  it("lets a preset override its instrument's default", () => {
    expect(probeFor(preset({ probe: "lead" })).name).toBe("lead");
  });

  it("ignores an unknown probe name rather than rendering nothing", () => {
    expect(probeFor(preset({ probe: "nonsense" })).name).toBe(DEFAULT_PROBES.bass);
  });
});

describe("probeComposition", () => {
  it("produces a valid composition for every instrument", () => {
    for (const instrument of INSTRUMENT_NAMES) {
      expect(validateComposition(probeComposition(preset({ instrument })))).toEqual([]);
    }
  });

  it("plays one track — the voice under test, alone", () => {
    const comp = probeComposition(preset({ instrument: "lead", slug: "molten" }));
    expect(comp.tracks).toHaveLength(1);
    expect(comp.tracks[0]!.instrument).toBe("lead");
    expect(comp.tracks[0]!.voice).toBe("molten");
  });

  it("names the render after the voice, so two voices never collide", () => {
    expect(probeComposition(preset({ instrument: "pad", slug: "warm-glass" })).name).toBe(
      "voice-pad-warm-glass",
    );
  });

  it("leaves lofi unset, so a probe is heard through the same chain a song is", () => {
    expect(probeComposition(preset()).lofi).toBeUndefined();
  });

  it("stays short enough to audition — under 45 seconds", () => {
    for (const instrument of INSTRUMENT_NAMES) {
      const comp = probeComposition(preset({ instrument }));
      const seconds = compositionDurationSeconds(comp);
      expect(seconds).toBeGreaterThan(8);
      expect(seconds).toBeLessThan(45);
    }
  });

  it("exercises every kit piece, so no drum is approved unheard", () => {
    const comp = probeComposition(preset({ instrument: "drums", slug: "house-kit" }));
    const heard = new Set(comp.tracks[0]!.notes.map((n) => n.pitch));
    expect([...DRUM_PIECES].filter((piece) => !heard.has(piece))).toEqual([]);
  });

  it("covers a wide register on the pitched études", () => {
    for (const name of PROBE_NAMES) {
      if (name === "kit") continue;
      const octaves = new Set(
        probeFor(preset({ probe: name })).notes.map((n) => n.pitch.match(/\d+$/)?.[0]),
      );
      expect(octaves.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("asks a dynamics question — quiet and loud on the same étude", () => {
    for (const name of PROBE_NAMES) {
      const velocities = probeFor(preset({ probe: name })).notes.map((n) => n.velocity ?? 0.7);
      expect(Math.max(...velocities) - Math.min(...velocities)).toBeGreaterThanOrEqual(0.4);
    }
  });
});
