/**
 * The keys bench: play the computer keyboard, record what you played, hand it
 * over as notes.
 *
 * The one page here that makes a sound of its own. Everything else in this app
 * plays rendered files — see
 * [`docs/rendering.md`](../../../docs/rendering.md) — and this page is the
 * exception that proves the rule rather than a change to it: a keypress cannot
 * be rendered before it happens, so there is nothing to play. What it does not
 * do is render anything either. A take leaves here as *notes*, and notes become
 * audio the way every other note in this project does, through the CLI.
 *
 * **There is no Start button.** A browser will not make a sound until the user
 * does something, but playing a key *is* doing something — so the first note
 * wakes the audio and sounds, and the page is an instrument from the moment it
 * loads. The graph is built on mount, while the context is still suspended,
 * which is allowed and is what keeps that first note from paying for it.
 *
 * **It asks for a name and nothing else.** Tempo belongs to the click, because
 * that is the tempo you can actually hear; the key is inferred from what was
 * played; the grid is sixteenths until somebody reading the take back says
 * otherwise. Those were all form fields once, and each of them was a question
 * asked at the exact moment a musical idea was in somebody's hands and leaving.
 * What is left on screen is what a hand uses: octave, velocity, bend, click.
 *
 * The take is derived rather than stored, so a second reading costs nothing:
 * rename it, change the tempo, and the same presses are re-read through
 * [`buildTake`](../../engine/take.ts). That is `transcribe --requantize`, by
 * default, in the page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { INSTRUMENT_NAMES, type InstrumentName } from "@engine/composition";
import { BEND_SEMITONES, DEFAULT_OCTAVE, pianoKeys, scalePitchClasses, shiftOctave } from "@engine/keys";
import {
  armedMessage,
  clickMessage,
  copiedMessage,
  copyFailedMessage,
  downloadedMessage,
  heldMessage,
  legendFor,
  openingMessage,
  playability,
  playableInstruments,
  readyMessage,
  recordLabel,
  recordingMessage,
  savedMessage,
  saveFailedMessage,
  stateLine,
  stoppedMessage,
  takeHeader,
  type RecordState,
} from "@engine/keys-bench";
import { guessKey } from "@engine/key-guess";
import {
  DEFAULT_VELOCITY,
  buildTake,
  stepVelocity,
  summarizeTake,
  takeSlug,
  type BendGesture,
  type KeyPress,
  type Take,
} from "@engine/take";
import {
  SHELF_KEY,
  SHELF_LIMIT,
  forget,
  parseShelf,
  serializeShelf,
  shelve,
  takeFileName,
  takeJson,
} from "@engine/take-shelf";
import { voicesOf, type VoiceEntry } from "@engine/voice-library";
import { TAKE_SAVE_ENDPOINT } from "../../dev/endpoints";
import { BEATS_PER_BAR, Click } from "../audio/metronome";
import { InstrumentTabs } from "../components/InstrumentTabs";
import { PianoKeys } from "../components/PianoKeys";
import { useApi } from "../hooks/useApi";
import { useKeyboardSynth } from "../hooks/useKeyboardSynth";
import { COARSE_POINTER, useMediaQuery } from "../hooks/useMediaQuery";
import { VOICE_LIBRARY } from "../voices";

const PLAYABLE = VOICE_LIBRARY.filter((entry) => playability(entry.preset).playable);
const PLAYABLE_INSTRUMENTS = playableInstruments(INSTRUMENT_NAMES);
const FIRST = PLAYABLE.find((entry) => entry.preset.default) ?? PLAYABLE[0];

/**
 * Whether this browser can hand a *file* to the share sheet.
 *
 * Feature-detected with a real file rather than assumed from the platform:
 * `navigator.share` exists on Android without always accepting files, and the
 * button is only worth showing where the whole gesture works. On iOS this is
 * the best of the three routes out — it ends in Files, Notes, AirDrop or
 * anywhere else the user actually keeps things.
 */
const CAN_SHARE_FILES =
  typeof navigator !== "undefined" &&
  typeof navigator.canShare === "function" &&
  navigator.canShare({ files: [new File([""], "probe.take.json", { type: "application/json" })] });

/**
 * The shelf, read and written through a try/catch.
 *
 * `localStorage` throws rather than returning null in a few real situations —
 * a Safari tab with storage blocked, an origin over quota — and none of them
 * are worth a page that fails to mount. A lost shelf is a take the user still
 * has on screen; a thrown exception here is a black rectangle.
 */
function readShelf(): Take[] {
  try {
    return parseShelf(localStorage.getItem(SHELF_KEY));
  } catch {
    return [];
  }
}

function writeShelf(shelf: readonly Take[]): void {
  try {
    localStorage.setItem(SHELF_KEY, serializeShelf(shelf));
  } catch {
    // Nothing to do and nothing to say: the takes are still on screen.
  }
}

/**
 * Presses, at a tempo, under a name: the one place a take is derived.
 *
 * Reading is cheap and the performance is the thing being kept, so nothing here
 * is stored — rename it or change the tempo and the same presses are read
 * again. That is `transcribe --requantize`, by default, in the page.
 */
function derive(capture: Capture, name: string, bpm: number, voice: VoiceEntry | null): Take {
  return buildTake({
    name: takeSlug(name) || "take",
    presses: capture.presses,
    bends: capture.bends,
    bpm,
    instrument: voice?.instrument ?? "piano",
    voice: voice?.slug,
    startMs: capture.downbeatMs,
  });
}

/** What was played, held as gestures until somebody reads it at a tempo. */
interface Capture {
  presses: KeyPress[];
  bends: BendGesture[];
  /** Where bar 1 was, on the keypress clock. */
  downbeatMs: number;
}

export function Keys() {
  const api = useApi();

  const [instrument, setInstrument] = useState<InstrumentName | null>(FIRST?.instrument ?? null);
  const [voiceId, setVoiceId] = useState<string | null>(FIRST?.id ?? null);

  const [name, setName] = useState("take-1");
  const [bpm, setBpm] = useState(90);
  const [clicking, setClicking] = useState(false);

  const [record, setRecord] = useState<RecordState>("idle");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [status, setStatus] = useState(() => openingMessage(PLAYABLE.length, api.canEdit));

  /**
   * Takes this device is holding, on a build with no dev server to write them.
   *
   * Loaded before the first paint rather than in an effect: the reason the
   * shelf exists is a phone that discarded the tab mid-session, and the user
   * should see their takes in the same frame as the keyboard. See
   * [`@engine/take-shelf`](../../engine/take-shelf.ts).
   */
  const [shelf, setShelf] = useState<Take[]>(readShelf);

  /** A finger, not a mouse — which changes the legend, not the layout. */
  const coarse = useMediaQuery(COARSE_POINTER);

  const selected = PLAYABLE.find((entry) => entry.id === voiceId) ?? null;

  const synth = useKeyboardSynth({
    enabled: selected !== null,
    onTransport: (action) => {
      if (action === "toggle") toggleRecording();
      else setStatus("Panic — everything released.");
    },
  });

  // The click outlives every render and is driven from callbacks, so it and the
  // flags those callbacks read are refs rather than state.
  const click = useRef<Click | null>(null);
  if (click.current === null) click.current = new Click();
  const armed = useRef(false);
  const startLog = useRef(synth.startLog);
  startLog.current = synth.startLog;

  /**
   * The downbeat handler, registered once.
   *
   * This is the whole of what replaced the count-in setting: a click that is
   * already running *is* the count-in, so arming waits for its next bar rather
   * than counting one of its own.
   */
  useEffect(() => {
    click.current?.listen({
      onBeat: (beatInBar, atMs) => {
        if (beatInBar !== 0 || !armed.current) return;
        armed.current = false;
        startLog.current();
        pendingDownbeat.current = atMs;
        setRecord("recording");
        setStatus(recordingMessage(0));
      },
    });
  }, []);
  const pendingDownbeat = useRef(0);

  // Keys of the scale are drawn bright and the rest shaded, against whatever key
  // the notes so far suggest. It is a hint while you hunt for a note; it never
  // stops one being played.
  const scale = useMemo(() => {
    const played = capture?.presses.map((press) => press.midi) ?? [];
    if (played.length === 0) return undefined;
    const key = guessKey(played);
    return scalePitchClasses(key.tonic, key.mode);
  }, [capture]);

  const keys = useMemo(() => pianoKeys(synth.octave), [synth.octave]);

  /**
   * The take, re-derived whenever the reading changes.
   *
   * An unusable reading becomes a message rather than an exception: the
   * performance is still fine and the fix is one field away.
   */
  const reading = useMemo((): { take: Take; summary: string } | { error: string } | null => {
    if (!capture || capture.presses.length === 0) return null;
    try {
      const take = derive(capture, name, bpm, selected);
      return { take, summary: summarizeTake(take) };
    } catch (err) {
      return { error: (err as Error).message };
    }
    // `selected` is rebuilt each render; its identity is not the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture, name, bpm, selected?.id]);

  /**
   * Put the selected voice under the hands, on mount and on every change.
   *
   * Runs whether or not the context is awake: Tone nodes can be built against a
   * suspended context, and building them now is what lets the first keypress be
   * a note rather than a graph construction. Nothing here makes a sound, so
   * nothing here needs a gesture.
   */
  useEffect(() => {
    if (!selected) return;
    try {
      synth.use(selected.instrument, selected.slug);
      setStatus(readyMessage(selected.id, playability(selected.preset).note));
    } catch (err) {
      setStatus(`Could not load ${selected.id}: ${(err as Error).message}`);
    }
    // `selected` is rebuilt each render; the voice it names is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  /**
   * The click is the one control that makes a sound without a key being played,
   * so it is the one that has to wake the audio itself. Pressing the button is
   * the gesture that permits it.
   */
  async function toggleClick(): Promise<void> {
    if (clicking) {
      click.current?.stop();
      setClicking(false);
      setStatus(clickMessage(false, bpm));
      return;
    }
    await synth.wake();
    click.current?.start(bpm);
    setClicking(true);
    setStatus(clickMessage(true, bpm));
  }

  /** Tempo is the click's, so changing it moves the pulse under your hands at once. */
  function changeBpm(next: number): void {
    setBpm(next);
    click.current?.setBpm(next);
  }

  function toggleRecording(): void {
    if (record === "idle") startRecording();
    else stopRecording();
  }

  function startRecording(): void {
    setCapture(null);
    if (clicking) {
      // Wait for the bar line. The click's callback does the rest.
      armed.current = true;
      setRecord("armed");
      setStatus(armedMessage(bpm));
      return;
    }
    // No click, nothing to wait for: bar 1 is now, and the grid is whatever the
    // tempo field says it was.
    synth.startLog();
    pendingDownbeat.current = performance.now();
    setRecord("recording");
    setStatus(recordingMessage(0));
  }

  function stopRecording(): void {
    armed.current = false;
    const { presses, bends } = synth.stopLog();
    setRecord("idle");
    const stopped = { presses, bends, downbeatMs: pendingDownbeat.current };
    setCapture(stopped);
    setStatus(stoppedMessage(presses.length, api.canEdit));
    // Shelved the moment it stops, before anybody decides what to do with it.
    // A take that only exists in React state is a take a backgrounded phone
    // throws away, and the hands that played it have moved on.
    if (!api.canEdit) {
      const take = read(stopped);
      if (take) setShelf((held) => shelve(held, take));
    }
  }

  /**
   * The take a capture reads as right now, or nothing if it cannot be read.
   *
   * The same derivation the summary is made of, reached without waiting for a
   * render — `stopRecording` needs the take in the same tick it sets the
   * capture, and an unreadable one is a message rather than a throw.
   */
  function read(from: Capture): Take | null {
    try {
      return derive(from, name, bpm, selected);
    } catch {
      return null;
    }
  }

  async function save(): Promise<void> {
    if (!reading || "error" in reading) return;
    try {
      const body = await api.post<{ path: string }>(TAKE_SAVE_ENDPOINT, { take: reading.take });
      setStatus(savedMessage(body.path));
    } catch (err) {
      setStatus(saveFailedMessage((err as Error).message));
    }
  }

  /**
   * The same handoff from a build that has no server behind it.
   *
   * A browser can put a file in exactly two places without one — the downloads
   * folder and the clipboard — and which of them works is the platform's
   * business, not ours. So both are offered, plus the share sheet where there
   * is one, which is the only route on iOS that ends anywhere a person chooses.
   * All three shelve first: the take should survive the user tapping the wrong
   * one.
   */
  function download(take: Take): void {
    setShelf((held) => shelve(held, take));
    const url = URL.createObjectURL(new Blob([takeJson(take)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = takeFileName(take);
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked on the next turn of the loop: revoking it in this one races the
    // navigation the click just started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(downloadedMessage(takeFileName(take)));
  }

  async function copy(take: Take): Promise<void> {
    setShelf((held) => shelve(held, take));
    try {
      await navigator.clipboard.writeText(takeJson(take));
      setStatus(copiedMessage(takeFileName(take)));
    } catch (err) {
      setStatus(copyFailedMessage((err as Error).message));
    }
  }

  async function share(take: Take): Promise<void> {
    setShelf((held) => shelve(held, take));
    const file = new File([takeJson(take)], takeFileName(take), { type: "application/json" });
    try {
      await navigator.share({ files: [file], title: takeFileName(take) });
      setStatus(`Shared ${takeFileName(take)}.`);
    } catch (err) {
      // A cancelled share sheet throws the same way a failed one does, and
      // "you cancelled" is not news. Only say something if it never opened.
      if ((err as Error).name !== "AbortError") setStatus(`Could not share: ${(err as Error).message}`);
    }
  }

  // The note count while they are being played.
  useEffect(() => {
    if (record === "recording") setStatus(recordingMessage(synth.logged));
  }, [record, synth.logged]);

  // Every change to the shelf goes straight to disk. It is a few tens of
  // kilobytes and the thing it is insuring against is the tab disappearing, so
  // there is nothing to gain by batching it.
  useEffect(() => {
    writeShelf(shelf);
  }, [shelf]);

  // What was waiting when the app opened. Said once, on mount, because it is
  // the only way to find out that a discarded session left something behind.
  useEffect(() => {
    if (!api.canEdit && shelf.length > 0) setStatus(heldMessage(shelf.length));
    // Mount only: this is the opening line, not a running commentary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The click is on the shared transport and must not outlive the page.
  useEffect(() => {
    const running = click.current;
    return () => running?.stop();
  }, []);

  const voices = voicesOf(PLAYABLE, instrument);
  const savable = api.canEdit && reading !== null && !("error" in reading);
  /** The take as it currently reads, or nothing to hand over yet. */
  const current = reading !== null && !("error" in reading) ? reading.take : null;

  return (
    <main>
      <h1>
        keys — play it, record it, hand it over
        {/* The standalone app is one page. The other benches read the library
            off the dev server and are not deployed with it, so linking to them
            there is three links to a 404. */}
        {!__KEYS_APP__ && (
          <>
            <a href="/index.html">compositions →</a>
            <a href="/session.html">session →</a>
            <a href="/voices.html">voices →</a>
          </>
        )}
      </h1>

      <InstrumentTabs
        entries={PLAYABLE}
        instrument={instrument}
        names={PLAYABLE_INSTRUMENTS}
        onPick={(picked) => setInstrument(picked)}
      />

      <div className="row" id="voicePick">
        <label htmlFor="voice">voice</label>
        <select
          id="voice"
          value={voiceId ?? ""}
          onChange={(event) => setVoiceId(event.target.value)}
        >
          {voices.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id}
              {entry.preset.default ? " (default)" : ""}
            </option>
          ))}
        </select>
      </div>

      <p id="state">
        {stateLine(synth.octave, synth.velocity, synth.heldMidis.size, synth.bendSemitones * 100)}
      </p>

      <PianoKeys
        keys={keys}
        held={synth.heldMidis}
        scale={scale}
        onPress={synth.press}
        onRelease={synth.release}
      />

      <p id="legend">{legendFor(coarse)}</p>

      <div id="controls">
        <div className="group" role="group" aria-label="Octave">
          <span className="what">octave</span>
          <button type="button" onClick={() => synth.setOctave(shiftOctave(synth.octave, -1))}>
            −
          </button>
          <span className="value">{synth.octave}</span>
          <button type="button" onClick={() => synth.setOctave(shiftOctave(synth.octave, 1))}>
            +
          </button>
          {/* "C4" on a phone: the words cost a row of the control strip, and
              the state line above already spells out what the octave means. */}
          <button type="button" onClick={() => synth.setOctave(DEFAULT_OCTAVE)}>
            {coarse ? `C${DEFAULT_OCTAVE}` : "middle C"}
          </button>
        </div>

        {/*
          Velocity has buttons for the same reason octave does, and one more:
          the arrow keys that used to be its only control do not exist on a
          phone, so without these a touch device could only ever play at 0.8.
        */}
        <div className="group" role="group" aria-label="Velocity">
          <span className="what">velocity</span>
          <button
            type="button"
            onClick={() => synth.setVelocity(stepVelocity(synth.velocity, -1))}
            aria-label="Softer"
          >
            −
          </button>
          <span className="value">{synth.velocity.toFixed(1)}</span>
          <button
            type="button"
            onClick={() => synth.setVelocity(stepVelocity(synth.velocity, 1))}
            aria-label="Harder"
          >
            +
          </button>
          <button type="button" onClick={() => synth.setVelocity(DEFAULT_VELOCITY)}>
            mid
          </button>
        </div>

        {/*
          Bend held rather than toggled — press, hold, release, exactly like the
          F and K keys and exactly like a string. A click-to-bend button would be
          a different gesture that recorded the same way, which is worse than not
          having one.
        */}
        <div className="group" role="group" aria-label="Bend">
          <span className="what">bend</span>
          <button
            type="button"
            className={synth.bendSemitones < 0 ? "bending" : ""}
            title={`Bend down ${BEND_SEMITONES} semitones (hold F)`}
            onPointerDown={() => synth.bend(-BEND_SEMITONES)}
            onPointerUp={() => synth.bend(0)}
            onPointerLeave={() => synth.bendSemitones < 0 && synth.bend(0)}
          >
            {/* The letter is the key that does this. There is no letter key on
                a phone, and naming one is an instruction that cannot be followed. */}
            {coarse ? "↓" : "↓ F"}
          </button>
          <button
            type="button"
            className={synth.bendSemitones > 0 ? "bending" : ""}
            title={`Bend up ${BEND_SEMITONES} semitones (hold K)`}
            onPointerDown={() => synth.bend(BEND_SEMITONES)}
            onPointerUp={() => synth.bend(0)}
            onPointerLeave={() => synth.bendSemitones > 0 && synth.bend(0)}
          >
            {coarse ? "↑" : "↑ K"}
          </button>
        </div>

        <div className="group" role="group" aria-label="Click">
          <button
            type="button"
            className={clicking ? "on" : ""}
            onClick={toggleClick}
            title="A pulse to play against. Never recorded."
          >
            {clicking ? "click on" : "click off"}
          </button>
          <input
            type="number"
            min={30}
            max={240}
            value={bpm}
            aria-label="Beats per minute"
            onChange={(event) => changeBpm(Number(event.target.value))}
          />
          <span className="what">BPM · {BEATS_PER_BAR}/4</span>
        </div>
      </div>

      <div className="row" id="transport">
        <button
          type="button"
          className={record === "recording" ? "recording" : record === "armed" ? "armed" : ""}
          onClick={toggleRecording}
        >
          {recordLabel(record)}
        </button>
        <label htmlFor="takeName" className="what">
          name
        </label>
        <input id="takeName" value={name} onChange={(event) => setName(event.target.value)} />
        {api.canEdit ? (
          <button type="button" onClick={save} disabled={!savable}>
            Save take
          </button>
        ) : (
          <>
            <button type="button" onClick={() => current && download(current)} disabled={!current}>
              Download
            </button>
            <button type="button" onClick={() => current && void copy(current)} disabled={!current}>
              Copy
            </button>
            {CAN_SHARE_FILES && (
              <button type="button" onClick={() => current && void share(current)} disabled={!current}>
                Share
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => setCapture(null)}
          disabled={capture === null || record !== "idle"}
        >
          Discard
        </button>
      </div>

      <pre id="summary">
        {reading === null
          ? "Nothing recorded yet. Turn the click on, press Record, and play from the next downbeat."
          : "error" in reading
            ? reading.error
            : `${takeHeader(reading.take)}\n\n${reading.summary}`}
      </pre>

      {/*
        Everything this device is still holding. Only on a build with no dev
        server: where there is one, a take goes to `recordings/keys/` and the
        shelf would be a second, worse copy of a folder that already exists.
      */}
      {!api.canEdit && shelf.length > 0 && (
        <div id="shelf">
          <p className="what">
            held on this device — {shelf.length}/{SHELF_LIMIT}
          </p>
          <ul>
            {shelf.map((held) => (
              <li key={`${held.name}-${held.recordedAt}`}>
                <span className="held">
                  {held.name} · {held.notes.length} notes · {held.bpm} BPM · {held.key}
                </span>
                <button type="button" onClick={() => download(held)}>
                  ↓
                </button>
                <button type="button" onClick={() => void copy(held)}>
                  copy
                </button>
                {CAN_SHARE_FILES && (
                  <button type="button" onClick={() => void share(held)}>
                    share
                  </button>
                )}
                <button
                  type="button"
                  className="forget"
                  aria-label={`Forget ${held.name}`}
                  onClick={() => setShelf((all) => forget(all, held.name))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p id="status">{status}</p>
    </main>
  );
}
