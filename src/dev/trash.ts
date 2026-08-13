/**
 * Path rules for the bench's delete button. Deleting is a *move* into
 * `compositions/_trash/`, mirroring the kind folder it came from, so a
 * mis-click costs a drag-back instead of the piece.
 *
 * Pure path arithmetic, no fs — the dev server ([`./library-api`](./library-api.ts))
 * does the moving. Kept separate because the guard below is the security-relevant
 * part: the browser sends a path, and nothing outside `compositions/` may ever be
 * touched.
 */
import { isAbsolute, relative, resolve } from "node:path";
import { TRASH_DIR } from "../engine/library";

export interface TrashMove {
  /** Absolute path of the composition to move. */
  from: string;
  /** Absolute destination inside `compositions/_trash/`. */
  to: string;
  /** `_trash`-relative destination, for the response + the status line. */
  label: string;
}

/**
 * Resolve a client-supplied composition path to a trash move, or throw.
 *
 * Rejects anything that escapes `compositions/` (`..`, absolute paths, symlink
 * bait via a resolved prefix check), anything that isn't a `.json`, and anything
 * already in the trash. `stamp` is appended when the destination is taken, so a
 * second `foo.json` never overwrites the first one you deleted.
 */
export function resolveTrashMove(
  compositionsDir: string,
  requestedPath: string,
  options: { exists?: (path: string) => boolean; stamp?: string } = {},
): TrashMove {
  const { exists = () => false, stamp = String(Date.now()) } = options;
  const raw = requestedPath.trim();
  if (raw === "") throw new Error("no composition path given");
  if (isAbsolute(raw)) throw new Error(`path must be relative to the repo: "${raw}"`);
  if (!raw.toLowerCase().endsWith(".json")) throw new Error(`not a composition file: "${raw}"`);

  const root = resolve(compositionsDir);
  // Accept both "compositions/loops/x.json" (repo-relative) and "loops/x.json".
  const withoutRoot = raw.replace(/^\.?[\\/]*compositions[\\/]/i, "");
  const from = resolve(root, withoutRoot);
  const rel = relative(root, from).split(/[\\/]/).join("/");
  if (rel === "" || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`path escapes compositions/: "${raw}"`);
  }
  if (rel.split("/")[0] === TRASH_DIR) throw new Error(`already in the trash: "${rel}"`);

  const trashRoot = resolve(root, TRASH_DIR);
  let label = rel;
  let to = resolve(trashRoot, label);
  if (exists(to)) {
    label = rel.replace(/\.json$/i, `.${stamp}.json`);
    to = resolve(trashRoot, label);
  }
  return { from, to, label };
}
