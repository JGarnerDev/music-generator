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
import { pianoKeys, scalePitchClasses, shiftOctave } from "@engine/keys";
import { playability } from "@engine/keys-bench";
import { guessKey } from "@engine/key-guess";
import { type VoiceEntry } from "@engine/voice-library";
import { PianoKeys } from "../components/PianoKeys";
import { useKeyboardSynth } from "../hooks/useKeyboardSynth";
import { VOICE_LIBRARY } from "../voices";

const PLAYABLE = VOICE_LIBRARY.filter((entry) => playability(entry.preset).playable);
const FIRST = PLAYABLE.find((entry) => entry.preset.default) ?? PLAYABLE[0];

export function Keys() {
  const [voiceId, setVoiceId] = useState<string | null>(FIRST?.id ?? null);

  const selected = PLAYABLE.find((entry) => entry.id === voiceId) ?? null;

  const synth = useKeyboardSynth({
    enabled: selected !== null,
  });

  const scale = useMemo(() => {
    return undefined;
  }, []);

  const keys = useMemo(() => pianoKeys(synth.octave), [synth.octave]);

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
      <div id="voicePick">
        {PLAYABLE.map((entry) => (
          <button
            key={entry.id}
            className={voiceId === entry.id ? "voice-btn active" : "voice-btn"}
            onClick={() => setVoiceId(entry.id)}
          >
            {entry.id}
          </button>
        ))}
      </div>

      <PianoKeys
        keys={keys}
        held={synth.heldMidis}
        scale={scale}
        onPress={synth.press}
        onRelease={synth.release}
      />

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
        </div>
      </div>
    </main>
  );
}
