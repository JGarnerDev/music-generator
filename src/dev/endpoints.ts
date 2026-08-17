/**
 * Shared route names for the dev-server APIs. Its own module so the browser can
 * import the paths without pulling `node:fs` (and the rest of
 * [`./library-api`](./library-api.ts) / [`./voice-api`](./voice-api.ts)) into the
 * bundle.
 */

/** POST `{ path }` → moves that composition into `compositions/_trash/`. Dev server only. */
export const TRASH_ENDPOINT = "/__library/trash";

/**
 * POST `{ id, makeDefault?, summary?, notes? }` → approves that voice and
 * rewrites `voices/archive.md`. `{ id, draft: true }` sends it back to the
 * workbench.
 */
export const VOICE_APPROVE_ENDPOINT = "/__voices/approve";

/** POST `{ from, slug, title? }` → copies a voice to a new draft slug. */
export const VOICE_FORK_ENDPOINT = "/__voices/fork";

/**
 * POST `{ id, thumb, tags?, note? }` → records a verdict on that study and
 * rewrites `studies/ledger.md`. `{ id, clear: true }` takes the verdict back.
 */
export const STUDY_VERDICT_ENDPOINT = "/__studies/verdict";
