/**
 * Entry point for the studies bench (`studies.html`).
 *
 * StrictMode for the same reason as the other two benches: it double-invokes
 * renders and effects, which is how an audio bug caused by starting playback
 * outside a click handler makes itself heard. See
 * [`hooks/usePlayback`](./hooks/usePlayback.ts).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Studies } from "./pages/Studies";
import "./studies.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Studies />
  </StrictMode>,
);
