/**
 * The render harness: Vite + a headless Chromium + N pages, shared by every
 * script that needs audio out of the graph.
 *
 * **Why a browser at all.** Web Audio is the synth engine, and Tone.js cannot run
 * in node — it goes through `standardized-audio-context`, which needs a real
 * `window`; rendering against `node-web-audio-api` with shims hangs rather than
 * failing cleanly (tried, 2026-08-14). So a render starts Vite, opens
 * `render.html` in Chromium, and calls into [`./render-page`](./render-page.ts).
 * The graph is the one the app has always used, so what a script writes and what
 * the browser would have produced are the same audio.
 *
 * Three things here are non-obvious and were each learned the hard way; see
 * [`docs/rendering.md`](../../docs/rendering.md):
 *
 * - **HMR must be off.** Editing any source file mid-run reloads the page under a
 *   render in progress and kills it with `Execution context was destroyed`.
 * - **PCM comes back in slices**, through a `page.exposeBinding` callback, not as
 *   a return value: a few minutes of stereo float audio is tens of megabytes and
 *   serialising that in one piece is slow and fragile.
 * - **Whatever finished must survive a crash.** This module does not decide what
 *   to do with results, so the caller can write its manifest in a `finally` —
 *   a full library is tens of minutes of rendering to lose.
 *
 * Dev-only: never part of `vite build`.
 */
import { availableParallelism } from "node:os";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { Composition } from "../engine/composition";
import type { PcmAudio } from "../utils/wav";

/** One browser page, ready to render compositions one at a time. */
export interface RenderSession {
  renderPcm(
    comp: Composition,
    opts?: { loopOnly?: boolean; audition?: boolean },
  ): Promise<PcmAudio>;
}

export interface RenderRunOptions<J> {
  /** Pieces to render in parallel. Each is one busy CPU thread. */
  jobs: number;
  items: readonly J[];
  /** Called once per item, on whichever page is free. Throwing aborts the run. */
  run(item: J, session: RenderSession): Promise<void>;
}

/**
 * Headless Chromium renders this graph at roughly 0.2x realtime — a two-minute
 * piece takes ten minutes — and each render is one busy thread. Half the cores
 * keeps the machine usable while still finishing the library far sooner.
 */
export function defaultJobs(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

/**
 * Run `items` through the graph, `jobs` at a time, then tear everything down.
 *
 * Server and browser are torn down in a `finally`, so a failed render still
 * leaves the machine clean — and the caller still gets whatever its own callback
 * managed to record before the throw.
 */
export async function renderItems<J>(options: RenderRunOptions<J>): Promise<void> {
  const { jobs, items, run } = options;
  if (items.length === 0) return;

  const server = await createServer({ server: { port: 0, hmr: false }, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch();
  const origin = originOf(server);

  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(jobs, items.length) }, async () => {
        const page = await newRenderPage(browser, origin);
        while (next < items.length) {
          await run(items[next++]!, sessionFor(page));
        }
        await page.close();
      }),
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

type RenderPage = Page & { incoming: Float32Array[][] };

/** A page with its own PCM sink — see `render-page.ts` for the chunking. */
async function newRenderPage(browser: Browser, origin: string): Promise<RenderPage> {
  const page = (await browser.newPage()) as RenderPage;
  page.incoming = [];
  await page.exposeBinding(
    "__renderChunk",
    (_source, payload: { channel: number; base64: string }) => {
      const bytes = Buffer.from(payload.base64, "base64");
      const samples = new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      (page.incoming[payload.channel] ??= []).push(samples);
    },
  );
  await page.goto(`${origin}/render.html`);
  await page.waitForSelector("body[data-ready=true]");
  return page;
}

function sessionFor(page: RenderPage): RenderSession {
  return {
    async renderPcm(comp, opts = {}) {
      page.incoming = [];
      const shape = await page.evaluate(
        ([composition, isLoop, audition]) =>
          window.renderToPcm!(composition as Composition, {
            loopOnly: isLoop as boolean,
            audition: audition as boolean,
          }),
        [comp, !!opts.loopOnly, !!opts.audition] as const,
      );
      return { sampleRate: shape.sampleRate, channels: page.incoming.map(join) };
    },
  };
}

function join(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function originOf(server: ViteDevServer): string {
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("vite did not report a port");
  return `http://localhost:${address.port}`;
}
