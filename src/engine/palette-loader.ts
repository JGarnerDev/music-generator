/**
 * Load palettes from disk. `parsePalette` (see ./palette) is the pure string→struct
 * core; this adds the fs layer that scripts + the browser bench share to turn a
 * directory of `palettes/*.md` into ranked matches for a mood query.
 *
 * The pure `parsePaletteFiles` step is split out from the fs read so it unit-tests
 * without touching the filesystem; `loadPalettesFromDir` is the thin IO wrapper.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/** Read + parse every `*.md` in a directory into Palettes. Sorted by filename for stable order. */
export function loadPalettesFromDir(dir: string): Palette[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((filename) => ({ filename, raw: readFileSync(join(dir, filename), "utf8") }));
  return parsePaletteFiles(files);
}

/**
 * Load palettes from a directory and rank them against a mood/scene query.
 * Returns best match first; empty array when nothing scores. Convenience for
 * scripts: "sad dog dies" → the `sad` palette.
 */
export function findPalettes(dir: string, query: string): Palette[] {
  return matchPalettes(loadPalettesFromDir(dir), query);
}
