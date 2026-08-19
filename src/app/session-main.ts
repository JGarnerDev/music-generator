/**
 * The session board: play the right cue at the right moment of a game.
 *
 * Two tabs. **Session** is tonight's running order — an ordered list of cues you
 * press in the order the scene happens, saved to `sessions/<name>.json` so it
 * survives a refresh and can be written for you before the game. **Archive** is
 * the campaign's whole shelf, to audition from and to add cues out of.
 *
 * This page is a *performance* tool, not an authoring one: it never validates,
 * never deletes a composition, and never asks a question it could answer. The
 * composition bench (`index.html`) stays the place where pieces are judged.
 *
 * Audio comes from `public/audio/` exactly as it does everywhere else — see
 * [`./playback`](./playback.ts). Nothing is synthesised here.
 */
import type { Composition } from "@engine/composition";
import { buildLibrary, type LibraryEntry } from "@engine/library";
import { audioName, indexManifest } from "@engine/manifest";
import {
  addCue,
  emptySession,
  moveCue,
  parseSessions,
  removeCue,
  resolveCues,
  sessionSlug,
  setCueLoop,
  setCueNote,
  unplayableCues,
  type ResolvedCue,
  type SessionPlan,
} from "@engine/session";
import { formatClock } from "@utils/clock";
import { formatVolume } from "@utils/volume";
import {
  SESSION_DELETE_ENDPOINT,
  SESSION_LIST_ENDPOINT,
  SESSION_SAVE_ENDPOINT,
} from "../dev/endpoints";
import {
  pausePlayback,
  playFile,
  playbackState,
  resumePlayback,
  setVolume,
  stopPlayback,
} from "./playback";
import { createScrubBar } from "./scrub";
import {
  HOTKEY_CUES,
  renderSession,
  type SessionTab,
  type SessionViewState,
} from "./session-view";

// Same eager glob the composition bench uses: Vite bundles every composition at
// build time, and `src/dev/live-library.ts` makes a *new* file reach the open tab.
const bundled = import.meta.glob<Composition>(
  ["../../compositions/**/*.json", "!../../compositions/_trash/**"],
  { eager: true, import: "default" },
);

const els = {
  tabs: pick("#tabs"),
  sessionPanel: pick("#sessionPanel"),
  archivePanel: pick("#archivePanel"),
  planTitle: pick("#planTitle"),
  planMeta: pick("#planMeta"),
  cueRows: pick("#cueRows"),
  cueEmpty: pick("#cueEmpty"),
  campaigns: pick("#campaigns"),
  archiveRows: pick("#archiveRows"),
  archiveEmpty: pick("#archiveEmpty"),
  sessionPick: pick<HTMLSelectElement>("#sessionPick"),
  newSession: pick<HTMLButtonElement>("#newSession"),
  deleteSession: pick<HTMLButtonElement>("#deleteSession"),
  search: pick<HTMLInputElement>("#search"),
  nowPlaying: pick("#nowPlaying"),
  scrub: pick("#scrub"),
  toggle: pick<HTMLButtonElement>("#toggle"),
  stop: pick<HTMLButtonElement>("#stop"),
  volumeRow: pick("#volumeRow"),
  volume: pick<HTMLInputElement>("#volume"),
  volumeRead: pick("#volumeRead"),
  mute: pick<HTMLButtonElement>("#mute"),
  status: pick("#status"),
};

function pick<T extends HTMLElement = HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

const view: SessionViewState = {
  plan: null,
  entries: buildLibrary(bundled),
  rendered: new Map(),
  tab: "session",
  campaign: null,
  query: "",
  playingCue: null,
  playingEntry: null,
};

/** Every plan on disk, so the picker can switch without another round trip. */
let sessions: SessionPlan[] = [];
/** False once a save has been refused — a built bundle has no dev server to write with. */
let canSave = true;

const scrub = createScrubBar(els.scrub, (seconds) => setStatus(`Moved to ${formatClock(seconds)}.`));

function setStatus(message: string): void {
  els.status.textContent = message;
}

function draw(): void {
  renderSession(els, view, {
    onPickTab: (tab: SessionTab) => {
      view.tab = tab;
      draw();
    },
    onPlayCue: (cue) => void playCue(cue),
    onMoveCue: (index, delta) => edit((plan) => moveCue(plan, index, delta)),
    onRemoveCue: (index) => edit((plan) => removeCue(plan, index)),
    onEditNote: (index) => {
      const plan = view.plan;
      if (!plan) return;
      const note = window.prompt("When does this cue play?", plan.cues[index]?.note ?? "");
      if (note !== null) edit((p) => setCueNote(p, index, note));
    },
    onToggleLoop: (cue) => edit((plan) => setCueLoop(plan, cue.index, !cue.loop)),
    onPickCampaign: (campaign) => {
      view.campaign = campaign;
      draw();
    },
    onPlayEntry: (entry) => void playEntry(entry),
    onAddCue: (entry) => {
      edit((plan) => addCue(plan, entry.id));
      setStatus(`Added ${entry.slug} to ${view.plan?.name ?? "the session"}.`);
    },
  });
  renderPicker();
}

function renderPicker(): void {
  els.sessionPick.replaceChildren(
    ...sessions.map((plan) => {
      const option = document.createElement("option");
      option.value = plan.name;
      option.textContent = plan.title ?? plan.name;
      option.selected = plan.name === view.plan?.name;
      return option;
    }),
  );
  els.sessionPick.disabled = sessions.length === 0;
  els.deleteSession.disabled = !view.plan;
}

/** Apply an edit to the open plan, redraw, and save it. */
function edit(change: (plan: SessionPlan) => SessionPlan): void {
  if (!view.plan) return;
  const next = change(view.plan);
  if (next === view.plan) return;
  view.plan = next;
  sessions = sessions.map((plan) => (plan.name === next.name ? next : plan));
  draw();
  void save();
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * Save the open plan. Debounced: reordering a running order is a burst of
 * clicks, and each one is a file write.
 */
let saveTimer = 0;
function save(): Promise<void> {
  window.clearTimeout(saveTimer);
  return new Promise((done) => {
    saveTimer = window.setTimeout(() => {
      void writePlan().then(done);
    }, 300);
  });
}

async function writePlan(): Promise<void> {
  const plan = view.plan;
  if (!plan || !canSave) return;
  try {
    const res = await fetch(SESSION_SAVE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    setStatus(`Saved sessions/${plan.name}.json.`);
  } catch (err) {
    // A built bundle has no dev server: say so once, then stop nagging on every
    // click. The board still works — it just cannot remember tonight's changes.
    canSave = false;
    setStatus(`Not saved (${(err as Error).message}). Run npm run dev to keep session edits.`);
  }
}

async function loadSessions(select?: string): Promise<void> {
  try {
    const res = await fetch(SESSION_LIST_ENDPOINT);
    const body = (await res.json()) as { sessions?: unknown };
    sessions = parseSessions(body.sessions);
  } catch {
    sessions = [];
    canSave = false;
  }
  view.plan = sessions.find((plan) => plan.name === select) ?? sessions[0] ?? null;
  view.campaign = view.plan?.campaign ?? null;
  draw();
  reportReadiness();
}

/**
 * The pre-flight check, run on load: how much of tonight cannot be heard. This
 * is the whole reason the page opens on the session tab — finding a silent cue
 * now costs a render, finding it mid-scene costs the scene.
 */
function reportReadiness(): void {
  if (!view.plan) {
    setStatus("No sessions yet. Press ＋ New to start one.");
    return;
  }
  const broken = unplayableCues(resolveCues(view.plan, view.entries, view.rendered));
  if (broken.length === 0) {
    setStatus(`${view.plan.name}: every cue is rendered and ready.`);
    return;
  }
  setStatus(`⚠ ${broken.length} cue(s) cannot play. ${broken[0]?.hint ?? ""}`);
}

// ── Transport ──────────────────────────────────────────────────────────────

async function playCue(cue: ResolvedCue): Promise<void> {
  if (cue.status !== "ready" || !cue.audio) {
    setStatus(cue.hint);
    return;
  }
  view.playingCue = cue.index;
  view.playingEntry = cue.entry?.id ?? null;
  await start(`/audio/${cue.audio.file}`, cue.loop, cue.label, cue.cue.note);
}

async function playEntry(entry: LibraryEntry): Promise<void> {
  const looping = !!entry.composition.loop;
  const audio = view.rendered.get(audioName(entry.composition.name, { loop: looping }));
  if (!audio) {
    setStatus(`No audio for ${entry.slug}. Run: npm run render -- --file ${entry.path}`);
    return;
  }
  view.playingCue = null;
  view.playingEntry = entry.id;
  await start(`/audio/${audio.file}`, looping, entry.composition.name);
}

async function start(url: string, loop: boolean, label: string, note?: string): Promise<void> {
  try {
    await playFile(url, {
      loop,
      onEnded: () => {
        // A one-shot that runs out is not a stop: leave the cue named on screen
        // so you can see what just finished.
        scrub.reset();
        syncTransport();
        setStatus(`${label} finished.`);
      },
    });
    els.nowPlaying.textContent = `${loop ? "∞" : "▶"} ${label}${note ? ` — ${note}` : ""}`;
    scrub.start();
    syncTransport();
    setStatus(loop ? "Looping." : "Playing.");
    draw();
  } catch (err) {
    setStatus(`Could not play ${label}: ${(err as Error).message}`);
  }
}

/** Play/pause the current cue. Does nothing when nothing is loaded. */
function togglePlayback(): void {
  if (playbackState() === "playing") {
    if (pausePlayback()) setStatus("Paused.");
  } else if (resumePlayback()) {
    scrub.start();
    setStatus("Playing.");
  }
  syncTransport();
}

function stop(): void {
  stopPlayback();
  scrub.reset();
  view.playingCue = null;
  view.playingEntry = null;
  els.nowPlaying.textContent = "Nothing playing";
  syncTransport();
  setStatus("Stopped.");
  draw();
}

function syncTransport(): void {
  const state = playbackState();
  els.toggle.textContent = state === "playing" ? "⏸ Pause" : "▶ Play";
  els.toggle.disabled = state === "stopped";
  els.stop.disabled = state === "stopped";
}

// ── Volume ─────────────────────────────────────────────────────────────────

/**
 * The fader is a property of the room, not of the running order: the same
 * session played on a laptop and through a speaker wants different levels, so it
 * is remembered per browser rather than written into `sessions/<name>.json`.
 */
const VOLUME_KEY = "music-generator.volume";
const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.8;

let level = DEFAULT_VOLUME;
let muted = false;

function applyVolume(): void {
  setVolume(muted ? 0 : level);
  els.volume.value = String(Math.round(level * 100));
  els.volumeRead.textContent = muted ? "muted" : formatVolume(level);
  els.volumeRow.classList.toggle("muted", muted);
  els.mute.textContent = muted ? "🔇" : "🔊";
  els.mute.title = muted ? "Unmute (m)" : "Mute (m)";
}

/** Move the fader to `next` (0–1). Any move off the bottom also unmutes. */
function changeVolume(next: number, announce = true): void {
  level = Math.min(Math.max(next, 0), 1);
  if (level > 0) muted = false;
  try {
    window.localStorage.setItem(VOLUME_KEY, String(level));
  } catch {
    // Private-browsing or a locked-down profile: the level still works, it just
    // does not survive a reload. Not worth a message during a game.
  }
  applyVolume();
  if (announce) setStatus(`Volume ${muted ? "muted" : formatVolume(level)}.`);
}

function toggleMute(): void {
  muted = !muted;
  applyVolume();
  setStatus(muted ? "Muted." : `Volume ${formatVolume(level)}.`);
}

function restoreVolume(): void {
  try {
    // `Number(null)` is 0, not NaN — an unset key would silently open the board
    // muted, so the missing case has to be checked before the parse.
    const stored = window.localStorage.getItem(VOLUME_KEY);
    const saved = stored === null ? Number.NaN : Number(stored);
    if (Number.isFinite(saved) && saved >= 0 && saved <= 1) level = saved;
  } catch {
    // No storage: start at the default.
  }
  applyVolume();
}

// ── Wiring ─────────────────────────────────────────────────────────────────

els.toggle.addEventListener("click", () => togglePlayback());
els.stop.addEventListener("click", () => stop());
els.volume.addEventListener("input", () => changeVolume(Number(els.volume.value) / 100, false));
els.volume.addEventListener("change", () => setStatus(`Volume ${formatVolume(level)}.`));
els.mute.addEventListener("click", () => toggleMute());

els.search.addEventListener("input", () => {
  view.query = els.search.value;
  draw();
});

els.sessionPick.addEventListener("change", () => {
  view.plan = sessions.find((plan) => plan.name === els.sessionPick.value) ?? null;
  view.campaign = view.plan?.campaign ?? null;
  draw();
  reportReadiness();
});

els.newSession.addEventListener("click", () => {
  const title = window.prompt("Name this session", `Session ${sessions.length + 1}`);
  if (!title) return;
  const name = sessionSlug(title);
  if (name === "") {
    setStatus("That name has no letters or numbers in it — try another.");
    return;
  }
  if (sessions.some((plan) => plan.name === name)) {
    setStatus(`There is already a sessions/${name}.json — pick another name.`);
    return;
  }
  const plan: SessionPlan = { ...emptySession(name, view.campaign ?? undefined), title };
  sessions = [...sessions, plan].sort((a, b) => a.name.localeCompare(b.name));
  view.plan = plan;
  view.tab = "archive"; // an empty running order is filled from the shelf
  draw();
  void writePlan();
});

els.deleteSession.addEventListener("click", () => {
  const plan = view.plan;
  if (!plan) return;
  if (!window.confirm(`Delete sessions/${plan.name}.json? The compositions are not touched.`)) return;
  void fetch(SESSION_DELETE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: plan.name }),
  })
    .then(async (res) => {
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setStatus(`Deleted sessions/${plan.name}.json.`);
      return loadSessions();
    })
    .catch((err: Error) => setStatus(`Could not delete: ${err.message}`));
});

/**
 * Number keys fire cues, space plays/pauses, Escape stops. The point of the page
 * is that the right cue is one keystroke away while you are looking at the table
 * rather than the screen — so the shortcuts stay out of the way of typing.
 */
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
    return;
  }
  if (event.key === "Escape") {
    stop();
    return;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault(); // otherwise the page scrolls under the cue list
    changeVolume(level + (event.key === "ArrowUp" ? VOLUME_STEP : -VOLUME_STEP));
    return;
  }
  if (event.key === "m" || event.key === "M") {
    toggleMute();
    return;
  }
  const digit = Number(event.key);
  if (!Number.isInteger(digit) || digit < 1 || digit > HOTKEY_CUES) return;
  const plan = view.plan;
  if (!plan) return;
  const cue = resolveCues(plan, view.entries, view.rendered)[digit - 1];
  if (!cue) return;
  event.preventDefault();
  view.tab = "session";
  void playCue(cue);
});

async function init(): Promise<void> {
  restoreVolume();
  syncTransport();
  els.nowPlaying.textContent = "Nothing playing";
  view.rendered = await fetch("/audio/manifest.json")
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
    .then(indexManifest)
    .catch(() => indexManifest(null));
  await loadSessions();
}

void init();
