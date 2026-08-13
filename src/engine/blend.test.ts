import { describe, it, expect } from "vitest";
import { blendPalettes, BlendError } from "./blend";
import { parsePalette, type Palette } from "./palette";

const emotion = (over = ""): Palette =>
  parsePalette(`---
kind: emotion
slug: sad
title: Sad
tags: [sad]
tonality:
  tonic: A
  scale: minor
progressions:
  - [i, VI, III, VII]
tempo: [60, 78]
instruments: [piano, pad]
${over}---
body`);

const jazz: Palette = parsePalette(`---
kind: genre
slug: jazz
title: Jazz
tags: [jazz]
tempo: [70, 120]
mode: either
progressions:
  - [ii, V, I]
instruments: [epiano, bass]
---
body`);

const synth: Palette = parsePalette(`---
kind: timbre
slug: analog-synth
title: Analog Synth
tags: [synth]
instruments: [pluck]
signal: [overdrive, tape-echo, plate-reverb]
---
body`);

describe("blendPalettes", () => {
  it("takes tonality from the one emotion layer", () => {
    const d = blendPalettes([emotion()]);
    expect(d.tonic).toBe("A");
    expect(d.scale).toBe("minor");
    expect(d.slugs).toEqual(["sad"]);
  });

  it("requires exactly one emotion", () => {
    expect(() => blendPalettes([jazz])).toThrow(BlendError);
    expect(() => blendPalettes([emotion(), emotion()])).toThrow(BlendError);
  });

  it("lets a genre override the emotion's progressions", () => {
    const d = blendPalettes([emotion(), jazz]);
    expect(d.progressions).toEqual([["ii", "V", "I"]]);
  });

  it("keeps the emotion's progressions when no layer supplies any", () => {
    const d = blendPalettes([emotion(), synth]);
    expect(d.progressions).toEqual([["i", "VI", "III", "VII"]]);
  });

  it("intersects tempo ranges across layers", () => {
    const d = blendPalettes([emotion(), jazz]); // [60,78] ∩ [70,120] = [70,78]
    expect(d.tempo).toEqual([70, 78]);
  });

  it("falls back to the later layer's tempo on no overlap", () => {
    const fast = parsePalette(`---
kind: genre
slug: dnb
title: DnB
tags: [dnb]
tempo: [160, 180]
---
body`);
    const d = blendPalettes([emotion(), fast]); // [60,78] vs [160,180] → later wins
    expect(d.tempo).toEqual([160, 180]);
  });

  it("merges instruments in order and picks pad + lead voices", () => {
    const d = blendPalettes([emotion(), jazz, synth]);
    expect(d.instruments).toEqual(["piano", "pad", "epiano", "bass", "pluck"]);
    expect(d.padVoice).toBe("pad");
    expect(d.leadVoice).toBe("piano"); // first of piano>epiano>pluck present
  });

  it("gathers the signal chain and nudges lo-fi (drive darkens, ambience wets)", () => {
    const d = blendPalettes([emotion(), synth]);
    expect(d.signal).toEqual(["overdrive", "tape-echo", "plate-reverb"]);
    expect(d.lofi.lowpassHz).toBe(2000); // overdrive → darker
    expect(d.lofi.reverb).toBeGreaterThanOrEqual(0.45); // plate/echo → wetter
  });

  it("blends through a generic (unknown-kind) layer without error", () => {
    const era = parsePalette(`---
kind: era
slug: eighties
title: The 80s
tags: [retro]
instruments: [epiano]
---
gated reverb everywhere.`);
    const d = blendPalettes([emotion(), era]);
    expect(d.slugs).toEqual(["sad", "eighties"]);
    expect(d.instruments).toContain("epiano");
  });
});
