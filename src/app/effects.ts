/**
 * `EffectSpec` → Tone nodes. The browser half of `@engine/signal`.
 *
 * Everything worth arguing about — which token means what, in which order — is
 * decided in the engine, where it is pure and tested. This file is the part that
 * genuinely has to touch Tone: which class each spec builds, and how a wet/dry
 * mix is wired when the node in question has no wet control of its own.
 *
 * Browser-only glue; kept thin on purpose.
 */
import * as Tone from "tone";
import type { EffectSpec } from "@engine/signal";
import { impulseResponse } from "@utils/impulse";
import { getQuality } from "./quality";

/** A built chain: connect a source to `input`, take the result from `output`. */
export interface EffectChain {
  input: Tone.ToneAudioNode;
  output: Tone.ToneAudioNode;
}

/**
 * Build a chain from its specs, in order.
 *
 * An empty list still returns a real pass-through node rather than null, so
 * callers wire the same graph either way instead of branching around it.
 */
export function buildEffects(specs: readonly EffectSpec[]): EffectChain {
  const input = new Tone.Gain(1);
  let node: Tone.ToneAudioNode = input;
  for (const spec of specs) node = buildEffect(node, spec);
  return { input, output: node };
}

function buildEffect(source: Tone.ToneAudioNode, spec: EffectSpec): Tone.ToneAudioNode {
  switch (spec.kind) {
    case "distortion": {
      const node = new Tone.Distortion({
        distortion: spec.amount,
        oversample: getQuality().oversample,
      });
      source.connect(node);
      return node;
    }
    case "compress": {
      const node = new Tone.Compressor({
        threshold: spec.threshold,
        ratio: spec.ratio,
        attack: spec.attack,
        release: spec.release,
      });
      source.connect(node);
      return node;
    }
    case "filter": {
      const node = new Tone.Filter({
        type: spec.type,
        frequency: spec.frequency,
        Q: spec.q ?? 1,
      });
      source.connect(node);
      return node;
    }
    case "autofilter": {
      const node = new Tone.AutoFilter({
        frequency: spec.frequency,
        baseFrequency: spec.base,
        octaves: spec.octaves,
        depth: spec.depth,
      }).start();
      source.connect(node);
      return node;
    }
    case "reverb":
      return convolve(source, spec.decay, spec.wet);
    case "delay": {
      const node = new Tone.FeedbackDelay({
        delayTime: spec.time,
        feedback: spec.feedback,
        wet: spec.wet,
      });
      source.connect(node);
      return node;
    }
    case "chorus": {
      const node = new Tone.Chorus({
        frequency: spec.frequency,
        depth: spec.depth,
        wet: spec.wet,
      }).start();
      source.connect(node);
      return node;
    }
    case "wobble": {
      const node = new Tone.Vibrato({ frequency: spec.frequency, depth: spec.depth });
      source.connect(node);
      return node;
    }
    case "bitcrush": {
      const node = new Tone.BitCrusher({ bits: spec.bits });
      source.connect(node);
      return node;
    }
    case "widen": {
      // A short delay on one side only. Cheaper than a real doubler and it is
      // what a hard-double-tracked guitar actually is: the same part twice, a
      // few milliseconds apart.
      const node = new Tone.StereoWidener(0.8);
      const offset = new Tone.Delay(spec.amount);
      source.chain(offset, node);
      return node;
    }
  }
}

/**
 * Convolution reverb with a wet/dry mix, built the way `graph.ts` builds the
 * shared one and for the same reason: `Tone.Reverb` generates its impulse
 * asynchronously from `Math.random`, so it can be empty when an offline render
 * starts and is never twice the same. `@utils/impulse` is synchronous and
 * deterministic. A bare `Convolver` is 100% wet, so the balance is a `CrossFade`.
 */
function convolve(source: Tone.ToneAudioNode, decay: number, wet: number): Tone.ToneAudioNode {
  const ir = impulseResponse({ decay, sampleRate: Tone.getContext().sampleRate });
  const convolver = new Tone.Convolver(Tone.ToneAudioBuffer.fromArray(ir));
  const mix = new Tone.CrossFade(wet);
  source.connect(mix.a);
  source.chain(convolver, mix.b);
  return mix;
}
