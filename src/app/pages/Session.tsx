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
 * Two things follow from that, and they are why this page differs from the other
 * three benches. **Nothing may move**: the transport sits at a fixed place at
 * the bottom and switching tabs cannot shift it, because you learn where Play is
 * with your hand, not your eyes. And **nothing is announced twice**: the status
 * line under the transport is read at a glance in a dark room, so it says one
 * thing at a time and the wording lives in
 * [`@engine/session-bench`](../../engine/session-bench.ts) where it can be tested.
 *
 * Audio comes from `public/audio/` exactly as it does everywhere else — see
 * [`../audio/playback`](../audio/playback.ts). Nothing is synthesised here.
 */
import { useMemo, useState } from "react";
import type { Composition } from "@engine/composition";
import { buildLibrary, type LibraryEntry } from "@engine/library";
import { audioName } from "@engine/manifest";
import {
  addCue,
  moveCue,
  removeCue,
  resolveCues,
  setCueLoop,
  setCueNote,
  entriesOfCampaign,
  type ResolvedCue,
  type SessionPlan,
} from "@engine/session";
import {
  HOTKEY_CUES,
  NOTHING_PLAYING,
  addedMessage,
  muteMessage,
  noEntryAudioMessage,
  nowPlayingLabel,
  planHeader,
  readinessMessage,
  seekedMessage,
  suggestedSessionTitle,
  volumeMessage,
  type SessionTab,
} from "@engine/session-bench";
import { ArchiveTable } from "../components/ArchiveTable";
import { CampaignChips } from "../components/CampaignChips";
import { CueTable } from "../components/CueTable";
import { SessionTabs } from "../components/SessionTabs";
import { useHotkeys } from "../hooks/useHotkeys";
import { useManifestIndex } from "../hooks/useManifest";
import { usePlayback } from "../hooks/usePlayback";
import { useScrubBar } from "../hooks/useScrubBar";
import { useSessions } from "../hooks/useSessions";
import { VOLUME_STEP, useVolume } from "../hooks/useVolume";

// The same eager glob the composition bench uses: Vite bundles every composition
// at build time, and `src/dev/live-library.ts` makes a *new* file reach the open
// tab without a restart.
const bundled = import.meta.glob<Composition>(
  ["../../../compositions/**/*.json", "!../../../compositions/_trash/**"],
  { eager: true, import: "default" },
);

// Built once at import, not per render: the glob is static, and the archive is
// the shelf you fill a running order from — it exists before any fetch does.
const ENTRIES = buildLibrary(bundled);

export function Session() {
  const [tab, setTab] = useState<SessionTab>("session");
  const [campaign, setCampaign] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** Index of the cue sounding, if it was fired from the session tab. */
  const [playingCue, setPlayingCue] = useState<number | null>(null);
  /** Library id sounding, if it was auditioned from the archive. */
  const [playingEntry, setPlayingEntry] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState(NOTHING_PLAYING);
  const [status, setStatus] = useState("");

  const playback = usePlayback();
  const fader = useVolume();
  const scrub = useScrubBar((seconds) => setStatus(seekedMessage(seconds)));
  const rendered = useManifestIndex();

  const sessions = useSessions({
    // Held until the manifest is in: the pre-flight check below is the first
    // thing this page says, and run a moment early it would call every cue silent.
    enabled: rendered !== null,
    onStatus: setStatus,
    onOpen: (plan) => {
      // The archive follows the session's campaign, so opening a plan puts the
      // shelf you will fill it from one tab away rather than one filter away.
      setCampaign(plan?.campaign ?? null);
      setStatus(readinessMessage(plan, plan && rendered ? resolveCues(plan, ENTRIES, rendered) : []));
    },
  });

  const plan = sessions.plan;
  const cues = useMemo(
    () => (plan && rendered ? resolveCues(plan, ENTRIES, rendered) : []),
    [plan, rendered],
  );
  const header = planHeader(plan, cues);

  /* ── Transport ─────────────────────────────────────────────────────────── */

  async function start(url: string, loop: boolean, label: string, note?: string): Promise<void> {
    try {
      await playback.play(url, {
        loop,
        onEnded: () => {
          // A one-shot that runs out is not a stop: leave the cue named on
          // screen so you can see what just finished.
          scrub.reset();
          setStatus(`${label} finished.`);
        },
      });
      setNowPlaying(nowPlayingLabel(label, loop, note));
      scrub.start();
      setStatus(loop ? "Looping." : "Playing.");
    } catch (err) {
      setStatus(`Could not play ${label}: ${(err as Error).message}`);
    }
  }

  async function playCue(cue: ResolvedCue): Promise<void> {
    if (cue.status !== "ready" || !cue.audio) {
      setStatus(cue.hint);
      return;
    }
    setPlayingCue(cue.index);
    setPlayingEntry(cue.entry?.id ?? null);
    await start(`/audio/${cue.audio.file}`, cue.loop, cue.label, cue.cue.note);
  }

  async function playEntry(entry: LibraryEntry): Promise<void> {
    const looping = !!entry.composition.loop;
    const audio = rendered?.get(audioName(entry.composition.name, { loop: looping }));
    if (!audio) {
      setStatus(noEntryAudioMessage(entry));
      return;
    }
    setPlayingCue(null);
    setPlayingEntry(entry.id);
    await start(`/audio/${audio.file}`, looping, entry.composition.name);
  }

  /** Play/pause whatever is loaded. Does nothing when nothing is. */
  function togglePlayback(): void {
    if (playback.state === "playing") {
      if (playback.pause()) setStatus("Paused.");
    } else if (playback.resume()) {
      scrub.start();
      setStatus("Playing.");
    }
  }

  function stop(): void {
    playback.stop();
    scrub.reset();
    setPlayingCue(null);
    setPlayingEntry(null);
    setNowPlaying(NOTHING_PLAYING);
    setStatus("Stopped.");
  }

  /* ── Editing the running order ─────────────────────────────────────────── */

  function editNote(index: number): void {
    if (!plan) return;
    const note = window.prompt("When does this cue play?", plan.cues[index]?.note ?? "");
    if (note !== null) sessions.edit((p) => setCueNote(p, index, note));
  }

  function newSession(): void {
    const title = window.prompt("Name this session", suggestedSessionTitle(sessions.all.length));
    if (!title) return;
    // An empty running order is filled from the shelf, so land on it.
    if (sessions.create(title, campaign)) setTab("archive");
  }

  function deleteSession(): void {
    if (!plan) return;
    if (!window.confirm(`Delete sessions/${plan.name}.json? The compositions are not touched.`)) {
      return;
    }
    sessions.remove();
  }

  /* ── Keys ──────────────────────────────────────────────────────────────── */

  /**
   * The point of the page is that the right cue is one keystroke away while you
   * are looking at the table rather than the screen. `useHotkeys` is what keeps
   * these out of the way of typing into the search box.
   */
  useHotkeys((event) => {
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
      const moved = fader.nudge(event.key === "ArrowUp" ? VOLUME_STEP : -VOLUME_STEP);
      setStatus(volumeMessage(moved.level, moved.muted));
      return;
    }
    if (event.key === "m" || event.key === "M") {
      const moved = fader.toggleMute();
      setStatus(muteMessage(moved.level, moved.muted));
      return;
    }
    const digit = Number(event.key);
    if (!Number.isInteger(digit) || digit < 1 || digit > HOTKEY_CUES) return;
    const cue = cues[digit - 1];
    if (!cue) return;
    event.preventDefault();
    setTab("session");
    void playCue(cue);
  });

  /* ── Layout ────────────────────────────────────────────────────────────── */

  return (
    <main>
      <h1>
        music-generator · session board
        <a href="/">bench →</a>
        <a href="/voices.html">voices →</a>
      </h1>

      <div id="pickerRow">
        <select
          id="sessionPick"
          aria-label="Session"
          value={plan?.name ?? ""}
          disabled={sessions.all.length === 0}
          onChange={(e) => sessions.select(e.target.value)}
        >
          {sessions.all.map((option: SessionPlan) => (
            <option key={option.name} value={option.name}>
              {option.title ?? option.name}
            </option>
          ))}
        </select>
        <button id="newSession" title="Start a new session" onClick={newSession}>
          ＋ New
        </button>
        <button
          id="deleteSession"
          title="Delete this session plan"
          disabled={!plan}
          onClick={deleteSession}
        >
          🗑
        </button>
      </div>

      <SessionTabs
        tab={tab}
        cues={cues.length}
        archive={entriesOfCampaign(ENTRIES, campaign).length}
        onPick={setTab}
      />

      {/* Both panels live in the same grid cell, so the tab you are not on takes
          up exactly as much room as the one you are. */}
      <div id="panels">
        <section
          id="sessionPanel"
          role="tabpanel"
          aria-label="Session"
          hidden={tab !== "session"}
        >
          <div className="planHead">
            <div id="planTitle">{rendered === null ? "loading…" : header.title}</div>
            <div id="planMeta" className={header.warn ? "warn" : undefined}>
              {rendered === null ? "" : header.meta}
            </div>
          </div>
          <CueTable
            cues={cues}
            hasPlan={!!plan}
            playing={playingCue}
            onPlay={(cue) => void playCue(cue)}
            onMove={(index, delta) => sessions.edit((p) => moveCue(p, index, delta))}
            onRemove={(index) => sessions.edit((p) => removeCue(p, index))}
            onEditNote={editNote}
            onToggleLoop={(cue) => sessions.edit((p) => setCueLoop(p, cue.index, !cue.loop))}
          />
        </section>

        <section
          id="archivePanel"
          role="tabpanel"
          aria-label="Archive"
          hidden={tab !== "archive"}
        >
          <div id="filters">
            <CampaignChips entries={ENTRIES} campaign={campaign} onPick={setCampaign} />
            <input
              id="search"
              type="search"
              placeholder="filter by name or tag…"
              aria-label="Filter the archive"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ArchiveTable
            entries={ENTRIES}
            campaign={campaign}
            query={query}
            playing={playingEntry}
            onPlay={(entry) => void playEntry(entry)}
            onAdd={(entry) => {
              sessions.edit((p) => addCue(p, entry.id));
              setStatus(addedMessage(entry, plan?.name ?? null));
            }}
          />
        </section>
      </div>

      <div id="nowPlaying">{nowPlaying}</div>
      {/* The bar owns its own children and its own class list from here on —
          see hooks/useScrubBar.ts for why it is not JSX. */}
      <div id="scrub" className="scrub idle" ref={scrub.ref} />
      <div className="row">
        <button id="toggle" disabled={playback.state === "stopped"} onClick={togglePlayback}>
          {playback.state === "playing" ? "⏸ Pause" : "▶ Play"}
        </button>
        <button id="stop" disabled={playback.state === "stopped"} onClick={stop}>
          ■ Stop
        </button>
      </div>
      <div id="volumeRow" className={fader.muted ? "muted" : undefined}>
        <button
          id="mute"
          className="icon"
          title={fader.muted ? "Unmute (m)" : "Mute (m)"}
          aria-label="Mute"
          onClick={() => {
            const moved = fader.toggleMute();
            setStatus(muteMessage(moved.level, moved.muted));
          }}
        >
          {fader.muted ? "🔇" : "🔊"}
        </button>
        <input
          id="volume"
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label="Volume"
          value={fader.percent}
          // Silent while it moves, announced when it lands: a status line that
          // repainted on every pixel of a drag is one you stop reading.
          onChange={(e) => fader.set(Number(e.target.value) / 100)}
          onPointerUp={() => setStatus(volumeMessage(fader.level, fader.muted))}
          onKeyUp={() => setStatus(volumeMessage(fader.level, fader.muted))}
        />
        <span id="volumeRead" className="scrub-time">
          {fader.read}
        </span>
      </div>
      <div id="status">{status}</div>
      <div className="hint">
        Keys: 1–9 fire that cue · space plays/pauses · esc stops · ←/→ scrub 5s · ↑/↓ volume · m
        mutes
      </div>
    </main>
  );
}
