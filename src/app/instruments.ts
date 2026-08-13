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

export type Playable = Tone.PolySynth | Tone.Sampler;

export function createInstrument(name: InstrumentName): Playable {
  switch (name) {
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
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square" },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.4 },
      });
  }
}
