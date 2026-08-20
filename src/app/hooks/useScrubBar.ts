/**
 * React's handle on [`scrub.ts`](../scrub.ts) — the position bar under the
 * transport.
 *
 * The bar is not ported to JSX, and that is deliberate. It repaints from a
 * `requestAnimationFrame` loop reading the player's position sixty times a
 * second, because `Tone.Player` has no position event; driving that through
 * `setState` would re-render the whole board — a table of cues and an archive of
 * every piece — once per frame, during the one activity the page exists for.
 * The widget owns three text nodes and a width, so it keeps owning them.
 *
 * Mounted through a **callback ref** rather than an effect: the node is the only
 * thing it needs, React hands it over the moment it exists, and there is no
 * effect for StrictMode to double. A throwaway unmount hands back `null`, which
 * cancels the frame loop and drops the bar; the remount builds a fresh one into
 * the same (emptied) container.
 */
import { useCallback, useRef } from "react";
import { createScrubBar, type ScrubBar } from "../scrub";

export interface ScrubHandle {
  /** Goes on the `<div id="scrub">` the bar builds itself into. */
  ref(node: HTMLDivElement | null): void;
  /** Begin following playback. Idempotent. */
  start(): void;
  /** Stop following and blank the bar — call when playback stops. */
  reset(): void;
}

export function useScrubBar(onSeek: (seconds: number) => void): ScrubHandle {
  const bar = useRef<ScrubBar | null>(null);
  const seek = useRef(onSeek);
  // Latched rather than passed: the bar is built once, but `onSeek` closes over
  // this render's status setter. Assigning here keeps the seek message current
  // without rebuilding the DOM every time the board re-renders.
  seek.current = onSeek;

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      bar.current?.reset();
      bar.current = null;
      return;
    }
    bar.current = createScrubBar(node, (seconds) => seek.current(seconds));
  }, []);

  return {
    ref,
    start: () => bar.current?.start(),
    reset: () => bar.current?.reset(),
  };
}
