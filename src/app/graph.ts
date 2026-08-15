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
import { isDry, signalChain } from "@engine/signal";
import { impulseResponse } from "@utils/impulse";
import { buildEffects } from "./effects";
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

/**
 * The shared lo-fi bed, with two ways in.
 *
 * `input` is the normal one: wobble → low-pass → the room. `dry` skips only the
 * room, joining after the reverb, so a track that asked to stay dry still gets
 * the tape colour and the noise floor that make the piece sound like one
 * recording — it just isn't put in a hall it was never in.
 */
function buildLoFiChain(lofi: LoFiSettings | undefined): {
  input: Tone.ToneAudioNode;
  dry: Tone.ToneAudioNode;
} {
  const input = new Tone.Gain(1);
  const dry = new Tone.Gain(1);
  const lowpass = new Tone.Filter(lofi?.lowpassHz ?? 3200, "lowpass");
  const dryLowpass = new Tone.Filter(lofi?.lowpassHz ?? 3200, "lowpass");
  const reverb = buildReverb(lofi?.reverb ?? 0.25);

  let tail: Tone.ToneAudioNode = input;
  if (lofi?.wobble && lofi.wobble > 0) {
    const wobble = new Tone.Vibrato({ frequency: 0.6, depth: lofi.wobble * 0.1 });
    tail.connect(wobble);
    tail = wobble;
  }
  tail.chain(lowpass, reverb.input);
  reverb.output.connect(Tone.getDestination());
  dry.chain(dryLowpass, Tone.getDestination());

  if (lofi?.vinyl) {
    // Faint crackle/noise floor mixed straight into the chain input.
    const noise = new Tone.Noise("pink");
    const noiseGain = new Tone.Gain(0.008);
    noise.connect(noiseGain);
    noiseGain.connect(input);
    noise.start();
  }
  return { input, dry };
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
  // Tone reads "bars:beats:sixteenths" against this, so it has to be set before
  // any part is scheduled — otherwise a 3/4 piece places every bar after the
  // first a beat late, and the render is silently wrong rather than broken.
  if (comp.meter) transport.timeSignature = [comp.meter[0], comp.meter[1]];

  const { input: chainInput, dry: dryInput } = buildLoFiChain(comp.lofi);

  for (const track of comp.tracks) {
    // `track.voice` names one of the instrument's presets in `voices/`; omitted
    // means its default, so a piece written before voices existed is unchanged.
    const voice = createVoice(track.instrument, track.voice);
    const trackGain = new Tone.Gain(track.gain ?? 1);

    // The track's own signal chain, from the timbre that shaped it. This is
    // where `fuzz` and `plate-reverb` stop being prose. It sits between the
    // instrument and the track gain, so gain still means "how loud is this
    // part" and not "how driven" — and it is per track, because distortion
    // belongs to the guitar and would ruin the drums summed with it.
    const fx = buildEffects(signalChain(track.fx ?? []));
    voice.output.connect(fx.input);

    // Pan last, so the whole processed part moves together rather than the dry
    // half of a wet/dry mix moving without its ambience.
    let tail: Tone.ToneAudioNode = fx.output;
    if (track.pan !== undefined && track.pan !== 0) {
      const panner = new Tone.Panner(track.pan);
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(trackGain);

    // A track that asked to stay dry bypasses the shared ambience but keeps the
    // rest of the bed. `desert-fuzz` ends on `dry` precisely to say "small amp,
    // close mic, no room", and drowning that in a house reverb erases the one
    // thing the palette is about.
    trackGain.connect(isDry(track.fx ?? []) ? dryInput : chainInput);

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
