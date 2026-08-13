/**
 * App entry: load a composition JSON, validate it, and wire the Play / Stop /
 * Export-WAV buttons. Deliberately minimal — a workshop bench, not a DAW.
 */
import * as Tone from "tone";
import { validateComposition, type Composition } from "@engine/composition";
import { scheduleComposition } from "./graph";
import { renderToWav, downloadWav } from "./render";
import demo from "../../compositions/demo-sad.json";

const els = {
  status: document.querySelector<HTMLElement>("#status")!,
  play: document.querySelector<HTMLButtonElement>("#play")!,
  stop: document.querySelector<HTMLButtonElement>("#stop")!,
  export: document.querySelector<HTMLButtonElement>("#export")!,
  title: document.querySelector<HTMLElement>("#title")!,
};

let current: Composition = demo as Composition;
let scheduled = false;

function setStatus(msg: string): void {
  els.status.textContent = msg;
}

function loadComposition(comp: Composition): void {
  const issues = validateComposition(comp);
  if (issues.length > 0) {
    setStatus(`Invalid composition: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    els.play.disabled = true;
    els.export.disabled = true;
    return;
  }
  current = comp;
  els.title.textContent = `${comp.name} — ${comp.key} @ ${comp.bpm} BPM`;
  els.play.disabled = false;
  els.export.disabled = false;
  setStatus("Ready.");
}

async function play(): Promise<void> {
  await Tone.start();
  stop(); // reset any prior schedule
  scheduleComposition(current);
  scheduled = true;
  Tone.getTransport().start();
  setStatus("Playing…");
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

async function exportWav(): Promise<void> {
  setStatus("Rendering WAV…");
  els.export.disabled = true;
  try {
    const bytes = await renderToWav(current);
    downloadWav(bytes, current.name);
    setStatus("Exported WAV.");
  } catch (err) {
    setStatus(`Export failed: ${(err as Error).message}`);
  } finally {
    els.export.disabled = false;
  }
}

els.play.addEventListener("click", () => void play());
els.stop.addEventListener("click", () => stop());
els.export.addEventListener("click", () => void exportWav());

loadComposition(current);
