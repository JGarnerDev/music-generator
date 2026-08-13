/**
 * Dev-server side of the bench's library table: the one thing the browser can't
 * do on its own is change files on disk, so `npm run dev` mounts this tiny
 * middleware for the delete button.
 *
 * Dev only — it is never part of `vite build`, so the built bundle has no way to
 * touch the filesystem. Deleting *moves* the file into `compositions/_trash/`
 * (see [`./trash`](./trash.ts)); the path guard there is what keeps a crafted
 * request from reaching anything outside `compositions/`.
 */
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";
import { TRASH_ENDPOINT } from "./endpoints";
import { resolveTrashMove } from "./trash";

const MAX_BODY_BYTES = 4096;

export function libraryApi(compositionsDir = resolve(process.cwd(), "compositions")): Plugin {
  return {
    name: "music-generator:library-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(TRASH_ENDPOINT, (req, res) => {
        if (req.method !== "POST") {
          return send(res, 405, { error: `use POST, not ${req.method}` });
        }
        readJsonBody(req)
          .then((body) => {
            const move = resolveTrashMove(compositionsDir, String(body.path ?? ""), {
              exists: existsSync,
            });
            if (!existsSync(move.from)) {
              return send(res, 404, { error: `no such composition: ${body.path}` });
            }
            mkdirSync(dirname(move.to), { recursive: true });
            renameSync(move.from, move.to);
            server.config.logger.info(`  trashed ${move.label} → compositions/_trash/`);
            send(res, 200, { trashed: move.label });
          })
          .catch((err: Error) => send(res, 400, { error: err.message }));
      });
    },
  };
}

/** Body is a few bytes of JSON; anything larger is a client bug (or worse). */
async function readJsonBody(req: { on: NodeJS.EventEmitter["on"] }): Promise<{ path?: unknown }> {
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
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw) as { path?: unknown };
  } catch {
    throw new Error("body must be JSON: { path: \"compositions/<kind>/<name>.json\" }");
  }
}

function send(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void }, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
