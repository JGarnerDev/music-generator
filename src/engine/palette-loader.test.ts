import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  it("reads every .md recursively, in path order", () => {
    const palettes = loadPalettesFromDir(fixturesDir);
    // alpha.md + bravo.md are flat; genre/charlie.md lives in a subfolder, so its
    // presence here proves the loader recurses into the per-kind directories.
    expect(palettes.map((p) => p.frontmatter.slug)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("rejects a set whose subtype names a parent that isn't there", () => {
    // A whole-set rule, so it can only fail here — the file itself parses fine.
    const dir = mkdtempSync(join(tmpdir(), "palettes-"));
    try {
      writeFileSync(
        join(dir, "orphan.md"),
        "---\nkind: genre\nslug: orphan\ntitle: Orphan\ntags: [x]\nparent: nowhere\n---\nbody",
      );
      expect(() => loadPalettesFromDir(dir)).toThrow(/orphan: parent "nowhere" does not exist/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
