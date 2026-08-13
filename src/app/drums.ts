/**
 * The drum kit: one instrument, many sounds. A drum note's `pitch` is a kit
 * piece name (`"kick"`, `"open-hat"`), so this exposes the same
 * `triggerAttackRelease(name, duration, time, velocity)` surface as a synth and
 * the graph schedules percussion without knowing it is percussion.
 *
 * Synthesised rather than sampled for the same reason the melodic voices are:
 * a piece auditions instantly with nothing downloaded. Swap in `smplr` samples
 * later behind this same interface.
 *
 * Per-piece levels live here, not in the pattern: a groove says *where* the hits
 * are and how they're accented, while how loud a hat sits under a kick is a
 * property of the kit. Browser-only glue, kept logic-free — the pattern maths is
 * `src/engine/groove.ts`, which is tested.
 */
import * as Tone from "tone";
import { type DrumPiece } from "@engine/composition";

/** Relative level per piece, so an even pattern still balances like a kit. */
const LEVEL: Record<DrumPiece, number> = {
  kick: 1,
  snare: 0.8,
  rim: 0.5,
  clap: 0.6,
  hat: 0.32,
  "open-hat": 0.3,
  ride: 0.3,
  crash: 0.45,
  "tom-lo": 0.7,
  "tom-mid": 0.7,
  "tom-hi": 0.65,
  shaker: 0.25,
};

/** Membrane pieces: a pitched thump. Tuning is what separates kick from toms. */
const DRUM_TUNING: Partial<Record<DrumPiece, { pitch: string; decay: number }>> = {
  kick: { pitch: "C1", decay: 0.4 },
  "tom-lo": { pitch: "A1", decay: 0.5 },
  "tom-mid": { pitch: "D2", decay: 0.45 },
  "tom-hi": { pitch: "G2", decay: 0.4 },
};

/** Noise pieces: filtered bursts. Cutoff + decay is the whole character. */
const NOISE_VOICES: Partial<Record<DrumPiece, { hz: number; decay: number; type: "white" | "pink" }>> = {
  snare: { hz: 1400, decay: 0.18, type: "white" },
  rim: { hz: 2600, decay: 0.04, type: "white" },
  clap: { hz: 1200, decay: 0.12, type: "white" },
  hat: { hz: 7000, decay: 0.04, type: "white" },
  "open-hat": { hz: 6500, decay: 0.35, type: "white" },
  ride: { hz: 5200, decay: 0.6, type: "white" },
  crash: { hz: 4200, decay: 1.6, type: "white" },
  shaker: { hz: 8000, decay: 0.06, type: "pink" },
};

/**
 * A kit of independent one-shot voices behind a single output gain. Quacks like
 * a `Tone.PolySynth` as far as `graph.ts` is concerned: `connect` +
 * `triggerAttackRelease`.
 */
type Trigger = (time: Tone.Unit.Time | undefined, velocity: number) => void;

export class DrumKit {
  private readonly output = new Tone.Gain(1);
  private readonly parts: { dispose: () => void }[] = [this.output];
  private readonly triggers = new Map<DrumPiece, Trigger>();

  constructor() {
    for (const [piece, tuning] of Object.entries(DRUM_TUNING) as [
      DrumPiece,
      { pitch: string; decay: number },
    ][]) {
      const synth = new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 6,
        envelope: { attack: 0.001, decay: tuning.decay, sustain: 0, release: 0.1 },
      });
      const gain = new Tone.Gain(LEVEL[piece]);
      synth.chain(gain, this.output);
      this.parts.push(synth, gain);
      this.triggers.set(piece, (time, velocity) => {
        synth.triggerAttackRelease(tuning.pitch, tuning.decay, time, velocity);
      });
    }

    for (const [piece, voice] of Object.entries(NOISE_VOICES) as [
      DrumPiece,
      { hz: number; decay: number; type: "white" | "pink" },
    ][]) {
      const synth = new Tone.NoiseSynth({
        noise: { type: voice.type },
        envelope: { attack: 0.001, decay: voice.decay, sustain: 0, release: 0.05 },
      });
      // Bandpass, not highpass: a snare needs its body as much as its snap, and
      // an unfiltered burst reads as static rather than as a drum.
      const filter = new Tone.Filter({ frequency: voice.hz, type: "bandpass", Q: 0.9 });
      const gain = new Tone.Gain(LEVEL[piece]);
      synth.chain(filter, gain, this.output);
      this.parts.push(synth, filter, gain);
      this.triggers.set(piece, (time, velocity) => {
        synth.triggerAttackRelease(voice.decay, time, velocity);
      });
    }

    // A snare is a tone *and* a rattle; the noise burst alone sounds like a
    // hi-hat pitched down. Layer a short membrane hit under it.
    const body = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
    });
    const bodyGain = new Tone.Gain(LEVEL.snare * 0.45);
    body.chain(bodyGain, this.output);
    this.parts.push(body, bodyGain);
    const noiseOnly = this.triggers.get("snare")!;
    this.triggers.set("snare", (time, velocity) => {
      noiseOnly(time, velocity);
      body.triggerAttackRelease("D2", 0.12, time, velocity * 0.8);
    });
  }

  connect(destination: Tone.InputNode): this {
    this.output.connect(destination);
    return this;
  }

  /**
   * `duration` is ignored — a struck drum rings for as long as its own envelope
   * says, which is why the groove's note lengths are documentation rather than
   * control. Unknown pieces are skipped silently here; `validateComposition`
   * is where a typo is meant to be caught.
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
