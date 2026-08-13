import { describe, it, expect } from "vitest";
import {
  parsePalette,
  matchPalettes,
  isEmotionPalette,
  validatePaletteSet,
  PaletteParseError,
  MODE_NAMES,
  MODE_LEANS,
  type Palette,
} from "./palette";
import { SUPPORTED_MODES } from "./theory";

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

  it("accepts a modal emotion tonality", () => {
    const modal = rawSad.replace("scale: minor", "scale: dorian");
    const p = parsePalette(modal);
    if (!isEmotionPalette(p)) throw new Error("expected emotion");
    expect(p.frontmatter.tonality.scale).toBe("dorian");
  });

  it("rejects a tonality whose scale harmony can't resolve", () => {
    const bad = rawSad.replace("scale: minor", "scale: bebop");
    expect(() => parsePalette(bad)).toThrow(/must be a mode/);
  });

  it("accepts a modal genre lean", () => {
    const raw = `---\nkind: genre\nslug: folk\ntitle: Folk\ntags: [folk]\ntempo: [90, 120]\nmode: dorian\n---\nbody`;
    expect(parsePalette(raw).frontmatter.kind).toBe("genre");
  });

  it("rejects a genre mode that isn't a mode or `either`", () => {
    const bad = `---\nkind: genre\nslug: folk\ntitle: Folk\ntags: [folk]\ntempo: [90, 120]\nmode: modal\n---\nbody`;
    expect(() => parsePalette(bad)).toThrow(PaletteParseError);
  });

  it("rejects an emotion palette missing tonality", () => {
    const bad = `---\nkind: emotion\nslug: x\ntitle: X\ntags: [a]\ntempo: [60, 80]\nprogressions:\n  - [i, V]\n---\nbody`;
    expect(() => parsePalette(bad)).toThrow(PaletteParseError);
  });
});

describe("mode names", () => {
  it("accepts exactly the modes harmony can resolve", () => {
    // Drift either way is a bug: a schema-only name fails at compose time, and a
    // theory-only mode is unreachable from a palette.
    expect([...MODE_NAMES].sort()).toEqual([...SUPPORTED_MODES].sort());
  });

  it("adds `either` for a genre that recolours both", () => {
    expect(MODE_LEANS).toContain("either");
    expect(MODE_LEANS.length).toBe(MODE_NAMES.length + 1);
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

describe("parsePalette + parent", () => {
  it("lets a genre subtype omit tempo and inherit it", () => {
    const raw = `---\nkind: genre\nslug: desert-rock\ntitle: Desert Rock\ntags: [x]\nparent: rock\n---\nbody`;
    expect(parsePalette(raw).frontmatter.parent).toBe("rock");
  });

  it("still requires tempo on a parentless genre", () => {
    const raw = `---\nkind: genre\nslug: rock\ntitle: Rock\ntags: [x]\n---\nbody`;
    expect(() => parsePalette(raw)).toThrow(PaletteParseError);
  });

  it("rejects a parent on an emotion (the blend takes exactly one)", () => {
    const raw = `---\nkind: emotion\nslug: wistful\ntitle: Wistful\ntags: [x]\nparent: sad\ntonality:\n  tonic: A\n  scale: minor\nprogressions:\n  - [i, VI]\ntempo: [60, 78]\n---\nbody`;
    expect(() => parsePalette(raw)).toThrow(PaletteParseError);
  });
});

describe("validatePaletteSet", () => {
  const genre = (slug: string, extra = ""): Palette =>
    parsePalette(`---\nkind: genre\nslug: ${slug}\ntitle: ${slug}\ntags: [x]\ntempo: [80, 100]\n${extra}---\nbody`);

  it("accepts a set whose parents resolve to the same kind", () => {
    expect(validatePaletteSet([genre("rock"), genre("desert-rock", "parent: rock\n")])).toEqual([]);
  });

  it("accepts a set with no parents at all", () => {
    expect(validatePaletteSet([genre("rock"), genre("funk")])).toEqual([]);
  });

  it("flags a duplicate slug", () => {
    const issues = validatePaletteSet([genre("rock"), genre("rock")]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("duplicate slug");
  });

  it("flags a parent that does not exist", () => {
    const issues = validatePaletteSet([genre("desert-rock", "parent: rock\n")]);
    expect(issues[0]).toMatchObject({ path: "desert-rock" });
    expect(issues[0]?.message).toContain("does not exist");
  });

  it("flags a parent of a different kind", () => {
    const timbre = parsePalette(`---\nkind: timbre\nslug: fuzz\ntitle: Fuzz\ntags: [x]\n---\nbody`);
    const issues = validatePaletteSet([timbre, genre("desert-rock", "parent: fuzz\n")]);
    expect(issues[0]?.message).toContain("must share its parent's kind");
  });

  it("flags a self-parent and a cycle", () => {
    expect(validatePaletteSet([genre("rock", "parent: rock\n")])[0]?.message).toContain("is itself");

    const cyclic = [genre("a", "parent: b\n"), genre("b", "parent: a\n")];
    expect(validatePaletteSet(cyclic).some((i) => i.message.includes("cycle"))).toBe(true);
  });
});
