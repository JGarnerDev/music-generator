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
import type { BendPoint } from "@engine/bend";
import type { InstrumentName } from "@engine/composition";
import type {
  AmpSpec,
  BreathSpec,
  ResonanceSpec,
  SynthSpec,
  TremoloSpec,
  VibratoSpec,
  VoicePreset,
} from "@engine/voice";
import { planSection, sectionGain, type PlayerPlan } from "@engine/section";
import { getQuality } from "./quality";
import { DrumKit } from "./drums";
import { voiceFor } from "../voices";

export type Playable = Tone.PolySynth | Tone.Sampler | DrumKit | Section;

/**
 * A voice is what you trigger plus where its sound comes *out*, because an
 * instrument with its own effects no longer ends at the synth. Connect
 * `output` downstream; trigger notes on `play`.
 */
export interface Voice {
  play: Playable;
  output: { connect(destination: Tone.InputNode): unknown };
  /**
   * Where notes carrying a `bend` go, when the track asked for one and the
   * preset can provide it. Absent means play them straight — see `BendVoice`.
   */
  bend?: BendVoice;
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
export function createVoice(name: InstrumentName, slug?: string, wantsBend = false): Voice {
  const preset = voiceFor(name, slug);
  const play = createInstrument(preset);
  const bend = wantsBend ? bendVoiceFor(preset) : undefined;
  // Signal order is the instrument being modelled, top to bottom: the string
  // moves (synth), its pitch is not still (vibrato), the bow may be reversing
  // several times a second (tremolo), the box it is mounted on rings at its own
  // fixed frequencies (body), the player adds noise the box never made (breath)
  // — and only then does any of it reach an amplifier.
  //
  // A section has already built that chain once per player and summed them, so
  // it arrives here as a finished output: running the shared blocks over it
  // again would put one vibrato and one body across the whole desk, which is
  // exactly the thing a section exists to avoid.
  //
  // A bending voice joins *before* that chain, at a summing gain, so it is the
  // same instrument all the way down: the same vibrato hand, the same box, the
  // same amp. Hanging it off the end instead would give the one note anybody is
  // listening to a different tone from the phrase it belongs to. The gain only
  // exists on tracks that bend, so every other piece builds the graph it always
  // did, node for node.
  const head = bend ? sum(play, bend) : play;
  const acoustic = play instanceof Section ? play.output : acousticChain(head, preset);
  if (preset.amp) {
    return { play, bend, output: guitarAmp(acoustic, preset.amp) };
  }
  return { play, bend, output: acoustic };
}

/** The polyphonic voice and the bending one, into one node the chain can start from. */
function sum(play: Playable, bend: BendVoice): Tone.ToneAudioNode {
  const head = new Tone.Gain(1);
  (play as unknown as Tone.ToneAudioNode).connect(head);
  bend.connect(head);
  return head;
}

/**
 * The bending voice a preset can support, or nothing.
 *
 * Two presets can't have one. **Drums** have no pitch to bend — a kit piece is a
 * name, not a note. **Sections** are the harder no: a desk is many players with
 * their own chains, and one bend across all of them is either one hand moving
 * six instruments or six hands moving in lockstep, and neither is a thing that
 * happens. A section that needs a bent line wants that line written on its own
 * track with a solo voice, which is also how it would be played.
 *
 * Both cases warn rather than throw. The piece is already written and the render
 * is already running; a straight note is a worse performance, where a failed
 * render is no performance.
 */
function bendVoiceFor(preset: VoicePreset): BendVoice | undefined {
  if (!preset.synth) {
    console.warn(`voice "${preset.slug}" has no synth to bend — bends ignored`);
    return undefined;
  }
  if (preset.section) {
    console.warn(
      `voice "${preset.slug}" is a section — bends ignored. ` +
        `Write the bent line on its own track with a solo voice.`,
    );
    return undefined;
  }
  return new BendVoice(preset.synth);
}

/**
 * The blocks that make a synth read as a played object rather than a triggered
 * one. Each is skipped entirely when the preset omits it, so a voice written
 * before they existed builds precisely the graph it always did.
 *
 * Why here and not in the preset's oscillator settings: none of this is
 * expressible as a waveform or an envelope. Vibrato is pitch over time, a body
 * is a set of resonances that *don't* follow the note, and breath is a second
 * sound source. The filter-envelope-and-detune vocabulary can approximate none
 * of the three, which is why voices built only from it all share a family
 * resemblance no amount of tuning removes.
 */
function acousticChain(source: Playable | Tone.ToneAudioNode, parts: AcousticParts): Tone.ToneAudioNode {
  let node = source as unknown as Tone.ToneAudioNode;
  if (parts.vibrato) node = vibrato(node, parts.vibrato);
  if (parts.tremolo) node = tremolo(node, parts.tremolo);
  if (parts.body?.length) node = body(node, parts.body);
  if (parts.breath) node = breath(node, parts.breath);
  return node;
}

/**
 * The blocks as *values* rather than as a preset, because a section player plays
 * a varied copy of them: their own hand, their own bowing arm, their own
 * instrument, the same bow noise. A `VoicePreset` is assignable to this as it is.
 */
interface AcousticParts {
  vibrato?: VibratoSpec;
  tremolo?: TremoloSpec;
  body?: ResonanceSpec[];
  breath?: BreathSpec;
}

/**
 * Pitch movement, as a delay-line modulation across the whole instrument.
 *
 * It is one node for the track rather than per note because `PolySynth` exposes
 * no per-voice pitch input to reach — the practical cost is that every sounding
 * note shares one vibrato phase, which is right for one player and wrong for a
 * section.
 *
 * `drift` is the part that matters. A vibrato at a fixed rate and width is the
 * single most recognisable "this is a synth patch" gesture there is; a player's
 * hand wanders. So a slow LFO — a seventh of the vibrato rate, deliberately not
 * a neat fraction — rides the depth between `depth·(1-drift)` and `depth`.
 */
function vibrato(source: Tone.ToneAudioNode, spec: VibratoSpec): Tone.ToneAudioNode {
  const node = new Tone.Vibrato({ frequency: spec.rate, depth: spec.depth, type: "sine" });
  if (spec.drift) {
    const wander = new Tone.LFO({
      frequency: spec.rate / 7,
      min: spec.depth * (1 - spec.drift),
      max: spec.depth,
      type: "triangle",
    });
    wander.connect(node.depth);
    wander.start();
  }
  source.connect(node);
  return node;
}

/**
 * Re-bowing, as amplitude modulation ahead of the box and the bow noise.
 *
 * That position is the whole reason this reads as an articulation rather than as
 * a tremolo pedal. `breath` is gated by an envelope follower watching whatever
 * reaches it, so putting the strokes upstream means the follower opens once per
 * stroke and every bow change gets its own burst of rosin scrape — the sound of
 * the bow biting, which is what a listener actually identifies. Downstream of
 * `breath` it would be one continuous scrape being turned up and down, which is
 * a volume knob.
 *
 * `depth` is Tone's fraction removed at the bottom of the cycle, so the note
 * dips rather than stops: a string is still ringing when the bow turns, and a
 * modulation that reaches zero is a gate, audibly mechanical.
 */
function tremolo(source: Tone.ToneAudioNode, spec: TremoloSpec): Tone.ToneAudioNode {
  const node = new Tone.Tremolo({
    frequency: spec.rate,
    depth: spec.depth,
    spread: spec.spread ?? 0,
    type: "sine",
  }).start();
  source.connect(node);
  return node;
}

/**
 * The resonating box: peaking filters in series at frequencies that never move.
 *
 * This is the exact opposite of the filter envelope inside the preset, and both
 * are needed. The filter envelope tracks the note — brighter at the attack,
 * darker as it rings. A body does not care what note is playing: the same air
 * mode sits at the same frequency whether you play the note below it or above,
 * so a scale walks through the resonances and changes colour as it goes. That
 * unevenness across the register is the difference between an instrument and a
 * preset, and it is the one thing that makes a scale sound played.
 */
function body(source: Tone.ToneAudioNode, resonances: ResonanceSpec[]): Tone.ToneAudioNode {
  let node = source;
  for (const resonance of resonances) {
    const peak = new Tone.Filter({
      type: "peaking",
      frequency: resonance.frequency,
      Q: resonance.q,
      gain: resonance.gain,
    });
    node.connect(peak);
    node = peak;
  }
  return node;
}

/**
 * Noise that arrives with the note without knowing anything about notes.
 *
 * A `Follower` on the instrument's own output is a rectified, smoothed copy of
 * its amplitude — so it opens when a note starts, sits at whatever level it was
 * played at, and closes when it ends. Multiplying a bandpassed noise source by
 * it gives bow scrape that tracks the bow, rather than a hiss bed that is
 * audibly independent of the music.
 *
 * The instrument passes through dry as well: this adds noise, it does not
 * replace the tone with it.
 */
function breath(source: Tone.ToneAudioNode, spec: BreathSpec): Tone.ToneAudioNode {
  const sum = new Tone.Gain(1);
  source.connect(sum);

  const follower = new Tone.Follower({ smoothing: spec.attack ?? 0.02 });
  source.connect(follower);

  // Gain starts at 0 so the follower is the only thing that ever opens it —
  // a noise source with a static gain is a hiss bed and reads as tape, not bow.
  const gate = new Tone.Gain(0);
  follower.connect(gate.gain);

  const noise = new Tone.Noise("pink").start();
  const band = new Tone.Filter({ type: "bandpass", frequency: spec.hz, Q: spec.q ?? 1 });
  const level = new Tone.Gain(spec.level);
  noise.chain(band, gate, level, sum);
  return sum;
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
function guitarAmp(source: Tone.ToneAudioNode, voicing: AmpSpec): Tone.ToneAudioNode {
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
  // Cab thump cleanup, after the speaker. 105 Hz for a guitar, because nothing
  // musical of a guitar's lives under it and the bass owns that band anyway —
  // but a bass through this rig is the exception that would be gutted by it, so
  // it never sits above where that preset chose to high-pass going in.
  const body = new Tone.Filter(Math.min(105, voicing.tighten), "highpass");
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
  if (preset.section) return new Section(preset);
  return polySynth(preset.synth);
}

/**
 * Several players on one part, summed — a section rather than a soloist.
 *
 * It presents the same `triggerAttackRelease` surface as a `PolySynth`, the same
 * trick `DrumKit` uses, so the schedule in `graph.ts` neither knows nor cares
 * how many people are playing. Everything downstream sees one instrument.
 *
 * What it is *not* is a detuned oscillator stack. A `fat` oscillator gives one
 * player several pitches sharing a single envelope, a single vibrato phase and a
 * single instant of attack, and no amount of spread makes that sound like more
 * than one instrument — which is why every unison-detune string patch has the
 * same enormous, singular quality. Here each player is a whole voice: their own
 * synth (their own envelope, their own filter sweep), their own vibrato at their
 * own rate, their own slightly different box, their own bow noise, their own
 * seat, and their own attack a few milliseconds off everyone else's.
 *
 * The bill is linear. `n` players is `n` times the polyphony, which `quality.ts`
 * measured as the dominant render cost, so a six-player section costs about what
 * six guitars cost. That is simply what the effect is worth; the audition
 * profile caps the desk so that judging one is not a coffee break.
 *
 * Who differs and by how much is decided in [`@engine/section`](../engine/section.ts),
 * pure and seeded from the voice's slug, so the same voice always builds the
 * same desk and a re-render never quietly reshuffles who was sharp.
 */
export class Section {
  readonly output: Tone.Gain;
  private readonly players: { synth: Tone.PolySynth; delay: number; effort: number }[];

  constructor(preset: VoicePreset) {
    const spec = preset.section!;
    // The quality profile is a ceiling the preset cannot raise — the same rule
    // polyphony follows, and for the same reason: an audition exists to be fast.
    const wanted = Math.min(spec.players, getQuality().maxPlayers);
    const plans = planSection(preset).slice(0, wanted);

    this.output = new Tone.Gain(sectionGain(plans.length));
    this.players = plans.map((plan) => this.seat(preset, plan));
  }

  private seat(preset: VoicePreset, plan: PlayerPlan): { synth: Tone.PolySynth; delay: number; effort: number } {
    // Detune is set on the synth rather than by transposing the note, so the
    // part stays written in notes and a player is out by cents, not by pitch
    // names — and the filter envelope still tracks the note it was written for.
    const synth = polySynth(preset.synth!, plan.detune);
    const chain = acousticChain(synth, {
      vibrato: plan.vibrato,
      tremolo: plan.tremolo,
      body: plan.body,
      breath: preset.breath,
    });
    const panner = new Tone.Panner(plan.pan);
    chain.connect(panner);
    panner.connect(this.output);
    return { synth, delay: plan.delay, effort: plan.effort };
  }

  connect(destination: Tone.InputNode): this {
    this.output.connect(destination);
    return this;
  }

  /**
   * One written note, played by everybody — a little later and a little softer
   * for all but the leader.
   *
   * The delays are added here rather than by a delay line on each player's
   * output because they must move the *attack*, not the sound: a delayed signal
   * is the same envelope arriving late, whereas a late trigger is a different
   * bow landing at a different moment, with its own filter sweep starting then.
   * Those are the same thing only for a note with no attack.
   */
  triggerAttackRelease(
    pitch: string,
    duration: Tone.Unit.Time,
    time?: Tone.Unit.Time,
    velocity = 0.8,
  ): this {
    const start = time === undefined ? Tone.now() : Tone.Time(time).toSeconds();
    for (const player of this.players) {
      player.synth.triggerAttackRelease(pitch, duration, start + player.delay, velocity * player.effort);
    }
    return this;
  }
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
/**
 * The preset's synth settings as Tone options, negotiated with the quality
 * profile. Shared by the polyphonic build and the monophonic bending voice, so
 * a bent note is the same instrument as the notes around it rather than a
 * near-miss that drifts every time one of them is tuned.
 */
function synthOptions(spec: SynthSpec, detune?: number): Record<string, unknown> {
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
  const options: Record<string, unknown> = { oscillator, envelope: spec.envelope };
  // Cents off concert pitch, for one player in a section. Left off entirely
  // otherwise, so a solo voice builds exactly the synth it always did.
  if (detune !== undefined) options.detune = detune;
  if (spec.filter) options.filter = spec.filter;
  if (spec.filterEnvelope) options.filterEnvelope = spec.filterEnvelope;
  if (spec.harmonicity !== undefined) options.harmonicity = spec.harmonicity;
  if (spec.modulationIndex !== undefined) options.modulationIndex = spec.modulationIndex;
  return options;
}

function polySynth(spec: SynthSpec, detune?: number): Tone.PolySynth {
  const quality = getQuality();
  // The preset's oscillator type is a free string on purpose — every Tone
  // waveform name is fair game while designing a sound — so the cast inside
  // `build` is where untyped JSON meets Tone's unions. A name Tone doesn't know
  // fails loudly at render time, which is the moment you are listening anyway.
  const synth = build(spec.kind, synthOptions(spec, detune));
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

/** The single-voice twin of `build`, for the one instrument that has to be bendable. */
function buildMono(kind: SynthSpec["kind"], options: Record<string, unknown>): Bendable {
  switch (kind) {
    case "fm":
      return new Tone.FMSynth(options as unknown as Partial<Tone.FMSynthOptions>);
    case "mono":
      return new Tone.MonoSynth(options as unknown as Partial<Tone.MonoSynthOptions>);
    case "synth":
      return new Tone.Synth(options as unknown as Partial<Tone.SynthOptions>);
  }
}

/** A Tone voice with a detune signal of its own — which is what a bend automates. */
type Bendable = Tone.Synth | Tone.MonoSynth | Tone.FMSynth;

/**
 * The one voice on a track that can change pitch while it sounds.
 *
 * **Why a second synth rather than bending the track's synth.** A bend is an
 * automation curve on a detune signal, and `PolySynth` has no detune signal to
 * automate — it allocates voices privately and `set({detune})` reaches all of
 * them, immediately, with no way to schedule it. Even if it could be scheduled,
 * every note the track happened to be sounding would bend along with the one
 * that asked. So bent notes are routed here instead: one monophonic voice built
 * from the same preset, summed into the same chain, whose detune belongs to
 * whatever note it is currently playing. Chords, held pads and unbent melody on
 * the same track keep going through the PolySynth, untouched.
 *
 * The cost is one extra voice per bending track, which is the price of one more
 * note of polyphony — and only tracks that actually bend pay it.
 *
 * The limit that follows is that this voice plays one note at a time, so two
 * bent notes may not overlap. `validateComposition` enforces it, because the
 * failure is audible as a strange bend rather than as an obvious break.
 */
export class BendVoice {
  readonly synth: Bendable;

  constructor(spec: SynthSpec) {
    this.synth = buildMono(spec.kind, synthOptions(spec));
  }

  connect(destination: Tone.InputNode): this {
    this.synth.connect(destination);
    return this;
  }

  /**
   * Play one note with its pitch travelling.
   *
   * The detune signal is cancelled and re-anchored at the attack rather than
   * ramped on from wherever it was: the previous note left it parked at its own
   * target, and a ramp from there would start this note out of tune and slide
   * it in. `points` always opens at 0 cents for the same reason — see
   * [`@engine/bend`](../engine/bend.ts).
   */
  play(
    pitch: string,
    duration: Tone.Unit.Time,
    time: number,
    velocity: number,
    points: readonly BendPoint[],
  ): void {
    const detune = this.synth.detune;
    detune.cancelScheduledValues(time);
    for (const [i, point] of points.entries()) {
      if (i === 0) detune.setValueAtTime(point.cents, time);
      else detune.linearRampToValueAtTime(point.cents, time + point.time);
    }
    this.synth.triggerAttackRelease(pitch, duration, time, velocity);
  }
}
