/**
 * The dev-server APIs, from React: approve a voice, thumb a study, save a
 * running order.
 *
 * All four benches talk to [`src/dev`](../../dev) the same way — POST JSON, read
 * JSON back, and treat a non-2xx as an error carrying the server's own message
 * rather than a status code. That last part is the whole reason this is shared:
 * `{ error: "voice lead/molten is already approved" }` is what the status line
 * should say, and every page that re-implemented the fetch got one variant of it
 * slightly wrong.
 *
 * Not a data-fetching library, and deliberately no loading state: every call
 * here starts at a click the caller can already `await` inside.
 */
import { useMemo } from "react";

/** POST JSON, get JSON. Throws with the server's `error` when it refuses. */
export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<T> {
  return unwrap(
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** GET JSON. Same error handling; used where a glob would fight live-reload. */
export async function getJson<T = Record<string, unknown>>(url: string): Promise<T> {
  return unwrap(await fetch(url));
}

async function unwrap<T>(res: Response): Promise<T> {
  const parsed = (await res.json()) as T & { error?: unknown };
  if (!res.ok) throw new Error(String(parsed.error ?? `HTTP ${res.status}`));
  return parsed;
}

export interface Api {
  post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T>;
  get<T = Record<string, unknown>>(url: string): Promise<T>;
  /**
   * Whether writing is possible at all. The APIs are Vite dev-server plugins, so
   * a built bundle has nobody to answer them — the pages grey their write
   * buttons out on this rather than letting a click fail at the network.
   */
  canEdit: boolean;
}

export function useApi(): Api {
  return useMemo<Api>(
    () => ({ post: postJson, get: getJson, canEdit: import.meta.env.DEV }),
    [],
  );
}
