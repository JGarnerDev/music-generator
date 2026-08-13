import { describe, it, expect } from "vitest";
import {
  parsePalette,
  matchPalettes,
  isEmotionPalette,
  PaletteParseError,
  type Palette,
} from "./palette";

const rawSad = `---
kind: emotion
slug: sad
title: Sad / Bittersweet
tags: [sad, grief, loss, bittersweet, melancholy, death, friend]
tonality:
  tonic: A
  scale: minor
progressions:
  - [i, VI, III, VII]
  - [i, iv, i, V]
tempo: [60, 78]
instruments: [piano, pad]
---
Lean on slow, sparse voicings. Let notes ring.`;

describe("parsePalette", () => {
  it("parses valid emotion frontmatter + body", () => {
    const p = parsePalette(rawSad);
    expect(p.frontmatter.kind).toBe("emotion");
    expect(p.frontmatter.slug).toBe("sad");
    if (!isEmotionPalette(p)) throw new Error("expected emotion");
    expect(p.frontmatter.tonality).toEqual({ tonic: "A", scale: "minor" });
    expect(p.frontmatter.progressions[0]).toEqual(["i", "VI", "III", "VII"]);
    expect(p.body).toContain("slow, sparse");
  });

  it("defaults a kind-less palette to emotion (back-compat)", () => {
    const noKind = rawSad.replace("kind: emotion\n", "");
    expect(parsePalette(noKind).frontmatter.kind).toBe("emotion");
  });

  it("parses a genre palette (no tonality required)", () => {
    const raw = `---
kind: genre
slug: jazz
title: Jazz
tags: [jazz, swing]
tempo: [80, 132]
mode: either
progressions:
  - [ii, V, I]
---
swung, walking bass.`;
    const p = parsePalette(raw);
    expect(p.frontmatter.kind).toBe("genre");
    expect(isEmotionPalette(p)).toBe(false);
  });

  it("parses a timbre palette (pure sound, no harmony)", () => {
    const raw = `---
kind: timbre
slug: analog-synth
title: Analog Synth
tags: [synth, warm]
instruments: [pad]
signal: [saw-detune, chorus]
character: warm detuned saws
---
vintage subtractive.`;
    const p = parsePalette(raw);
    expect(p.frontmatter.kind).toBe("timbre");
  });

  it("throws PaletteParseError on missing fields", () => {
    const bad = `---\nslug: broken\n---\nbody`;
    expect(() => parsePalette(bad)).toThrow(PaletteParseError);
  });

  it("accepts an unknown kind via the generic fallback (open-ended kinds)", () => {
    const raw = `---\nkind: era\nslug: eighties\ntitle: The 80s\ntags: [retro]\ninstruments: [epiano]\n---\nbody`;
    const p = parsePalette(raw);
    expect(p.frontmatter.kind).toBe("era");
    expect(isEmotionPalette(p)).toBe(false);
  });

  it("still rejects a generic palette missing base fields (slug/title/tags)", () => {
    const bad = `---\nkind: era\nslug: x\n---\nbody`;
    expect(() => parsePalette(bad)).toThrow(PaletteParseError);
  });

  it("rejects an emotion palette missing tonality", () => {
    const bad = `---\nkind: emotion\nslug: x\ntitle: X\ntags: [a]\ntempo: [60, 80]\nprogressions:\n  - [i, V]\n---\nbody`;
    expect(() => parsePalette(bad)).toThrow(PaletteParseError);
  });
});

describe("matchPalettes", () => {
  const palettes: Palette[] = [
    parsePalette(rawSad),
    parsePalette(rawSad.replace("slug: sad", "slug: metal").replace("title: Sad / Bittersweet", "title: Metal").replace(/tags: \[.*\]/, "tags: [badass, intense, metal, aggressive]")),
  ];

  it("ranks by number of term hits", () => {
    const hits = matchPalettes(palettes, "sad death dog");
    expect(hits[0]?.frontmatter.slug).toBe("sad");
  });

  it("returns empty when nothing matches", () => {
    expect(matchPalettes(palettes, "polka accordion")).toEqual([]);
  });
});
