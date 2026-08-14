/**
 * The three things that happen to a voice file: fork it, approve it, send it
 * back to draft.
 *
 * One implementation, two front ends — `npm run voice:approve` and the bench's
 * buttons (via [`./voice-api`](./voice-api.ts)) — so clicking and typing can
 * never drift into meaning different things. The decisions are pure and tested
 * in [`@engine/voice-library`](../engine/voice-library.ts); what is here is the
 * reading, writing and archive rewriting around them.
 *
 * Dev-only.
 */
import { existsSync } from "node:fs";
import { basename } from "node:path";
import {
  approvePreset,
  clearDefaults,
  draftPreset,
  forkPreset,
  isInstrumentName,
  resolveVoice,
  type VoiceEntry,
} from "../engine/voice-library";
import { validateVoice, type VoicePreset } from "../engine/voice";
import { readVoices, voiceFile, voicesRoot, writeArchive, writeVoice } from "./voice-store";

export interface VoiceOpResult {
  /** `<instrument>/<slug>` of the voice that changed. */
  id: string;
  path: string;
  preset: VoicePreset;
  /** Ids whose `default` flag was cleared to make room for this one. */
  demoted: string[];
}

export interface VoiceOpOptions {
  root?: string;
  today?: Date;
}

/**
 * Approve a voice and rewrite the archive.
 *
 * `makeDefault` also demotes whatever was the instrument's default, in the same
 * call: two defaults is a bug the schema can't see, because each file is valid
 * on its own.
 */
export function approve(
  id: string,
  opts: VoiceOpOptions & { makeDefault?: boolean; notes?: string; summary?: string } = {},
): VoiceOpResult {
  const root = opts.root ?? voicesRoot();
  const today = opts.today ?? new Date();
  const entry = loadVoice(id, root);
  const preset = approvePreset(entry.preset, {
    today: today.toISOString().slice(0, 10),
    makeDefault: opts.makeDefault,
    notes: opts.notes,
    summary: opts.summary,
  });
  // A summary too long to be a table cell is the one thing that would grow the
  // archive back, so it fails here rather than being silently written.
  assertValid(preset);

  const demoted: string[] = [];
  if (opts.makeDefault) {
    for (const other of clearDefaults(readVoices(root), entry.instrument, entry.slug)) {
      const { default: _wasDefault, ...rest } = other.preset;
      writeVoice(voiceFile(other.id, root), rest as VoicePreset);
      demoted.push(other.id);
    }
  }

  const path = voiceFile(id, root);
  writeVoice(path, preset);
  writeArchive(root, today);
  return { id: entry.id, path, preset, demoted };
}

/** Send an approved voice back to the workbench, and drop it from the archive. */
export function unapprove(id: string, opts: VoiceOpOptions = {}): VoiceOpResult {
  const root = opts.root ?? voicesRoot();
  const entry = loadVoice(id, root);
  const preset = draftPreset(entry.preset);
  const path = voiceFile(id, root);
  writeVoice(path, preset);
  writeArchive(root, opts.today ?? new Date());
  return { id: entry.id, path, preset, demoted: [] };
}

export interface ForkOptions extends VoiceOpOptions {
  /** Voice to copy. Defaults to the instrument's current default. */
  from?: string;
  /** Instrument to fork within, when `from` is omitted. */
  instrument?: string;
  slug: string;
  title?: string;
  notes?: string;
  summary?: string;
}

/**
 * Copy a voice to a new slug, in draft.
 *
 * With no `from`, it forks the instrument's default — "start from what we
 * already like" is the common case, and a preset built from nothing is a worse
 * starting point than one that already sounds like something.
 */
export function fork(opts: ForkOptions): VoiceOpResult {
  const root = opts.root ?? voicesRoot();
  const source = opts.from
    ? loadVoice(opts.from, root)
    : defaultOf(opts.instrument ?? "", root);

  const preset = forkPreset(source.preset, { slug: opts.slug, title: opts.title });
  if (opts.notes) preset.notes = opts.notes;
  if (opts.summary) preset.summary = opts.summary;
  assertValid(preset);

  const id = `${source.instrument}/${opts.slug}`;
  const path = voiceFile(id, root);
  if (existsSync(path)) {
    throw new Error(`${id} already exists — pick another slug, or edit ${basename(path)}`);
  }
  writeVoice(path, preset);
  return { id, path, preset, demoted: [] };
}

/** Load one voice, or explain what is wrong with the id rather than throwing ENOENT. */
function loadVoice(id: string, root: string): VoiceEntry {
  const path = voiceFile(id, root); // also validates the shape of the id
  const entry = readVoices(root).find((candidate) => candidate.id === id.trim());
  if (!entry) throw new Error(`no such voice: ${id} (looked in ${path})`);
  if (entry.issues.length > 0) {
    const first = entry.issues[0]!;
    throw new Error(`${id} is not valid yet: ${first.path} ${first.message}`);
  }
  return entry;
}

function defaultOf(instrument: string, root: string): VoiceEntry {
  if (!isInstrumentName(instrument)) {
    throw new Error(`unknown instrument "${instrument}" — pass --from <instrument>/<slug> instead`);
  }
  const entry = resolveVoice(readVoices(root), instrument);
  if (!entry) throw new Error(`no voice to fork for ${instrument} — pass --from <instrument>/<slug>`);
  return entry;
}

/** Re-validate a preset after an edit, for callers that want to fail loudly. */
export function assertValid(preset: VoicePreset): void {
  const issues = validateVoice(preset);
  if (issues.length > 0) {
    throw new Error(`voice is invalid: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
  }
}
