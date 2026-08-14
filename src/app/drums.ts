/**
 * The drum kit: one instrument, many sounds. A drum note's `pitch` is a kit
 * piece name (`"kick"`, `"open-hat"`), so this exposes the same
 * `triggerAttackRelease(name, duration, time, velocity)` surface as a synth and
 * the graph schedules percussion without knowing it is percussion.
 *
 * Which pieces exist, how they are tuned and how loud they sit is a **voice
 * preset** (`voices/drums/<slug>.json`, shape in [`@engine/voice`](../engine/voice.ts));
 * this file is only how that becomes Tone nodes. Per-piece levels belong to the
 * kit rather than to the pattern: a groove says *where* the hits are and how
 * they're accented, while how loud a hat sits under a kick is a property of the
 * kit you are playing.
 *
 * Synthesised rather than sampled for the same reason the melodic voices are: a
 * piece auditions instantly with nothing downloaded. Swap in `smplr` samples
 * later behind this same interface.
 */
import * as Tone from "tone";
import { type DrumPiece } from "@engine/composition";
import type { KitSpec, MembranePiece } from "@engine/voice";

/** Defaults for the parts of a piece a preset may leave out. */
const MEMBRANE_DEFAULTS = { pitchDecay: 0.03, octaves: 6 };
const NOISE_Q = 0.9;
/** The snare body follows its rattle, a little behind it. */
const SNARE_BODY_VELOCITY = 0.8;

type Trigger = (time: Tone.Unit.Time | undefined, velocity: number) => void;

/**
 * A kit of independent one-shot voices behind a single output gain. Quacks like
 * a `Tone.PolySynth` as far as `graph.ts` is concerned: `connect` +
 * `triggerAttackRelease`.
 */
export class DrumKit {
  private readonly output = new Tone.Gain(1);
  private readonly parts: { dispose: () => void }[] = [this.output];
  private readonly triggers = new Map<DrumPiece, Trigger>();

  constructor(kit: KitSpec) {
    const level = (piece: string): number => kit.levels[piece] ?? 0;

    // Membrane pieces: a pitched thump. Tuning is what separates kick from toms.
    for (const [piece, voice] of Object.entries(kit.membrane)) {
      const synth = this.membrane(voice);
      const gain = new Tone.Gain(level(piece));
      synth.chain(gain, this.output);
      this.parts.push(synth, gain);
      this.triggers.set(piece as DrumPiece, (time, velocity) => {
        synth.triggerAttackRelease(voice.pitch, voice.decay, time, velocity);
      });
    }

    // Noise pieces: filtered bursts. Cutoff + decay is the whole character.
    for (const [piece, voice] of Object.entries(kit.noise)) {
      const synth = new Tone.NoiseSynth({
        noise: { type: voice.type },
        envelope: { attack: 0.001, decay: voice.decay, sustain: 0, release: 0.05 },
      });
      // Bandpass, not highpass: a snare needs its body as much as its snap, and
      // an unfiltered burst reads as static rather than as a drum.
      const filter = new Tone.Filter({
        frequency: voice.hz,
        type: "bandpass",
        Q: voice.q ?? NOISE_Q,
      });
      const gain = new Tone.Gain(level(piece));
      synth.chain(filter, gain, this.output);
      this.parts.push(synth, filter, gain);
      this.triggers.set(piece as DrumPiece, (time, velocity) => {
        synth.triggerAttackRelease(voice.decay, time, velocity);
      });
    }

    // A snare is a tone *and* a rattle; the noise burst alone sounds like a
    // hi-hat pitched down. Layer a short membrane hit under it.
    const body = kit.snareBody;
    const rattle = this.triggers.get("snare");
    if (body && rattle) {
      const synth = this.membrane(body);
      const gain = new Tone.Gain(level("snare") * body.level);
      synth.chain(gain, this.output);
      this.parts.push(synth, gain);
      this.triggers.set("snare", (time, velocity) => {
        rattle(time, velocity);
        synth.triggerAttackRelease(body.pitch, body.decay, time, velocity * SNARE_BODY_VELOCITY);
      });
    }
  }

  private membrane(voice: MembranePiece): Tone.MembraneSynth {
    return new Tone.MembraneSynth({
      pitchDecay: voice.pitchDecay ?? MEMBRANE_DEFAULTS.pitchDecay,
      octaves: voice.octaves ?? MEMBRANE_DEFAULTS.octaves,
      envelope: { attack: 0.001, decay: voice.decay, sustain: 0, release: 0.1 },
    });
  }

  connect(destination: Tone.InputNode): this {
    this.output.connect(destination);
    return this;
  }

  /**
   * `duration` is ignored — a struck drum rings for as long as its own envelope
   * says, which is why the groove's note lengths are documentation rather than
   * control. A piece the kit doesn't voice is skipped silently here;
   * `validateComposition` catches a typo'd piece name, and `validateVoice`
   * catches a piece the kit voices but never levels.
   */
  triggerAttackRelease(
    piece: string,
    _duration: Tone.Unit.Time,
    time?: Tone.Unit.Time,
    velocity = 0.8,
  ): this {
    this.triggers.get(piece as DrumPiece)?.(time, velocity);
    return this;
  }

  dispose(): this {
    for (const part of this.parts) part.dispose();
    return this;
  }
}
