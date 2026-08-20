/**
 * The composition library: how `compositions/` is organised on disk and how the
 * bench groups it into tabs.
 *
 * A composition's **kind is its folder** — `compositions/loops/foo.json` is a
 * loop. That keeps the taxonomy in one place (the filesystem) instead of a field
 * that can disagree with where the file actually lives, and it means the tabs in
 * the app and the folders on disk can never drift apart.
 *
 * Pure: this module never touches fs or the DOM. The app feeds it Vite's glob
 * record; scripts feed it real paths. Both get the same entries back.
 */
import type { Composition } from "./composition";

/** Folder names under `compositions/`, in tab order. */
export const COMPOSITION_KINDS = ["leitmotifs", "segments", "loops", "songs"] as const;

export type CompositionKind = (typeof COMPOSITION_KINDS)[number];

/** What each kind is *for* — shown in the bench, and the rule for filing a new piece. */
export const KIND_BLURBS: Record<CompositionKind, string> = {
  leitmotifs: "Short memorable themes — a character, a place, an idea. Quoted by other pieces.",
  segments: "Short one-shot takes: the moving core of an idea, a few bars long.",
  loops: "Pieces with a loop window, written to repeat under a scene forever.",
  songs: "Long-form pieces, usually expanded from a plan in `plans/`.",
};

export interface LibraryEntry {
  /** Stable id, `<kind>/<slug>` — unique across the library. */
  id: string;
  kind: CompositionKind;
  /** Filename without `.json`. */
  slug: string;
  /** Repo-relative path, e.g. `compositions/loops/high-noon-warpath.json`. */
  path: string;
  composition: Composition;
  /** Display tags: explicit `tags`, falling back to the palettes it drew from. */
  tags: string[];
  /** Leitmotif slugs this piece quotes. */
  motifs: string[];
}

/** Deleted pieces are moved here rather than unlinked; they are not part of the library. */
export const TRASH_DIR = "_trash";

const KIND_SET: ReadonlySet<string> = new Set<string>(COMPOSITION_KINDS);

export function isCompositionKind(value: unknown): value is CompositionKind {
  return typeof value === "string" && KIND_SET.has(value);
}

/**
 * Kind from the folder under `compositions/`, or null for a loose file sitting at
 * the root (pre-reorg, or hand-dropped). Accepts any path that contains a
 * `compositions/` segment, so Vite's `../../compositions/x/y.json` works too.
 */
export function kindFromPath(path: string): CompositionKind | null {
  const folder = folderOf(path);
  return isCompositionKind(folder) ? folder : null;
}

/** True for anything under `compositions/_trash/` — deleted, and stays out of the library. */
export function isTrashPath(path: string): boolean {
  return folderOf(path) === TRASH_DIR;
}

/** The path segment directly under `compositions/`, if there is one. */
function folderOf(path: string): string | undefined {
  const parts = path.split(/[\\/]/);
  const root = parts.lastIndexOf("compositions");
  return root === -1 ? parts.at(-2) : parts[root + 1];
}

/**
 * Where an unfiled composition belongs, judged by shape alone: a loop window
 * means it was written to repeat. `songs` and `leitmotifs` are never inferred —
 * "long-form" and "memorable enough to quote" are editorial calls, so those two
 * only ever come from the folder you put the file in.
 */
export function inferKind(comp: Composition): CompositionKind {
  return comp.loop ? "loops" : "segments";
}

/**
 * A path as it would be typed at the repo root: `compositions/loops/x.json`.
 *
 * Vite's glob keys are relative to the module that globbed them, so the same
 * file arrives as `../../compositions/…` from `src/app` and `../../../` from
 * `src/app/pages`. How deep a component sits is not something a path *shown to
 * the user* may depend on — this one ends up in
 * `npm run render -- --file <path>` and in the delete endpoint's body, and both
 * of those are answered from the repo root.
 */
export function repoPath(path: string): string {
  return path.replace(/^(?:\.{1,2}[\\/])+/, "");
}

/** Filename without directories or the `.json` extension. */
export function slugFromPath(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.json$/i, "");
}

/** Display tags for a piece: explicit `tags` win, else its palette provenance. */
export function tagsOf(comp: Composition): string[] {
  const tags = comp.tags?.filter((t) => t.trim() !== "");
  if (tags && tags.length > 0) return tags;
  return comp.palettes ?? [];
}

/**
 * Turn a path→composition map into sorted library entries (kind order, then
 * slug). Loose files at the root of `compositions/` are still listed — filed by
 * `inferKind` — so nothing you drop in ever disappears from the bench.
 */
export function buildLibrary(files: Record<string, Composition>): LibraryEntry[] {
  const entries = Object.entries(files)
    .filter(([path]) => !isTrashPath(path))
    .map(([path, composition]) => {
      const kind = kindFromPath(path) ?? inferKind(composition);
      const slug = slugFromPath(path);
      return {
        id: `${kind}/${slug}`,
        kind,
        slug,
        path: repoPath(path),
        composition,
        tags: tagsOf(composition),
        motifs: composition.motifs ?? [],
      } satisfies LibraryEntry;
    });
  return entries.sort(
    (a, b) =>
      COMPOSITION_KINDS.indexOf(a.kind) - COMPOSITION_KINDS.indexOf(b.kind) ||
      a.slug.localeCompare(b.slug),
  );
}

/** Entries of one kind, or all of them when `kind` is null (the "All" tab). */
export function entriesOfKind(
  entries: readonly LibraryEntry[],
  kind: CompositionKind | null,
): LibraryEntry[] {
  return kind === null ? [...entries] : entries.filter((e) => e.kind === kind);
}

/** How many entries sit in each kind — the counts on the tabs. */
export function countsByKind(entries: readonly LibraryEntry[]): Record<CompositionKind, number> {
  const counts = Object.fromEntries(COMPOSITION_KINDS.map((k) => [k, 0])) as Record<
    CompositionKind,
    number
  >;
  for (const entry of entries) counts[entry.kind] += 1;
  return counts;
}

/** Case-insensitive match over name, slug and tags — the table's filter box. */
export function searchEntries(entries: readonly LibraryEntry[], query: string): LibraryEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...entries];
  return entries.filter((e) =>
    [e.slug, e.composition.name, ...e.tags, ...e.motifs].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}

/**
 * Leitmotif slug → slugs of the pieces that quote it, opera-style: the theme is
 * written once and recurs wherever that character or idea shows up. Only pieces
 * filed under `leitmotifs/` are keys, so a typo in a `motifs` list surfaces as an
 * empty entry rather than inventing a motif that doesn't exist.
 */
export function motifUsage(entries: readonly LibraryEntry[]): Map<string, LibraryEntry[]> {
  const usage = new Map<string, LibraryEntry[]>();
  for (const entry of entries) {
    if (entry.kind === "leitmotifs") usage.set(entry.slug, []);
  }
  for (const entry of entries) {
    for (const motif of entry.motifs) {
      usage.get(motif)?.push(entry);
    }
  }
  return usage;
}

/**
 * How wide a tempo band counts as "the same tempo". 146–158 BPM is the range
 * three of the first four loops shared without anyone noticing.
 */
const SAME_TEMPO_BPM = 12;

/** A piece already on the shelf that the one being written would sound like. */
export interface Neighbour {
  entry: LibraryEntry;
  /** Which of key / tempo / meter matched — what to change to get away from it. */
  shared: string[];
}

/**
 * Pieces already in the library that a new one is at risk of duplicating.
 *
 * Same key + same tempo band is the signal `docs/variety.md` says to look for
 * before writing bars, and the reason it was worth writing down: `high-noon-
 * warpath`, `six-gun-shredout` and `black-hat-arrives` shared a mode, an arc and
 * a twelve-BPM window, and nobody spotted it until all three had been rendered.
 *
 * Reports rather than blocks — a campaign wanting three pieces in one key is a
 * legitimate thing to want. Sorted most-shared first.
 */
export function neighboursOf(
  candidate: Pick<Composition, "key" | "bpm" | "meter">,
  entries: readonly LibraryEntry[],
): Neighbour[] {
  const meterOf = (c: Pick<Composition, "meter">) => (c.meter ?? [4, 4]).join("/");
  return entries
    .map((entry) => {
      const other = entry.composition;
      const shared: string[] = [];
      if (other.key.toLowerCase() === candidate.key.toLowerCase()) shared.push("key");
      if (Math.abs(other.bpm - candidate.bpm) <= SAME_TEMPO_BPM) shared.push("tempo");
      if (meterOf(other) === meterOf(candidate)) shared.push("meter");
      return { entry, shared };
    })
    // Meter alone is no signal at all — nearly everything is in 4/4.
    .filter(({ shared }) => shared.includes("key") && shared.includes("tempo"))
    .sort((a, b) => b.shared.length - a.shared.length);
}

/** `motifs` entries that name no known leitmotif — a broken quote, worth reporting. */
export function danglingMotifs(entries: readonly LibraryEntry[]): { entry: LibraryEntry; motif: string }[] {
  const known = new Set(entries.filter((e) => e.kind === "leitmotifs").map((e) => e.slug));
  return entries.flatMap((entry) =>
    entry.motifs.filter((m) => !known.has(m)).map((motif) => ({ entry, motif })),
  );
}

/** One tag pill in the library table. `motif` pills are accented. */
export interface ChipLabel {
  text: string;
  motif: boolean;
}

/**
 * The pills for one row: the piece's own tags, then the leitmotifs it quotes,
 * then — for a leitmotif — how many pieces quote *it*.
 *
 * Labels rather than nodes, so the table and its hover title come from one list
 * and cannot disagree about what the row says.
 */
export function chipLabels(entry: LibraryEntry, quotedBy: number): ChipLabel[] {
  const chips: ChipLabel[] = entry.tags.map((text) => ({ text, motif: false }));
  for (const motif of entry.motifs) chips.push({ text: `♪ ${motif}`, motif: true });
  if (entry.kind === "leitmotifs" && quotedBy > 0) {
    chips.push({ text: `♪ quoted ×${quotedBy}`, motif: true });
  }
  return chips;
}

/**
 * What the table says when it has no rows. Three different nothings: the filter
 * excluded everything, the library is empty, or this one folder is.
 */
export function emptyMessage(kind: CompositionKind | null, query: string): string {
  if (query.trim() !== "") return `Nothing matches “${query.trim()}”.`;
  if (kind === null) return "No compositions yet — run npm run compose.";
  return `Nothing in compositions/${kind}/ yet.`;
}
