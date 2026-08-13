/**
 * Read `compositions/` off disk into library entries — the fs half of
 * [`./library`](./library.ts), which stays pure. Scripts use this; the browser
 * bench gets the same entries from Vite's glob instead.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { Composition } from "./composition";
import { buildLibrary, TRASH_DIR, type LibraryEntry } from "./library";

/**
 * Every `*.json` under a compositions directory, keyed by a repo-style relative
 * path (`compositions/loops/foo.json`) so `kindFromPath` can read the folder.
 * Parse errors name their file — one bad JSON shouldn't silently shrink the list.
 */
export function loadLibraryFromDir(dir: string): LibraryEntry[] {
  const root = basename(dir);
  const files: Record<string, Composition> = {};
  for (const abs of jsonFilesIn(dir)) {
    const key = `${root}/${relative(dir, abs).split(/[\\/]/).join("/")}`;
    try {
      files[key] = JSON.parse(readFileSync(abs, "utf8")) as Composition;
    } catch (err) {
      throw new Error(`composition "${key}": ${(err as Error).message}`);
    }
  }
  return buildLibrary(files);
}

function jsonFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== TRASH_DIR) out.push(...jsonFilesIn(abs));
    } else if (entry.name.toLowerCase().endsWith(".json")) {
      out.push(abs);
    }
  }
  return out;
}
