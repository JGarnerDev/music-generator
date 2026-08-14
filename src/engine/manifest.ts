/**
 * The manifest that tells the app what audio exists.
 *
 * `npm run render` writes `public/audio/manifest.json`; the app imports it and
 * plays what it lists. It is the contract between the render step and the
 * player, so its shape lives in the engine beside the composition contract
 * rather than in either side's glue.
 *
 * Pure — building and reading it is tested.
 */

export interface ManifestEntry {
  /** Composition name, or `<name>.loop` for the seam-wrapped body. */
  name: string;
  /** Filename inside `public/audio/`. */
  file: string;
  seconds: number;
  bytes: number;
  /** True for the seam-wrapped loop body, which is meant to be repeated. */
  isLoop: boolean;
  /** ISO timestamp, so a stale render is visible rather than mysterious. */
  renderedAt: string;
}

export interface Manifest {
  entries: ManifestEntry[];
}

/** Serialise a manifest, sorted by name so re-rendering produces a clean diff. */
export function renderManifest(entries: ManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  return `${JSON.stringify({ entries: sorted }, null, 2)}\n`;
}

/**
 * Index a manifest by entry name. Unknown shapes give an empty index rather
 * than throwing: a missing or half-written manifest should mean "nothing is
 * rendered yet", which the app can report, not a blank page.
 */
export function indexManifest(manifest: unknown): Map<string, ManifestEntry> {
  const entries = (manifest as Manifest | undefined)?.entries;
  if (!Array.isArray(entries)) return new Map();
  return new Map(
    entries
      .filter((entry): entry is ManifestEntry => typeof entry?.name === "string" && !!entry.file)
      .map((entry) => [entry.name, entry]),
  );
}

/**
 * Fold a run's fresh entries into the previous manifest, keeping anything whose
 * file is still on disk and dropping anything whose file is not.
 *
 * Rendering the whole library takes tens of minutes, so a run that dies partway
 * — or renders only one piece — must not erase the manifest for everything
 * else. `available` is what is actually in the audio directory, which is the
 * only real authority on what the app can play.
 */
export function mergeManifest(
  previous: ManifestEntry[],
  fresh: ManifestEntry[],
  available: ReadonlySet<string>,
): ManifestEntry[] {
  const merged = new Map<string, ManifestEntry>();
  for (const entry of previous) merged.set(entry.name, entry);
  for (const entry of fresh) merged.set(entry.name, entry);
  return [...merged.values()].filter((entry) => available.has(entry.file));
}

/** The manifest name for a composition, in the two flavours that get rendered. */
export function audioName(compositionName: string, opts: { loop?: boolean } = {}): string {
  return opts.loop ? `${compositionName}.loop` : compositionName;
}
