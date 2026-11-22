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
import { Badge, Box, Button, Checkbox, Link, PageHeader, Row, Text } from "jeff-ui";
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
    }
    // After the catch rather than in a `finally`: React Compiler skips any
    // function with a `finally`, and the catch never rethrows.
    setLoading(false);
  }

  /**
   * Approve, or send an approved voice back to the workbench. `makeDefault`
   * demotes whichever voice of that instrument held the slot — the server says
   * which, and the table has to agree with it without a reload.
   */
  async function approve(entry: VoiceEntry): Promise<void> {
    const backToDraft = entry.preset.status === "approved";
    const promoted = !backToDraft && makeDefault;
    try {
      const body = await api.post(VOICE_APPROVE_ENDPOINT, {
        id: entry.id,
        draft: backToDraft,
        makeDefault,
      });
      const demoted = demotedIds(body);
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
      setStatus(approvalMessage(entry.id, backToDraft, demoted));
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
      <PageHeader title="music-generator · voice bench">
        <Link variant="nav" href="/index.html">
          compositions →
        </Link>
        <Link variant="nav" href="/session.html">
          session →
        </Link>
        <Link variant="nav" href="/studies.html">
          studies →
        </Link>
        <Link variant="nav" href="/keys.html">
          keys →
        </Link>
      </PageHeader>

      <InstrumentTabs entries={entries} instrument={instrument} onPick={setInstrument} />
      <Text id="blurb" size="sm" tone="muted" lines={1}>
        {instrument ? INSTRUMENT_BLURBS[instrument] : ALL_INSTRUMENTS_BLURB}
      </Text>
      <Row id="filters" wrap={false} align="center" gap={4}>
        <Checkbox
          label="drafts only"
          id="draftsOnly"
          checked={draftsOnly}
          onChange={setDraftsOnly}
        />
        <Checkbox label="loop the probe" id="loop" checked={loopWanted} onChange={setLoopWanted} />
        <Badge id="probeName" title={probe ? `${probe.bpm} BPM, ${probe.key}` : undefined}>
          {probe ? `${probe.name}: ${probe.describe}` : "probe"}
        </Badge>
      </Row>

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

      <Text id="selected" strong lines={1}>
        {described ? described.label : NO_VOICE_SELECTED}
      </Text>
      <Box id="notes" inset>
        <Text size="sm" tone="muted">
          {described ? described.notes : ""}
        </Text>
      </Box>

      <Row equal>
        <Button
          id="play"
          disabled={!selected || broken || loading}
          onClick={() => selected && void play(selected)}
        >
          ▶ Play
        </Button>
        <Button
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
        </Button>
        <Button
          id="stop"
          onClick={() => {
            playback.stop();
            setStatus("Stopped.");
          }}
        >
          ■ Stop
        </Button>
      </Row>

      <Row equal align="center">
        <Button
          id="approve"
          hue="var(--ui-ok)"
          disabled={!selected || broken || !api.canEdit}
          onClick={() => selected && void approve(selected)}
        >
          {approveLabel(selected)}
        </Button>
        <Checkbox
          label="as default"
          id="makeDefault"
          checked={makeDefault}
          onChange={setMakeDefault}
        />
        <Button
          id="fork"
          disabled={!selected || broken || !api.canEdit}
          onClick={() => selected && void fork(selected)}
        >
          ⑂ Fork
        </Button>
      </Row>

      <Text id="status" size="sm" tone="muted" lines={2}>
        {status}
      </Text>
    </main>
  );
}

/**
 * The voices an approval knocked out of their default slot. This and the
 * message below live out here because React Compiler cannot compile a `??` or
 * a `? :` inside a `try`.
 */
function demotedIds(body: Record<string, unknown>): string[] {
  return (body.demoted as string[] | undefined) ?? [];
}

function approvalMessage(id: string, backToDraft: boolean, demoted: string[]): string {
  return backToDraft ? draftedMessage(id) : approvedMessage(id, demoted);
}
