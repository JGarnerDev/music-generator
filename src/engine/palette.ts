/**
 * Palettes map human intent (emotion, imagery, genre, sound) to concrete musical
 * direction. They live as markdown files under /palettes/<kind>/*.md with rich
 * frontmatter so they are both human-readable and machine-queryable — matching the
 * repo's "frontmatter-first, progressive disclosure" mandate.
 *
 * KINDS are open-ended — `palettes/` may grow arbitrary subfolders as new ways to
 * describe what a piece is made of. Three kinds have strict, hand-tuned schemas:
 *   - `emotion` — the mood primitives. Carry tonality + progressions + tempo.
 *   - `genre`   — jazz/rock/funk. Carry groove: tempo, optional progressions, mode
 *                 lean. No fixed tonic (the emotion supplies that).
 *   - `timbre`  — a *sound* ("analog synth", "brown sound"). Pure sound: instrument
 *                 voices + a signal/fx chain. No tonality or progressions at all.
 * Any other kind (a new subfolder) validates against a permissive `generic` schema:
 * the shared base fields plus whatever optional structured hints it chooses to
 * carry. That way a new descriptive layer needs a folder + prose, not a code change.
 *
 * A per-kind zod schema (looked up in `SCHEMAS`, falling back to generic) is the
 * single hard schema — invalid frontmatter fails loudly with a path'd message.
 * `parsePalette` is pure (string in, struct out) so it unit-tests without fs; file
 * loading lives in the loader.
 */
import matter from "gray-matter";
import { z } from "zod";

// --- shared field schemas -------------------------------------------------
const tonality = z.object({ tonic: z.string().min(1), scale: z.string().min(1) });
const progressions = z.array(z.array(z.string().min(1)).min(1)).min(1);
const tempo = z.tuple([z.number().positive(), z.number().positive()]);
const tags = z.array(z.string().min(1)).min(1);
const instruments = z.array(z.string().min(1)).optional();

const base = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  tags,
});

// --- per-kind schemas -----------------------------------------------------
/** Mood primitive: the tonality + progression source. */
export const emotionSchema = base.extend({
  kind: z.literal("emotion"),
  tonality,
  progressions,
  tempo,
  instruments,
});

/** Genre: groove + harmonic vocabulary. No fixed tonic — an emotion supplies it. */
export const genreSchema = base.extend({
  kind: z.literal("genre"),
  tempo,
  /** Optional signature progressions in roman numerals (major/minor-diatonic). */
  progressions: progressions.optional(),
  /** Harmonic lean, so the blend knows which mode this genre wants. */
  mode: z.enum(["major", "minor", "either"]).optional(),
  instruments,
});

/** Timbre: pure sound. Instrument voices + a signal chain. No harmony/tempo. */
export const timbreSchema = base.extend({
  kind: z.literal("timbre"),
  instruments,
  /** Ordered fx/processing chain, e.g. ["overdrive", "phaser", "tape-echo"]. */
  signal: z.array(z.string().min(1)).optional(),
  /** One-line sonic descriptor. */
  character: z.string().min(1).optional(),
});

/**
 * Fallback for any not-yet-formalized kind (an arbitrary new subfolder). Accepts
 * any non-empty `kind` and makes every structured hint optional, so a new
 * descriptive layer parses on tags + prose alone and can opt into whatever fields
 * make sense. Promote it to a strict schema once its shape stabilizes.
 */
export const genericSchema = base.extend({
  kind: z.string().min(1),
  tonality: tonality.optional(),
  progressions: progressions.optional(),
  tempo: tempo.optional(),
  mode: z.enum(["major", "minor", "either"]).optional(),
  instruments,
  signal: z.array(z.string().min(1)).optional(),
  character: z.string().min(1).optional(),
});

/** Kinds with a strict, hand-tuned schema. Everything else falls back to generic. */
export const SCHEMAS = {
  emotion: emotionSchema,
  genre: genreSchema,
  timbre: timbreSchema,
} as const;

/** The kinds `palette:new` scaffolds. Not a closed set — generic covers the rest. */
export const PALETTE_KINDS = ["emotion", "genre", "timbre"] as const;

export type EmotionFrontmatter = z.infer<typeof emotionSchema>;
export type GenreFrontmatter = z.infer<typeof genreSchema>;
export type TimbreFrontmatter = z.infer<typeof timbreSchema>;
export type GenericFrontmatter = z.infer<typeof genericSchema>;
export type PaletteFrontmatter =
  | EmotionFrontmatter
  | GenreFrontmatter
  | TimbreFrontmatter
  | GenericFrontmatter;
export type PaletteKind = PaletteFrontmatter["kind"];

export interface Palette<F extends PaletteFrontmatter = PaletteFrontmatter> {
  frontmatter: F;
  /** Markdown body: prose guidance for Claude on how to use this palette. */
  body: string;
}
export type EmotionPalette = Palette<EmotionFrontmatter>;
export type GenrePalette = Palette<GenreFrontmatter>;
export type TimbrePalette = Palette<TimbreFrontmatter>;
export type GenericPalette = Palette<GenericFrontmatter>;

export class PaletteParseError extends Error {}

/** Narrowing guard: is this an emotion palette (the composer's required input)? */
export function isEmotionPalette(p: Palette): p is EmotionPalette {
  return p.frontmatter.kind === "emotion";
}

/**
 * Parse a raw palette markdown string into a validated Palette. A file that omits
 * `kind` is treated as `emotion` (the original single-kind shape + folder default),
 * so pre-kind palettes keep parsing.
 */
export function parsePalette(raw: string): Palette {
  const { data, content } = matter(raw);
  const fm: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  if (fm.kind == null) fm.kind = "emotion";

  const schema = SCHEMAS[fm.kind as keyof typeof SCHEMAS] ?? genericSchema;
  const result = schema.safeParse(fm);
  if (!result.success) {
    throw new PaletteParseError(
      `invalid ${String(fm.kind)} palette frontmatter — ${formatIssues(result.error)}`,
    );
  }
  return { frontmatter: result.data as PaletteFrontmatter, body: content.trim() };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
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
