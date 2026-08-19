/**
 * Path rules for saving a session plan. The browser sends a plan whose `name`
 * becomes a filename, so this is the security-relevant half of
 * [`./session-api`](./session-api.ts) and lives on its own to be tested without
 * a dev server.
 *
 * Pure path arithmetic, no fs. The rule is narrow on purpose: a session file is
 * `sessions/<slug>.json` and nothing else — no subfolders, no extensions, no
 * traversal. A name that is not already a slug is rejected rather than quietly
 * rewritten, because the page saves under the name it is showing you and a
 * silent rename would strand the file you thought you just wrote.
 */
import { isAbsolute, relative, resolve } from "node:path";
import { sessionSlug } from "../engine/session";

/** Absolute path of `sessions/<name>.json`, or throw if `name` is not a plain slug. */
export function resolveSessionPath(sessionsDir: string, name: unknown): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("session name is required");
  }
  const raw = name.trim();
  if (raw !== sessionSlug(raw)) {
    throw new Error(`session name must be a slug (lowercase, hyphens): "${raw}"`);
  }

  const root = resolve(sessionsDir);
  const file = resolve(root, `${raw}.json`);
  const rel = relative(root, file).split(/[\\/]/).join("/");
  // Belt and braces: the slug check above already forbids separators, but the
  // guard is what makes that a rule rather than an assumption.
  if (rel !== `${raw}.json` || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`path escapes sessions/: "${raw}"`);
  }
  return file;
}

/** True for the files the session list should read — plans, not stray notes. */
export function isSessionFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".json");
}
