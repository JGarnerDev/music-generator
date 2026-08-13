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
import { loopWindowSeconds } from "@engine/arrange";
import { createVoice } from "./instruments";

export interface ScheduleOptions {
  /**
   * Cycle the composition's loop window forever (game-style playback): the intro
   * bars play once, then the body repeats. Ignored when the piece has no `loop`.
   * Off for offline renders, which walk the timeline once.
   */
  loop?: boolean;
}

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
export function scheduleComposition(comp: Composition, opts: ScheduleOptions = {}): void {
  const transport = Tone.getTransport();
  transport.bpm.value = comp.bpm;

  const window = opts.loop ? loopWindowSeconds(comp) : null;
  if (window) {
    // Notes that ring past loopEnd keep ringing while the body restarts, which is
    // the live equivalent of the tail-wrap the WAV exporter does.
    transport.loop = true;
    transport.loopStart = window.start;
    transport.loopEnd = window.end;
  } else {
    transport.loop = false;
  }

  const chainInput = buildLoFiChain(comp.lofi);

  for (const track of comp.tracks) {
    const voice = createVoice(track.instrument);
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
