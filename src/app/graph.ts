/**
 * Wires a Composition into a Tone.js graph: instruments -> per-track gain ->
 * shared lo-fi chain -> destination, and schedules every note on the transport.
 *
 * The same builder runs live (audition) and inside Tone.Offline (WAV render),
 * because Tone.Offline swaps the global context for the duration of its
 * callback, so nodes created here bind to whichever context is active.
 *
 * Browser-only glue; the tested brains (timing, arrangement, validation, wav)
 * live in engine/ and utils/.
 */
import * as Tone from "tone";
import type { Composition, LoFiSettings } from "@engine/composition";
import { createInstrument } from "./instruments";

function buildLoFiChain(lofi: LoFiSettings | undefined): Tone.ToneAudioNode {
  const input = new Tone.Gain(1);
  const lowpass = new Tone.Filter(lofi?.lowpassHz ?? 3200, "lowpass");
  const reverb = new Tone.Reverb({ decay: 4, wet: lofi?.reverb ?? 0.25 });

  let tail: Tone.ToneAudioNode = input;
  if (lofi?.wobble && lofi.wobble > 0) {
    const wobble = new Tone.Vibrato({ frequency: 0.6, depth: lofi.wobble * 0.1 });
    tail.connect(wobble);
    tail = wobble;
  }
  tail.chain(lowpass, reverb, Tone.getDestination());

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
 * Does NOT start the transport — caller decides (live vs offline).
 */
export function scheduleComposition(comp: Composition): void {
  const transport = Tone.getTransport();
  transport.bpm.value = comp.bpm;

  const chainInput = buildLoFiChain(comp.lofi);

  for (const track of comp.tracks) {
    const instrument = createInstrument(track.instrument);
    const trackGain = new Tone.Gain(track.gain ?? 1);
    instrument.connect(trackGain);
    trackGain.connect(chainInput);

    const events = track.notes.map((n) => ({
      time: n.time,
      pitch: n.pitch,
      duration: n.duration,
      velocity: n.velocity ?? 0.7,
    }));

    new Tone.Part((time, ev) => {
      instrument.triggerAttackRelease(ev.pitch, ev.duration, time, ev.velocity);
    }, events).start(0);
  }
}
