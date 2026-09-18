/**
 * Path rules for saving a keyboard take. The browser sends a name that becomes
 * a filename, so this is the security-relevant half of
 * [`./take-api`](./take-api.ts) and lives on its own to be tested without a dev
 * server.
 *
 * Same rule, same reasons, as [`./session-store`](./session-store.ts): a take is
 * `recordings/keys/<slug>.take.json` and nothing else — no subfolders, no
 * traversal, no second extension. A name that is not already a slug is rejected
 * rather than quietly rewritten, because the page tells the user the path it
 * saved to and a silent rename strands the file they were told about.
 */
import { isAbsolute, relative, resolve } from "node:path";
import { takeSlug } from "../engine/take";

/** The folder takes live in, relative to the project root. */
export const TAKES_DIR = "recordings/keys";

/** The extension, kept distinct so `recordings/` can hold other kinds of note file. */
export const TAKE_EXTENSION = ".take.json";

/** Absolute path of `recordings/keys/<name>.take.json`, or throw if `name` is not a plain slug. */
export function resolveTakePath(takesDir: string, name: unknown): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("take name is required");
  }
  const raw = name.trim();
  if (raw !== takeSlug(raw)) {
    throw new Error(`take name must be a slug (lowercase, hyphens): "${raw}"`);
  }

  const root = resolve(takesDir);
  const file = resolve(root, `${raw}${TAKE_EXTENSION}`);
  const rel = relative(root, file).split(/[\\/]/).join("/");
  if (rel !== `${raw}${TAKE_EXTENSION}` || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`path escapes ${TAKES_DIR}/: "${raw}"`);
  }
  return file;
}

/** True for the files a take listing should read. */
export function isTakeFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(TAKE_EXTENSION);
}

/** The project-relative path the page shows and the user hands to Claude. */
export function takeRelativePath(name: string): string {
  return `${TAKES_DIR}/${name}${TAKE_EXTENSION}`;
}
