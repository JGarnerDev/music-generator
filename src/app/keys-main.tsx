/**
 * Entry point for the keys bench (`keys.html`) and for the standalone keys app
 * (`dist-keys/index.html`) — the same page, built twice.
 *
 * StrictMode, like the other three, and it earns its keep hardest here: it
 * double-invokes effects, so the keyboard's graph is built, disposed and built
 * again on every mount. A live instrument that leaks nodes or loses its
 * listeners across that is one that would also break the first time a voice was
 * switched mid-session.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Keys } from "./pages/Keys";
import "./keys.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Keys />
  </StrictMode>,
);

/**
 * The service worker, in the standalone build only.
 *
 * Its whole job is the train: a keyboard that needs a connection to make a
 * sound is not an instrument, and this app has no server side to need one for —
 * the voices are bundled and the notes come out of your hands. It is written by
 * [`vite.keys.config.ts`](../../vite.keys.config.ts), which knows the file
 * list; there is nothing to register in the bench build, where the file does
 * not exist. See `src/globals.d.ts` for why `import.meta.env.PROD` cannot make
 * this decision.
 *
 * Registration failing is not worth a word to the user — the page in front of
 * them is already working, and the only thing lost is a later load without
 * signal.
 */
if (__KEYS_APP__ && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(new URL("sw.js", location.href), { scope: "./" });
  });
}
