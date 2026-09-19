import { describe, expect, it } from "vitest";
import type { KitSpec, VoicePreset } from "./voice";
import {
  PAD_CODES,
  drumPads,
  kitPieces,
  padForCode,
  padLabel,
  padLegend,
  padPlayable,
} from "./pads";

function kit(over: Partial<KitSpec> = {}): KitSpec {
  return {
    levels: { kick: 1, snare: 0.8, hat: 0.4 },
    membrane: { kick: { pitch: "C1", decay: 0.3 } },
    noise: { snare: { type: "white", hz: 1800, decay: 0.2 }, hat: { type: "white", hz: 8000, decay: 0.05 } },
    ...over,
  } as KitSpec;
}

function preset(over: Partial<VoicePreset> = {}): VoicePreset {
  return { instrument: "drums", slug: "club-kit", title: "Club kit", status: "approved", kit: kit(), ...over };
}

describe("kitPieces", () => {
  it("lists membrane and noise pieces in canonical order, not the preset's", () => {
    expect(kitPieces(preset())).toEqual(["kick", "snare", "hat"]);
  });

  it("leaves out a piece the kit does not voice", () => {
    expect(kitPieces(preset())).not.toContain("crash");
  });

  it("has nothing to draw for a preset with no kit", () => {
    expect(kitPieces(preset({ kit: undefined }))).toEqual([]);
  });
});

describe("drumPads", () => {
  it("assigns the keys in grid order", () => {
    const pads = drumPads(preset());
    expect(pads.map((pad) => pad.code)).toEqual([PAD_CODES[0], PAD_CODES[1], PAD_CODES[2]]);
    expect(pads[0]).toMatchObject({ piece: "kick", keyLabel: "Q" });
  });

  it("draws a pad past the twelfth with no key on it rather than doubling one up", () => {
    const wide = preset({
      kit: kit({
        membrane: {
          kick: { pitch: "C1", decay: 0.3 },
          "tom-lo": { pitch: "G1", decay: 0.3 },
          "tom-mid": { pitch: "C2", decay: 0.3 },
          "tom-hi": { pitch: "E2", decay: 0.3 },
        },
        noise: Object.fromEntries(
          ["snare", "rim", "clap", "hat", "open-hat", "ride", "crash", "shaker"].map((piece) => [
            piece,
            { type: "white", hz: 4000, decay: 0.1 },
          ]),
        ) as KitSpec["noise"],
      }),
    });
    const pads = drumPads(wide);
    expect(pads).toHaveLength(12);
    expect(new Set(pads.map((pad) => pad.code)).size).toBe(12);
  });
});

describe("padLabel", () => {
  it("reads the hyphen out of a piece name", () => {
    expect(padLabel("open-hat")).toBe("open hat");
    expect(padLabel("kick")).toBe("kick");
  });
});

describe("padPlayable", () => {
  it("plays a kit with pieces in it", () => {
    expect(padPlayable(preset())).toBe(true);
  });

  it("refuses a pitched voice — those belong at the keyboard", () => {
    expect(padPlayable(preset({ instrument: "piano", kit: undefined }))).toBe(false);
  });

  it("refuses a kit that voices nothing", () => {
    expect(padPlayable(preset({ kit: kit({ membrane: {}, noise: {} }) }))).toBe(false);
  });
});

describe("padForCode", () => {
  it("finds the piece under a key, and nothing under a key with no pad", () => {
    const pads = drumPads(preset());
    expect(padForCode("KeyQ", pads)).toBe("kick");
    expect(padForCode("KeyP", pads)).toBeUndefined();
  });
});

describe("padLegend", () => {
  it("names only controls that are on screen", () => {
    const pads = drumPads(preset());
    expect(padLegend(pads, false)).toContain("Q W E R");
    expect(padLegend(pads, true)).toContain("tap a pad");
    expect(padLegend(pads, true)).not.toContain("esc");
  });

  it("counts one piece singular", () => {
    expect(padLegend([{ piece: "kick", label: "kick" }], true)).toContain("1 piece");
  });
});
