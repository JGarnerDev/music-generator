/**
 * What the session board *says* and *shows*: the plan header, every row's
 * label, and every status line under the transport.
 *
 * Pure, and separate from the components, for the reason [`./bench.ts`](./bench.ts)
 * and [`./voice-bench.ts`](./voice-bench.ts) are — plus one that is specific to
 * this page. The board is used at a table with people waiting, so several of
 * these strings are the *command that fixes the problem* rather than a
 * description of it (`npm run render -- --file …`). A command printed wrong is
 * worse than no command at all, so they are tested rather than eyeballed.
 *
 * The rules about what a plan may contain and what state a cue is in stay in
 * [`./session.ts`](./session.ts); this module only phrases them.
 */
import type { LibraryEntry } from "./library";
import { campaignOf, type ResolvedCue, type SessionPlan } from "./session";
import { formatClock } from "@utils/clock";
import { formatVolume } from "@utils/volume";

/** How many cues get a number-key shortcut. Nine fingers over the row of digits. */
export const HOTKEY_CUES = 9;

export type SessionTab = "session" | "archive";

/* ── The plan header ──────────────────────────────────────────────────────── */

export interface PlanHeader {
  title: string;
  /** The dimmer line under it: campaign · cues · runtime · readiness. */
  meta: string;
  /** True when a cue cannot sound — the line goes `--warn` pink. */
  warn: boolean;
}

const NEW_SESSION_HINT = 'New session, or: npm run session:new -- --name "Session 14"';

/**
 * The line above the running order: what this session is, and — the part worth
 * the pixels — how much of it is actually playable.
 */
export function planHeader(
  plan: SessionPlan | null,
  cues: readonly ResolvedCue[],
): PlanHeader {
  if (!plan) return { title: "No session yet", meta: NEW_SESSION_HINT, warn: false };
  const broken = cues.filter((cue) => cue.status !== "ready").length;
  const seconds = cues.reduce((total, cue) => total + (cue.audio?.seconds ?? 0), 0);
  return {
    title: plan.title ?? plan.name,
    meta: [
      plan.campaign ? `${plan.campaign} campaign` : "no campaign",
      `${cues.length} ${cues.length === 1 ? "cue" : "cues"}`,
      `${formatClock(seconds)} of audio`,
      broken > 0 ? `⚠ ${broken} cannot play` : "all playable",
    ].join(" · "),
    warn: broken > 0,
  };
}

/* ── Cue rows ─────────────────────────────────────────────────────────────── */

/**
 * The number-key column. 1–9 only: past that, reaching for a key is slower than
 * clicking, so the rest of the list gets a dot rather than a shortcut nobody can
 * press.
 */
export function hotkeyLabel(index: number): string {
  return index < HOTKEY_CUES ? `${index + 1}` : "·";
}

export interface NoteLabel {
  text: string;
  /** No note written yet — the pill is dimmer, and the text is the invitation. */
  empty: boolean;
}

/**
 * The note beside a cue's name. It is why the cue is in the list at all, so a
 * cue without one still offers the same click target; a *broken* cue spends that
 * space on the reason it cannot play instead, which matters more tonight.
 */
export function noteLabel(cue: ResolvedCue): NoteLabel {
  if (cue.cue.note) return { text: cue.cue.note, empty: false };
  return { text: cue.status === "ready" ? "＋ add a note" : cue.hint, empty: true };
}

/** The loop button's glyph and title — one button, both directions. */
export function loopLabel(loop: boolean): { glyph: string; title: string } {
  return loop
    ? { glyph: "∞", title: "Loops — click to play once" }
    : { glyph: "→", title: "Plays once — click to loop" };
}

export function cueEmptyMessage(hasPlan: boolean): string {
  return hasPlan
    ? "Empty running order — add cues from the Archive tab."
    : "No session loaded.";
}

/* ── The archive ──────────────────────────────────────────────────────────── */

export interface ArchiveChip {
  text: string;
  /** The campaign pill is accented; a plain tag is not. */
  campaign: boolean;
}

/**
 * The tag column on the archive tab.
 *
 * The campaign leads, and a tag repeating it is dropped: pieces filed before the
 * `campaign` field existed carry it as a tag too, and two identical chips read
 * as a bug.
 */
export function archiveChips(entry: LibraryEntry): ArchiveChip[] {
  const campaign = campaignOf(entry);
  const chips = entry.tags
    .filter((tag) => tag !== campaign)
    .map((text) => ({ text, campaign: false }));
  return campaign ? [{ text: campaign, campaign: true }, ...chips] : chips;
}

export function archiveEmptyMessage(campaign: string | null, query: string): string {
  if (query.trim() !== "") return `Nothing matches “${query.trim()}”.`;
  if (campaign === null) return "No compositions yet — run npm run compose.";
  return `Nothing filed under “${campaign}” — add "campaign": "${campaign}" to a piece.`;
}

/* ── Status lines ─────────────────────────────────────────────────────────── */

/**
 * The pre-flight check, run on load and on every session switch: how much of
 * tonight cannot be heard. This is the whole reason the page opens on the
 * session tab — finding a silent cue now costs a render, finding it mid-scene
 * costs the scene.
 */
export function readinessMessage(
  plan: SessionPlan | null,
  cues: readonly ResolvedCue[],
): string {
  if (!plan) return "No sessions yet. Press ＋ New to start one.";
  const broken = cues.filter((cue) => cue.status !== "ready");
  if (broken.length === 0) return `${plan.name}: every cue is rendered and ready.`;
  return `⚠ ${broken.length} cue(s) cannot play. ${broken[0]?.hint ?? ""}`;
}

/** Auditioning something off the shelf that nobody has rendered. */
export function noEntryAudioMessage(entry: LibraryEntry): string {
  return `No audio for ${entry.slug}. Run: npm run render -- --file ${entry.path}`;
}

/** The line under the tables naming what the speakers are doing. */
export function nowPlayingLabel(label: string, loop: boolean, note?: string): string {
  return `${loop ? "∞" : "▶"} ${label}${note ? ` — ${note}` : ""}`;
}

export const NOTHING_PLAYING = "Nothing playing";

export function addedMessage(entry: LibraryEntry, session: string | null): string {
  return `Added ${entry.slug} to ${session ?? "the session"}.`;
}

export function savedMessage(name: string): string {
  return `Saved sessions/${name}.json.`;
}

/**
 * A built bundle has no dev server to write with. The board still works — it
 * just cannot remember tonight's changes, and saying so once beats a failed
 * fetch on every click.
 */
export function saveFailedMessage(reason: string): string {
  return `Not saved (${reason}). Run npm run dev to keep session edits.`;
}

export function deletedMessage(name: string): string {
  return `Deleted sessions/${name}.json.`;
}

export function seekedMessage(seconds: number): string {
  return `Moved to ${formatClock(seconds)}.`;
}

/* ── Starting a session ───────────────────────────────────────────────────── */

export interface NewSessionCheck {
  /** The slug the plan would be filed under, or null when it cannot be used. */
  name: string | null;
  /** Why not, for the status line. Null when the name is good. */
  error: string | null;
}

/**
 * Whether a typed session name can become `sessions/<slug>.json`.
 *
 * Both failures are worth catching before the file write rather than after: a
 * name with nothing alphanumeric in it slugs to the empty string, and a
 * collision would silently overwrite a running order somebody already built.
 */
export function checkSessionName(
  slug: string,
  existing: readonly string[],
): NewSessionCheck {
  if (slug === "") {
    return { name: null, error: "That name has no letters or numbers in it — try another." };
  }
  if (existing.includes(slug)) {
    return { name: null, error: `There is already a sessions/${slug}.json — pick another name.` };
  }
  return { name: slug, error: null };
}

/** The default offered in the New Session prompt. */
export function suggestedSessionTitle(count: number): string {
  return `Session ${count + 1}`;
}

/* ── The fader ────────────────────────────────────────────────────────────── */

/**
 * A stored fader position, or null when there is nothing usable to restore.
 *
 * `Number(null)` is 0, not NaN — an unset key parsed naively would silently open
 * the board muted, which at a table reads as "the audio is broken". So the
 * missing case is checked before the parse, and anything out of 0–1 is dropped
 * rather than clamped: a junk value means the key is not ours.
 */
export function parseStoredVolume(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function volumeMessage(level: number, muted: boolean): string {
  return `Volume ${muted ? "muted" : formatVolume(level)}.`;
}

/**
 * What the mute button says it did. Muting names the state; unmuting names the
 * level, because the number is the thing you want confirmed when the sound comes
 * back and it is louder than you remembered.
 */
export function muteMessage(level: number, muted: boolean): string {
  return muted ? "Muted." : `Volume ${formatVolume(level)}.`;
}

/** The number beside the fader, which reads `muted` rather than `0%` when it is. */
export function volumeRead(level: number, muted: boolean): string {
  return muted ? "muted" : formatVolume(level);
}
