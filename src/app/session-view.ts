/**
 * The session board's two panels: the running order (Session) and the campaign's
 * shelf (Archive).
 *
 * DOM only. Every decision about what a cue *is* — whether it loops, whether it
 * can sound, which campaign a piece belongs to — comes from the pure
 * [`@engine/session`](../engine/session.ts); this file turns that into rows and
 * calls handlers back.
 *
 * The one rule this page does not share with the composition bench: a cue that
 * cannot play is never quietly greyed and left at that. It carries the command
 * that fixes it, because the alternative is finding out with six people waiting.
 */
import type { LibraryEntry } from "@engine/library";
import { searchEntries } from "@engine/library";
import type { ManifestEntry } from "@engine/manifest";
import {
  campaignOf,
  campaignsOf,
  entriesOfCampaign,
  resolveCues,
  type ResolvedCue,
  type SessionPlan,
} from "@engine/session";
import { formatClock } from "@utils/clock";
import { button, cell, iconButton, span } from "./dom";

/** How many cues get a number-key shortcut. Ten fingers, ten cues. */
export const HOTKEY_CUES = 9;

export type SessionTab = "session" | "archive";

export interface SessionViewState {
  /** The open plan, or null when there are no sessions yet. */
  plan: SessionPlan | null;
  entries: LibraryEntry[];
  rendered: ReadonlyMap<string, ManifestEntry>;
  tab: SessionTab;
  /** Archive filter: a campaign slug, or null for everything on the shelf. */
  campaign: string | null;
  query: string;
  /** Index of the cue currently sounding, if it came from the session tab. */
  playingCue: number | null;
  /** Library id currently sounding, if it was played from the archive. */
  playingEntry: string | null;
}

export interface SessionViewHandlers {
  onPickTab(tab: SessionTab): void;
  onPlayCue(cue: ResolvedCue): void;
  onMoveCue(index: number, delta: number): void;
  onRemoveCue(index: number): void;
  onEditNote(index: number): void;
  onToggleLoop(cue: ResolvedCue): void;
  onPickCampaign(campaign: string | null): void;
  onPlayEntry(entry: LibraryEntry): void;
  onAddCue(entry: LibraryEntry): void;
}

export interface SessionViewElements {
  tabs: HTMLElement;
  sessionPanel: HTMLElement;
  archivePanel: HTMLElement;
  planTitle: HTMLElement;
  planMeta: HTMLElement;
  cueRows: HTMLElement;
  cueEmpty: HTMLElement;
  campaigns: HTMLElement;
  archiveRows: HTMLElement;
  archiveEmpty: HTMLElement;
}

export function renderSession(
  els: SessionViewElements,
  state: SessionViewState,
  handlers: SessionViewHandlers,
): void {
  const cues = state.plan ? resolveCues(state.plan, state.entries, state.rendered) : [];
  renderTabs(els, state, handlers, cues);
  els.sessionPanel.hidden = state.tab !== "session";
  els.archivePanel.hidden = state.tab !== "archive";
  renderPlanHeader(els, state, cues);
  renderCues(els, state, handlers, cues);
  renderCampaigns(els, state, handlers);
  renderArchive(els, state, handlers);
}

function renderTabs(
  els: SessionViewElements,
  state: SessionViewState,
  handlers: SessionViewHandlers,
  cues: readonly ResolvedCue[],
): void {
  const archiveCount = entriesOfCampaign(state.entries, state.campaign).length;
  els.tabs.replaceChildren(
    tab("Session", cues.length, state.tab === "session", () => handlers.onPickTab("session")),
    tab("Archive", archiveCount, state.tab === "archive", () => handlers.onPickTab("archive")),
  );
}

function tab(label: string, count: number, selected: boolean, onClick: () => void): HTMLElement {
  const el = button("tab", label, onClick);
  el.setAttribute("role", "tab");
  el.setAttribute("aria-selected", String(selected));
  el.append(span("count", `${count}`));
  return el;
}

/**
 * The line above the running order: what this session is, and — the part worth
 * the pixels — how much of it is actually playable.
 */
function renderPlanHeader(
  els: SessionViewElements,
  state: SessionViewState,
  cues: readonly ResolvedCue[],
): void {
  if (!state.plan) {
    els.planTitle.textContent = "No session yet";
    els.planMeta.textContent = "New session, or: npm run session:new -- --name \"Session 14\"";
    return;
  }
  els.planTitle.textContent = state.plan.title ?? state.plan.name;
  const broken = cues.filter((cue) => cue.status !== "ready").length;
  const seconds = cues.reduce((total, cue) => total + (cue.audio?.seconds ?? 0), 0);
  els.planMeta.textContent = [
    state.plan.campaign ? `${state.plan.campaign} campaign` : "no campaign",
    `${cues.length} ${cues.length === 1 ? "cue" : "cues"}`,
    `${formatClock(seconds)} of audio`,
    broken > 0 ? `⚠ ${broken} cannot play` : "all playable",
  ].join(" · ");
  els.planMeta.classList.toggle("warn", broken > 0);
}

function renderCues(
  els: SessionViewElements,
  state: SessionViewState,
  handlers: SessionViewHandlers,
  cues: readonly ResolvedCue[],
): void {
  els.cueRows.replaceChildren(...cues.map((cue) => cueRow(cue, state, handlers, cues.length)));
  els.cueEmpty.hidden = cues.length > 0;
  els.cueEmpty.textContent = state.plan
    ? "Empty running order — add cues from the Archive tab."
    : "No session loaded.";
}

function cueRow(
  cue: ResolvedCue,
  state: SessionViewState,
  handlers: SessionViewHandlers,
  total: number,
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const playable = cue.status === "ready";
  tr.classList.toggle("bad", !playable);
  tr.setAttribute("aria-selected", String(state.playingCue === cue.index));
  tr.title = playable ? (cue.entry?.path ?? "") : cue.hint;

  // 1–9 only: past that, reaching for a number key is slower than clicking.
  const key = cue.index < HOTKEY_CUES ? `${cue.index + 1}` : "·";

  const play = iconButton(playable ? "▶" : "⚠", playable ? `Play ${cue.label}` : cue.hint, false, () =>
    handlers.onPlayCue(cue),
  );
  play.disabled = !playable;

  const name = cell("cell-name", cue.label);
  // The note is why this cue is in the list at all, so it is the click target for
  // editing it — a cue with no note yet still offers the same spot.
  const note = span("note", cue.cue.note ?? (playable ? "＋ add a note" : cue.hint));
  note.classList.toggle("empty", !cue.cue.note);
  note.title = "Click to edit this cue's note";
  note.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onEditNote(cue.index);
  });
  name.append(note);

  const loop = iconButton(
    cue.loop ? "∞" : "→",
    cue.loop ? "Loops — click to play once" : "Plays once — click to loop",
    false,
    () => handlers.onToggleLoop(cue),
  );
  loop.classList.add("toggle");
  loop.classList.toggle("on", cue.loop);
  // Only a piece written with a loop window has a seam-wrapped body to repeat.
  loop.disabled = !cue.entry?.composition.loop;

  const up = iconButton("↑", "Move earlier", false, () => handlers.onMoveCue(cue.index, -1));
  up.disabled = cue.index === 0;
  const down = iconButton("↓", "Move later", false, () => handlers.onMoveCue(cue.index, 1));
  down.disabled = cue.index === total - 1;

  tr.append(
    cell("cell-key", span("key", key)),
    cell("cell-play", play),
    name,
    cell("cell-len", cue.audio ? formatClock(cue.audio.seconds) : "—"),
    cell("cell-loop", loop),
    cell("cell-move", up, down),
    cell("cell-delete", iconButton("✕", `Remove ${cue.label} from the session`, true, () =>
      handlers.onRemoveCue(cue.index),
    )),
  );
  return tr;
}

/** The archive's campaign shelf: All, then one chip per campaign in the library. */
function renderCampaigns(
  els: SessionViewElements,
  state: SessionViewState,
  handlers: SessionViewHandlers,
): void {
  const chips = [chip("All", state.campaign === null, () => handlers.onPickCampaign(null))];
  for (const campaign of campaignsOf(state.entries)) {
    chips.push(chip(campaign, state.campaign === campaign, () => handlers.onPickCampaign(campaign)));
  }
  els.campaigns.replaceChildren(...chips);
}

function chip(label: string, selected: boolean, onClick: () => void): HTMLElement {
  const el = button("chip-button", label, onClick);
  el.setAttribute("aria-pressed", String(selected));
  return el;
}

function renderArchive(
  els: SessionViewElements,
  state: SessionViewState,
  handlers: SessionViewHandlers,
): void {
  const visible = searchEntries(entriesOfCampaign(state.entries, state.campaign), state.query);
  els.archiveRows.replaceChildren(...visible.map((entry) => archiveRow(entry, state, handlers)));
  els.archiveEmpty.hidden = visible.length > 0;
  els.archiveEmpty.textContent = archiveEmptyMessage(state);
}

function archiveRow(
  entry: LibraryEntry,
  state: SessionViewState,
  handlers: SessionViewHandlers,
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.title = entry.path;
  tr.setAttribute("aria-selected", String(state.playingEntry === entry.id));

  const campaign = campaignOf(entry);
  // The campaign leads, and a tag repeating it is dropped: pieces filed before
  // the `campaign` field existed carry it as a tag too, and two identical chips
  // read as a bug.
  const chips = entry.tags.filter((tag) => tag !== campaign).map((tag) => span("chip", tag));
  if (campaign) chips.unshift(span("chip campaign", campaign));
  const tags = cell("cell-tags", ...chips);
  tags.title = chips.map((c) => c.textContent).join(" · ");

  tr.append(
    cell("cell-play", iconButton("▶", `Audition ${entry.slug}`, false, () => handlers.onPlayEntry(entry))),
    cell("cell-name", entry.slug, span("kind", entry.kind)),
    tags,
    cell("cell-add", iconButton("＋", `Add ${entry.slug} to the session`, false, () => handlers.onAddCue(entry))),
  );
  return tr;
}

function archiveEmptyMessage(state: SessionViewState): string {
  if (state.query.trim() !== "") return `Nothing matches “${state.query.trim()}”.`;
  if (state.campaign === null) return "No compositions yet — run npm run compose.";
  return `Nothing filed under “${state.campaign}” — add "campaign": "${state.campaign}" to a piece.`;
}
