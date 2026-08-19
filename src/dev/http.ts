/**
 * The three lines of HTTP every dev-server API needs: read a small JSON body,
 * answer with JSON, and mount a POST-only route.
 *
 * Extracted because the voice, study, library and session APIs had all grown
 * their own copy — four identical `readJsonBody`s is three chances for one of
 * them to forget the body-size cap.
 *
 * Dev only; `vite build` never sees any of it.
 */
import type { ViteDevServer } from "vite";

export type Body = Record<string, unknown>;

export interface Responder {
  statusCode: number;
  setHeader(k: string, v: string): void;
  end(body: string): void;
}

export interface IncomingLike {
  method?: string;
  on: NodeJS.EventEmitter["on"];
}

/** Bodies here are a few bytes of JSON; anything larger is a client bug (or worse). */
export const MAX_BODY_BYTES = 64 * 1024;

/** Answer a request with a JSON body and a status. */
export function send(res: Responder, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * Read and parse a request body, refusing anything over `maxBytes`. `example` is
 * quoted back when the JSON does not parse, so a bad request says what a good
 * one looks like.
 */
export async function readJsonBody(
  req: IncomingLike,
  example: string,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<Body> {
  const chunks: Buffer[] = [];
  let size = 0;
  await new Promise<void>((ok, fail) => {
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) return fail(new Error("request body too large"));
      chunks.push(chunk);
    });
    req.on("end", () => ok());
    req.on("error", fail);
  });
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
  } catch {
    throw new Error(`body must be JSON, e.g. ${example}`);
  }
}

/**
 * POST-only JSON route: parse the body, run `handle`, answer with what it
 * returns. A throwing handler becomes a 400 with its message — every one of
 * these APIs validates by throwing.
 */
export function postRoute(
  server: ViteDevServer,
  path: string,
  example: string,
  handle: (body: Body) => unknown,
  maxBytes: number = MAX_BODY_BYTES,
): void {
  server.middlewares.use(path, (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: `use POST, not ${req.method}` });
    readJsonBody(req, example, maxBytes)
      .then((body) => send(res, 200, handle(body)))
      .catch((err: Error) => send(res, 400, { error: err.message }));
  });
}

/** GET-only JSON route, for the APIs that also have something to hand back. */
export function getRoute(server: ViteDevServer, path: string, handle: () => unknown): void {
  server.middlewares.use(path, (req, res) => {
    if (req.method !== "GET") return send(res, 405, { error: `use GET, not ${req.method}` });
    try {
      send(res, 200, handle());
    } catch (err) {
      send(res, 500, { error: (err as Error).message });
    }
  });
}
