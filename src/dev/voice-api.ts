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
import type { Plugin, ViteDevServer } from "vite";
import { VOICE_APPROVE_ENDPOINT, VOICE_FORK_ENDPOINT } from "./endpoints";
import { approve, fork, unapprove } from "./voice-ops";

const MAX_BODY_BYTES = 4096;

export function voiceApi(root?: string): Plugin {
  return {
    name: "music-generator:voice-api",
    apply: "serve",
    configureServer(server) {
      route(server, VOICE_APPROVE_ENDPOINT, (body) => {
        const id = String(body.id ?? "");
        const result = body.draft
          ? unapprove(id, { root })
          : approve(id, {
              root,
              makeDefault: body.makeDefault === true,
              notes: typeof body.notes === "string" ? body.notes : undefined,
            });
        server.config.logger.info(
          `  ${result.id} → ${result.preset.status}${result.demoted.length ? ` (demoted ${result.demoted.join(", ")})` : ""}`,
        );
        return { id: result.id, status: result.preset.status, demoted: result.demoted };
      });

      route(server, VOICE_FORK_ENDPOINT, (body) => {
        const result = fork({
          root,
          from: typeof body.from === "string" ? body.from : undefined,
          instrument: typeof body.instrument === "string" ? body.instrument : undefined,
          slug: String(body.slug ?? ""),
          title: typeof body.title === "string" ? body.title : undefined,
        });
        server.config.logger.info(`  forked ${result.preset.forkedFrom} → ${result.id}`);
        return { id: result.id, forkedFrom: result.preset.forkedFrom };
      });
    },
  };
}

type Body = Record<string, unknown>;
type Responder = { statusCode: number; setHeader(k: string, v: string): void; end(body: string): void };

/** POST-only JSON route: parse the body, run `handle`, answer with what it returns. */
function route(server: ViteDevServer, path: string, handle: (body: Body) => unknown): void {
  server.middlewares.use(path, (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: `use POST, not ${req.method}` });
    readJsonBody(req)
      .then((body) => send(res, 200, handle(body)))
      .catch((err: Error) => send(res, 400, { error: err.message }));
  });
}

interface IncomingLike {
  method?: string;
  on: NodeJS.EventEmitter["on"];
}

/** Body is a few bytes of JSON; anything larger is a client bug (or worse). */
async function readJsonBody(req: IncomingLike): Promise<Body> {
  const chunks: Buffer[] = [];
  let size = 0;
  await new Promise<void>((ok, fail) => {
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return fail(new Error("request body too large"));
      chunks.push(chunk);
    });
    req.on("end", () => ok());
    req.on("error", fail);
  });
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
  } catch {
    throw new Error('body must be JSON, e.g. { "id": "lead/molten" }');
  }
}

function send(res: Responder, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
