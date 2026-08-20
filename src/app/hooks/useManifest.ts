/**
 * What `npm run render` produced, looked up by audio name.
 *
 * Fetched rather than imported because the manifest sits in `public/` beside the
 * audio it describes, and Vite does not let JavaScript import out of `public/`.
 * The app renders nothing itself: a piece missing from this manifest has no
 * audio yet, and `npm run render` is what makes it playable.
 *
 * The promise is cached at module scope, not in state: every page that mounts
 * this hook — and every remount StrictMode causes — shares the one fetch.
 */
import { useCallback, useEffect, useState } from "react";
import { indexManifest, type ManifestEntry } from "@engine/manifest";

/** Compositions, written by `npm run render`. */
const COMPOSITIONS = "/audio/manifest.json";
/** Voice probes, written by `npm run voice:render`. Same shape, own folder. */
const VOICES = "/audio/voices/manifest.json";
/** Study attempts, written by `npm run study:render`. */
const STUDIES = "/audio/studies/manifest.json";

const cached = new Map<string, Promise<Map<string, ManifestEntry>>>();

/** A manifest index, fetched once per page load per file. */
export function manifest(url = COMPOSITIONS): Promise<Map<string, ManifestEntry>> {
  let index = cached.get(url);
  if (!index) {
    index = fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then(indexManifest)
      // A missing or malformed manifest means "nothing is rendered yet", which is
      // a normal state for a fresh clone — not an error worth breaking the page.
      .catch(() => indexManifest(null));
    cached.set(url, index);
  }
  return index;
}

/** Look up one rendered file by its audio name (see `audioName`). */
export type ManifestLookup = (name: string) => Promise<ManifestEntry | undefined>;

/**
 * A stable lookup rather than a loading flag: the caller is always inside a
 * click handler it can `await` in, so there is no render that has to cope with
 * "the manifest isn't here yet".
 */
export function useManifest(): ManifestLookup {
  return useCallback((name: string) => manifest().then((index) => index.get(name)), []);
}

/**
 * The same, for the voice bench's probes — `voiceAudioName(instrument, slug)`
 * is what it takes.
 */
export function useVoiceManifest(): ManifestLookup {
  return useCallback((name: string) => manifest(VOICES).then((index) => index.get(name)), []);
}

/** The same, for the studies bench — `studyAudioName(concept, slug)` takes it. */
export function useStudyManifest(): ManifestLookup {
  return useCallback((name: string) => manifest(STUDIES).then((index) => index.get(name)), []);
}

/**
 * The whole index, in state, for the one page that has to render what has *not*
 * been rendered: the session board marks a silent cue before the game rather
 * than at it, so it needs every row up front instead of a lookup per click.
 *
 * `null` until the fetch lands — the difference between "nothing is rendered"
 * and "we do not know yet" is the difference between a pre-flight check that
 * says the night is silent and one that is worth reading. StrictMode runs the
 * effect twice and the module cache turns that back into one request.
 */
export function useManifestIndex(url = COMPOSITIONS): ReadonlyMap<string, ManifestEntry> | null {
  const [index, setIndex] = useState<ReadonlyMap<string, ManifestEntry> | null>(null);
  useEffect(() => {
    let live = true;
    void manifest(url).then((loaded) => {
      if (live) setIndex(loaded);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return index;
}
