/**
 * A CSS media query, as a boolean React can render from.
 *
 * The keys bench needs one thing the stylesheet cannot do for it: the *words*
 * change on a touch device. A legend that says "space to record · esc to panic"
 * on a phone is a legend naming keys that do not exist, and the fix is a
 * different sentence rather than a different layout — which is a render
 * decision, not a style one.
 *
 * Keyed off `matchMedia` rather than a width or a user-agent string because
 * both are wrong in the case that matters: a tablet with a keyboard attached
 * should read the shortcuts, and a narrow window on a laptop should too.
 * `(pointer: coarse)` asks the only question worth asking — is a finger doing
 * the pointing?
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True while a finger, not a mouse, is doing the pointing. */
export const COARSE_POINTER = "(pointer: coarse)";
