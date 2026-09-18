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

/**
 * GET → `{ sessions: SessionPlan[] }`, every plan in `sessions/`.
 *
 * Fetched rather than globbed, unlike the composition library: a glob would put
 * session files under the live-reload watcher, and saving a running order
 * mid-game would reload the page — which stops the audio. See
 * [`./live-library-rules`](./live-library-rules.ts).
 */
export const SESSION_LIST_ENDPOINT = "/__sessions/list";

/** POST a `SessionPlan` → writes `sessions/<name>.json`. Dev server only. */
export const SESSION_SAVE_ENDPOINT = "/__sessions/save";

/** POST `{ name }` → deletes `sessions/<name>.json`. Dev server only. */
export const SESSION_DELETE_ENDPOINT = "/__sessions/delete";

/**
 * POST `{ take }` → writes `recordings/keys/<name>.take.json`. Dev server only.
 *
 * Deliberately not globbed into the app the way compositions and voices are: a
 * take is written *while* the page is being played, and a glob would put it
 * under the live-reload watcher — saving one would reload the tab and stop the
 * audio mid-session. See [`./live-library-rules`](./live-library-rules.ts),
 * where `sessions/` is absent for the same reason.
 */
export const TAKE_SAVE_ENDPOINT = "/__takes/save";
