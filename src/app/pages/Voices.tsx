/**
 * The voice bench: audition one instrument's sounds, then approve the ones
 * worth keeping.
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
 *
 * Approving rewrites the file on disk. The response is folded back into state
 * rather than reloaded, and *immutably* — the hand-rolled version mutated
 * `entry.preset` in place, which happened to work only because it redrew the
 * whole page afterwards.
 */
import { useState } from "react";
import {
  ALL_INSTRUMENTS_BLURB,
  NO_VOICE_SELECTED,
  approveLabel,
  approvedMessage,
  describeVoice,
  draftedMessage,
  forkedMessage,
  noAudioMessage,
  openingMessage,
  playingMessage,
} from "@engine/voice-bench";
import { INSTRUMENT_BLURBS, voiceAudioName, type VoiceEntry } from "@engine/voice-library";
import { probeFor } from "@engine/probe";
import type { InstrumentName } from "@engine/composition";
import { VOICE_APPROVE_ENDPOINT, VOICE_FORK_ENDPOINT } from "../../dev/endpoints";
import { InstrumentTabs } from "../components/InstrumentTabs";
import { VoiceTable } from "../components/VoiceTable";
import { useApi } from "../hooks/useApi";
import { useVoiceManifest } from "../hooks/useManifest";
import { usePlayback } from "../hooks/usePlayback";
import { VOICE_LIBRARY } from "../voices";

// Built once at import: the glob behind VOICE_LIBRARY is static, so a voice is
// already selected before React mounts and the bench never paints an empty
// panel on its way to one.
const FIRST = VOICE_LIBRARY[0];

export function Voices() {
  const [entries, setEntries] = useState<VoiceEntry[]>(VOICE_LIBRARY);
  const [instrument, setInstrument] = useState<InstrumentName | null>(null);
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(FIRST?.id ?? null);
  const [loopWanted, setLoopWanted] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const [loading, setLoading] = useState(false);

  const api = useApi();
  const [status, setStatus] = useState(() => openingMessage(VOICE_LIBRARY.length, api.canEdit));
  const lookup = useVoiceManifest();
  const playback = usePlayback();

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const described = selected ? describeVoice(selected) : null;
  const probe = selected ? probeFor(selected.preset) : null;
  // One test for three buttons: nothing invalid can be played, approved or forked.
  const broken = described?.broken ?? true;

  /** Play the selected voice's probe. */
  async function play(entry: VoiceEntry): Promise<void> {
    const audio = await lookup(voiceAudioName(entry.instrument, entry.slug));
    if (!audio) {
      setStatus(noAudioMessage(entry.id));
      return;
    }
    setLoading(true);
    try {
      await playback.play(`/audio/voices/${audio.file}`, {
        loop: loopWanted,
        onEnded: () => setStatus("Finished."),
      });
      setStatus(
        playingMessage(entry.id, {
          seconds: audio.seconds,
          renderedOn: new Date(audio.renderedAt).toLocaleDateString(),
        }),
      );
    } catch (err) {
      setStatus(`Could not play ${entry.id}: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Approve, or send an approved voice back to the workbench. `makeDefault`
   * demotes whichever voice of that instrument held the slot — the server says
   * which, and the table has to agree with it without a reload.
   */
  async function approve(entry: VoiceEntry): Promise<void> {
    const backToDraft = entry.preset.status === "approved";
    try {
      const body = await api.post(VOICE_APPROVE_ENDPOINT, {
        id: entry.id,
        draft: backToDraft,
        makeDefault,
      });
      const demoted = (body.demoted as string[] | undefined) ?? [];
      const promoted = !backToDraft && makeDefault;
      setEntries((prev) =>
        prev.map((other) => {
          const isEntry = other.id === entry.id;
          if (!isEntry && !(promoted && other.instrument === entry.instrument)) return other;
          return {
            ...other,
            preset: {
              ...other.preset,
              status: isEntry ? (backToDraft ? "draft" : "approved") : other.preset.status,
              default: promoted ? isEntry : other.preset.default,
            },
          };
        }),
      );
      setStatus(backToDraft ? draftedMessage(entry.id) : approvedMessage(entry.id, demoted));
    } catch (err) {
      setStatus(`Could not approve ${entry.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Fork = copy to a new draft slug on disk. The new voice reaches this list the
   * way every other new file does — `src/dev/live-library.ts` invalidates the
   * glob — so there is nothing to insert here, only the render command to print.
   */
  async function fork(entry: VoiceEntry): Promise<void> {
    const slug = window.prompt(`New slug for a copy of ${entry.id}:`, `${entry.slug}-2`)?.trim();
    if (!slug) return;
    try {
      const body = await api.post(VOICE_FORK_ENDPOINT, { from: entry.id, slug });
      setStatus(forkedMessage(String(body.id)));
    } catch (err) {
      setStatus(`Could not fork ${entry.id}: ${(err as Error).message}`);
    }
  }

  return (
    <main>
      <h1>
        music-generator · voice bench
        <a href="/index.html">compositions →</a>
        <a href="/session.html">session →</a>
        <a href="/studies.html">studies →</a>
      </h1>

      <InstrumentTabs entries={entries} instrument={instrument} onPick={setInstrument} />
      <div id="blurb">{instrument ? INSTRUMENT_BLURBS[instrument] : ALL_INSTRUMENTS_BLURB}</div>
      <div id="filters">
        <label className="check">
          <input
            id="draftsOnly"
            type="checkbox"
            checked={draftsOnly}
            onChange={(e) => setDraftsOnly(e.target.checked)}
          />
          <span>drafts only</span>
        </label>
        <label className="check">
          <input
            id="loop"
            type="checkbox"
            checked={loopWanted}
            onChange={(e) => setLoopWanted(e.target.checked)}
          />
          <span>loop the probe</span>
        </label>
        <span id="probeName" className="chip" title={probe ? `${probe.bpm} BPM, ${probe.key}` : undefined}>
          {probe ? `${probe.name}: ${probe.describe}` : "probe"}
        </span>
      </div>

      <VoiceTable
        entries={entries}
        instrument={instrument}
        draftsOnly={draftsOnly}
        selectedId={selectedId}
        onSelect={(entry) => setSelectedId(entry.id)}
        onPlay={(entry) => {
          setSelectedId(entry.id);
          void play(entry);
        }}
      />

      <div id="selected">{described ? described.label : NO_VOICE_SELECTED}</div>
      <div id="notes">{described ? described.notes : ""}</div>

      <div className="row">
        <button
          id="play"
          disabled={!selected || broken || loading}
          onClick={() => selected && void play(selected)}
        >
          ▶ Play
        </button>
        <button
          id="pause"
          disabled={playback.state === "stopped"}
          onClick={() => {
            // One button, both directions — pause says whether it had anything
            // to hold, so a false is "we were paused, carry on". Its answer is
            // what the status line reports; `playback.state` is still this
            // render's value until React comes back round.
            const held = playback.pause();
            if (!held) playback.resume();
            setStatus(held ? "Paused." : "Playing.");
          }}
        >
          {playback.state === "paused" ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button
          id="stop"
          onClick={() => {
            playback.stop();
            setStatus("Stopped.");
          }}
        >
          ■ Stop
        </button>
      </div>

      <div className="row">
        <button
          id="approve"
          disabled={!selected || broken || !api.canEdit}
          onClick={() => selected && void approve(selected)}
        >
          {approveLabel(selected)}
        </button>
        <label className="check">
          <input
            id="makeDefault"
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
          <span>as default</span>
        </label>
        <button
          id="fork"
          disabled={!selected || broken || !api.canEdit}
          onClick={() => selected && void fork(selected)}
        >
          ⑂ Fork
        </button>
      </div>

      <div id="status">{status}</div>
    </main>
  );
}
