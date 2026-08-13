/**
 * The library panel: kind tabs over a scrollable table of pieces
 * (play · name · tags · delete).
 *
 * DOM only — every decision about *which* entries exist, what they're tagged
 * with and which leitmotifs they quote comes from the pure
 * [`@engine/library`](../engine/library.ts). Nodes are built with `createElement`
 * rather than innerHTML: names and tags come out of JSON files, so they never get
 * parsed as markup.
 */
import {
  COMPOSITION_KINDS,
  KIND_BLURBS,
  countsByKind,
  entriesOfKind,
  motifUsage,
  searchEntries,
  type CompositionKind,
  type LibraryEntry,
} from "@engine/library";

export interface LibraryViewState {
  entries: LibraryEntry[];
  /** null = the "All" tab. */
  kind: CompositionKind | null;
  query: string;
  selectedId: string | null;
}

export interface LibraryViewHandlers {
  onPickKind(kind: CompositionKind | null): void;
  onSelect(entry: LibraryEntry): void;
  onPlay(entry: LibraryEntry): void;
  onDelete(entry: LibraryEntry): void;
  /** False in a production build, where there is no dev server to move files. */
  canDelete: boolean;
}

export interface LibraryViewElements {
  tabs: HTMLElement;
  blurb: HTMLElement;
  rows: HTMLElement;
  empty: HTMLElement;
}

const TAB_LABELS: Record<CompositionKind, string> = {
  leitmotifs: "Leitmotifs",
  segments: "Segments",
  loops: "Loops",
  songs: "Songs",
};

export function renderLibrary(
  els: LibraryViewElements,
  state: LibraryViewState,
  handlers: LibraryViewHandlers,
): void {
  renderTabs(els, state, handlers);
  els.blurb.textContent = state.kind ? KIND_BLURBS[state.kind] : "Everything in compositions/.";
  renderRows(els, state, handlers);
}

function renderTabs(
  els: LibraryViewElements,
  state: LibraryViewState,
  handlers: LibraryViewHandlers,
): void {
  const counts = countsByKind(state.entries);
  els.tabs.replaceChildren(
    tab("All", state.entries.length, state.kind === null, () => handlers.onPickKind(null)),
    ...COMPOSITION_KINDS.map((kind) =>
      tab(TAB_LABELS[kind], counts[kind], state.kind === kind, () => handlers.onPickKind(kind)),
    ),
  );
}

function tab(label: string, count: number, selected: boolean, onClick: () => void): HTMLElement {
  const button = document.createElement("button");
  button.className = "tab";
  button.type = "button";
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(selected));
  button.append(label, span("count", `${count}`));
  button.addEventListener("click", onClick);
  return button;
}

function renderRows(
  els: LibraryViewElements,
  state: LibraryViewState,
  handlers: LibraryViewHandlers,
): void {
  const visible = searchEntries(entriesOfKind(state.entries, state.kind), state.query);
  const usage = motifUsage(state.entries);

  els.rows.replaceChildren(
    ...visible.map((entry) => row(entry, state, handlers, usage.get(entry.slug)?.length ?? 0)),
  );
  els.empty.hidden = visible.length > 0;
  els.empty.textContent = emptyMessage(state);
}

function row(
  entry: LibraryEntry,
  state: LibraryViewState,
  handlers: LibraryViewHandlers,
  quotedBy: number,
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.setAttribute("aria-selected", String(entry.id === state.selectedId));
  tr.title = entry.path;
  tr.addEventListener("click", () => handlers.onSelect(entry));

  const chips = tagChips(entry, quotedBy);
  const tags = cell("cell-tags", ...chips);
  // Cells are clamped to one line (see index.html), so anything clipped is still
  // readable on hover rather than lost.
  tags.title = chips.map((chip) => chip.textContent).join(" · ");

  tr.append(
    cell("cell-play", iconButton("▶", `Play ${entry.slug}`, false, () => handlers.onPlay(entry))),
    cell("cell-name", entry.slug, span("kind", state.kind === null ? entry.kind : "")),
    tags,
  );

  const del = handlers.canDelete
    ? iconButton("🗑", `Delete ${entry.slug}`, true, () => handlers.onDelete(entry))
    : span("", "");
  tr.append(cell("cell-delete", del));
  return tr;
}

/** Palette/free-form tags, plus the leitmotifs this piece quotes (or is quoted by). */
function tagChips(entry: LibraryEntry, quotedBy: number): HTMLElement[] {
  const chips = entry.tags.map((tag) => span("chip", tag));
  chips.push(...entry.motifs.map((motif) => span("chip motif", `♪ ${motif}`)));
  if (entry.kind === "leitmotifs" && quotedBy > 0) {
    chips.push(span("chip motif", `♪ quoted ×${quotedBy}`));
  }
  return chips;
}

function emptyMessage(state: LibraryViewState): string {
  if (state.query.trim() !== "") return `Nothing matches “${state.query.trim()}”.`;
  if (state.kind === null) return "No compositions yet — run npm run compose.";
  return `Nothing in compositions/${state.kind}/ yet.`;
}

function cell(className: string, ...children: (Node | string)[]): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = className;
  td.append(...children);
  return td;
}

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement("span");
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/** Row buttons stop propagation so clicking one doesn't also fire the row's select. */
function iconButton(
  glyph: string,
  label: string,
  danger: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "icon danger" : "icon";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}
