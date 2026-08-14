/**
 * App entry: browse the library by kind (segments / loops / songs / leitmotifs),
 * pick a piece — or drop an external one — and wire the Play / Stop / Export
 * buttons. Deliberately minimal — a workshop bench, not a DAW.
 */
import { validateComposition, type Composition } from "@engine/composition";
import { buildLibrary, type CompositionKind, type LibraryEntry } from "@engine/library";
import { audioName, indexManifest } from "@engine/manifest";
import { TRASH_ENDPOINT } from "../dev/endpoints";
import { renderLibrary, type LibraryViewState } from "./library-view";
import { playFile, stopPlayback } from "./playback";

// What `npm run render` produced. Fetched rather than imported because it sits
// in `public/` beside the audio it describes, and Vite does not let JavaScript
// import out of `public/`. The app renders nothing itself: a piece missing from
// this manifest has no audio yet.
const rendered = fetch("/audio/manifest.json")
  .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
  .then(indexManifest)
  .catch(() => indexManifest(null));

// Vite bundles every composition in the tree at build time; add a JSON under
// compositions/<kind>/ (e.g. via `npm run compose`) and the open tab reloads
// itself with it — `npm run dev` mounts src/dev/live-library.ts to make a *new*
// file invalidate this glob, which Vite on its own does not.
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
    for (const button of [els.play, els.export]) button.disabled = true;
    return false;
  }
  current = comp as Composition;
  const loop = current.loop;
  els.title.textContent = `${current.name} — ${current.key} @ ${current.bpm} BPM`;
  for (const button of [els.play, els.export]) button.disabled = false;
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
      for (const button of [els.play, els.export, els.exportLoop]) {
        button.disabled = true;
      }
    }
    draw();
    setStatus(`Moved ${body.trashed} to compositions/_trash/.`);
  } catch (err) {
    setStatus(`Could not delete ${entry.slug}: ${(err as Error).message}`);
  }
}

/**
 * Play = play the rendered file (see `playback.ts`). Nothing is synthesised in
 * the browser, so playback cannot stutter however dense the arrangement is, and
 * a piece is ready the moment the page loads.
 *
 * A piece with no audio yet is not playable — `npm run render` is what makes it
 * so. Same for a piece whose notes changed since it was rendered: the audio has
 * no idea, and re-rendering is a command, not a button.
 */
async function play(): Promise<void> {
  if (!current) return;
  const comp = current;
  const looping = els.loop.checked && !!comp.loop;
  const name = audioName(comp.name, { loop: looping });
  const entry = (await rendered).get(name);
  if (!entry) {
    setStatus(`No audio for ${name}. Run: npm run render -- --file <its .json>`);
    return;
  }

  els.play.disabled = true;
  try {
    await playFile(`/audio/${entry.file}`, {
      loop: looping,
      onEnded: () => setStatus("Finished."),
    });
    setStatus(
      `${looping ? "Playing loop" : "Playing"} — ${entry.seconds.toFixed(0)}s, ` +
        `rendered ${new Date(entry.renderedAt).toLocaleDateString()}.`,
    );
  } catch (err) {
    setStatus(`Could not play ${name}: ${(err as Error).message}`);
  } finally {
    els.play.disabled = current === null;
  }
}

function stop(): void {
  stopPlayback();
  setStatus("Stopped.");
}

/**
 * Download what was rendered. `loopOnly` grabs the seam-wrapped loop body, the
 * file a game ships. Full-quality WAVs come from `npm run render -- --wav`.
 */
async function exportAudio(loopOnly: boolean): Promise<void> {
  if (!current) return;
  const name = audioName(current.name, { loop: loopOnly });
  const entry = (await rendered).get(name);
  if (!entry) {
    setStatus(`No audio for ${name}. Run: npm run render -- --file <its .json>`);
    return;
  }
  const link = document.createElement("a");
  link.href = `/audio/${entry.file}`;
  link.download = entry.file;
  link.click();
  setStatus(`Downloading ${entry.file}.`);
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
els.export.addEventListener("click", () => void exportAudio(false));
els.exportLoop.addEventListener("click", () => void exportAudio(true));
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
