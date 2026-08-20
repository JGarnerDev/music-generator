/**
 * The workshop bench: browse the library by kind (segments / loops / songs /
 * leitmotifs), pick a piece — or drop an external one — and play, export or
 * delete it. Deliberately minimal: a workshop tool, not a DAW.
 *
 * Nothing here synthesises audio. `npm run render` produces the files and this
 * plays them, so a piece that has not been rendered is a piece the user cannot
 * hear — see [`docs/rendering.md`](../../../docs/rendering.md) for the three
 * designs that tried it the other way round.
 *
 * Button state is *derived* from the piece in hand, never toggled: the previous
 * hand-rolled version had six `disabled = …` assignments in four functions, and
 * the invalid-file path missed two of them.
 */
import { useRef, useState } from "react";
import { describeLoad } from "@engine/bench";
import type { Composition } from "@engine/composition";
import {
  KIND_BLURBS,
  buildLibrary,
  type CompositionKind,
  type LibraryEntry,
} from "@engine/library";
import { audioName } from "@engine/manifest";
import { TRASH_ENDPOINT } from "../../dev/endpoints";
import { KindTabs } from "../components/KindTabs";
import { LibraryTable } from "../components/LibraryTable";
import { useManifest } from "../hooks/useManifest";
import { usePlayback } from "../hooks/usePlayback";

// Vite bundles every composition in the tree at build time; add a JSON under
// compositions/<kind>/ (e.g. via `npm run compose`) and the open tab reloads
// itself with it — `npm run dev` mounts src/dev/live-library.ts to make a *new*
// file invalidate this glob, which Vite on its own does not.
// The folder it sits in *is* its kind — see src/engine/library.ts.
// `_trash/` is excluded here as well as in `buildLibrary`: without it, deleting a
// piece triggers an HMR reload that would list the trashed file straight back.
const bundled = import.meta.glob<Composition>(
  ["../../../compositions/**/*.json", "!../../../compositions/_trash/**"],
  { eager: true, import: "default" },
);

// Built once at import, not per render: the glob is static, so the first piece
// is already chosen before React mounts and the bench never paints an empty
// frame on its way to a selection.
const ENTRIES = buildLibrary(bundled);
const FIRST = ENTRIES[0];
const INITIAL = FIRST
  ? { ...describeLoad(FIRST.composition, FIRST.id), selectedId: FIRST.id }
  : {
      composition: null,
      title: null,
      status: "No compositions found. Run npm run compose to create one.",
      selectedId: null,
    };

export function Bench() {
  const [entries, setEntries] = useState<LibraryEntry[]>(ENTRIES);
  const [kind, setKind] = useState<CompositionKind | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(INITIAL.selectedId);

  const [current, setCurrent] = useState<Composition | null>(INITIAL.composition);
  const [title, setTitle] = useState(INITIAL.title ?? "loading…");
  const [status, setStatus] = useState(INITIAL.status);
  const [loopWanted, setLoopWanted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [over, setOver] = useState(false);

  const lookup = useManifest();
  const playback = usePlayback();
  const fileInput = useRef<HTMLInputElement>(null);

  // Loop controls only mean something for a piece that declares a loop window.
  const hasLoop = !!current?.loop;
  const looping = loopWanted && hasLoop;

  /** Validate + adopt a composition. Returns it when it became the active piece. */
  function load(comp: unknown, source: string): Composition | null {
    const loaded = describeLoad(comp, source);
    setCurrent(loaded.composition);
    if (loaded.title !== null) setTitle(loaded.title);
    setStatus(loaded.status);
    return loaded.composition;
  }

  function select(entry: LibraryEntry): Composition | null {
    const comp = load(entry.composition, entry.id);
    if (comp) setSelectedId(entry.id);
    return comp;
  }

  /**
   * Play the rendered file. A piece with no audio yet is not playable —
   * `npm run render` is what makes it so, and the same goes for a piece whose
   * notes changed since: the audio has no idea, and re-rendering is a command,
   * not a button.
   */
  async function play(comp: Composition, repeat: boolean): Promise<void> {
    const name = audioName(comp.name, { loop: repeat });
    const entry = await lookup(name);
    if (!entry) {
      setStatus(`No audio for ${name}. Run: npm run render -- --file <its .json>`);
      return;
    }
    setLoading(true);
    try {
      await playback.play(`/audio/${entry.file}`, {
        loop: repeat,
        onEnded: () => setStatus("Finished."),
      });
      setStatus(
        `${repeat ? "Playing loop" : "Playing"} — ${entry.seconds.toFixed(0)}s, ` +
          `rendered ${new Date(entry.renderedAt).toLocaleDateString()}.`,
      );
    } catch (err) {
      setStatus(`Could not play ${name}: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Download what was rendered. `loopOnly` grabs the seam-wrapped loop body, the
   * file a game ships. Full-quality WAVs come from `npm run render -- --wav`.
   */
  async function exportAudio(loopOnly: boolean): Promise<void> {
    if (!current) return;
    const name = audioName(current.name, { loop: loopOnly });
    const entry = await lookup(name);
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

  /**
   * Delete = move the file into `compositions/_trash/` via the dev server, so a
   * mis-click is a drag back rather than a lost piece. Confirmed first because
   * it touches the user's files.
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
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      if (selectedId === entry.id) {
        setSelectedId(null);
        setCurrent(null);
        setTitle("No composition selected.");
      }
      setStatus(`Moved ${body.trashed} to compositions/_trash/.`);
    } catch (err) {
      setStatus(`Could not delete ${entry.slug}: ${(err as Error).message}`);
    }
  }

  /** Read a dropped/browsed .json into the bench (does not touch the folder). */
  async function loadFromFile(file: File): Promise<void> {
    try {
      const comp: unknown = JSON.parse(await file.text());
      if (load(comp, file.name)) setSelectedId(null); // external file isn't in the library
    } catch (err) {
      setStatus(`Could not read ${file.name}: ${(err as Error).message}`);
    }
  }

  return (
    <main>
      <h1>
        music-generator · workshop bench
        <a href="/session.html">session →</a>
        <a href="/voices.html">voices →</a>
        <a href="/studies.html">studies →</a>
      </h1>

      <KindTabs entries={entries} kind={kind} onPick={setKind} />
      <div id="kindBlurb">{kind ? KIND_BLURBS[kind] : "Everything in compositions/."}</div>
      <input
        id="search"
        type="search"
        placeholder="filter by name, tag or motif…"
        aria-label="Filter compositions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <LibraryTable
        entries={entries}
        kind={kind}
        query={query}
        selectedId={selectedId}
        canDelete={import.meta.env.DEV} // no dev server in a built bundle = no file moves
        onSelect={select}
        onPlay={(entry) => {
          const comp = select(entry);
          if (comp) void play(comp, loopWanted && !!comp.loop);
        }}
        onDelete={(entry) => void remove(entry)}
      />

      <div id="title">{title}</div>
      <div
        id="drop"
        className={over ? "over" : undefined}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void loadFromFile(file);
        }}
      >
        Drop a composition .json here, or click to browse
      </div>
      <input
        id="file"
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFromFile(file);
        }}
      />
      <div className="row">
        <button id="play" disabled={!current || loading} onClick={() => current && void play(current, looping)}>
          ▶ Play
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
        <button id="export" disabled={!current} onClick={() => void exportAudio(false)}>
          ⬇ Download
        </button>
        <button
          id="exportLoop"
          title="Seamless loop body only"
          disabled={!hasLoop}
          onClick={() => void exportAudio(true)}
        >
          ⬇ Download Loop
        </button>
      </div>
      <label id="loopRow" className={hasLoop ? "check" : "check disabled"}>
        <input
          id="loop"
          type="checkbox"
          checked={loopWanted}
          disabled={!hasLoop}
          onChange={(e) => setLoopWanted(e.target.checked)}
        />
        <span>Loop playback (intro once, then repeat the body)</span>
      </label>
      <div id="status">{status}</div>
    </main>
  );
}
