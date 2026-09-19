/**
 * Takes held on the device that played them.
 *
 * The keys bench saves by POSTing to a Vite plugin, which is fine on the
 * machine the repo is on and impossible anywhere else: the standalone app
 * ([`docs/deploy.md`](../../docs/deploy.md)) is a static page on a host with no
 * filesystem and no business writing to one. So on that build a take leaves in
 * the only two ways a browser can hand a file over — a download and the
 * clipboard — and this module is the shelf it waits on in between.
 *
 * The shelf exists because of how phones treat background tabs. iOS will
 * discard a page that has been out of sight for a minute, and a discarded keys
 * page is a performance nobody can play again. Every stop writes the derived
 * take to `localStorage`, so the worst case is "open the app again and it is
 * still there" rather than "play it again and hope".
 *
 * Pure, and therefore tested: it is a list with three rules (newest first, one
 * entry per name, bounded) and a parser that must never throw, because it runs
 * on mount and an exception there is a page that will not load at all.
 */
import { validateTake, type Take } from "./take";

/** Where the shelf lives. Namespaced because a host may serve other pages. */
export const SHELF_KEY = "music-generator.keys.takes";

/**
 * How many takes the shelf holds.
 *
 * A dozen is a session's worth of ideas and a few tens of kilobytes, well
 * inside the ~5 MB a browser gives an origin. It is a holding pen rather than a
 * library: the library is `recordings/keys/`, and a take that matters gets
 * imported into it.
 */
export const SHELF_LIMIT = 12;

/** The file name a take is downloaded as — the one `take:import` expects. */
export function takeFileName(take: Take): string {
  return `${take.name}.take.json`;
}

/**
 * The bytes of that file.
 *
 * Two-space JSON with a trailing newline, character for character what
 * [`src/dev/take-api.ts`](../dev/take-api.ts) writes on the dev server. A take
 * that came off a phone and a take saved locally should be the same file, or
 * the diff of importing one is noise about whitespace.
 */
export function takeJson(take: Take): string {
  return `${JSON.stringify(take, null, 2)}\n`;
}

/**
 * Put a take on the shelf: newest first, one entry per name.
 *
 * Replacing by name rather than appending because the page re-derives the take
 * every time the name or the tempo changes — shelving each of those as its own
 * entry would fill the shelf with twelve readings of one performance and push
 * out the take from before it.
 */
export function shelve(shelf: readonly Take[], take: Take, limit = SHELF_LIMIT): Take[] {
  const rest = shelf.filter((held) => held.name !== take.name);
  return [take, ...rest].slice(0, limit);
}

/** Take one off the shelf, by name. */
export function forget(shelf: readonly Take[], name: string): Take[] {
  return shelf.filter((held) => held.name !== name);
}

/**
 * Read the shelf back.
 *
 * Total, never throwing, and it drops anything that is not a usable take
 * instead of failing on it. This runs on mount, before the page exists: the
 * cost of being strict here is a blank screen, and the thing being protected is
 * a JSON blob this app wrote itself.
 */
export function parseShelf(raw: string | null | undefined): Take[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is Take => validateTake(entry).length === 0);
}

/** The shelf, as it is stored. */
export function serializeShelf(shelf: readonly Take[]): string {
  return JSON.stringify(shelf);
}
