/**
 * Window-level keyboard shortcuts, for the one page that needs them.
 *
 * The session board is played with a hand on the keyboard and eyes on the
 * table, so the shortcuts are unmodified single keys — which is exactly why the
 * guard here matters more than the binding: a bare `space` or `1` typed into the
 * archive's search box must filter the shelf, not fire cue one at the players.
 *
 * The handler is latched into a ref rather than listed as a dependency: it
 * closes over the running order, the fader and the transport, so it changes on
 * every render, and re-binding a window listener sixty times a scene is how you
 * end up with two of them. One listener, always calling the newest handler.
 */
import { useEffect, useRef } from "react";

/** Where a keystroke belongs to what you are typing in, not to the page. */
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

export function useHotkeys(handler: (event: KeyboardEvent) => void): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && TYPING.test(target.tagName)) return;
      // Leave the browser's own shortcuts alone — ⌘/ctrl-1 switches tabs.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      latest.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
