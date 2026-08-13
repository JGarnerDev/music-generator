import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parsePaletteFiles,
  loadPalettesFromDir,
  findPalettes,
} from "./palette-loader";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "palettes",
);

describe("parsePaletteFiles", () => {
  it("parses a batch and preserves each palette", () => {
    const palettes = parsePaletteFiles([
      { filename: "a.md", raw: "---\nslug: a\ntitle: A\ntags: [x]\ntonality:\n  tonic: C\n  scale: major\nprogressions:\n  - [I, IV]\ntempo: [90, 100]\n---\nbody" },
    ]);
    expect(palettes).toHaveLength(1);
    expect(palettes[0]?.frontmatter.slug).toBe("a");
  });

  it("attaches the filename when a palette is invalid", () => {
    expect(() =>
      parsePaletteFiles([{ filename: "broken.md", raw: "---\nslug: broken\n---\nbody" }]),
    ).toThrow(/broken\.md/);
  });
});

describe("loadPalettesFromDir", () => {
  it("reads every .md in filename order", () => {
    const palettes = loadPalettesFromDir(fixturesDir);
    expect(palettes.map((p) => p.frontmatter.slug)).toEqual(["alpha", "bravo"]);
  });
});

describe("findPalettes", () => {
  it("ranks disk palettes against a mood query", () => {
    const hits = findPalettes(fixturesDir, "dark moody scene");
    expect(hits[0]?.frontmatter.slug).toBe("bravo");
  });

  it("returns empty when nothing matches", () => {
    expect(findPalettes(fixturesDir, "polka accordion")).toEqual([]);
  });
});
