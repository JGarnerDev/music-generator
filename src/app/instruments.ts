/**
 * Instrument factory: a **voice preset** (`voices/<instrument>/<slug>.json`) in,
 * Tone nodes out.
 *
 * The sound used to be hardcoded here. It moved into JSON so it could be
 * auditioned, refined and approved on its own clock — see
 * [`docs/voices.md`](../../docs/voices.md) — and so a track can name which of an
 * instrument's several sounds it wants. What is left in this file is the part
 * that is genuinely code: which Tone class each kind of preset builds, and the
 * guitar amp, whose *order* is the instrument.
 *
 * Browser-only (constructs Tone nodes); the decisions it can't make itself —
 * which preset, what a preset may contain — live in the tested engine.
 */
import * as Tone from "tone";
import type { InstrumentName } from "@engine/composition";
import type { AmpSpec, SynthSpec, VoicePreset } from "@engine/voice";
import { getQuality } from "./quality";
import { DrumKit } from "./drums";
import { voiceFor } from "./voices";

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
 * `slug` is the track's `voice` field — omitted means the instrument's default
 * preset, which is what every piece written before voices existed gets.
 *
 * Per-instrument tone lives here rather than in the shared lo-fi chain in
 * `graph.ts`: distortion belongs to the guitar, not to the drums that would be
 * ruined by it.
 */
export function createVoice(name: InstrumentName, slug?: string): Voice {
  const preset = voiceFor(name, slug);
  const play = createInstrument(preset);
  if (preset.amp) {
    return { play, output: guitarAmp(play as Tone.PolySynth, preset.amp) };
  }
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
 * Which numbers go in each block is the preset's business — that is exactly what
 * separates the rhythm rig from the lead rig, and `voices/lead/brown-lead.json`
 * explains its four differences. The blocks and their order are not negotiable
 * from JSON, because they are the amp.
 *
 * The width here is a Haas pair — split after the cab, one side delayed 13 ms —
 * rather than two full amps rendering two performances. That started as a CPU
 * concession from when this graph ran in realtime; it is now a taste call, and
 * genuine double-tracking is open again if it sounds better, because rendering
 * is offline and has no deadline to miss.
 */
function guitarAmp(source: Tone.PolySynth, voicing: AmpSpec): Tone.ToneAudioNode {
  const input = new Tone.Gain(voicing.input);
  const tighten = new Tone.Filter(voicing.tighten, "highpass");
  // Variac sag: supply voltage dips on a hard hit, so the attack compresses and
  // blooms back instead of spiking. Gentle for a rhythm part on purpose — a
  // hard ratio there rides the level down through the dense sections and reads
  // as the music decaying. A lead wants exactly that hard ratio: a note that
  // stops decaying is a note that sustains.
  const sag = new Tone.Compressor({ ...voicing.sag, attack: 0.004, release: 0.25 });
  const preamp = new Tone.Distortion({
    distortion: voicing.preamp,
    oversample: getQuality().oversample,
  });
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

function createInstrument(preset: VoicePreset): Playable {
  if (preset.instrument === "drums") {
    if (!preset.kit) throw new Error(`Voice "${preset.slug}" has no kit`);
    return new DrumKit(preset.kit);
  }
  if (!preset.synth) throw new Error(`Voice "${preset.slug}" has no synth`);
  return polySynth(preset.synth);
}

/**
 * Build the preset's `PolySynth`.
 *
 * A `mono` voice is a `MonoSynth` for one reason — the filter envelope. A struck
 * string is brightest at the pick and darkens as it rings, and a tone that never
 * changes across its own length is what reads as toy-like; no amount of
 * distortion downstream fixes a static waveform. `synth` and `fm` have no filter
 * envelope, which is why they are the ones used for keys and pads.
 *
 * Oscillator counts and polyphony are *negotiated* with the render quality
 * profile rather than taken from the preset outright: an audition render
 * collapses fat stacks to a single saw and the preset does not get a vote, since
 * the point of an audition is to be fast. See `quality.ts` for the measurements.
 */
function polySynth(spec: SynthSpec): Tone.PolySynth {
  const quality = getQuality();
  // A fat oscillator runs `count` oscillators per allocated voice, continuously,
  // whether or not the voice is currently sounding — the dominant cost in a
  // dense guitar part. The amp's saturation generates most of the thickness
  // anyway, so an audition hears nearly the same instrument. `count` means
  // nothing to the other oscillator types, so it is not passed to them at all.
  const fat = spec.oscillator.type.startsWith("fat");
  const oscillator = fat
    ? { ...spec.oscillator, count: quality.singleOscillator ? 1 : (spec.oscillator.count ?? 3) }
    : { ...spec.oscillator };
  // The preset's oscillator type is a free string on purpose — every Tone
  // waveform name is fair game while designing a sound — so this cast is where
  // untyped JSON meets Tone's unions. A name Tone doesn't know fails loudly at
  // render time, which is the moment you are listening anyway.
  const options: Record<string, unknown> = { oscillator, envelope: spec.envelope };
  if (spec.filter) options.filter = spec.filter;
  if (spec.filterEnvelope) options.filterEnvelope = spec.filterEnvelope;
  if (spec.harmonicity !== undefined) options.harmonicity = spec.harmonicity;
  if (spec.modulationIndex !== undefined) options.modulationIndex = spec.modulationIndex;

  const synth = build(spec.kind, options);
  // PolySynth allocates up to `maxPolyphony` voices per track and each one runs
  // continuously once allocated, sounding or not — so a cap is both musical (a
  // guitar has six strings; a dozen ringing notes stopped sounding like one) and,
  // per the bench, the dominant cost in a guitar track. Only voices that ask for
  // a cap get one: a pad with a three-second release wants Tone's roomier default
  // rather than voice-stealing mid-chord. The quality profile is a ceiling the
  // preset cannot raise.
  if (spec.maxPolyphony !== undefined) {
    synth.maxPolyphony = Math.min(spec.maxPolyphony, quality.maxPolyphony);
  }
  return synth;
}

/**
 * The Tone voice classes a preset may be built on. A short list on purpose: each
 * is a different *kind* of generator, and adding one is a decision about the
 * instrument palette, not a knob.
 *
 * Spelled out per branch rather than looked up in a map because `PolySynth` is
 * generic in its voice class: the constructor has to see which one it is getting
 * for the options to be checked against the right shape at all.
 */
function build(kind: SynthSpec["kind"], options: Record<string, unknown>): Tone.PolySynth {
  switch (kind) {
    case "fm":
      return new Tone.PolySynth(Tone.FMSynth, options as unknown as Partial<Tone.FMSynthOptions>);
    case "mono":
      return new Tone.PolySynth(Tone.MonoSynth, options as unknown as Partial<Tone.MonoSynthOptions>);
    case "synth":
      return new Tone.PolySynth(Tone.Synth, options as unknown as Partial<Tone.SynthOptions>);
  }
}
