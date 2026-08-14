/**
 * Wires a Composition into a Tone.js graph: instruments -> per-track gain ->
 * shared lo-fi chain -> destination, and schedules every note on the transport.
 *
 * This runs **only inside `Tone.Offline`** (`render.ts`) — playback plays the
 * rendered buffer rather than this graph, so nothing here has to keep up with a
 * realtime deadline. Tone.Offline swaps the global context for the duration of
 * its callback, so nodes created here bind to the offline context.
 *
 * Browser-only glue; the tested brains (timing, arrangement, validation, wav)
 * live in engine/ and utils/.
 */
import * as Tone from "tone";
import type { Composition, LoFiSettings } from "@engine/composition";
import { impulseResponse } from "@utils/impulse";
import { createVoice } from "./instruments";

/** Seconds of reverb tail. Must stay <= render.ts's TAIL_SECONDS. */
const REVERB_DECAY = 4;

/**
 * A `Convolver` fed a pre-generated IR, not a `Reverb`.
 *
 * `Tone.Reverb` generates its own IR by rendering noise in a nested offline
 * context, from its constructor, asynchronously — which means it can still be
 * empty when the render that needs it begins, and it is seeded from
 * `Math.random`, so the same piece renders differently every time. The IR is
 * plain decaying noise, so `@utils/impulse` makes it directly: synchronous, and
 * identical for the same input.
 *
 * A bare `Convolver` is 100% wet, so the dry/wet balance `Reverb` used to
 * provide is rebuilt here as an equal-power `CrossFade` — the same thing
 * `Effect` does internally.
 */
function buildReverb(wet: number): { input: Tone.ToneAudioNode; output: Tone.ToneAudioNode } {
  const ir = impulseResponse({
    decay: REVERB_DECAY,
    sampleRate: Tone.getContext().sampleRate,
  });
  const input = new Tone.Gain(1);
  const convolver = new Tone.Convolver(Tone.ToneAudioBuffer.fromArray(ir));
  const mix = new Tone.CrossFade(wet);
  input.connect(mix.a);
  input.chain(convolver, mix.b);
  return { input, output: mix };
}

function buildLoFiChain(lofi: LoFiSettings | undefined): Tone.ToneAudioNode {
  const input = new Tone.Gain(1);
  const lowpass = new Tone.Filter(lofi?.lowpassHz ?? 3200, "lowpass");
  const reverb = buildReverb(lofi?.reverb ?? 0.25);

  let tail: Tone.ToneAudioNode = input;
  if (lofi?.wobble && lofi.wobble > 0) {
    const wobble = new Tone.Vibrato({ frequency: 0.6, depth: lofi.wobble * 0.1 });
    tail.connect(wobble);
    tail = wobble;
  }
  tail.chain(lowpass, reverb.input);
  reverb.output.connect(Tone.getDestination());

  if (lofi?.vinyl) {
    // Faint crackle/noise floor mixed straight into the chain input.
    const noise = new Tone.Noise("pink");
    const noiseGain = new Tone.Gain(0.008);
    noise.connect(noiseGain);
    noiseGain.connect(input);
    noise.start();
  }
  return input;
}

/**
 * Build instruments + effects and schedule all notes onto the current transport.
 * Does NOT start the transport — the renderer starts it, at an offset when it
 * wants the loop body rather than the whole timeline.
 *
 * The timeline is always walked once. Looping is not a graph concern any more:
 * the renderer folds the tail back onto the head and the player repeats the
 * finished buffer.
 */
export function scheduleComposition(comp: Composition): void {
  const transport = Tone.getTransport();
  transport.bpm.value = comp.bpm;
  transport.loop = false;

  const chainInput = buildLoFiChain(comp.lofi);

  for (const track of comp.tracks) {
    // `track.voice` names one of the instrument's presets in `voices/`; omitted
    // means its default, so a piece written before voices existed is unchanged.
    const voice = createVoice(track.instrument, track.voice);
    const trackGain = new Tone.Gain(track.gain ?? 1);
    // The voice's own effects sit between the synth and the track gain, so a
    // track's gain still means "how loud is this part", not "how driven".
    voice.output.connect(trackGain);
    trackGain.connect(chainInput);

    const events = track.notes.map((n) => ({
      time: n.time,
      pitch: n.pitch,
      duration: n.duration,
      velocity: n.velocity ?? 0.7,
    }));

    new Tone.Part((time, ev) => {
      voice.play.triggerAttackRelease(ev.pitch, ev.duration, time, ev.velocity);
    }, events).start(0);
  }
}
