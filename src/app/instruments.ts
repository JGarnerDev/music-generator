/**
 * Instrument factory. Synth-based so the app makes sound with zero downloaded
 * sample packs — good enough to audition a piece instantly. Swap individual
 * instruments for `smplr` sampled sources later without touching the graph.
 *
 * Browser-only (constructs Tone nodes); kept thin and logic-free so it needs no
 * unit tests — the pure decisions live in the engine.
 */
import * as Tone from "tone";
import type { InstrumentName } from "@engine/composition";
import { DrumKit } from "./drums";

export type Playable = Tone.PolySynth | Tone.Sampler | DrumKit;

/**
 * A voice is what you trigger plus where its sound comes *out*, because an
 * instrument with its own effects no longer ends at the synth. Connect
 * `output` downstream; trigger notes on `play`.
 */
export interface Voice {
  play: Playable;
  output: { connect(destination: Tone.InputNode): unknown };
}

/**
 * An instrument and its own signal chain, ready to be connected to the mix.
 *
 * Per-instrument tone lives here rather than in the shared lo-fi chain in
 * `graph.ts`: distortion belongs to the guitar, not to the drums that would be
 * ruined by it.
 */
export function createVoice(name: InstrumentName): Voice {
  const play = createInstrument(name);
  if (name === "pluck") return { play, output: guitarAmp(play as Tone.PolySynth) };
  return { play, output: play };
}

/**
 * The guitar rig — the `brown-sound` timbre palette's chain, in order:
 * tighten → sag → preamp → tone stack → power amp → cab → width → slap echo.
 * Order is the whole trick; the same blocks rearranged are a different
 * instrument.
 *
 * Three things separate this from "synth with a fuzz pedal":
 *
 * 1. **Cut the lows before the drive, not after.** Distortion multiplies
 *    whatever it is fed against itself, so low strings hitting it intermodulate
 *    into mud. Every tight metal tone high-passes going *in* and lets the bass
 *    guitar own everything under ~170 Hz.
 * 2. **Two mild stages beat one hard one.** A preamp saturating into a tone
 *    stack into a gently clipping power amp is how an amplifier actually
 *    distorts; a single hard waveshaper is what a cartoon guitar sounds like.
 * 3. **The speaker is the loudest thing in the chain.** A real cab is a brick
 *    wall (-48 dB) a bit above 4 kHz with a presence bump under it. Fizz above
 *    that range is the biggest tell of a fake guitar.
 *
 * **This runs in realtime, so it is built to a CPU budget.** Two full amps —
 * genuine double-tracking — is the better sound and it glitched: the graph
 * builds one rig per *track*, and this project's plans give the guitar two
 * (rhythm + lead). The width instead comes from splitting after the cab, one
 * side delayed 13 ms, which is a Haas pair rather than two performances but
 * costs two nodes instead of a second amplifier. Oversampling is likewise spent
 * only where it shows: on the preamp, which is doing the actual clipping.
 */
function guitarAmp(source: Tone.PolySynth): Tone.ToneAudioNode {
  const input = new Tone.Gain(1.7);
  const tighten = new Tone.Filter(170, "highpass");
  // Variac sag: supply voltage dips on a hard hit, so the attack compresses and
  // blooms back instead of spiking. Gentle on purpose — a hard ratio here rides
  // the level down through the dense sections and reads as the music decaying.
  const sag = new Tone.Compressor({ threshold: -16, ratio: 2.5, attack: 0.004, release: 0.25 });
  const preamp = new Tone.Distortion({ distortion: 0.5, oversample: "2x" });
  // Mid-forward, not scooped — scooped metal guitar disappears under the bass.
  const toneStack = new Tone.EQ3({
    low: -5,
    mid: 3.5,
    high: -6,
    lowFrequency: 220,
    highFrequency: 2800,
  });
  const powerAmp = new Tone.Distortion({ distortion: 0.18, oversample: "none" });
  const cab = new Tone.Filter({ frequency: 4400, type: "lowpass", rolloff: -48 });
  const presence = new Tone.Filter({ type: "peaking", frequency: 2300, Q: 1.2, gain: 3.5 });
  const body = new Tone.Filter(105, "highpass");
  const sum = new Tone.Gain(0.42);

  source.chain(input, tighten, sag, preamp, toneStack, powerAmp, cab, presence, body);

  // Width: the same cab hard left, and 13 ms later hard right. Short enough to
  // read as one guitar in a room, long enough that it is not just "loud centre".
  const left = new Tone.Panner(-0.6);
  const right = new Tone.Panner(0.6);
  const lag = new Tone.Delay(0.013);
  body.connect(left);
  body.chain(lag, right);
  left.connect(sum);
  right.connect(sum);

  const slap = new Tone.FeedbackDelay({ delayTime: 0.075, feedback: 0.12, wet: 0.09 });
  sum.connect(slap);
  return slap;
}

function createInstrument(name: InstrumentName): Playable {
  switch (name) {
    case "drums":
      return new DrumKit();
    case "piano":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 1.6 },
      });
    case "epiano":
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 6,
        envelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 1.2 },
      });
    case "pad":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.8, decay: 1.5, sustain: 0.7, release: 3 },
      });
    case "bass":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.6 },
      });
    case "pluck": {
      // The guitar, played through `guitarAmp`. A `MonoSynth` rather than a
      // plain `Synth` for one reason: the filter envelope. A struck string is
      // brightest at the pick and darkens as it rings, and a tone that never
      // changes across its own length is what reads as toy-like — no amount of
      // distortion downstream fixes a static waveform.
      //
      // Two saws detuned only slightly: wide detune is a synth-chorus effect,
      // while a real guitar's thickness comes from saturation and from the cab.
      const guitar = new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 10 },
        envelope: { attack: 0.003, decay: 0.3, sustain: 0.55, release: 0.28 },
        filter: { type: "lowpass", rolloff: -12, Q: 1.4 },
        filterEnvelope: {
          attack: 0.002,
          decay: 0.16,
          sustain: 0.32,
          release: 0.4,
          baseFrequency: 380,
          octaves: 3.6,
          exponent: 2,
        },
      });
      // A MonoSynth voice is expensive (oscillator pair + filter + two
      // envelopes), and PolySynth will happily allocate 32 of them per track.
      // Sixteenth-note riffs never need that: the densest bar of a plan like
      // `six-gun-shredout` peaks around seven voices including release tails.
      guitar.maxPolyphony = 16;
      return guitar;
    }
  }
}
