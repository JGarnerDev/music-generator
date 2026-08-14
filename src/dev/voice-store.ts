/**
 * The `voices/` folder, node side: read every preset, write one back, keep the
 * archive in step.
 *
 * Shared by the voice scripts and by the dev-server API behind the bench's
 * Approve/Fork buttons, so "what a voice file is called and where it lives" is
 * decided once. The organising and formatting rules themselves are pure and
 * tested in [`@engine/voice-library`](../engine/voice-library.ts); this module is
 * the filesystem around them.
 *
 * Dev-only — never bundled, so a built page has no way to touch these files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildVoiceLibrary,
  isInstrumentName,
  renderVoiceArchive,
  type VoiceEntry,
} from "../engine/voice-library";
import type { VoicePreset } from "../engine/voice";

export const VOICES_DIR = "voices";
export const ARCHIVE_FILE = "archive.md";

/** `<instrument>/<slug>` — how a voice is named on the command line and in the API. */
const VOICE_ID = /^([a-z]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function voicesRoot(cwd: string = process.cwd()): string {
  return resolve(cwd, VOICES_DIR);
}

/**
 * Every preset under `voices/`, as library entries.
 *
 * A file that won't parse is reported as an entry carrying that as its issue,
 * rather than thrown or skipped: the bench lists it as broken, which is how you
 * find a voice you just mistyped instead of wondering where it went.
 */
export function readVoices(root: string = voicesRoot()): VoiceEntry[] {
  if (!existsSync(root)) return [];
  const files: Record<string, unknown> = {};
  for (const instrument of readdirSync(root, { withFileTypes: true })) {
    if (!instrument.isDirectory() || !isInstrumentName(instrument.name)) continue;
    const dir = resolve(root, instrument.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const path = `${VOICES_DIR}/${instrument.name}/${file}`;
      try {
        files[path] = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
      } catch (err) {
        files[path] = { __parseError: (err as Error).message };
      }
    }
  }
  return buildVoiceLibrary(files);
}

/**
 * Absolute path for a voice id, or throw.
 *
 * The id reaches this function from a command line *and* from an HTTP request,
 * so it is matched against a strict pattern rather than sanitised: an id is one
 * known instrument and one kebab-case slug, which leaves no room for a `..`, a
 * separator or an extension to smuggle a write outside `voices/`.
 */
export function voiceFile(id: string, root: string = voicesRoot()): string {
  const match = VOICE_ID.exec(id.trim());
  if (!match) throw new Error(`not a voice id: "${id}" — expected <instrument>/<slug>`);
  const [, instrument, slug] = match;
  if (!isInstrumentName(instrument)) throw new Error(`unknown instrument "${instrument}"`);
  return resolve(root, instrument, `${slug}.json`);
}

/** Write a preset, creating its instrument folder. Trailing newline, like every file here. */
export function writeVoice(path: string, preset: VoicePreset): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(preset, null, 2)}\n`, "utf8");
}

/**
 * Rewrite `voices/archive.md` from what is on disk.
 *
 * Called after anything that changes a status, so the archive can never claim a
 * voice is approved that isn't. It is generated, never hand-edited — the JSON is
 * the source of truth and a hand edit here would quietly become a second one.
 */
export function writeArchive(root: string = voicesRoot(), today = new Date()): string {
  const path = resolve(root, ARCHIVE_FILE);
  const updated = today.toISOString().slice(0, 10);
  mkdirSync(root, { recursive: true });
  writeFileSync(path, renderVoiceArchive(readVoices(root), { updated }), "utf8");
  return path;
}
