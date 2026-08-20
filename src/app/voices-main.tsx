/**
 * Entry point for the voice bench (`voices.html`).
 *
 * StrictMode for the same reason as the composition bench: it double-invokes
 * renders and effects, which is exactly how an audio bug caused by starting
 * playback outside a click handler makes itself heard. See
 * [`hooks/usePlayback`](./hooks/usePlayback.ts).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Voices } from "./pages/Voices";
import "./voices.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Voices />
  </StrictMode>,
);
