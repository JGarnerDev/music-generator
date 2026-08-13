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
  /**
   * Optional subtype link: the slug of the broader palette this one specializes
   * (`desert-rock` → `rock`). One-way, child → parent, so adding a subtype is a
   * single new file — a parent never lists its children. The parent must exist
   * and share this palette's kind; `validatePaletteSet` enforces both. A subtype
   * only states what *differs*: the blend layers ancestors first, so unstated
   * fields are inherited.
   */
  parent: z.string().min(1).optional(),
});

// --- per-kind schemas -----------------------------------------------------
/**
 * Mood primitive: the tonality + progression source.
 *
 * Emotions may **not** declare a `parent`. The blend takes exactly one emotion
 * (it is the sole source of tonality), so layering an emotion's ancestor would
 * make the key ambiguous — the very thing that rule exists to prevent. Subtyping
 * is for `genre`, `timbre` and any generic kind.
 */
export const emotionSchema = base
  .extend({
    kind: z.literal("emotion"),
    tonality,
    progressions,
    tempo,
    instruments,
  })
  .superRefine((fm, ctx) => {
    if (fm.parent != null) {
      ctx.addIssue({
        code: "custom",
        path: ["parent"],
        message:
          "emotion palettes cannot declare a parent — the blend takes exactly one emotion, so an inherited key would be ambiguous",
      });
    }
  });

/**
 * Genre: groove + harmonic vocabulary. No fixed tonic — an emotion supplies it.
 * `tempo` is required, *unless* the genre is a subtype, in which case it may be
 * left out and inherited from the parent.
 */
export const genreSchema = base
  .extend({
    kind: z.literal("genre"),
    tempo: tempo.optional(),
    /** Optional signature progressions in roman numerals (major/minor-diatonic). */
    progressions: progressions.optional(),
    /** Harmonic lean, so the blend knows which mode this genre wants. */
    mode: z.enum(["major", "minor", "either"]).optional(),
    instruments,
  })
  .superRefine((fm, ctx) => {
    if (fm.tempo == null && fm.parent == null) {
      ctx.addIssue({
        code: "custom",
        path: ["tempo"],
        message: "required unless the genre declares a parent to inherit it from",
      });
    }
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

export interface PaletteSetIssue {
  /** The offending palette's slug (or "(root)" for set-wide problems). */
  path: string;
  message: string;
}

/**
 * Whole-set invariants that a single file can't check on its own. Pure: palettes
 * in, issues out, empty list means valid. The loader runs this after parsing a
 * directory so a bad `parent:` fails at load rather than at blend time.
 *
 * Slugs must be unique because `parent` (and `--palette`/`--with`) resolve by
 * slug; a subtype's parent must exist and share its kind, since layering a genre
 * under a timbre would silently change what the blend inherits.
 */
export function validatePaletteSet(palettes: Palette[]): PaletteSetIssue[] {
  const issues: PaletteSetIssue[] = [];
  const bySlug = new Map<string, Palette>();

  for (const p of palettes) {
    const { slug } = p.frontmatter;
    if (bySlug.has(slug)) issues.push({ path: slug, message: `duplicate slug "${slug}"` });
    else bySlug.set(slug, p);
  }

  for (const p of palettes) {
    const { slug, parent, kind } = p.frontmatter;
    if (parent == null) continue;
    if (parent === slug) {
      issues.push({ path: slug, message: `parent "${parent}" is itself` });
      continue;
    }
    const found = bySlug.get(parent);
    if (!found) {
      issues.push({ path: slug, message: `parent "${parent}" does not exist` });
      continue;
    }
    if (found.frontmatter.kind !== kind) {
      issues.push({
        path: slug,
        message: `parent "${parent}" is a ${found.frontmatter.kind}, but this is a ${kind} — a subtype must share its parent's kind`,
      });
      continue;
    }
    const cycle = findCycle(slug, bySlug);
    if (cycle) issues.push({ path: slug, message: `parent chain is a cycle: ${cycle.join(" → ")}` });
  }

  return issues;
}

/** Walk the parent chain from `slug`; return the looping path if it revisits a slug. */
function findCycle(slug: string, bySlug: Map<string, Palette>): string[] | undefined {
  const seen: string[] = [];
  let cursor: string | undefined = slug;
  while (cursor) {
    if (seen.includes(cursor)) return [...seen, cursor];
    seen.push(cursor);
    cursor = bySlug.get(cursor)?.frontmatter.parent;
  }
  return undefined;
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
