/**
 * Dev-server side of the keys bench: the Save button.
 *
 * The performance happens in the browser and only the server can write, which
 * is the same split every bench here has. What is different is the size of the
 * body — a take is a list of notes, not a flag — so the cap is raised from the
 * shared default, but only to the length of a performance somebody would
 * actually play in one sitting.
 *
 * Dev only: never part of `vite build`, so a built page has no way to touch the
 * filesystem. The name is checked against a strict slug pattern in
 * [`./take-store`](./take-store.ts) — that guard is what keeps a crafted
 * request inside `recordings/keys/`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Plugin } from "vite";
import { validateTake } from "../engine/take";
import { TAKE_SAVE_ENDPOINT } from "./endpoints";
import { postRoute } from "./http";
import { resolveTakePath, takeRelativePath } from "./take-store";

/**
 * A take of a few hundred notes is a few tens of kilobytes; 512 KB is a
 * comfortable ceiling over the longest thing a pair of hands produces in one
 * pass, and far under what a runaway loop could send.
 */
const MAX_BODY_BYTES = 512 * 1024;

export function takeApi(takesDir: string): Plugin {
  return {
    name: "music-generator:take-api",
    apply: "serve",
    configureServer(server) {
      postRoute(
        server,
        TAKE_SAVE_ENDPOINT,
        '{ "take": { "name": "tavern-hook", "bpm": 90, "key": "Am", "notes": [] } }',
        (body) => {
          const take = body.take;
          const issues = validateTake(take);
          // Refuse before writing rather than after: a take that fails to load
          // is discovered when somebody sits down to compose from it, by which
          // time the hands that could play it again have gone.
          if (issues.length > 0) throw new Error(`take is not usable — ${issues.join("; ")}`);

          const name = (take as { name: string }).name;
          const file = resolveTakePath(takesDir, name);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, `${JSON.stringify(take, null, 2)}\n`, "utf8");

          const path = takeRelativePath(name);
          server.config.logger.info(`  take saved → ${path}`);
          return { path };
        },
        MAX_BODY_BYTES,
      );
    },
  };
}
