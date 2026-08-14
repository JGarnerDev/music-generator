/**
 * Which files, when they appear or vanish, should reload an open bench.
 *
 * Split from the plugin so it can be tested without a dev server: the plugin is
 * three watcher callbacks, and everything worth getting wrong is here. Paths
 * arrive relative to the project root, in whatever separator the OS uses.
 */

/**
 * `library` — a composition or voice preset, which the app reaches through an
 * eager glob, so the server's module cache has to be dropped as well.
 * `audio` — a rendered file under `public/`, fetched fresh every time, so a
 * reload is enough. `null` — everything else; Vite's own HMR owns it.
 */
export type ReloadReason = "library" | "audio" | null;

const AUDIO_FILE = /\.(mp3|wav|json)$/;

export function reloadReason(relativePath: string): ReloadReason {
  const path = relativePath.replace(/\\/g, "/");
  if (path.startsWith("../") || path.startsWith("/")) return null; // outside the root

  // Trashing a piece moves it into `_trash/`, which no glob matches: the unlink
  // it leaves behind is the event that matters, not the arrival.
  if (path.startsWith("compositions/_trash/")) return null;

  if (path.startsWith("compositions/") && path.endsWith(".json")) return "library";
  if (path.startsWith("voices/") && path.endsWith(".json")) return "library";
  if (path.startsWith("public/audio/") && AUDIO_FILE.test(path)) return "audio";
  return null;
}
