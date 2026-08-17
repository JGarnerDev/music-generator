/**
 * The `studies/` folder, node side: read every study, write one back, keep the
 * ledger in step.
 *
 * Shared by the study scripts and by the dev-server API behind the bench's thumb
 * buttons, so "what a study is called and where it lives" is decided once. The
 * organising and formatting rules are pure and tested in
 * [`@engine/study-library`](../engine/study-library.ts); this module is the
 * filesystem around them.
 *
 * Dev-only — never bundled, so a built page has no way to touch these files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildStudyLibrary, renderStudyLedger, type StudyEntry } from "../engine/study-library";
import { conceptOf, type Study } from "../engine/study";

export const STUDIES_DIR = "studies";
export const LEDGER_FILE = "ledger.md";

/** `<concept>/<slug>` — how a study is named on the command line and in the API. */
const STUDY_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function studiesRoot(cwd: string = process.cwd()): string {
  return resolve(cwd, STUDIES_DIR);
}

/**
 * Every study under `studies/`, as library entries.
 *
 * A file that won't parse is reported as an entry carrying that as its issue
 * rather than thrown or skipped — the bench lists it as broken, which is how you
 * find a study you just mistyped instead of wondering where it went.
 */
export function readStudies(root: string = studiesRoot()): StudyEntry[] {
  if (!existsSync(root)) return [];
  const files: Record<string, unknown> = {};
  for (const concept of readdirSync(root, { withFileTypes: true })) {
    if (!concept.isDirectory() || !conceptOf(concept.name)) continue;
    const dir = resolve(root, concept.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const path = `${STUDIES_DIR}/${concept.name}/${file}`;
      try {
        files[path] = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
      } catch (err) {
        files[path] = { __parseError: (err as Error).message };
      }
    }
  }
  return buildStudyLibrary(files);
}

/**
 * Absolute path for a study id, or throw.
 *
 * The id reaches this function from a command line *and* from an HTTP request,
 * so it is matched against a strict pattern rather than sanitised: an id is one
 * known concept and one kebab-case slug, which leaves no room for a `..`, a
 * separator or an extension to smuggle a write outside `studies/`.
 */
export function studyFile(id: string, root: string = studiesRoot()): string {
  const match = STUDY_ID.exec(id.trim());
  if (!match) throw new Error(`not a study id: "${id}" — expected <concept>/<slug>`);
  const [, concept, slug] = match;
  if (!conceptOf(concept!)) {
    throw new Error(`unknown concept "${concept}" — see CONCEPTS in src/engine/study.ts`);
  }
  return resolve(root, concept!, `${slug}.json`);
}

/** Write a study, creating its concept folder. Trailing newline, like every file here. */
export function writeStudy(path: string, study: Study): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(study, null, 2)}\n`, "utf8");
}

/**
 * Delete one study's JSON, and its concept folder if that emptied it.
 *
 * Real `rm`, not a move into a trash folder the way a composition is deleted —
 * because the two are not the same kind of object. A composition is the work; a
 * study is the scratch that produced a line in `docs/taste.md`, and it is
 * regenerable from the concept, axis and mood if it is ever wanted again.
 * Keeping them would leave answered questions sitting in the bench inviting a
 * second, contradictory verdict.
 *
 * The id goes through `studyFile`, so the same strict `<concept>/<slug>` guard
 * that protects a write protects this.
 */
export function deleteStudy(id: string, root: string = studiesRoot()): string {
  const path = studyFile(id, root);
  rmSync(path, { force: true });
  const dir = dirname(path);
  // A concept folder with nothing in it would still be a tab with a zero on it.
  if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  return path;
}

/**
 * Rewrite `studies/ledger.md` from what is on disk.
 *
 * Called after anything that changes a verdict, so the ledger can never claim a
 * study was approved that wasn't. Generated, never hand-edited — the JSON files
 * are the source of truth.
 */
export function writeLedger(root: string = studiesRoot(), today = new Date()): string {
  const path = resolve(root, LEDGER_FILE);
  const updated = today.toISOString().slice(0, 10);
  mkdirSync(root, { recursive: true });
  writeFileSync(path, renderStudyLedger(readStudies(root), { updated }), "utf8");
  return path;
}
