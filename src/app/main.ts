/**
 * App entry: browse the library by kind (segments / loops / songs / leitmotifs),
 * pick a piece — or drop an external one — and wire the Play / Stop / Export
 * buttons. Deliberately minimal — a workshop bench, not a DAW.
 */
import * as Tone from "tone";
import { validateComposition, type Composition } from "@engine/composition";
import { buildLibrary, type CompositionKind, type LibraryEntry } from "@engine/library";
import { TRASH_ENDPOINT } from "../dev/endpoints";
import { renderLibrary, type LibraryViewState } from "./library-view";
import { scheduleComposition } from "./graph";
import { renderToWav, renderLoopToWav, downloadWav } from "./render";

// Vite bundles every composition in the tree at build time; add a JSON under
// compositions/<kind>/ (e.g. via `npm run compose`) and it shows up after reload.
// The folder it sits in *is* its kind — see src/engine/library.ts.
// `_trash/` is excluded here as well as in `buildLibrary`: without it, deleting a
// piece triggers an HMR reload that would list the trashed file straight back.
const bundled = import.meta.glob<Composition>(
  ["../../compositions/**/*.json", "!../../compositions/_trash/**"],
  { eager: true, import: "default" },
);

const els = {
  status: document.querySelector<HTMLElement>("#status")!,
  play: document.querySelector<HTMLButtonElement>("#play")!,
  stop: document.querySelector<HTMLButtonElement>("#stop")!,
  export: document.querySelector<HTMLButtonElement>("#export")!,
  exportLoop: document.querySelector<HTMLButtonElement>("#exportLoop")!,
  loop: document.querySelector<HTMLInputElement>("#loop")!,
  loopRow: document.querySelector<HTMLElement>("#loopRow")!,
  title: document.querySelector<HTMLElement>("#title")!,
  drop: document.querySelector<HTMLElement>("#drop")!,
  file: document.querySelector<HTMLInputElement>("#file")!,
  tabs: document.querySelector<HTMLElement>("#tabs")!,
  blurb: document.querySelector<HTMLElement>("#kindBlurb")!,
  rows: document.querySelector<HTMLElement>("#rows")!,
  empty: document.querySelector<HTMLElement>("#empty")!,
  search: document.querySelector<HTMLInputElement>("#search")!,
};

const view: LibraryViewState = {
  entries: buildLibrary(bundled),
  kind: null,
  query: "",
  selectedId: null,
};

let current: Composition | null = null;
let scheduled = false;

function setStatus(msg: string): void {
  els.status.textContent = msg;
}

function draw(): void {
  renderLibrary(els, view, {
    canDelete: import.meta.env.DEV, // no dev server in a built bundle = no file moves
    onPickKind: (kind: CompositionKind | null) => {
      view.kind = kind;
      draw();
    },
    onSelect: (entry) => select(entry),
    onPlay: (entry) => {
      if (select(entry)) void play();
    },
    onDelete: (entry) => void remove(entry),
  });
}

/** Validate + adopt a composition. Returns true when it became the active piece. */
function loadComposition(comp: unknown, source: string): boolean {
  const issues = validateComposition(comp);
  if (issues.length > 0) {
    setStatus(`Invalid ${source}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    els.play.disabled = true;
    els.export.disabled = true;
    return false;
  }
  current = comp as Composition;
  const loop = current.loop;
  els.title.textContent = `${current.name} — ${current.key} @ ${current.bpm} BPM`;
  els.play.disabled = false;
  els.export.disabled = false;
  // Loop controls only mean something for a piece that declares a loop window.
  els.exportLoop.disabled = !loop;
  els.loop.disabled = !loop;
  els.loopRow.classList.toggle("disabled", !loop);
  setStatus(
    loop
      ? `Ready. Loops bars ${loop.startBar}–${loop.endBar} (${loop.endBar - loop.startBar} bars).`
      : "Ready. One-shot piece — no loop window.",
  );
  return true;
}

function select(entry: LibraryEntry): boolean {
  if (!loadComposition(entry.composition, entry.id)) return false;
  view.selectedId = entry.id;
  draw();
  return true;
}

/**
 * Delete = move the file into `compositions/_trash/` via the dev server, so a
 * mis-click is a drag back rather than a lost piece. Confirmed first because it
 * touches the user's files.
 */
async function remove(entry: LibraryEntry): Promise<void> {
  if (!window.confirm(`Move ${entry.id} to compositions/_trash/?`)) return;
  try {
    const res = await fetch(TRASH_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: entry.path.replace(/^.*compositions\//, "compositions/") }),
    });
    const body = (await res.json()) as { trashed?: string; error?: string };
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    view.entries = view.entries.filter((e) => e.id !== entry.id);
    if (view.selectedId === entry.id) {
      view.selectedId = null;
      current = null;
      els.title.textContent = "No composition selected.";
      for (const button of [els.play, els.export, els.exportLoop]) button.disabled = true;
    }
    draw();
    setStatus(`Moved ${body.trashed} to compositions/_trash/.`);
  } catch (err) {
    setStatus(`Could not delete ${entry.slug}: ${(err as Error).message}`);
  }
}

async function play(): Promise<void> {
  if (!current) return;
  await Tone.start();
  stop(); // reset any prior schedule
  const looping = els.loop.checked && !!current.loop;
  scheduleComposition(current, { loop: looping });
  scheduled = true;
  Tone.getTransport().start();
  setStatus(looping ? "Playing (looping)…" : "Playing…");
}

function stop(): void {
  const t = Tone.getTransport();
  t.stop();
  t.cancel(0);
  if (scheduled) {
    // Drop old nodes so a re-play rebuilds a clean graph.
    Tone.getContext().dispose();
    Tone.setContext(new Tone.Context());
    scheduled = false;
  }
  setStatus("Stopped.");
}

/**
 * Render and download. `loopOnly` exports the seamless loop body under a
 * `.loop` suffix, so a game can drop it straight in beside the full take.
 */
async function exportWav(loopOnly: boolean): Promise<void> {
  if (!current) return;
  const comp = current;
  setStatus(loopOnly ? "Rendering seamless loop…" : "Rendering WAV…");
  els.export.disabled = true;
  els.exportLoop.disabled = true;
  try {
    const bytes = loopOnly ? await renderLoopToWav(comp) : await renderToWav(comp);
    downloadWav(bytes, loopOnly ? `${comp.name}.loop` : comp.name);
    setStatus(loopOnly ? "Exported seamless loop WAV." : "Exported WAV.");
  } catch (err) {
    setStatus(`Export failed: ${(err as Error).message}`);
  } finally {
    els.export.disabled = false;
    els.exportLoop.disabled = !comp.loop;
  }
}

/** Read a dropped/browsed .json file into the bench (does not touch the folder). */
async function loadFromFile(file: File): Promise<void> {
  try {
    const comp = JSON.parse(await file.text());
    if (loadComposition(comp, file.name)) {
      view.selectedId = null; // external file isn't in the library
      draw();
    }
  } catch (err) {
    setStatus(`Could not read ${file.name}: ${(err as Error).message}`);
  }
}

els.play.addEventListener("click", () => void play());
els.stop.addEventListener("click", () => stop());
els.export.addEventListener("click", () => void exportWav(false));
els.exportLoop.addEventListener("click", () => void exportWav(true));
els.search.addEventListener("input", () => {
  view.query = els.search.value;
  draw();
});

els.drop.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", () => {
  const file = els.file.files?.[0];
  if (file) void loadFromFile(file);
});
els.drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.drop.classList.add("over");
});
els.drop.addEventListener("dragleave", () => els.drop.classList.remove("over"));
els.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  els.drop.classList.remove("over");
  const file = e.dataTransfer?.files?.[0];
  if (file) void loadFromFile(file);
});

const first = view.entries[0];
if (first) select(first);
else {
  draw();
  setStatus("No compositions found. Run npm run compose to create one.");
}
