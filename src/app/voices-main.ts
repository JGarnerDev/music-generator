/**
 * The voice bench (`/voices.html`): audition one instrument's sounds, then
 * approve the ones worth keeping.
 *
 * Deliberately narrow. The composition bench is where pieces live; this page
 * shows a single voice at a time, playing its probe — the same étude for every
 * voice of an instrument, because two sounds can only be compared on identical
 * material — with pause and resume, since judging a tone means hearing one
 * phrase again rather than restarting from the top.
 *
 * It plays files like everything else here: `npm run voice:render` writes them.
 * A voice with no audio is a voice this page will tell you to render, and a
 * voice you *edited* sounds like its old self until you re-render it.
 */
import { indexManifest } from "@engine/manifest";
import { probeFor } from "@engine/probe";
import {
  INSTRUMENT_BLURBS,
  VOICE_INSTRUMENTS,
  countsByInstrument,
  voiceAudioName,
  voicesOf,
  type VoiceEntry,
} from "@engine/voice-library";
import type { InstrumentName } from "@engine/composition";
import { VOICE_APPROVE_ENDPOINT, VOICE_FORK_ENDPOINT } from "../dev/endpoints";
import { VOICE_LIBRARY } from "./voices";
import { pausePlayback, playFile, playbackState, resumePlayback, stopPlayback } from "./playback";

// What `npm run voice:render` produced. Fetched rather than imported because it
// sits in `public/` beside the audio it describes.
const rendered = fetch("/audio/voices/manifest.json")
  .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
  .then(indexManifest)
  .catch(() => indexManifest(null));

const els = {
  tabs: document.querySelector<HTMLElement>("#tabs")!,
  blurb: document.querySelector<HTMLElement>("#blurb")!,
  rows: document.querySelector<HTMLElement>("#rows")!,
  empty: document.querySelector<HTMLElement>("#empty")!,
  draftsOnly: document.querySelector<HTMLInputElement>("#draftsOnly")!,
  loop: document.querySelector<HTMLInputElement>("#loop")!,
  probeName: document.querySelector<HTMLElement>("#probeName")!,
  selected: document.querySelector<HTMLElement>("#selected")!,
  notes: document.querySelector<HTMLElement>("#notes")!,
  play: document.querySelector<HTMLButtonElement>("#play")!,
  pause: document.querySelector<HTMLButtonElement>("#pause")!,
  stop: document.querySelector<HTMLButtonElement>("#stop")!,
  approve: document.querySelector<HTMLButtonElement>("#approve")!,
  makeDefault: document.querySelector<HTMLInputElement>("#makeDefault")!,
  fork: document.querySelector<HTMLButtonElement>("#fork")!,
  status: document.querySelector<HTMLElement>("#status")!,
};

/** Approve and Fork write files; there is no dev server in a built bundle. */
const canEdit = import.meta.env.DEV;

interface State {
  entries: VoiceEntry[];
  instrument: InstrumentName | null;
  draftsOnly: boolean;
  selectedId: string | null;
}

const state: State = {
  entries: VOICE_LIBRARY,
  instrument: null,
  draftsOnly: false,
  selectedId: null,
};

function setStatus(message: string): void {
  els.status.textContent = message;
}

function selected(): VoiceEntry | null {
  return state.entries.find((entry) => entry.id === state.selectedId) ?? null;
}

function visible(): VoiceEntry[] {
  const ofInstrument = voicesOf(state.entries, state.instrument);
  return state.draftsOnly
    ? ofInstrument.filter((entry) => entry.preset.status !== "approved")
    : ofInstrument;
}

function draw(): void {
  drawTabs();
  els.blurb.textContent = state.instrument
    ? INSTRUMENT_BLURBS[state.instrument]
    : "Every sound under voices/. Pick an instrument to work on one at a time.";
  drawRows();
  drawSelection();
}

function drawTabs(): void {
  const counts = countsByInstrument(state.entries);
  els.tabs.replaceChildren(
    tab("All", state.entries.length, state.instrument === null, () => pickInstrument(null)),
    ...VOICE_INSTRUMENTS.map((instrument) =>
      tab(instrument, counts[instrument], state.instrument === instrument, () =>
        pickInstrument(instrument),
      ),
    ),
  );
}

function pickInstrument(instrument: InstrumentName | null): void {
  state.instrument = instrument;
  draw();
}

function tab(label: string, count: number, isSelected: boolean, onClick: () => void): HTMLElement {
  const button = document.createElement("button");
  button.className = "tab";
  button.type = "button";
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(isSelected));
  button.append(label, span("count", `${count}`));
  button.addEventListener("click", onClick);
  return button;
}

function drawRows(): void {
  const rows = visible();
  els.rows.replaceChildren(...rows.map(row));
  els.empty.hidden = rows.length > 0;
  els.empty.textContent = state.draftsOnly
    ? "No drafts here — everything is approved."
    : `Nothing in voices/${state.instrument ?? ""} yet. Fork one: npm run voice:new -- --instrument <i> --slug <s>`;
}

function row(entry: VoiceEntry): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.setAttribute("aria-selected", String(entry.id === state.selectedId));
  tr.title = entry.path.replace(/^.*voices\//, "voices/");
  tr.addEventListener("click", () => select(entry));

  const play = document.createElement("button");
  play.type = "button";
  play.className = "icon";
  play.textContent = "▶";
  play.title = `Play ${entry.id}`;
  play.addEventListener("click", (event) => {
    event.stopPropagation();
    select(entry);
    void play_();
  });

  const status = entry.issues.length > 0 ? "broken" : entry.preset.status;
  const statusCell = cell("cell-status", span(`chip ${status}`, status));
  if (entry.preset.default) statusCell.append(span("chip default", "default"));

  tr.append(
    cell("cell-play", play),
    cell("cell-slug", entry.slug, span("instrument", state.instrument ? "" : entry.instrument)),
    cell("cell-title", entry.preset.title ?? ""),
    statusCell,
  );
  return tr;
}

function select(entry: VoiceEntry): void {
  state.selectedId = entry.id;
  draw();
}

function drawSelection(): void {
  const entry = selected();
  if (!entry) {
    els.selected.textContent = "No voice selected.";
    els.notes.textContent = "";
    els.probeName.textContent = "probe";
    for (const button of [els.play, els.approve, els.fork]) button.disabled = true;
    return;
  }

  const preset = entry.preset;
  const broken = entry.issues.length > 0;
  els.selected.textContent = `${preset.title ?? entry.slug} — ${entry.id}${preset.default ? " (default)" : ""}`;
  els.notes.textContent = broken
    ? entry.issues.map((issue) => `${issue.path} ${issue.message}`).join(" · ")
    : (preset.notes ?? "No notes yet — say what this sound is for before approving it.");

  const probe = probeFor(preset);
  els.probeName.textContent = `${probe.name}: ${probe.describe}`;
  els.probeName.title = `${probe.bpm} BPM, ${probe.key}`;

  els.play.disabled = broken;
  els.approve.disabled = broken || !canEdit;
  els.fork.disabled = broken || !canEdit;
  els.approve.textContent = preset.status === "approved" ? "↩ Back to draft" : "✓ Approve";
}

/** Play the selected voice's probe. Named with an underscore to leave `play` free. */
async function play_(): Promise<void> {
  const entry = selected();
  if (!entry) return;
  const name = voiceAudioName(entry.instrument, entry.slug);
  const audio = (await rendered).get(name);
  if (!audio) {
    setStatus(`No audio for ${entry.id}. Run: npm run voice:render -- --voice ${entry.id}`);
    return;
  }

  els.play.disabled = true;
  try {
    await playFile(`/audio/voices/${audio.file}`, {
      loop: els.loop.checked,
      onEnded: () => {
        setStatus("Finished.");
        drawTransport();
      },
    });
    setStatus(
      `Playing ${entry.id} — ${audio.seconds.toFixed(0)}s, ` +
        `rendered ${new Date(audio.renderedAt).toLocaleDateString()}. ` +
        `Edited it since? npm run voice:render -- --voice ${entry.id} --force`,
    );
  } catch (err) {
    setStatus(`Could not play ${entry.id}: ${(err as Error).message}`);
  } finally {
    els.play.disabled = false;
    drawTransport();
  }
}

/** The pause button is the only control whose label depends on what is happening. */
function drawTransport(): void {
  const playing = playbackState();
  els.pause.textContent = playing === "paused" ? "▶ Resume" : "⏸ Pause";
  els.pause.disabled = playing === "stopped";
}

async function approve(): Promise<void> {
  const entry = selected();
  if (!entry) return;
  const backToDraft = entry.preset.status === "approved";
  try {
    const body = await post(VOICE_APPROVE_ENDPOINT, {
      id: entry.id,
      draft: backToDraft,
      makeDefault: els.makeDefault.checked,
    });
    const demoted = (body.demoted as string[] | undefined) ?? [];
    // The file on disk changed; keep the page honest without a reload.
    entry.preset.status = backToDraft ? "draft" : "approved";
    if (!backToDraft && els.makeDefault.checked) {
      for (const other of state.entries) {
        if (other.instrument === entry.instrument) other.preset.default = other.id === entry.id;
      }
    }
    draw();
    setStatus(
      backToDraft
        ? `${entry.id} is a draft again.`
        : `Approved ${entry.id} — it is in voices/archive.md now` +
            `${demoted.length ? `, and ${demoted.join(", ")} is no longer the default` : ""}.`,
    );
  } catch (err) {
    setStatus(`Could not approve ${entry.id}: ${(err as Error).message}`);
  }
}

async function fork(): Promise<void> {
  const entry = selected();
  if (!entry) return;
  const slug = window.prompt(`New slug for a copy of ${entry.id}:`, `${entry.slug}-2`)?.trim();
  if (!slug) return;
  try {
    const body = await post(VOICE_FORK_ENDPOINT, { from: entry.id, slug });
    setStatus(
      `Created ${String(body.id)} as a draft. Edit the JSON, then: ` +
        `npm run voice:render -- --voice ${String(body.id)}`,
    );
  } catch (err) {
    setStatus(`Could not fork ${entry.id}: ${(err as Error).message}`);
  }
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(parsed.error ?? `HTTP ${res.status}`));
  return parsed;
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

els.play.addEventListener("click", () => void play_());
els.pause.addEventListener("click", () => {
  if (!pausePlayback()) resumePlayback();
  drawTransport();
  setStatus(playbackState() === "paused" ? "Paused." : "Playing.");
});
els.stop.addEventListener("click", () => {
  stopPlayback();
  drawTransport();
  setStatus("Stopped.");
});
els.approve.addEventListener("click", () => void approve());
els.fork.addEventListener("click", () => void fork());
els.draftsOnly.addEventListener("change", () => {
  state.draftsOnly = els.draftsOnly.checked;
  draw();
});

draw();
drawTransport();
const first = visible()[0];
if (first) {
  select(first);
  setStatus(
    canEdit
      ? "Pick a voice and press Play. Approve keeps it; Fork copies it to a new draft."
      : "Read-only build — approving and forking need the dev server (npm run dev).",
  );
} else {
  setStatus("No voices found under voices/.");
}
