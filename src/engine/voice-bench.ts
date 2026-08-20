/**
 * What the voice bench *says* about a voice: the header line, the notes block,
 * and every message that lands in the status line.
 *
 * Pure, and separate from the components, for the reason
 * [`./bench.ts`](./bench.ts) is: these strings are the page's only feedback, and
 * half of them are instructions — "run `npm run voice:render -- --voice x`" is
 * the difference between a silent bench and a rendered one. A command printed
 * wrong is worse than no command, so they are tested rather than eyeballed.
 */
import type { InstrumentName } from "./composition";
import { voicesOf, type VoiceEntry } from "./voice-library";

/**
 * The rows the table shows: one instrument's voices, and — with the filter on —
 * only the ones still to judge. A broken file counts as a draft, since it is
 * certainly not approved work.
 */
export function visibleVoices(
  entries: readonly VoiceEntry[],
  instrument: InstrumentName | null,
  draftsOnly: boolean,
): VoiceEntry[] {
  const ofInstrument = voicesOf(entries, instrument);
  return draftsOnly ? ofInstrument.filter((e) => e.preset.status !== "approved") : ofInstrument;
}

/** The chip in a row's status column. `broken` outranks the file's own status. */
export type RowStatus = "draft" | "approved" | "broken";

export function statusOf(entry: VoiceEntry): RowStatus {
  return entry.issues.length > 0 ? "broken" : entry.preset.status;
}

export interface VoiceDescription {
  /** The line above the notes: title, id, and whether it is the default. */
  label: string;
  /**
   * Summary then notes, one blank line apart — the bench is a one-voice view,
   * so it shows both halves: the summary that becomes this voice's archive row,
   * and the design notes the archive deliberately leaves in the file. A broken
   * file shows its validation issues here instead.
   */
  notes: string;
  /** Nothing can be played, approved or forked while the file is invalid. */
  broken: boolean;
}

const NO_SUMMARY = "No summary yet — one line on when to pick this, before approving it.";
const NO_NOTES = "No notes yet — say why it is built this way, so a fork has something to work from.";

export function describeVoice(entry: VoiceEntry): VoiceDescription {
  const preset = entry.preset;
  const broken = entry.issues.length > 0;
  return {
    label: `${preset.title ?? entry.slug} — ${entry.id}${preset.default ? " (default)" : ""}`,
    notes: broken
      ? entry.issues.map((issue) => `${issue.path} ${issue.message}`).join(" · ")
      : [preset.summary ?? NO_SUMMARY, preset.notes ?? NO_NOTES].join("\n\n"),
    broken,
  };
}

/** Approve doubles as un-approve, so the button says which way it goes. */
export function approveLabel(entry: VoiceEntry | null): string {
  return entry?.preset.status === "approved" ? "↩ Back to draft" : "✓ Approve";
}

export const NO_VOICE_SELECTED = "No voice selected.";

export const ALL_INSTRUMENTS_BLURB =
  "Every sound under voices/. Pick an instrument to work on one at a time.";

/** Why the table is empty — and, when it is a folder, how to put something in it. */
export function emptyVoicesMessage(instrument: string | null, draftsOnly: boolean): string {
  if (draftsOnly) return "No drafts here — everything is approved.";
  return (
    `Nothing in voices/${instrument ?? ""} yet. ` +
    `Fork one: npm run voice:new -- --instrument <i> --slug <s>`
  );
}

/* ── Status line ──────────────────────────────────────────────────────────── */

/**
 * A voice with no audio is not a failure — it is a voice nobody has rendered
 * yet, so the message is the command that fixes it.
 */
export function noAudioMessage(id: string): string {
  return `No audio for ${id}. Run: npm run voice:render -- --voice ${id}`;
}

export interface PlayedAudio {
  seconds: number;
  /** Already formatted for display — the engine does not pick a locale. */
  renderedOn: string;
}

/**
 * Carries the `--force` re-render, because the failure this page invites is
 * editing a voice's JSON and then judging the sound it made yesterday.
 */
export function playingMessage(id: string, audio: PlayedAudio): string {
  return (
    `Playing ${id} — ${audio.seconds.toFixed(0)}s, rendered ${audio.renderedOn}. ` +
    `Edited it since? npm run voice:render -- --voice ${id} --force`
  );
}

export function approvedMessage(id: string, demoted: readonly string[]): string {
  const alsoDemoted = demoted.length > 0 ? `, and ${demoted.join(", ")} is no longer the default` : "";
  return `Approved ${id} — it is in voices/archive.md now${alsoDemoted}.`;
}

export function draftedMessage(id: string): string {
  return `${id} is a draft again.`;
}

export function forkedMessage(id: string): string {
  return `Created ${id} as a draft. Edit the JSON, then: npm run voice:render -- --voice ${id}`;
}

/** The opening line: what this page is for, or why its buttons are dead. */
export function openingMessage(entries: number, canEdit: boolean): string {
  if (entries === 0) return "No voices found under voices/.";
  return canEdit
    ? "Pick a voice and press Play. Approve keeps it; Fork copies it to a new draft."
    : "Read-only build — approving and forking need the dev server (npm run dev).";
}
