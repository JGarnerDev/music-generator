/**
 * The two things that happen to a study file: judge it, and take the judgement
 * back.
 *
 * One implementation, two front ends — `npm run study:verdict` and the bench's
 * thumb buttons (via [`./study-api`](./study-api.ts)) — so clicking and typing
 * can never drift into meaning different things. Every write also rewrites
 * `studies/ledger.md`, because a verdict that isn't in the ledger is a verdict
 * nothing will ever read.
 *
 * Dev-only.
 */
import { isVerdictTag, validateStudy, type Study, type Thumb, type Verdict } from "../engine/study";
import type { StudyEntry } from "../engine/study-library";
import { readStudies, studiesRoot, studyFile, writeLedger, writeStudy } from "./study-store";

export interface StudyOpResult {
  /** `<concept>/<slug>` of the study that changed. */
  id: string;
  path: string;
  study: Study;
}

export interface StudyOpOptions {
  root?: string;
  today?: Date;
}

export interface VerdictOptions extends StudyOpOptions {
  thumb: Thumb;
  /** Shelf tags. Anything not on the shelf is rejected rather than dropped. */
  tags?: readonly string[];
  note?: string;
}

/**
 * Record a thumb on a study.
 *
 * Tags are validated against the shelf here rather than filtered, because a
 * silently dropped tag is a reason the listener gave and the ledger will never
 * show — and the ledger is the entire point. A study can be re-judged: the new
 * verdict replaces the old one outright, since "what I think now" is the only
 * useful reading of a taste record.
 */
export function judge(id: string, opts: VerdictOptions): StudyOpResult {
  const root = opts.root ?? studiesRoot();
  const today = opts.today ?? new Date();
  const entry = loadStudy(id, root);

  const tags = [...new Set((opts.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  const unknown = tags.filter((tag) => !isVerdictTag(tag));
  if (unknown.length > 0) {
    throw new Error(
      `not on the tag shelf: ${unknown.join(", ")} — see VERDICT_TAGS in src/engine/study.ts`,
    );
  }

  const note = opts.note?.trim();
  const verdict: Verdict = {
    thumb: opts.thumb,
    tags,
    ...(note ? { note } : {}),
    at: today.toISOString().slice(0, 10),
  };
  const study: Study = { ...entry.study, verdict };
  assertValid(study);

  const path = studyFile(id, root);
  writeStudy(path, study);
  writeLedger(root, today);
  return { id: entry.id, path, study };
}

/** Take a verdict back — the study returns to the queue and leaves the ledger. */
export function unjudge(id: string, opts: StudyOpOptions = {}): StudyOpResult {
  const root = opts.root ?? studiesRoot();
  const entry = loadStudy(id, root);
  const { verdict: _dropped, ...rest } = entry.study;
  const study = rest as Study;
  const path = studyFile(id, root);
  writeStudy(path, study);
  writeLedger(root, opts.today ?? new Date());
  return { id: entry.id, path, study };
}

/** Load one study, or explain what is wrong with the id rather than throwing ENOENT. */
function loadStudy(id: string, root: string): StudyEntry {
  const path = studyFile(id, root); // also validates the shape of the id
  const entry = readStudies(root).find((candidate) => candidate.id === id.trim());
  if (!entry) throw new Error(`no such study: ${id} (looked in ${path})`);
  if (entry.issues.length > 0) {
    const first = entry.issues[0]!;
    throw new Error(`${id} is not valid yet: ${first.path} ${first.message}`);
  }
  return entry;
}

/** Re-validate a study after an edit, for callers that want to fail loudly. */
export function assertValid(study: Study): void {
  const issues = validateStudy(study);
  if (issues.length > 0) {
    throw new Error(`study is invalid: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
  }
}
