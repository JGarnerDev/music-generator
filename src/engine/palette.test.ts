import { describe, it, expect } from "vitest";
import { parsePalette, matchPalettes, PaletteParseError, type Palette } from "./palette";

const rawSad = `---
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
  it("parses valid frontmatter + body", () => {
    const p = parsePalette(rawSad);
    expect(p.frontmatter.slug).toBe("sad");
    expect(p.frontmatter.tonality).toEqual({ tonic: "A", scale: "minor" });
    expect(p.frontmatter.progressions[0]).toEqual(["i", "VI", "III", "VII"]);
    expect(p.body).toContain("slow, sparse");
  });

  it("throws PaletteParseError on missing fields", () => {
    const bad = `---\nslug: broken\n---\nbody`;
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
