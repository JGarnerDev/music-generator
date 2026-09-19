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
 * **A kit is not a keyboard.** Pick a drums voice and the piano is replaced by
 * a grid of pads, one per piece the kit voices — because a kit piece is a name
 * rather than a note, so there is no low-to-high to lay out and no octave to
 * move. Which pads exist is
 * [`@engine/pads`](../../engine/pads.ts); the keyboard's letter keys become the
 * pad grid while one is loaded.
 *
 * **The monitor is the one setting that hides.** What the page is being heard
 * *on* is not something a hand reaches for mid-phrase, so it sits behind the
 * hamburger rather than beside the octave — and it is remembered per device,
 * because the speakers are a property of the device and not of the music. It
 * corrects nothing but the monitoring path: see
 * [`@engine/monitor`](../../engine/monitor.ts).
 *
 * The take is derived rather than stored, so a second reading costs nothing:
 * rename it, change the tempo, and the same presses are re-read through
 * [`buildTake`](../../engine/take.ts). That is `transcribe --requantize`, by
 * default, in the page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { pianoKeys, scalePitchClasses, shiftOctave } from "@engine/keys";
import { playability } from "@engine/keys-bench";
import { guessKey } from "@engine/key-guess";
import { defaultMonitor, isMonitorId, type MonitorId } from "@engine/monitor";
import { drumPads, padPlayable } from "@engine/pads";
import { type VoiceEntry } from "@engine/voice-library";
import { DrumPads } from "../components/DrumPads";
import { KeysMenu } from "../components/KeysMenu";
import { PianoKeys } from "../components/PianoKeys";
import { useKeyboardSynth } from "../hooks/useKeyboardSynth";
import { COARSE_POINTER, useMediaQuery } from "../hooks/useMediaQuery";
import { VOICE_LIBRARY } from "../voices";

/**
 * The shelf: everything a hand can play, pitched or struck.
 *
 * Two questions rather than one, because they are two instruments.
 * `playability` asks whether a keyboard can play a preset — and says no to a
 * kit, correctly, since a key would have no pitch to sound. `padPlayable` asks
 * the question a kit answers yes to.
 */
const PLAYABLE = VOICE_LIBRARY.filter(
  (entry) => playability(entry.preset).playable || padPlayable(entry.preset),
);
const FIRST = PLAYABLE.find((entry) => entry.preset.default) ?? PLAYABLE[0];

/**
 * The monitor, remembered per browser.
 *
 * Per device rather than in a file, for the reason the session board's fader is:
 * the same instrument played on a phone and through headphones wants different
 * monitoring, and neither answer belongs to the music.
 */
const MONITOR_KEY = "music-generator.keys.monitor";

function storedMonitor(): MonitorId | null {
  try {
    const held = window.localStorage.getItem(MONITOR_KEY);
    return isMonitorId(held) ? held : null;
  } catch {
    // Private browsing or a locked-down profile: fall back to the device default.
    return null;
  }
}

function rememberMonitor(id: MonitorId): void {
  try {
    window.localStorage.setItem(MONITOR_KEY, id);
  } catch {
    // It still applies, it just does not survive a reload. Not worth a message
    // in the middle of playing something.
  }
}

export function Keys() {
  const [voiceId, setVoiceId] = useState<string | null>(FIRST?.id ?? null);
  const coarsePointer = useMediaQuery(COARSE_POINTER);
  // Read once: what is stored, else what this device should start at. A phone
  // that has never been told starts corrected, because the first thing it would
  // otherwise play is the problem the correction exists for.
  const [monitor, setMonitor] = useState<MonitorId | null>(() => storedMonitor());
  const chosen = monitor ?? defaultMonitor(coarsePointer);

  const selected = PLAYABLE.find((entry) => entry.id === voiceId) ?? null;

  // Empty for a pitched voice, which is what leaves the letter keys a piano.
  const pads = useMemo(() => (selected ? drumPads(selected.preset) : []), [selected]);

  const synth = useKeyboardSynth({
    enabled: selected !== null,
    pads,
  });

  const scale = useMemo(() => {
    return undefined;
  }, []);

  const keys = useMemo(() => pianoKeys(synth.octave), [synth.octave]);

  // After `use`, not before: loading a voice rebuilds the chain the monitor
  // hangs off, so the correction has to be re-applied to the graph that exists
  // now rather than the one that did when the toggle was moved.
  useEffect(() => {
    synth.setMonitor(chosen);
  }, [synth, chosen, selected?.id]);

  useEffect(() => {
    if (!selected) return;
    try {
      synth.use(selected.instrument, selected.slug);
    } catch (err) {
      console.error(`Could not load ${selected.id}: ${(err as Error).message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  return (
    <main>
      <div className="row" id="topControls">
        <KeysMenu
          monitor={chosen}
          onMonitor={(id) => {
            setMonitor(id);
            rememberMonitor(id);
          }}
        />

        <div id="voicePick">
          <label htmlFor="voice">voice</label>
          <select
            id="voice"
            value={voiceId ?? ""}
            onChange={(event) => setVoiceId(event.target.value)}
          >
            {PLAYABLE.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id}
                {entry.preset.default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>

        {pads.length === 0 ? (
          <div className="group" role="group" aria-label="Octave">
            <span className="what">octave</span>
            <button type="button" onClick={() => synth.setOctave(shiftOctave(synth.octave, -1))}>
              −
            </button>
            <span className="value">{synth.octave}</span>
            <button type="button" onClick={() => synth.setOctave(shiftOctave(synth.octave, 1))}>
              +
            </button>
          </div>
        ) : null}
      </div>

      {pads.length > 0 ? (
        <DrumPads pads={pads} struck={synth.struck} onHit={synth.hit} />
      ) : (
        <PianoKeys
          keys={keys}
          held={synth.heldMidis}
          scale={scale}
          onPress={synth.press}
          onRelease={synth.release}
        />
      )}
    </main>
  );
}
