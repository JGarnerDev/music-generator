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

  it("merges every layer's instruments in order, for provenance", () => {
    const d = blendPalettes([emotion(), jazz, synth]);
    expect(d.instruments).toEqual(["piano", "pad", "epiano", "bass", "pluck"]);
  });

  it("lets the timbre decide the voices — that is what a timbre is", () => {
    // The emotion mentions a piano in passing; the timbre says what this piece
    // *is*. Before this rule the piano won and a guitar blend played on keys.
    const d = blendPalettes([emotion(), jazz, synth]);
    expect(d.leadVoice).toBe("pluck");
  });

  it("falls back to the merged set when no layer names an instrument", () => {
    const bare = parsePalette(`---
kind: timbre
slug: bare
title: Bare
tags: [bare]
signal: [tape-saturation]
---
body`);
    const d = blendPalettes([emotion(), bare]);
    expect(d.leadVoice).toBe("piano");
    expect(d.padVoice).toBe("pad");
  });

  it("sings on the lead rig when it comps on the rhythm one", () => {
    // `pluck` and `lead` are one guitar with two rigs; a solo on the rhythm
    // tone is the puny-solo problem, and no palette should have to say so.
    const d = blendPalettes([emotion(), jazz, synth]);
    expect(d.leadVoice).toBe("pluck");
    expect(d.melodyVoice).toBe("lead");
  });

  it("keeps the comping voice for the tune when it is a keys voice", () => {
    const d = blendPalettes([emotion(), jazz]);
    expect(d.leadVoice).toBe("epiano");
    expect(d.melodyVoice).toBe("epiano");
  });

  it("uses a sustaining voice for the pad, preferring one the layers named", () => {
    const noPad = parsePalette(`---
kind: timbre
slug: keys
title: Keys
tags: [keys]
instruments: [epiano]
---
body`);
    expect(blendPalettes([emotion(), noPad]).padVoice).toBe("epiano");
    expect(blendPalettes([emotion(), synth]).padVoice).toBe("pad");
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

describe("mode warnings", () => {
  const minorGenre: Palette = parsePalette(`---
kind: genre
slug: metal
title: Metal
tags: [metal]
tempo: [120, 180]
mode: aeolian
---
body`);

  const major = (): Palette =>
    parsePalette(`---
kind: emotion
slug: happy
title: Happy
tags: [happy]
tonality:
  tonic: C
  scale: major
progressions:
  - [I, V, vi, IV]
tempo: [100, 130]
---
body`);

  it("warns when a genre's mode fights the emotion's key", () => {
    // The reproducer from progress.md: the chords go minor while the melody is
    // still drawn from the emotion's major scale.
    const d = blendPalettes([major(), minorGenre]);
    expect(d.warnings).toHaveLength(1);
    expect(d.warnings[0]).toMatch(/metal leans aeolian but the key is major/);
  });

  it("stays quiet when the genre and the key agree, whatever they call it", () => {
    // The genre says `aeolian`, the emotion says `minor`. Same seven notes.
    expect(blendPalettes([emotion(), minorGenre]).warnings).toEqual([]);
  });

  it("stays quiet for a genre that recolours either way", () => {
    expect(blendPalettes([major(), jazz]).warnings).toEqual([]);
  });

  const dorian: Palette = parsePalette(`---
kind: genre
slug: medieval
title: Medieval
tags: [medieval]
tempo: [80, 110]
mode: dorian
---
body`);

  it("calls a cross-family clash what it is", () => {
    expect(blendPalettes([major(), dorian]).warnings[0]).toMatch(/passing notes can rub/);
  });

  it("says when a genre's mode is simply being ignored", () => {
    // Dorian under an aeolian key is no clash — both are minor-idiom — but the
    // natural sixth the genre exists for never arrives, because the emotion is
    // the sole source of tonality. That silence is what the `mode` field spent
    // years not saying.
    const [warning] = blendPalettes([emotion(), dorian]).warnings;
    expect(warning).toMatch(/wants dorian/);
    expect(warning).toMatch(/scale: dorian/);
  });

  it("says nothing when the emotion already supplies the genre's mode", () => {
    const dorianEmotion = parsePalette(`---
kind: emotion
slug: solemn
title: Solemn
tags: [solemn]
tonality:
  tonic: G
  scale: dorian
progressions:
  - [i, VII, i, i]
tempo: [50, 72]
---
body`);
    expect(blendPalettes([dorianEmotion, dorian]).warnings).toEqual([]);
  });

  it("says nothing at all for a genre that declares no mode", () => {
    expect(blendPalettes([major(), synth]).warnings).toEqual([]);
  });
});
