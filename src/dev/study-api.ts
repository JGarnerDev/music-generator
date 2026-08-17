/**
 * Dev-server side of the studies bench: the buttons that change files on disk,
 * thumbs up and thumbs down.
 *
 * The listening happens in the browser, so the judgement should be a click there
 * rather than a trip back to a terminal — but only the server can write. The
 * route calls the same [`./study-ops`](./study-ops.ts) the CLI does, so a click
 * and `npm run study:verdict` cannot come to mean different things.
 *
 * Dev only: never part of `vite build`, so a built page has no way to touch the
 * filesystem. Ids are checked against a strict `<concept>/<slug>` pattern in
 * `study-store.ts` — that guard is what keeps a crafted request inside
 * `studies/`.
 */
import type { Plugin, ViteDevServer } from "vite";
import { STUDY_VERDICT_ENDPOINT } from "./endpoints";
import { judge, unjudge } from "./study-ops";

/**
 * A note is prose the listener typed, so this is larger than the voice API's
 * 4 KB — but still small enough that anything over it is a client bug.
 */
const MAX_BODY_BYTES = 16384;

export function studyApi(root?: string): Plugin {
  return {
    name: "music-generator:study-api",
    apply: "serve",
    configureServer(server) {
      route(server, STUDY_VERDICT_ENDPOINT, (body) => {
        const id = String(body.id ?? "");
        if (body.clear === true) {
          const cleared = unjudge(id, { root });
          server.config.logger.info(`  ${cleared.id} → back in the queue`);
          return { id: cleared.id, verdict: null };
        }
        const thumb = body.thumb === "up" || body.thumb === "down" ? body.thumb : null;
        if (!thumb) throw new Error('thumb must be "up" or "down"');
        const result = judge(id, {
          root,
          thumb,
          tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
          note: typeof body.note === "string" ? body.note : undefined,
        });
        const verdict = result.study.verdict!;
        server.config.logger.info(
          `  ${result.id} → ${verdict.thumb}${verdict.tags.length ? ` (${verdict.tags.join(", ")})` : ""}`,
        );
        return { id: result.id, verdict };
      });
    },
  };
}

type Body = Record<string, unknown>;
type Responder = {
  statusCode: number;
  setHeader(k: string, v: string): void;
  end(body: string): void;
};

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
    throw new Error('body must be JSON, e.g. { "id": "hook/dust-a", "thumb": "up" }');
  }
}

function send(res: Responder, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
