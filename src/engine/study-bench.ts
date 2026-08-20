/**
 * What the studies bench *says* and *shows*: which attempts are on screen, what
 * the selection's header and approach lines read, and every status message.
 *
 * Pure, and separate from the components, for the reason
 * [`./bench.ts`](./bench.ts) and [`./voice-bench.ts`](./voice-bench.ts) are —
 * but two of these rules are load-bearing rather than cosmetic, and both are
 * about not moving the thing under the user's hand mid-comparison:
 *
 * - {@link visibleStudies} keeps the *selected* attempt on screen even once it
 *   has a verdict, so thumbing something does not make it vanish from under the
 *   cursor when the next thing you want is to hear its sibling again.
 * - {@link siblingsOf} reads the whole library rather than the filtered rows,
 *   because "unjudged only" would otherwise hide exactly the attempt you are
 *   A/B-ing against.
 */
import {
  conceptOf,
  type ConceptGroup,
  type Thumb,
} from "./study";
import {
  searchStudies,
  setsOf,
  studiesOfGroup,
  type StudyEntry,
} from "./study-library";

export interface StudyFilters {
  /** null = the "All" tab. */
  group: ConceptGroup | null;
  query: string;
  unjudgedOnly: boolean;
  /** Survives the unjudged filter — see the module note. */
  selectedId: string | null;
}

export function visibleStudies(
  entries: readonly StudyEntry[],
  filters: StudyFilters,
): StudyEntry[] {
  const inGroup = searchStudies(studiesOfGroup(entries, filters.group), filters.query);
  if (!filters.unjudgedOnly) return inGroup;
  return inGroup.filter((entry) => !entry.study.verdict || entry.id === filters.selectedId);
}

/**
 * The attempt to open on.
 *
 * Falls back past the filtered rows to the whole library, because "unjudged
 * only" is on by default: a session where everything has already been judged
 * would otherwise open on nothing — no selection, no transport, and a status
 * line claiming there are no studies at all.
 */
export function firstSelectable(
  entries: readonly StudyEntry[],
  filters: StudyFilters,
): StudyEntry | null {
  return (
    visibleStudies(entries, filters)[0] ??
    entries.find((entry) => entry.issues.length === 0) ??
    null
  );
}

export const ALL_GROUPS_BLURB =
  "Every attempt under studies/. Pick a group to work through one kind of question.";

export const NO_STUDY_SELECTED = "No study selected.";

const FAN_OUT =
  'npm run study:new -- --concept <slug> --axis <axis> --mood "<scene>"';

/** Why the table is empty — a filter, a finished queue, or an empty shelf. */
export function emptyStudiesMessage(
  query: string,
  unjudgedOnly: boolean,
  total: number,
): string {
  if (query.trim() !== "") return `Nothing matches “${query.trim()}”.`;
  if (unjudgedOnly && total > 0) {
    return "Everything here has a verdict. Untick “unjudged only” to revisit them.";
  }
  return `No studies yet. Fan out a set: ${FAN_OUT}`;
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

/** `<set>/<last part of the slug>` — the set is what a row is identified by. */
export function rowLabel(entry: StudyEntry): string {
  return `${entry.study.set ?? "?"}/${entry.slug.split("-").at(-1) ?? entry.slug}`;
}

export interface ChipSpec {
  /** Appended to `chip` — an empty string is the neutral "no verdict yet" pill. */
  variant: string;
  text: string;
}

/**
 * The verdict column. `broken` and `draft` outrank a verdict: neither can have
 * one, since nothing renders a draft and an invalid file never played.
 */
export function verdictChip(entry: StudyEntry): ChipSpec {
  if (entry.issues.length > 0) return { variant: "broken", text: "broken" };
  if (entry.study.draft) return { variant: "draft", text: "draft" };
  const verdict = entry.study.verdict;
  if (!verdict) return { variant: "", text: "—" };
  return { variant: verdict.thumb, text: thumbGlyph(verdict.thumb) };
}

export function thumbGlyph(thumb: Thumb): string {
  return thumb === "up" ? "👍" : "👎";
}

/* ── The attempt under the needle ─────────────────────────────────────────── */

export interface StudyDescription {
  /** Title and id, the line above the approach. */
  label: string;
  /**
   * Two lines: what this attempt does differently, then what is held constant —
   * which is how a stale set gives itself away.
   */
  approach: string;
  broken: boolean;
}

export function describeStudy(entry: StudyEntry): StudyDescription {
  const study = entry.study;
  const broken = entry.issues.length > 0;
  const concept = conceptOf(entry.concept);
  return {
    label: `${study.title ?? entry.id} — ${entry.id}`,
    approach: broken
      ? entry.issues.map((issue) => `${issue.path} ${issue.message}`).join(" · ")
      : [
          study.approach ?? "",
          `held: ${study.held ?? "—"}${study.mood ? ` · from “${study.mood}”` : ""}` +
            `${concept ? ` · ${concept.title}` : ""}`,
        ].join("\n"),
    broken,
  };
}

/** The rest of the set: the attempts this one's thumb means anything against. */
export function siblingsOf(
  entries: readonly StudyEntry[],
  entry: StudyEntry,
): StudyEntry[] {
  const key = `${entry.concept}/${entry.study.set ?? entry.slug}`;
  return setsOf(entries).get(key) ?? [entry];
}

/** A sibling's button in the set strip: its position on the axis, plus its thumb. */
export function siblingLabel(entry: StudyEntry): string {
  const thumb = entry.study.verdict?.thumb;
  return `${entry.study.variant ?? entry.slug}${thumb ? ` ${thumbGlyph(thumb)}` : ""}`;
}

export interface Judgeable {
  /** A draft has nothing rendered and an invalid file never played. */
  canPlay: boolean;
  /** Thumbs, tag chips and the note all go dead together. */
  canJudge: boolean;
  /** Only a verdict that exists can be taken back. */
  canClear: boolean;
}

/** `canEdit` is false in a built bundle, where no dev server can write a verdict. */
export function judgeable(entry: StudyEntry | null, canEdit: boolean): Judgeable {
  if (!entry) return { canPlay: false, canJudge: false, canClear: false };
  const broken = entry.issues.length > 0;
  const draft = !!entry.study.draft;
  const canJudge = canEdit && !broken && !draft;
  return {
    canPlay: !broken && !draft,
    canJudge,
    canClear: canJudge && !!entry.study.verdict,
  };
}

/* ── Status line ──────────────────────────────────────────────────────────── */

export function noStudyAudioMessage(id: string): string {
  return `No audio for ${id}. Run: npm run study:render -- --study ${id}`;
}

export interface PlayedStudy {
  seconds: number;
  /** Already formatted for display — the engine does not pick a locale. */
  renderedOn: string;
}

export function studyPlayingMessage(id: string, audio: PlayedStudy): string {
  return (
    `Playing ${id} — ${audio.seconds.toFixed(0)}s, rendered ${audio.renderedOn}. ` +
    `Edited it since? npm run study:render -- --study ${id} --force`
  );
}

/**
 * A verdict with neither a tag nor a note says so out loud: the ledger tallies
 * tags, and a thumb on its own adds a row nothing can ever be counted from.
 */
export function judgedMessage(
  id: string,
  thumb: Thumb,
  tags: readonly string[],
  note: string,
): string {
  const why = tags.length > 0 ? ` (${tags.join(", ")})` : "";
  const empty =
    tags.length === 0 && note.trim() === ""
      ? " No reason given — the tally learns nothing from it."
      : "";
  return `${id} → ${thumb}${why}. studies/ledger.md rewritten.${empty}`;
}

export function clearedMessage(id: string): string {
  return `${id} is back in the queue.`;
}

/**
 * The opening line: how to use the page, or why its buttons are dead.
 *
 * Keyed on whether anything is *selectable* rather than on how many files there
 * are, because a shelf of nothing but invalid files is, to this page, an empty
 * one — there is nothing it can open on and nothing it can play.
 */
export function openingStudiesMessage(hasSelectable: boolean, canEdit: boolean): string {
  if (!hasSelectable) {
    return `No studies yet. Fan out a set: npm run study:new -- --concept guitar-solo --axis phrasing --mood "<scene>"`;
  }
  return canEdit
    ? "Play an attempt, pick the tags that say why, then thumb it. Its siblings are the strip above."
    : "Read-only build — judging needs the dev server (npm run dev).";
}
