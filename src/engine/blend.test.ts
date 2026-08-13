import { describe, it, expect } from "vitest";
import { blendPalettes, withAncestors, BlendError } from "./blend";
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

/** A genre subtype: `parent: jazz`, restating only its own progressions. */
const subtype: Palette = parsePalette(`---
kind: genre
slug: acid-jazz
title: Acid Jazz
tags: [acid]
parent: jazz
progressions:
  - [i, bII, i]
---
body`);

/** Two genres with different beats, for testing which one the blend keeps. */
const boomBap: Palette = parsePalette(`---
kind: genre
slug: lofi
title: Lo-Fi
tags: [lofi]
tempo: [70, 90]
groove:
  swing: 0.4
  swingUnit: 8n
  patterns:
    kick: "X.....x........."
    snare: "........X......."
---
body`);

const fourFloor: Palette = parsePalette(`---
kind: genre
slug: house
title: House
tags: [house]
tempo: [118, 128]
groove:
  patterns:
    kick: "X...X...X...X..."
---
body`);

describe("groove resolution", () => {
  it("has no groove when no layer states one — an emotion alone is drumless", () => {
    expect(blendPalettes([emotion()]).groove).toBeUndefined();
  });

  it("takes the groove from the genre that states one", () => {
    const d = blendPalettes([emotion(), boomBap]);
    expect(d.groove?.patterns.kick).toBe("X.....x.........");
    expect(d.groove?.swing).toBe(0.4);
    expect(d.groove?.swingUnit).toBe("8n");
  });

  it("keeps the last groove whole rather than merging lanes", () => {
    const d = blendPalettes([emotion(), boomBap, fourFloor]);
    expect(d.groove?.patterns).toEqual({ kick: "X...X...X...X..." });
    expect(d.groove?.swing).toBeUndefined();
  });

  it("survives a layer that states no groove on top of one that does", () => {
    const d = blendPalettes([emotion(), boomBap, synth]);
    expect(d.groove?.patterns.snare).toBe("........X.......");
  });

  it("rejects a groove with a bad step string at parse time", () => {
    expect(() =>
      parsePalette(`---
kind: genre
slug: broken
title: Broken
tags: [broken]
tempo: [90, 100]
groove:
  patterns:
    kick: "X..."
---
body`),
    ).toThrow(/multiple of 16/);
  });

  it("never treats drums as a melodic voice", () => {
    const withDrums = parsePalette(`---
kind: genre
slug: kit-only
title: Kit Only
tags: [kit]
tempo: [90, 100]
instruments: [drums, bass]
---
body`);
    const d = blendPalettes([emotion(), withDrums]);
    expect(d.instruments).not.toContain("drums");
    expect(d.instruments).toContain("bass");
    expect(d.leadVoice).not.toBe("drums");
  });
});

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

  it("lets the last progression-carrying layer win, so a subtype overrides its parent", () => {
    const d = blendPalettes([emotion(), jazz, subtype]);
    expect(d.progressions).toEqual([["i", "bII", "i"]]);
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

describe("withAncestors", () => {
  const all = [emotion(), jazz, synth, subtype];

  it("puts a parent before its subtype", () => {
    const layers = withAncestors([subtype], all);
    expect(layers.map((p) => p.frontmatter.slug)).toEqual(["jazz", "acid-jazz"]);
  });

  it("leaves a parentless palette alone", () => {
    const layers = withAncestors([synth], all);
    expect(layers.map((p) => p.frontmatter.slug)).toEqual(["analog-synth"]);
  });

  it("dedupes when the parent is also selected explicitly", () => {
    const layers = withAncestors([jazz, subtype], all);
    expect(layers.map((p) => p.frontmatter.slug)).toEqual(["jazz", "acid-jazz"]);
  });

  it("skips an unresolvable parent rather than throwing", () => {
    const orphan = parsePalette(`---
kind: genre
slug: orphan
title: Orphan
tags: [orphan]
parent: nowhere
tempo: [90, 100]
---
body`);
    const layers = withAncestors([orphan], [orphan]);
    expect(layers.map((p) => p.frontmatter.slug)).toEqual(["orphan"]);
  });

  it("lets a subtype inherit what it does not restate", () => {
    // acid-jazz carries no tempo/instruments — they come from jazz.
    const d = blendPalettes(withAncestors([emotion(), subtype], all));
    expect(d.tempo).toEqual([70, 78]); // emotion [60,78] ∩ jazz [70,120]
    expect(d.instruments).toEqual(["piano", "pad", "epiano", "bass"]);
    expect(d.progressions).toEqual([["i", "bII", "i"]]); // but its own harmony wins
  });
});
