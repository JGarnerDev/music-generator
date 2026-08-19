/**
 * Dev-server side of the session page: reading, saving and deleting the running
 * orders in `sessions/`.
 *
 * The page is used at the table, where the running order changes as the night
 * does — a cue gets dropped, another moves earlier. That has to survive a
 * refresh and be visible to the next `npm run compose`, so it is a file on disk,
 * not browser storage.
 *
 * **Why a fetch and not a glob.** Every other bench reads its library through an
 * eager `import.meta.glob`, which puts the folder under the live-reload watcher
 * (see [`./live-library-rules`](./live-library-rules.ts)). That is right for
 * compositions and wrong for sessions: saving a running order would reload the
 * page, and reloading the page stops whatever is playing. Mid-game, that is the
 * worst thing this app could do.
 *
 * Dev only: never part of `vite build`, so a built page has no way to touch the
 * filesystem. The `sessions/<slug>.json` guard is in
 * [`./session-store`](./session-store.ts).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import {
  SESSION_DELETE_ENDPOINT,
  SESSION_LIST_ENDPOINT,
  SESSION_SAVE_ENDPOINT,
} from "./endpoints";
import { getRoute, postRoute } from "./http";
import { isSessionFile, resolveSessionPath } from "./session-store";
import {
  parseSessions,
  renderSessionPlan,
  validateSessionPlan,
  type SessionPlan,
} from "../engine/session";

/** A plan is a few dozen cues of pointers and short notes — generous, still bounded. */
const MAX_BODY_BYTES = 64 * 1024;

export function sessionApi(sessionsDir = resolve(process.cwd(), "sessions")): Plugin {
  return {
    name: "music-generator:session-api",
    apply: "serve",
    configureServer(server) {
      getRoute(server, SESSION_LIST_ENDPOINT, () => ({ sessions: readSessions(sessionsDir) }));

      postRoute(
        server,
        SESSION_SAVE_ENDPOINT,
        '{ "name": "session-14", "cues": [{ "entry": "loops/tavern-raid" }] }',
        (body) => {
          const issues = validateSessionPlan(body);
          if (issues.length > 0) {
            throw new Error(issues.map((i) => `${i.path} ${i.message}`).join("; "));
          }
          const plan = body as unknown as SessionPlan;
          const file = resolveSessionPath(sessionsDir, plan.name);
          mkdirSync(sessionsDir, { recursive: true });
          writeFileSync(file, renderSessionPlan(plan), "utf8");
          server.config.logger.info(`  saved sessions/${plan.name}.json (${plan.cues.length} cues)`);
          return { name: plan.name, cues: plan.cues.length };
        },
        MAX_BODY_BYTES,
      );

      postRoute(server, SESSION_DELETE_ENDPOINT, '{ "name": "session-14" }', (body) => {
        const file = resolveSessionPath(sessionsDir, body.name);
        if (!existsSync(file)) throw new Error(`no such session: ${String(body.name)}`);
        rmSync(file);
        server.config.logger.info(`  deleted sessions/${String(body.name)}.json`);
        return { deleted: String(body.name) };
      });
    },
  };
}

/**
 * Every plan in `sessions/`. A file that does not parse is skipped rather than
 * thrown on — one hand-edited plan with a trailing comma must not take the whole
 * page down on the night you need it.
 */
function readSessions(sessionsDir: string): SessionPlan[] {
  if (!existsSync(sessionsDir)) return [];
  const parsed = readdirSync(sessionsDir)
    .filter(isSessionFile)
    .map((file) => {
      try {
        return JSON.parse(readFileSync(join(sessionsDir, file), "utf8")) as unknown;
      } catch {
        return null;
      }
    });
  return parseSessions(parsed);
}
