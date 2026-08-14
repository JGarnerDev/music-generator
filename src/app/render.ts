/**
 * Offline rendering: run a composition through the Tone graph faster than
 * realtime and silently, producing raw PCM.
 *
 * **This is the only place audio is synthesised, and it does not run in the
 * app.** `npm run render` drives it through a headless browser
 * (`scripts/render.ts` → `src/dev/render-page.ts`) and writes the result to
 * `public/audio/`; the app only ever plays those files. Synthesising during
 * playback means a realtime deadline — every buffer filled in time — and a dense
 * piece blows through it, which is heard as stutter and dropouts. See
 * [`docs/rendering.md`](../../docs/rendering.md) for the designs that were tried
 * and rejected before this one.
 *
 * Two shapes: the whole piece once, and just the looping body folded into a
 * gapless lap a game can repeat forever (`loopOnly`).
 */
import * as Tone from "tone";
import type { Composition } from "@engine/composition";
import { compositionDurationSeconds, loopWindowSeconds } from "@engine/arrange";
import type { PcmAudio } from "@utils/wav";
import { wrapTail, secondsToSamples } from "@utils/loop";
import { EXPORT_QUALITY, withQuality, type RenderQuality } from "./quality";
import { scheduleComposition } from "./graph";

/** Reverb/release tail added after the last note so it doesn't cut off. */
const TAIL_SECONDS = 4;

export interface RenderOptions {
  /**
   * Render only the loop body, seam-wrapped, instead of the whole timeline.
   * Requires the composition to declare a loop window.
   */
  loopOnly?: boolean;
  /** Defaults to full export quality. Playback passes the audition profile. */
  quality?: RenderQuality;
}

/**
 * Render a composition to PCM. The one entry point; the render script encodes
 * what comes back as MP3 (and WAV with `--wav`).
 *
 * With `loopOnly`, playback starts at the loop point rather than at bar 0, so
 * the intro is excluded and the body is heard exactly as it will be on every lap
 * but the first. We render `TAIL_SECONDS` past the end and fold that overhang
 * back onto the head — without it, every repeat would chop the reverb and
 * restart dry.
 */
export async function renderComposition(
  comp: Composition,
  opts: RenderOptions = {},
): Promise<PcmAudio> {
  const quality = opts.quality ?? EXPORT_QUALITY;
  if (!opts.loopOnly) {
    const seconds = compositionDurationSeconds(comp) + TAIL_SECONDS;
    const buffer = await renderOffline(comp, seconds, 0, quality);
    return { sampleRate: buffer.sampleRate, channels: readChannels(buffer) };
  }

  const window = loopWindowSeconds(comp);
  if (!window) {
    throw new Error(`"${comp.name}" has no loop window — add a loop {startBar,endBar}`);
  }
  const buffer = await renderOffline(comp, window.duration + TAIL_SECONDS, window.start, quality);
  const channels = wrapTail({
    channels: readChannels(buffer),
    loopSamples: secondsToSamples(window.duration, buffer.sampleRate),
  });
  return { sampleRate: buffer.sampleRate, channels };
}

/**
 * Run the graph offline. `offsetSeconds` seeks the transport, so the render
 * starts mid-piece without the earlier bars sounding.
 *
 * This is `Tone.Offline` unrolled so the clock walk is ours to control, and it
 * runs the **asynchronous** walk deliberately. The choice is between two flaws:
 *
 * - **async** (`render()`, what `Tone.Offline` does) awaits a `setTimeout` once
 *   per second of rendered audio. A render makes no sound, so nothing exempts
 *   the tab from timer throttling — hidden, that clamps to one tick per second,
 *   and after five minutes to roughly one per minute. That is survivable here
 *   only because the render script drives a headless browser whose page is
 *   never hidden.
 * - **sync** (`render(false)`) has no timers to throttle, but walks ~340
 *   iterations per second of audio without yielding, freezing the page for the
 *   length of the render.
 *
 * Async wins: the sync walk starves the page's event loop, and Playwright needs
 * that loop alive to receive the PCM slices this render hands back.
 */
async function renderOffline(
  comp: Composition,
  seconds: number,
  offsetSeconds: number,
  quality: RenderQuality,
): Promise<Tone.ToneAudioBuffer> {
  const original = Tone.getContext();
  const context = new Tone.OfflineContext(
    2,
    seconds,
    quality.sampleRate ?? original.sampleRate,
  );
  Tone.setContext(context);
  let rendering: Promise<Tone.ToneAudioBuffer>;
  try {
    // The graph must be *built* under the profile — it decides oscillator
    // counts and oversampling, which are constructor arguments.
    withQuality(quality, () => {
      scheduleComposition(comp);
      context.transport.start(0, offsetSeconds);
    });
    rendering = context.render();
  } finally {
    // Restore before awaiting, exactly as Tone.Offline does: anything the page
    // builds while the render runs must land on the live context, not this one.
    Tone.setContext(original);
  }
  return rendering;
}

function readChannels(buffer: Tone.ToneAudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return channels;
}
