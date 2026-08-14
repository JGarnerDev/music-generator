/**
 * Dev-server side of "I just made a thing — let me hear it".
 *
 * Both benches read their library through an eager `import.meta.glob`
 * (see [`src/app/main.ts`](../app/main.ts) and [`src/app/voices.ts`](../app/voices.ts)).
 * Vite re-transforms a globbed module when a file it already matched *changes*,
 * but a brand-new `compositions/<kind>/x.json` or `voices/<instrument>/x.json`
 * leaves the transformed module in the server's cache untouched — so the new
 * piece stays invisible through any number of browser refreshes, and only a
 * dev-server restart brings it back. This plugin drops that cache and reloads
 * the page instead.
 *
 * Rendered audio lands in `public/`, which Vite serves straight from disk with
 * `Cache-Control: no-cache`, so a fresh MP3 needs no cache-busting — only a
 * reload, which is the other half of what this does: finish `npm run render`
 * and the open tab picks the audio up on its own.
 *
 * Dev only; `vite build` never sees it. The path rules are pure and tested in
 * [`./live-library-rules`](./live-library-rules.ts).
 */
import { relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { reloadReason } from "./live-library-rules";

/** Renders write many files in a burst; collapse them into one reload. */
const SETTLE_MS = 120;

export function liveLibrary(root = process.cwd()): Plugin {
  return {
    name: "music-generator:live-library",
    apply: "serve",
    configureServer(server) {
      let pending: ReturnType<typeof setTimeout> | null = null;
      let invalidate = false;
      let label = "";

      const flush = (): void => {
        pending = null;
        // An eager glob's members are baked into the transformed importer, so a
        // new file only shows up once that transform is thrown away.
        if (invalidate) server.moduleGraph.invalidateAll();
        server.ws.send({ type: "full-reload", path: "*" });
        server.config.logger.info(`  live reload — ${label}`, { timestamp: true });
        invalidate = false;
      };

      const onEvent = (event: "add" | "change" | "unlink") => (file: string) => {
        const reason = reloadReason(relative(root, file));
        if (!reason) return;
        // A changed composition or voice is Vite's own job — it already reloads.
        if (reason === "library" && event === "change") return;
        invalidate ||= reason === "library";
        label = `${event} ${relative(root, file).replace(/\\/g, "/")}`;
        if (pending) clearTimeout(pending);
        pending = setTimeout(flush, SETTLE_MS);
      };

      // `public/` is inside the root Vite already watches, but say so explicitly:
      // the audio directory is what `npm run render` writes, and a watcher that
      // silently stopped covering it would look exactly like a stale render.
      server.watcher.add(resolve(root, "public/audio"));
      server.watcher.on("add", onEvent("add"));
      server.watcher.on("change", onEvent("change"));
      server.watcher.on("unlink", onEvent("unlink"));
    },
  };
}
