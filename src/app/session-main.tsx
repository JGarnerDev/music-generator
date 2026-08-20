/**
 * Entry point for the session board (`session.html`).
 *
 * StrictMode for the same reason as the other three benches: it double-invokes
 * renders and effects, which is how an audio bug caused by starting playback
 * outside a click handler makes itself heard. See
 * [`hooks/usePlayback`](./hooks/usePlayback.ts).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Session } from "./pages/Session";
import "./session.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Session />
  </StrictMode>,
);
