/**
 * Load palettes from disk. `parsePalette` (see ./palette) is the pure string→struct
 * core; this adds the fs layer that scripts + the browser bench share to turn a
 * directory of `palettes/*.md` into ranked matches for a mood query.
 *
 * The pure `parsePaletteFiles` step is split out from the fs read so it unit-tests
 * without touching the filesystem; `loadPalettesFromDir` is the thin IO wrapper.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parsePalette, matchPalettes, type Palette } from "./palette";

export interface PaletteFile {
  /** Source filename, e.g. "sad.md" — used in parse-error messages. */
  filename: string;
  /** Raw markdown contents. */
  raw: string;
}

/**
 * Parse a batch of raw palette files. Pure: no fs. A bad file fails loudly with
 * its filename attached, so a typo in one palette doesn't silently vanish.
 */
export function parsePaletteFiles(files: PaletteFile[]): Palette[] {
  return files.map(({ filename, raw }) => {
    try {
      return parsePalette(raw);
    } catch (err) {
      throw new Error(`palette "${filename}": ${(err as Error).message}`);
    }
  });
}

/**
 * Read + parse every `*.md` under a directory into Palettes, recursing into the
 * per-kind subfolders (`emotion/`, `genre/`, `timbre/`). Sorted by relative path
 * for stable order; `filename` carries the subfolder so parse errors point at the
 * real file (e.g. "genre/jazz.md").
 */
export function loadPalettesFromDir(dir: string): Palette[] {
  const files = walkMarkdown(dir)
    .sort()
    .map((full) => ({ filename: relative(dir, full), raw: readFileSync(full, "utf8") }));
  return parsePaletteFiles(files);
}

/** Absolute paths of every `*.md` under `dir`, recursing subdirectories. */
function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * Load palettes from a directory and rank them against a mood/scene query.
 * Returns best match first; empty array when nothing scores. Convenience for
 * scripts: "sad dog dies" → the `sad` palette.
 */
export function findPalettes(dir: string, query: string): Palette[] {
  return matchPalettes(loadPalettesFromDir(dir), query);
}
