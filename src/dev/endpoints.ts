/**
 * Shared route names for the dev-server library API. Its own module so the
 * browser can import the path without pulling `node:fs` (and the rest of
 * [`./library-api`](./library-api.ts)) into the bundle.
 */

/** POST `{ path }` → moves that composition into `compositions/_trash/`. Dev server only. */
export const TRASH_ENDPOINT = "/__library/trash";
