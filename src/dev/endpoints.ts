/**
 * Shared route names for the dev-server APIs. Its own module so the browser can
 * import the paths without pulling `node:fs` (and the rest of
 * [`./library-api`](./library-api.ts) / [`./voice-api`](./voice-api.ts)) into the
 * bundle.
 */

/** POST `{ path }` → moves that composition into `compositions/_trash/`. Dev server only. */
export const TRASH_ENDPOINT = "/__library/trash";

/**
 * POST `{ id, makeDefault?, notes? }` → approves that voice and rewrites
 * `voices/archive.md`. `{ id, draft: true }` sends it back to the workbench.
 */
export const VOICE_APPROVE_ENDPOINT = "/__voices/approve";

/** POST `{ from, slug, title? }` → copies a voice to a new draft slug. */
export const VOICE_FORK_ENDPOINT = "/__voices/fork";
