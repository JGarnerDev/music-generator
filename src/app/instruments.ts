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
  if (name === "pluck" || name === "lead") {
    return { play, output: guitarAmp(play as Tone.PolySynth, name) };
  }
  return { play, output: play };
}

/**
 * The two guitar rigs, as differences from each other. A lead is not a rhythm
 * part turned up — turning the rhythm tone up is exactly what makes a solo sound
 * puny and loud at the same time. Four things actually separate them:
 *
 * 1. **Compression, which is what "sustain" means on a guitar.** The lead hits a
 *    harder ratio at a lower threshold, so a held note stops decaying and starts
 *    singing. The rhythm part wants the opposite — a chug that compresses is a
 *    chug that has lost its attack.
 * 2. **Space in the spectrum.** The rhythm guitar is doubled at the fifth and
 *    reinforced by the bass, so it owns the low-mids; the lead climbs out above
 *    it (higher high-pass, presence up where the chug is quiet) instead of
 *    fighting it there. Two mid-forward parts in the same band cancel to mud.
 * 3. **Width.** The rhythm is a wide Haas pair; the lead stays near the centre.
 *    Everything wide at once reads as *nothing* wide, and the centre is the
 *    loudest place in a stereo mix — which is where the top line belongs.
 * 4. **Level.** The lead's output sum is roughly twice the rhythm's, before the
 *    per-track gain in `graph.ts` says anything.
 */
interface AmpVoicing {
  /** Gain into the preamp — more here is more saturation, not more volume. */
  input: number;
  /** High-pass before the drive, so low strings don't intermodulate into mud. */
  tighten: number;
  sag: { threshold: number; ratio: number };
  preamp: number;
  toneStack: { low: number; mid: number; high: number };
  /** Speaker roll-off. The lead gets a little more top than the chug. */
  cab: number;
  presence: { frequency: number; gain: number };
  /** Haas spread, 0..1. Rhythm goes wide; lead stays near the middle. */
  width: number;
  slap: { delayTime: number; wet: number };
  sum: number;
}

const AMP_VOICINGS: Record<"pluck" | "lead", AmpVoicing> = {
  pluck: {
    input: 1.7,
    tighten: 170,
    sag: { threshold: -16, ratio: 2.5 },
    preamp: 0.5,
    toneStack: { low: -5, mid: 3.5, high: -6 },
    cab: 4400,
    presence: { frequency: 2300, gain: 3.5 },
    width: 0.6,
    slap: { delayTime: 0.075, wet: 0.09 },
    sum: 0.42,
  },
  lead: {
    input: 2.6,
    tighten: 260,
    sag: { threshold: -26, ratio: 6 },
    preamp: 0.62,
    toneStack: { low: -9, mid: 5, high: -3 },
    cab: 5400,
    presence: { frequency: 3100, gain: 5.5 },
    width: 0.22,
    slap: { delayTime: 0.11, wet: 0.16 },
    sum: 0.8,
  },
};

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
function guitarAmp(source: Tone.PolySynth, role: "pluck" | "lead"): Tone.ToneAudioNode {
  const voicing = AMP_VOICINGS[role];
  const input = new Tone.Gain(voicing.input);
  const tighten = new Tone.Filter(voicing.tighten, "highpass");
  // Variac sag: supply voltage dips on a hard hit, so the attack compresses and
  // blooms back instead of spiking. Gentle for the rhythm part on purpose — a
  // hard ratio there rides the level down through the dense sections and reads
  // as the music decaying. The lead wants exactly that hard ratio: a note that
  // stops decaying is a note that sustains.
  const sag = new Tone.Compressor({ ...voicing.sag, attack: 0.004, release: 0.25 });
  const preamp = new Tone.Distortion({ distortion: voicing.preamp, oversample: "2x" });
  // Mid-forward, not scooped — scooped metal guitar disappears under the bass.
  const toneStack = new Tone.EQ3({
    ...voicing.toneStack,
    lowFrequency: 220,
    highFrequency: 2800,
  });
  const powerAmp = new Tone.Distortion({ distortion: 0.18, oversample: "none" });
  const cab = new Tone.Filter({ frequency: voicing.cab, type: "lowpass", rolloff: -48 });
  const presence = new Tone.Filter({ type: "peaking", Q: 1.2, ...voicing.presence });
  const body = new Tone.Filter(105, "highpass");
  const sum = new Tone.Gain(voicing.sum);

  source.chain(input, tighten, sag, preamp, toneStack, powerAmp, cab, presence, body);

  // Width: the same cab one side, and 13 ms later the other. Short enough to
  // read as one guitar in a room, long enough that it is not just "loud centre".
  const left = new Tone.Panner(-voicing.width);
  const right = new Tone.Panner(voicing.width);
  const lag = new Tone.Delay(0.013);
  body.connect(left);
  body.chain(lag, right);
  left.connect(sum);
  right.connect(sum);

  const slap = new Tone.FeedbackDelay({ ...voicing.slap, feedback: 0.12 });
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
    case "pluck":
      return guitarSynth("pluck");
    case "lead":
      return guitarSynth("lead");
  }
}

/**
 * The guitar oscillator, played through `guitarAmp`. A `MonoSynth` rather than a
 * plain `Synth` for one reason: the filter envelope. A struck string is
 * brightest at the pick and darkens as it rings, and a tone that never changes
 * across its own length is what reads as toy-like — no amount of distortion
 * downstream fixes a static waveform.
 *
 * Two saws detuned only slightly: wide detune is a synth-chorus effect, while a
 * real guitar's thickness comes from saturation and from the cab.
 *
 * The lead's envelope is the amplitude half of the same argument the amp voicing
 * makes: it holds near full level for as long as the note is held and releases
 * slowly, so a quarter note is still ringing when the next one arrives. The
 * rhythm part decays instead, because overlapping chugs are mud. Its filter also
 * opens higher and stays open — a lead that darkens as fast as a palm mute reads
 * as far away.
 */
function guitarSynth(role: "pluck" | "lead"): Tone.PolySynth {
  const lead = role === "lead";
  const guitar = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: "fatsawtooth", count: lead ? 3 : 2, spread: lead ? 16 : 10 },
    envelope: lead
      ? { attack: 0.004, decay: 0.5, sustain: 0.9, release: 0.7 }
      : { attack: 0.003, decay: 0.3, sustain: 0.55, release: 0.28 },
    filter: { type: "lowpass", rolloff: -12, Q: 1.4 },
    filterEnvelope: lead
      ? { attack: 0.004, decay: 0.3, sustain: 0.75, release: 0.8, baseFrequency: 700, octaves: 3, exponent: 2 }
      : { attack: 0.002, decay: 0.16, sustain: 0.32, release: 0.4, baseFrequency: 380, octaves: 3.6, exponent: 2 },
  });
  // A MonoSynth voice is expensive (oscillator pair + filter + two envelopes),
  // and PolySynth will happily allocate 32 of them per track. Sixteenth-note
  // riffs never need that: the densest bar of a plan like `six-gun-shredout`
  // peaks around seven voices including release tails. The lead is one line, but
  // its long release means several notes overlap, so it keeps some headroom.
  guitar.maxPolyphony = 16;
  return guitar;
}
