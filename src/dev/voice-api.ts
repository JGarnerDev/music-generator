/**
 * Dev-server side of the voices bench: the two buttons that change files on
 * disk, Approve and Fork.
 *
 * The listening happens in the browser, so the decision should be a click there
 * rather than a trip back to a terminal — but only the server can write. Both
 * routes call the same [`./voice-ops`](./voice-ops.ts) the CLI does, so a click
 * and `npm run voice:approve` cannot come to mean different things.
 *
 * Dev only: never part of `vite build`, so a built page has no way to touch the
 * filesystem. Ids are checked against a strict `<instrument>/<slug>` pattern in
 * `voice-store.ts` — that guard is what keeps a crafted request inside `voices/`.
 */
import type { Plugin } from "vite";
import { VOICE_APPROVE_ENDPOINT, VOICE_FORK_ENDPOINT } from "./endpoints";
import { postRoute } from "./http";
import { approve, fork, unapprove } from "./voice-ops";

const MAX_BODY_BYTES = 4096;

export function voiceApi(root?: string): Plugin {
  return {
    name: "music-generator:voice-api",
    apply: "serve",
    configureServer(server) {
      postRoute(server, VOICE_APPROVE_ENDPOINT, '{ "id": "lead/molten" }', (body) => {
        const id = String(body.id ?? "");
        const result = body.draft
          ? unapprove(id, { root })
          : approve(id, {
              root,
              makeDefault: body.makeDefault === true,
              notes: typeof body.notes === "string" ? body.notes : undefined,
              summary: typeof body.summary === "string" ? body.summary : undefined,
            });
        server.config.logger.info(
          `  ${result.id} → ${result.preset.status}${result.demoted.length ? ` (demoted ${result.demoted.join(", ")})` : ""}`,
        );
        return { id: result.id, status: result.preset.status, demoted: result.demoted };
      }, MAX_BODY_BYTES);

      postRoute(server, VOICE_FORK_ENDPOINT, '{ "from": "lead/molten", "slug": "molten-wide" }', (body) => {
        const result = fork({
          root,
          from: typeof body.from === "string" ? body.from : undefined,
          instrument: typeof body.instrument === "string" ? body.instrument : undefined,
          slug: String(body.slug ?? ""),
          title: typeof body.title === "string" ? body.title : undefined,
        });
        server.config.logger.info(`  forked ${result.preset.forkedFrom} → ${result.id}`);
        return { id: result.id, forkedFrom: result.preset.forkedFrom };
      }, MAX_BODY_BYTES);
    },
  };
}
