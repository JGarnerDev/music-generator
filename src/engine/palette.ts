/**
 * Palettes map human intent (emotion, imagery, genre) to concrete musical
 * direction. They live as markdown files in /palettes with rich frontmatter so
 * they are both human-readable and machine-queryable — matching the repo's
 * "frontmatter-first, progressive disclosure" mandate.
 *
 * `parsePalette` is pure (string in, struct out) so it unit-tests without fs.
 * File loading lives in a separate loader (see scripts + app), keeping this
 * theory-adjacent core free of IO.
 */
import matter from "gray-matter";

export interface PaletteFrontmatter {
  /** kebab-case unique id, e.g. "sad", "spaghetti-western". */
  slug: string;
  /** Human title. */
  title: string;
  /** Search tags: emotions, imagery, genres — what a user might say. */
  tags: string[];
  /** Suggested tonic + scale, e.g. { tonic: "A", scale: "minor" }. */
  tonality: { tonic: string; scale: string };
  /** Roman-numeral chord progressions to draw from. */
  progressions: string[][];
  /** BPM range [min, max]. */
  tempo: [number, number];
  /** Instrument hints (must map to engine InstrumentName eventually). */
  instruments?: string[];
}

export interface Palette {
  frontmatter: PaletteFrontmatter;
  /** Markdown body: prose guidance for Claude on how to use this palette. */
  body: string;
}

export class PaletteParseError extends Error {}

/** Parse a raw palette markdown string into a validated Palette. */
export function parsePalette(raw: string): Palette {
  const { data, content } = matter(raw);
  const fm = data as Partial<PaletteFrontmatter>;

  const problems: string[] = [];
  if (!isNonEmptyString(fm.slug)) problems.push("slug (non-empty string)");
  if (!isNonEmptyString(fm.title)) problems.push("title (non-empty string)");
  if (!isStringArray(fm.tags) || fm.tags.length === 0) problems.push("tags (string[])");
  if (!fm.tonality || !isNonEmptyString(fm.tonality.tonic) || !isNonEmptyString(fm.tonality.scale)) {
    problems.push("tonality ({ tonic, scale })");
  }
  if (!isProgressionList(fm.progressions)) problems.push("progressions (string[][])");
  if (!isTempoRange(fm.tempo)) problems.push("tempo ([min, max])");

  if (problems.length > 0) {
    throw new PaletteParseError(`invalid palette frontmatter — missing/bad: ${problems.join(", ")}`);
  }

  return { frontmatter: fm as PaletteFrontmatter, body: content.trim() };
}

/** Rank palettes by how many query terms hit their tags/slug/title. Case-insensitive. */
export function matchPalettes(palettes: Palette[], query: string): Palette[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return palettes
    .map((p) => ({ p, score: scorePalette(p, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

function scorePalette(p: Palette, terms: string[]): number {
  const haystack = [p.frontmatter.slug, p.frontmatter.title, ...p.frontmatter.tags]
    .join(" ")
    .toLowerCase();
  return terms.reduce((n, term) => (haystack.includes(term) ? n + 1 : n), 0);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function isProgressionList(v: unknown): v is string[][] {
  return Array.isArray(v) && v.length > 0 && v.every(isStringArray);
}
function isTempoRange(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
  );
}
