/**
 * App entry: pick any composition from `compositions/*.json` (or drop/browse an
 * external one), validate it, and wire the Play / Stop / Export-WAV buttons.
 * Deliberately minimal — a workshop bench, not a DAW.
 */
import * as Tone from "tone";
import { validateComposition, type Composition } from "@engine/composition";
import { scheduleComposition } from "./graph";
import { renderToWav, renderLoopToWav, downloadWav } from "./render";

// Vite bundles every composition in the folder at build time; add a JSON there
// (e.g. via `npm run compose`) and it shows up in the dropdown after reload.
const bundled = import.meta.glob<Composition>("../../compositions/*.json", {
  eager: true,
  import: "default",
});
const library = new Map<string, Composition>();
for (const [path, comp] of Object.entries(bundled)) {
  const file = path.split("/").pop() ?? path;
  library.set(file.replace(/\.json$/, ""), comp);
}

const els = {
  status: document.querySelector<HTMLElement>("#status")!,
  play: document.querySelector<HTMLButtonElement>("#play")!,
  stop: document.querySelector<HTMLButtonElement>("#stop")!,
  export: document.querySelector<HTMLButtonElement>("#export")!,
  exportLoop: document.querySelector<HTMLButtonElement>("#exportLoop")!,
  loop: document.querySelector<HTMLInputElement>("#loop")!,
  loopRow: document.querySelector<HTMLElement>("#loopRow")!,
  title: document.querySelector<HTMLElement>("#title")!,
  select: document.querySelector<HTMLSelectElement>("#composition")!,
  drop: document.querySelector<HTMLElement>("#drop")!,
  file: document.querySelector<HTMLInputElement>("#file")!,
};

let current: Composition | null = null;
let scheduled = false;

function setStatus(msg: string): void {
  els.status.textContent = msg;
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

function populateSelect(): void {
  const names = [...library.keys()].sort();
  els.select.innerHTML = "";
  if (names.length === 0) {
    const opt = new Option("(no compositions — run npm run compose)", "");
    opt.disabled = true;
    els.select.add(opt);
    els.select.disabled = true;
    return;
  }
  for (const name of names) els.select.add(new Option(name, name));
}

function selectByName(name: string): void {
  const comp = library.get(name);
  if (!comp) return;
  if (loadComposition(comp, name)) els.select.value = name;
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
      els.select.value = ""; // external file isn't in the bundled list
    }
  } catch (err) {
    setStatus(`Could not read ${file.name}: ${(err as Error).message}`);
  }
}

els.play.addEventListener("click", () => void play());
els.stop.addEventListener("click", () => stop());
els.export.addEventListener("click", () => void exportWav(false));
els.exportLoop.addEventListener("click", () => void exportWav(true));
els.select.addEventListener("change", () => selectByName(els.select.value));

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

populateSelect();
const first = [...library.keys()].sort()[0];
if (first) selectByName(first);
else setStatus("No compositions found. Run npm run compose to create one.");
