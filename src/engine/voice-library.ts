/**
 * The voice library: how `voices/` is organised, which voice a track gets when
 * it names none, and the archive markdown that records what was approved.
 *
 * A voice's **instrument is its folder** — `voices/lead/molten.json` is a lead —
 * mirroring the composition library, and for the same reason: the taxonomy lives
 * in the filesystem, so the tabs in the bench and the folders on disk cannot
 * drift apart.
 *
 * Pure: no fs, no DOM. The app feeds it Vite's glob record; the scripts feed it
 * real paths. Both get the same entries back.
 */
import type { InstrumentName, ValidationIssue } from "./composition";
import { INSTRUMENT_NAMES } from "./composition";
import { validateVoice, type VoicePreset } from "./voice";

/** Instruments, in tab order — the same order the composition spec lists them. */
export const VOICE_INSTRUMENTS = INSTRUMENT_NAMES;

/** What each instrument is *for*, shown above its tab in the voices bench. */
export const INSTRUMENT_BLURBS: Record<InstrumentName, string> = {
  piano: "Struck keys. Carries a melody or a chord bed without asking for attention.",
  epiano: "Electric piano — FM bell in the attack, warm body. The lo-fi default.",
  pad: "Slow, wide, sustained. Atmosphere and glue, never the top line.",
  bass: "The low end. Owns everything under the guitars; defines the groove with the kick.",
  pluck: "Rhythm guitar: tight, fast-decaying, wide, low in the mix.",
  lead: "Top line guitar: compressed into sustain, mid-forward, centred, loud.",
  drums: "The kit — levels, tuning and decay per piece.",
};

export interface VoiceEntry {
  /** Stable id, `<instrument>/<slug>` — unique across the library. */
  id: string;
  instrument: InstrumentName;
  /** Filename without `.json`. */
  slug: string;
  /** Repo-relative path, e.g. `voices/lead/molten.json`. */
  path: string;
  preset: VoicePreset;
  /** Empty when the file is valid; the bench shows a warning otherwise. */
  issues: ValidationIssue[];
}

const INSTRUMENT_SET: ReadonlySet<string> = new Set<string>(VOICE_INSTRUMENTS);

export function isInstrumentName(value: unknown): value is InstrumentName {
  return typeof value === "string" && INSTRUMENT_SET.has(value);
}

/**
 * Instrument from the folder under `voices/`, or null for a file that isn't in
 * one. Accepts Vite's `../../voices/bass/x.json` as readily as a repo-relative
 * path.
 */
export function instrumentFromPath(path: string): InstrumentName | null {
  const parts = path.split(/[\\/]/);
  const root = parts.lastIndexOf("voices");
  const folder = root === -1 ? parts.at(-2) : parts[root + 1];
  return isInstrumentName(folder) ? folder : null;
}

/** Filename without directories or the `.json` extension. */
export function slugFromPath(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.json$/i, "");
}

/** `<instrument>.<slug>` — the audio filename and manifest key for a voice probe. */
export function voiceAudioName(instrument: InstrumentName, slug: string): string {
  return `${instrument}.${slug}`;
}

/**
 * Turn a path→JSON map into sorted entries (instrument order, then slug).
 *
 * Files in an unknown folder are dropped — there is no instrument to file them
 * under — but a file that merely *fails validation* is kept and flagged, because
 * a preset vanishing from the bench is how you end up debugging a sound you
 * can't find.
 */
export function buildVoiceLibrary(files: Record<string, unknown>): VoiceEntry[] {
  const entries: VoiceEntry[] = [];
  for (const [path, raw] of Object.entries(files)) {
    const instrument = instrumentFromPath(path);
    if (!instrument) continue;
    const slug = slugFromPath(path);
    const issues = validateVoice(raw);
    const preset = raw as VoicePreset;
    // The folder wins over the field, and the filename wins over the slug: the
    // filesystem is the taxonomy, so a stale field can't move a voice.
    entries.push({
      id: `${instrument}/${slug}`,
      instrument,
      slug,
      path,
      preset: { ...preset, instrument, slug },
      issues,
    });
  }
  return entries.sort(
    (a, b) =>
      VOICE_INSTRUMENTS.indexOf(a.instrument) - VOICE_INSTRUMENTS.indexOf(b.instrument) ||
      a.slug.localeCompare(b.slug),
  );
}

/** Every voice for one instrument, or all of them when `instrument` is null. */
export function voicesOf(
  entries: readonly VoiceEntry[],
  instrument: InstrumentName | null,
): VoiceEntry[] {
  return instrument === null ? [...entries] : entries.filter((e) => e.instrument === instrument);
}

/** How many voices each instrument has — the counts on the tabs. */
export function countsByInstrument(
  entries: readonly VoiceEntry[],
): Record<InstrumentName, number> {
  const counts = Object.fromEntries(VOICE_INSTRUMENTS.map((i) => [i, 0])) as Record<
    InstrumentName,
    number
  >;
  for (const entry of entries) counts[entry.instrument] += 1;
  return counts;
}

/**
 * The voice a track gets: the one it names, else the instrument's default.
 *
 * "Default" is, in order: the voice flagged `default`, then the first approved
 * one, then the first one at all. That ordering is what lets you add a draft to
 * an instrument without silently changing how every existing song renders — a
 * draft never becomes the default while an approved voice exists.
 *
 * Returns null when the instrument has no voices, which the app answers with its
 * built-in fallback rather than with silence.
 */
export function resolveVoice(
  entries: readonly VoiceEntry[],
  instrument: InstrumentName,
  slug?: string,
): VoiceEntry | null {
  const candidates = entries.filter((e) => e.instrument === instrument && e.issues.length === 0);
  if (slug) return candidates.find((e) => e.slug === slug) ?? null;
  return (
    candidates.find((e) => e.preset.default) ??
    candidates.find((e) => e.preset.status === "approved") ??
    candidates[0] ??
    null
  );
}

/** Case-insensitive match over slug, title and tags — the bench's filter box. */
export function searchVoices(entries: readonly VoiceEntry[], query: string): VoiceEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...entries];
  return entries.filter((e) =>
    [e.slug, e.preset.title ?? "", ...(e.preset.tags ?? [])].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}

/**
 * Approve a voice: it is now one we keep, dated so the archive can say when.
 *
 * Approving does not freeze the file — nothing can — but it is the point after
 * which the working agreement is to *fork rather than edit*, so a song that
 * names this voice keeps meaning what it meant. `voice:new --from` is the fork.
 */
export function approvePreset(
  preset: VoicePreset,
  opts: { today: string; makeDefault?: boolean; notes?: string },
): VoicePreset {
  return {
    ...preset,
    status: "approved",
    approvedAt: opts.today,
    ...(opts.makeDefault ? { default: true } : {}),
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
}

/** Send a voice back to the workbench. The archive drops it on the next write. */
export function draftPreset(preset: VoicePreset): VoicePreset {
  const { approvedAt: _dropped, ...rest } = preset;
  return { ...rest, status: "draft" };
}

/**
 * A copy under a new slug, back in draft, remembering where it came from.
 *
 * This is how an approved sound gets refined: the take you signed off on stays
 * exactly as it was, and the variant is a new file — which is also how an
 * instrument ends up with several voices worth choosing between, rather than one
 * voice with a history only git can see.
 */
export function forkPreset(
  preset: VoicePreset,
  opts: { slug: string; title?: string },
): VoicePreset {
  return {
    ...preset,
    slug: opts.slug,
    title: opts.title ?? `${preset.title} (fork)`,
    status: "draft",
    default: undefined,
    approvedAt: undefined,
    forkedFrom: `${preset.instrument}/${preset.slug}`,
  };
}

/**
 * Strip the `default` flag from every voice of an instrument except `keep`.
 *
 * Two defaults is not an error the schema can catch — each file is fine on its
 * own — and the loser is decided by sort order, which is the kind of bug that
 * shows up as "why does this song sound different now".
 */
export function clearDefaults(
  entries: readonly VoiceEntry[],
  instrument: InstrumentName,
  keep: string,
): VoiceEntry[] {
  return entries.filter(
    (entry) => entry.instrument === instrument && entry.slug !== keep && entry.preset.default,
  );
}

/**
 * The archive: every approved voice, grouped by instrument, as markdown.
 *
 * This is the file to read when picking sounds for a new piece — it is the
 * record of what we listened to and kept, with the notes that say what each one
 * is for. Regenerated by `npm run voice:approve`, never hand-edited: the JSON
 * files are the source of truth, and a hand edit here would be a second one.
 */
export function renderVoiceArchive(
  entries: readonly VoiceEntry[],
  opts: { updated: string },
): string {
  const approved = entries.filter(
    (e) => e.preset.status === "approved" && e.issues.length === 0,
  );
  const lines = [
    "---",
    "title: Approved voices",
    "purpose: The instrument sounds we listened to and kept — read this before choosing voices for a new piece.",
    "audience: [claude, human]",
    `updated: ${opts.updated}`,
    "generated_by: npm run voice:approve",
    "---",
    "",
    "# Approved voices",
    "",
    "Generated — edit the JSON under `voices/`, then re-approve. Each entry is a",
    "sound that was auditioned in the voices bench and signed off, so it can be",
    "named by any track: `{ \"instrument\": \"lead\", \"voice\": \"<slug>\" }`.",
    "",
  ];

  if (approved.length === 0) {
    lines.push("Nothing approved yet. Audition a draft: `npm run dev` → `/voices.html`.", "");
    return lines.join("\n");
  }

  for (const instrument of VOICE_INSTRUMENTS) {
    const voices = approved.filter((e) => e.instrument === instrument);
    if (voices.length === 0) continue;
    lines.push(`## ${instrument}`, "", INSTRUMENT_BLURBS[instrument], "");
    for (const entry of voices) {
      const preset = entry.preset;
      const flags = [
        preset.default ? "**default**" : "",
        preset.tags?.length ? preset.tags.map((t) => `\`${t}\``).join(" ") : "",
      ].filter(Boolean);
      lines.push(`### ${preset.title} — \`${entry.id}\``);
      lines.push("");
      if (flags.length > 0) lines.push(flags.join(" · "), "");
      if (preset.notes) lines.push(preset.notes.trim(), "");
      // Link relative to the archive's own home (`voices/archive.md`) rather than
      // to `entry.path`, which carries Vite's `../../` prefix in the browser.
      const file = `${entry.instrument}/${entry.slug}.json`;
      const provenance = [
        `approved ${preset.approvedAt ?? "—"}`,
        preset.forkedFrom ? `forked from \`${preset.forkedFrom}\`` : "",
        `[\`voices/${file}\`](./${file})`,
      ].filter(Boolean);
      lines.push(provenance.join(" · "), "");
    }
  }
  return lines.join("\n");
}
