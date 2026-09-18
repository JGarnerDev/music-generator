/**
 * Entry point for the keys bench (`keys.html`).
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
