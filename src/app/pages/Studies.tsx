/**
 * The studies bench: hear an attempt at a musical concept and say whether we
 * should write music like that.
 *
 * The composition bench asks "is this piece good" and the voice bench asks "is
 * this sound good". This one asks the question neither can — *how should a
 * guitar solo go at all* — and the answer accumulates into `studies/ledger.md`,
 * which is the evidence `docs/taste.md` is written from.
 *
 * Two things shape the layout. **The set is the unit**: an attempt's thumb only
 * means something against its siblings, which differ from it on exactly one
 * axis, so they sit in a strip under the selection and are one click away.
 * **The tag shelf is fixed**: a free-text reason appears once and can never be
 * counted, whereas `cluttered` said five times is a preference — so the chips
 * are the primary input and the note is the overflow.
 *
 * It plays files like everything else here: `npm run study:render` writes them.
 */
import { useState } from "react";
import {
  ALL_GROUPS_BLURB,
  NO_STUDY_SELECTED,
  clearedMessage,
  describeStudy,
  firstSelectable,
  judgeable,
  judgedMessage,
  noStudyAudioMessage,
  openingStudiesMessage,
  studyPlayingMessage,
  visibleStudies,
  type StudyFilters,
} from "@engine/study-bench";
import { studyAudioName, type StudyEntry } from "@engine/study-library";
import { GROUP_BLURBS, type ConceptGroup, type Thumb } from "@engine/study";
import { STUDY_VERDICT_ENDPOINT } from "../../dev/endpoints";
import { GroupTabs } from "../components/GroupTabs";
import { SetStrip } from "../components/SetStrip";
import { StudyTable } from "../components/StudyTable";
import { TagShelf } from "../components/TagShelf";
import { useApi } from "../hooks/useApi";
import { useStudyManifest } from "../hooks/useManifest";
import { usePlayback } from "../hooks/usePlayback";
import { STUDY_LIBRARY } from "../studies";

// Built once at import, like the other two benches: the glob is static, so the
// page opens on an attempt rather than painting an empty panel on its way to one.
// "Unjudged only" is on by default — the queue is the point of the page.
const INITIAL_FILTERS: StudyFilters = {
  group: null,
  query: "",
  unjudgedOnly: true,
  selectedId: null,
};
const FIRST = firstSelectable(STUDY_LIBRARY, INITIAL_FILTERS);

export function Studies() {
  const [entries, setEntries] = useState<StudyEntry[]>(STUDY_LIBRARY);
  const [group, setGroup] = useState<ConceptGroup | null>(null);
  const [query, setQuery] = useState("");
  const [unjudgedOnly, setUnjudgedOnly] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(FIRST?.id ?? null);
  const [loopWanted, setLoopWanted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Tags and the note belong to one attempt, so both are seeded from whatever
  // verdict it already carries and both are replaced when the selection moves.
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(FIRST?.study.verdict?.tags ?? []),
  );
  const [note, setNote] = useState(FIRST?.study.verdict?.note ?? "");

  const api = useApi();
  const [status, setStatus] = useState(() => openingStudiesMessage(!!FIRST, api.canEdit));
  const lookup = useStudyManifest();
  const playback = usePlayback();

  const filters: StudyFilters = { group, query, unjudgedOnly, selectedId };
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const described = selected ? describeStudy(selected) : null;
  const can = judgeable(selected, api.canEdit);

  /**
   * Move the needle. Carrying the armed tags to the next attempt would silently
   * attribute a reason to a study it was never said about, so they are reloaded
   * from the target — and re-selecting what is already selected is a no-op, or
   * clicking the current row would discard tags you were part-way through
   * picking.
   */
  function select(entry: StudyEntry): void {
    if (entry.id === selectedId) return;
    setSelectedId(entry.id);
    setPicked(new Set(entry.study.verdict?.tags ?? []));
    setNote(entry.study.verdict?.note ?? "");
  }

  /**
   * Keep something selected when a filter change leaves rows on screen but drops
   * the selection. Takes the *new* filters: the rows it has to look at are the
   * ones the change is about to produce.
   */
  function retarget(next: StudyFilters): void {
    const rows = visibleStudies(entries, next);
    if (rows.some((entry) => entry.id === next.selectedId)) return;
    const first = rows[0];
    if (first) select(first);
  }

  async function play(entry: StudyEntry): Promise<void> {
    const audio = await lookup(studyAudioName(entry.concept, entry.slug));
    if (!audio) {
      setStatus(noStudyAudioMessage(entry.id));
      return;
    }
    setLoading(true);
    try {
      await playback.play(`/audio/studies/${audio.file}`, {
        loop: loopWanted,
        onEnded: () => setStatus("Finished."),
      });
      setStatus(
        studyPlayingMessage(entry.id, {
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
   * Record a verdict. The server rewrites the study's JSON and `studies/ledger.md`
   * and hands back the verdict it stored; that is what goes into state, so the
   * chip in the table and the ledger on disk can never disagree.
   */
  async function judge(entry: StudyEntry, thumb: Thumb): Promise<void> {
    const tags = [...picked];
    const trimmed = note.trim();
    try {
      const body = await api.post(STUDY_VERDICT_ENDPOINT, {
        id: entry.id,
        thumb,
        tags,
        note: trimmed,
      });
      const verdict = body.verdict as StudyEntry["study"]["verdict"];
      setEntries((prev) =>
        prev.map((other) =>
          other.id === entry.id ? { ...other, study: { ...other.study, verdict } } : other,
        ),
      );
      setStatus(judgedMessage(entry.id, thumb, tags, trimmed));
    } catch (err) {
      setStatus(`Could not record a verdict on ${entry.id}: ${(err as Error).message}`);
    }
  }

  /** Take a verdict back: the attempt returns to the queue, tags and all. */
  async function clearVerdict(entry: StudyEntry): Promise<void> {
    try {
      await api.post(STUDY_VERDICT_ENDPOINT, { id: entry.id, clear: true });
      setEntries((prev) =>
        prev.map((other) => {
          if (other.id !== entry.id) return other;
          const { verdict: _dropped, ...study } = other.study;
          return { ...other, study };
        }),
      );
      setPicked(new Set());
      setNote("");
      setStatus(clearedMessage(entry.id));
    } catch (err) {
      setStatus(`Could not clear ${entry.id}: ${(err as Error).message}`);
    }
  }

  return (
    <main>
      <h1>
        music-generator · studies bench
        <a href="/index.html">compositions →</a>
        <a href="/session.html">session →</a>
        <a href="/voices.html">voices →</a>
      </h1>

      <GroupTabs entries={entries} group={group} onPick={setGroup} />
      <div id="blurb">{group ? GROUP_BLURBS[group] : ALL_GROUPS_BLURB}</div>
      <div id="filters">
        <label className="check">
          <input
            id="unjudgedOnly"
            type="checkbox"
            checked={unjudgedOnly}
            onChange={(e) => {
              setUnjudgedOnly(e.target.checked);
              retarget({ ...filters, unjudgedOnly: e.target.checked });
            }}
          />
          <span>unjudged only</span>
        </label>
        <label className="check">
          <input
            id="loop"
            type="checkbox"
            checked={loopWanted}
            onChange={(e) => setLoopWanted(e.target.checked)}
          />
          <span>loop</span>
        </label>
        <input
          id="search"
          type="search"
          placeholder="filter by concept, set or variant…"
          aria-label="Filter studies"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            retarget({ ...filters, query: e.target.value });
          }}
        />
      </div>

      <StudyTable
        entries={entries}
        filters={filters}
        onSelect={select}
        onPlay={(entry) => {
          select(entry);
          void play(entry);
        }}
      />

      <div id="selected">{described ? described.label : NO_STUDY_SELECTED}</div>
      <div id="approach">{described ? described.approach : ""}</div>
      <SetStrip entries={entries} entry={selected} onSelect={select} />

      <div className="row">
        <button
          id="play"
          disabled={!can.canPlay || loading}
          onClick={() => selected && void play(selected)}
        >
          ▶ Play
        </button>
        <button
          id="pause"
          disabled={playback.state === "stopped"}
          onClick={() => {
            // One button, both directions — pause reports whether it had
            // anything to hold, and that answer is what the status line says.
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

      <TagShelf
        picked={picked}
        disabled={!can.canJudge}
        onToggle={(tag) =>
          setPicked((prev) => {
            const next = new Set(prev);
            if (!next.delete(tag)) next.add(tag);
            return next;
          })
        }
      />
      <textarea
        id="note"
        rows={2}
        placeholder="anything the tags don't cover (optional)…"
        aria-label="Verdict note"
        value={note}
        disabled={!can.canJudge}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row">
        <button
          id="up"
          disabled={!can.canJudge}
          onClick={() => selected && void judge(selected, "up")}
        >
          👍 Keep this approach
        </button>
        <button
          id="down"
          disabled={!can.canJudge}
          onClick={() => selected && void judge(selected, "down")}
        >
          👎 Not this
        </button>
        <button
          id="clear"
          title="Take the verdict back"
          disabled={!can.canClear}
          onClick={() => selected && void clearVerdict(selected)}
        >
          ↩ Clear
        </button>
      </div>
      <div id="status">{status}</div>
    </main>
  );
}
