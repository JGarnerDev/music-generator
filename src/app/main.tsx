/**
 * Entry point for the workshop bench (`index.html`).
 *
 * StrictMode is on deliberately: it double-invokes renders and effects to
 * surface the exact bug this app is most exposed to — audio started from an
 * effect instead of a click. See [`hooks/usePlayback`](./hooks/usePlayback.ts).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Bench } from "./pages/Bench";
import "./bench.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
