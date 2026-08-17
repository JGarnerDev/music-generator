/**
 * The study library: how `studies/` is organised, and the ledger generated from
 * what has been judged.
 *
 * A study's **concept is its folder** — `studies/guitar-solo/dust-a.json` is a
 * guitar-solo study — the same rule the composition and voice libraries use, for
 * the same reason: the taxonomy lives in the filesystem, so the bench's tabs and
 * the folders on disk cannot drift apart.
 *
 * The other half of this module is the **tally**: which shelf tags keep recurring
 * on thumbs-up and which on thumbs-down, per concept. That is the raw evidence.
 * The prose rules distilled out of it live in `docs/taste.md`, written by hand —
 * counting is mechanical, deciding what a count *means* is not.
 *
 * Pure: no fs, no DOM. The app feeds it Vite's glob record; the scripts feed it
 * real paths. Both get the same entries back.
 */
import type { ValidationIssue } from "./composition";
import {
  CONCEPTS,
  CONCEPT_GROUPS,
  GROUP_BLURBS,
  conceptOf,
  validateStudy,
  type Concept,
  type ConceptGroup,
  type Study,
  type Thumb,
} from "./study";

export interface StudyEntry {
  /** Stable id, `<concept>/<slug>` — unique across the library. */
  id: string;
  concept: string;
  /** Filename without `.json`. */
  slug: string;
  /** Repo-relative path, e.g. `studies/guitar-solo/dust-a.json`. */
  path: string;
  study: Study;
  /** Empty when the file is valid; the bench lists it as broken otherwise. */
  issues: ValidationIssue[];
}

/** Filename without directories or the `.json` extension. */
export function slugFromPath(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.json$/i, "");
}

/**
 * Concept from the folder under `studies/`, or null for a file that isn't in a
 * known one. Accepts Vite's `../../studies/hook/x.json` as readily as a
 * repo-relative path.
 */
export function conceptFromPath(path: string): string | null {
  const parts = path.split(/[\\/]/);
  const root = parts.lastIndexOf("studies");
  const folder = root === -1 ? parts.at(-2) : parts[root + 1];
  return folder !== undefined && conceptOf(folder) ? folder : null;
}

/** `<concept>.<slug>` — the audio filename and manifest key for a study. */
export function studyAudioName(concept: string, slug: string): string {
  return `${concept}.${slug}`;
}

/**
 * Turn a path→JSON map into sorted entries (group order, then concept, then
 * set, then slug).
 *
 * A file in an unknown folder is dropped — there is no concept to file it under
 * — but one that merely fails validation is kept and flagged, so a study you
 * just mistyped shows up as broken rather than vanishing.
 */
export function buildStudyLibrary(files: Record<string, unknown>): StudyEntry[] {
  const entries: StudyEntry[] = [];
  for (const [path, raw] of Object.entries(files)) {
    const concept = conceptFromPath(path);
    if (!concept) continue;
    const slug = slugFromPath(path);
    const issues = validateStudy(raw);
    const study = raw as Study;
    // Folder beats field and filename beats slug: the filesystem is the
    // taxonomy, so a stale field cannot move a study out from under its verdicts.
    entries.push({
      id: `${concept}/${slug}`,
      concept,
      slug,
      path,
      study: { ...study, concept, slug },
      issues,
    });
  }
  return entries.sort(compareEntries);
}

function groupIndex(concept: string): number {
  const found = conceptOf(concept);
  return found ? CONCEPT_GROUPS.indexOf(found.group) : CONCEPT_GROUPS.length;
}

function compareEntries(a: StudyEntry, b: StudyEntry): number {
  return (
    groupIndex(a.concept) - groupIndex(b.concept) ||
    a.concept.localeCompare(b.concept) ||
    (a.study.set ?? "").localeCompare(b.study.set ?? "") ||
    a.slug.localeCompare(b.slug)
  );
}

/** Entries in one concept group, or all of them when `group` is null. */
export function studiesOfGroup(
  entries: readonly StudyEntry[],
  group: ConceptGroup | null,
): StudyEntry[] {
  if (group === null) return [...entries];
  return entries.filter((entry) => conceptOf(entry.concept)?.group === group);
}

/** How many studies sit in each group — the counts on the tabs. */
export function countsByGroup(entries: readonly StudyEntry[]): Record<ConceptGroup, number> {
  const counts = Object.fromEntries(CONCEPT_GROUPS.map((g) => [g, 0])) as Record<
    ConceptGroup,
    number
  >;
  for (const entry of entries) {
    const group = conceptOf(entry.concept)?.group;
    if (group) counts[group] += 1;
  }
  return counts;
}

/** Case-insensitive match over slug, set, title, concept, variant and approach. */
export function searchStudies(entries: readonly StudyEntry[], query: string): StudyEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...entries];
  return entries.filter((entry) =>
    [
      entry.slug,
      entry.concept,
      entry.study.set ?? "",
      entry.study.title ?? "",
      entry.study.variant ?? "",
      entry.study.approach ?? "",
    ].some((field) => field.toLowerCase().includes(q)),
  );
}

/** Studies still waiting on a thumb — what the bench opens on. */
export function unjudged(entries: readonly StudyEntry[]): StudyEntry[] {
  return entries.filter((entry) => entry.issues.length === 0 && !entry.study.verdict);
}

/**
 * The attempts grouped into the sets they were fanned out as, in library order.
 *
 * A set is the unit of comparison: four attempts, one axis, everything else
 * held. Judging one in isolation is possible but weaker, which is why the bench
 * shows a study's siblings beside it.
 */
export function setsOf(entries: readonly StudyEntry[]): Map<string, StudyEntry[]> {
  const sets = new Map<string, StudyEntry[]>();
  for (const entry of entries) {
    const key = `${entry.concept}/${entry.study.set ?? entry.slug}`;
    sets.set(key, [...(sets.get(key) ?? []), entry]);
  }
  return sets;
}

// ── Tallies: the evidence a taste rule is written from ──────────────────────

export interface TagTally {
  tag: string;
  up: number;
  down: number;
}

/**
 * How often each shelf tag was attached to a thumbs-up and to a thumbs-down.
 *
 * Sorted by total mentions, because a tag said six times is the one worth
 * writing a rule about and a tag said once is an anecdote. Both counts are kept
 * rather than netted: `breathes` on four ups and one down is a preference, and
 * `breathes` on three of each says the tag is being used for two different
 * things and the shelf needs a word it hasn't got.
 */
export function tallyTags(entries: readonly StudyEntry[]): TagTally[] {
  const counts = new Map<string, TagTally>();
  for (const entry of entries) {
    const verdict = entry.study.verdict;
    if (!verdict || entry.issues.length > 0) continue;
    for (const tag of verdict.tags) {
      const tally = counts.get(tag) ?? { tag, up: 0, down: 0 };
      tally[verdict.thumb] += 1;
      counts.set(tag, tally);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.up + b.down - (a.up + a.down) || a.tag.localeCompare(b.tag),
  );
}

export interface ConceptTally {
  concept: Concept;
  judged: number;
  up: number;
  down: number;
  /** Tag tallies for this concept alone, most-mentioned first. */
  tags: TagTally[];
}

/** Per-concept counts, for concepts that have at least one judged study. */
export function tallyConcepts(entries: readonly StudyEntry[]): ConceptTally[] {
  const tallies: ConceptTally[] = [];
  for (const concept of CONCEPTS) {
    const mine = entries.filter(
      (entry) => entry.concept === concept.slug && entry.issues.length === 0,
    );
    const judged = mine.filter((entry) => entry.study.verdict);
    if (judged.length === 0) continue;
    tallies.push({
      concept,
      judged: judged.length,
      up: judged.filter((entry) => entry.study.verdict!.thumb === "up").length,
      down: judged.filter((entry) => entry.study.verdict!.thumb === "down").length,
      tags: tallyTags(mine),
    });
  }
  return tallies;
}

/**
 * How the axis values fared within one concept: the value on each attempt, and
 * which way its thumb went.
 *
 * This is the comparison the one-axis rule exists to make possible. Ten studies
 * of `guitar-solo` varied on `register` are a statement about register in
 * guitar solos; ten varied on everything at once are ten opinions.
 */
export interface AxisTally {
  axis: string;
  variant: string;
  up: number;
  down: number;
}

export function tallyAxis(entries: readonly StudyEntry[], concept: string): AxisTally[] {
  const counts = new Map<string, AxisTally>();
  for (const entry of entries) {
    if (entry.concept !== concept || entry.issues.length > 0) continue;
    const verdict = entry.study.verdict;
    if (!verdict) continue;
    const key = `${entry.study.axis} ${entry.study.variant}`;
    const tally = counts.get(key) ?? {
      axis: entry.study.axis,
      variant: entry.study.variant,
      up: 0,
      down: 0,
    };
    tally[verdict.thumb] += 1;
    counts.set(key, tally);
  }
  return [...counts.values()].sort(
    (a, b) => a.axis.localeCompare(b.axis) || a.variant.localeCompare(b.variant),
  );
}

// ── Teardown ────────────────────────────────────────────────────────────────

export interface CleanupPlan {
  /** Entries to delete, with the audio names that go with them. */
  remove: { entry: StudyEntry; audioName: string }[];
  /**
   * Entries that matched the selection but have no verdict yet. Held back by
   * default — deleting an attempt nobody judged throws away the render *and*
   * the question, and neither is recorded anywhere else.
   */
  unjudged: StudyEntry[];
}

/**
 * What a teardown would remove.
 *
 * A study is scratch. Once its finding is written into `docs/taste.md` the JSON
 * and the MP3s are dead weight — worse than dead weight, because a stale set
 * sitting in the bench invites a second verdict on a question already answered,
 * and the ledger would then disagree with the rule. So the loop ends in a
 * delete, and this is the pure half of it: which files, and which of them the
 * caller should be warned about first.
 *
 * Pure so the destructive part can be tested without a filesystem, and so the
 * script can show the list before touching anything.
 */
export function planCleanup(
  entries: readonly StudyEntry[],
  opts: { includeUnjudged?: boolean } = {},
): CleanupPlan {
  const remove: CleanupPlan["remove"] = [];
  const unjudged: StudyEntry[] = [];
  for (const entry of entries) {
    // A broken file has no verdict it could possibly have earned, but it is also
    // not a question worth protecting — it is a typo. It goes with the rest.
    const judged = entry.issues.length > 0 || Boolean(entry.study.verdict);
    if (!judged && !opts.includeUnjudged) {
      unjudged.push(entry);
      continue;
    }
    remove.push({ entry, audioName: studyAudioName(entry.concept, entry.slug) });
  }
  return { remove, unjudged };
}

// ── The generated ledger ────────────────────────────────────────────────────

/** Table cells are pipe-delimited, so a pipe in prose would end the column. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function thumbGlyph(thumb: Thumb): string {
  return thumb === "up" ? "up" : "down";
}

/**
 * `studies/ledger.md` — every verdict, one row each, plus the tallies.
 *
 * This is the file to read before composing: it is the raw record of what this
 * listener said yes and no to, cheap enough to read every time. It is generated
 * from the JSON and never hand-edited — a hand edit here would be a second
 * source of truth for the one thing that has to have only one.
 *
 * It deliberately stops at counting. `docs/taste.md` is where a count becomes a
 * rule, and that file is prose, written by hand, because "six thumbs-down on
 * `cluttered`" does not tell you *which* part to drop.
 */
export function renderStudyLedger(
  entries: readonly StudyEntry[],
  opts: { updated: string },
): string {
  const valid = entries.filter((entry) => entry.issues.length === 0);
  const judged = valid.filter((entry) => entry.study.verdict);
  const waiting = valid.filter((entry) => !entry.study.verdict);

  const lines = [
    "---",
    "title: Study verdicts",
    "purpose: The raw record of which musical approaches were approved and rejected. Read before composing; the rules derived from it are docs/taste.md.",
    "audience: [claude, human]",
    `updated: ${opts.updated}`,
    "generated_by: npm run study:ledger",
    "---",
    "",
    "# Study verdicts",
    "",
    "Generated — judge studies in the bench (`npm run dev` → `/studies.html`), never",
    "edit this file. Each row is one attempt at a musical concept, thumbed up or",
    "down, with the shelf tags saying what the thumb was about.",
    "",
    "**This is the evidence, not the conclusion.** What to actually *do* differently",
    "is [`docs/taste.md`](../docs/taste.md), which is written by hand from these",
    "counts — a tally says a preference exists, not what to write instead.",
    "",
    `${judged.length} judged · ${waiting.length} waiting · ${valid.length} total.`,
    "",
  ];

  if (judged.length === 0) {
    lines.push(
      "Nothing judged yet. Fan out a set:",
      "`npm run study:new -- --concept <slug> --axis <axis> --mood \"<scene>\"`.",
      "",
    );
    return lines.join("\n");
  }

  lines.push(...renderSignals(valid), ...renderVerdicts(judged), ...renderWaiting(waiting));
  return lines.join("\n");
}

/** The tag tallies — the part a rule gets written from. */
function renderSignals(entries: readonly StudyEntry[]): string[] {
  const tags = tallyTags(entries).filter((tally) => tally.up + tally.down > 0);
  if (tags.length === 0) return [];
  const lines = [
    "## Signals",
    "",
    "Shelf tags by how often they were attached to a verdict, most-mentioned first.",
    "A tag said once is an anecdote; a tag said five times the same way is a rule",
    "waiting to be written into `docs/taste.md`.",
    "",
    "| tag | on thumbs-up | on thumbs-down |",
    "| --- | --- | --- |",
  ];
  for (const tally of tags) lines.push(`| \`${tally.tag}\` | ${tally.up} | ${tally.down} |`);
  lines.push("");

  const concepts = tallyConcepts(entries);
  if (concepts.length > 0) {
    lines.push("| concept | judged | up | down | strongest signal |", "| --- | --- | --- | --- | --- |");
    for (const tally of concepts) {
      const top = tally.tags[0];
      const signal = top ? `\`${top.tag}\` (${top.up}↑ / ${top.down}↓)` : "—";
      lines.push(
        `| \`${tally.concept.slug}\` | ${tally.judged} | ${tally.up} | ${tally.down} | ${signal} |`,
      );
    }
    lines.push("");
  }
  return lines;
}

/** Every verdict, grouped by concept, with its set and axis so it can be compared. */
function renderVerdicts(judged: readonly StudyEntry[]): string[] {
  const lines = ["## Verdicts", ""];
  for (const concept of CONCEPTS) {
    const mine = judged.filter((entry) => entry.concept === concept.slug);
    if (mine.length === 0) continue;
    lines.push(`### ${concept.title} \`${concept.slug}\``, "", concept.blurb, "");
    lines.push(
      "| study | axis · variant | approach | verdict | tags | note |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const entry of mine) {
      const study = entry.study;
      const verdict = study.verdict!;
      const name = `[\`${entry.slug}\`](./${concept.slug}/${entry.slug}.json)`;
      lines.push(
        `| ${name} | \`${cell(study.axis)}\` · ${cell(study.variant)} | ${cell(study.approach)} | ` +
          `**${thumbGlyph(verdict.thumb)}** | ${verdict.tags.map((t) => `\`${t}\``).join(" ") || "—"} | ` +
          `${cell(verdict.note ?? "—")} |`,
      );
    }
    lines.push("");
  }
  return lines;
}

/** What still needs an ear, so the queue is visible without opening the bench. */
function renderWaiting(waiting: readonly StudyEntry[]): string[] {
  if (waiting.length === 0) return [];
  const lines = ["## Waiting on a thumb", ""];
  for (const entry of waiting) {
    const draft = entry.study.draft ? " *(needs writing)*" : "";
    lines.push(`- \`${entry.id}\` — ${cell(entry.study.variant)}${draft}`);
  }
  lines.push("");
  return lines;
}

/** Group blurbs, re-exported so the bench does not import two modules for tabs. */
export { CONCEPT_GROUPS, GROUP_BLURBS };
