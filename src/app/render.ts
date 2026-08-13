/**
 * WAV export: render a composition offline (faster-than-realtime, silent) into a
 * PCM buffer, then encode to a real 16-bit WAV via the tested `encodeWav` util.
 *
 * Two shapes of export: the whole piece once (`renderToWav`), and just the
 * looping body as a gapless file a game can repeat forever (`renderLoopToWav`).
 */
import * as Tone from "tone";
import type { Composition } from "@engine/composition";
import { compositionDurationSeconds, loopWindowSeconds } from "@engine/arrange";
import { encodeWav } from "@utils/wav";
import { wrapTail, secondsToSamples } from "@utils/loop";
import { scheduleComposition } from "./graph";

/** Reverb/release tail added after the last note so it doesn't cut off. */
const TAIL_SECONDS = 4;

export async function renderToWav(comp: Composition): Promise<Uint8Array<ArrayBuffer>> {
  const seconds = compositionDurationSeconds(comp) + TAIL_SECONDS;
  const buffer = await renderOffline(comp, seconds, 0);
  return encodeWav({ sampleRate: buffer.sampleRate, channels: readChannels(buffer) });
}

/**
 * Render just the loop body as a seamless file.
 *
 * Playback starts at the loop point rather than at bar 0, so the intro is
 * excluded and the body is heard exactly as it will be on every lap but the
 * first. We render `TAIL_SECONDS` past the end and fold that overhang back onto
 * the head — without it, every repeat would chop the reverb and restart dry.
 */
export async function renderLoopToWav(comp: Composition): Promise<Uint8Array<ArrayBuffer>> {
  const window = loopWindowSeconds(comp);
  if (!window) {
    throw new Error(`"${comp.name}" has no loop window — add a loop {startBar,endBar}`);
  }

  const buffer = await renderOffline(comp, window.duration + TAIL_SECONDS, window.start);
  const channels = wrapTail({
    channels: readChannels(buffer),
    loopSamples: secondsToSamples(window.duration, buffer.sampleRate),
  });
  return encodeWav({ sampleRate: buffer.sampleRate, channels });
}

/**
 * Run the graph offline. `offsetSeconds` seeks the transport, so the render
 * starts mid-piece without the earlier bars sounding.
 */
function renderOffline(
  comp: Composition,
  seconds: number,
  offsetSeconds: number,
): Promise<Tone.ToneAudioBuffer> {
  return Tone.Offline(() => {
    scheduleComposition(comp);
    Tone.getTransport().start(0, offsetSeconds);
  }, seconds);
}

function readChannels(buffer: Tone.ToneAudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return channels;
}

/** Trigger a browser download of a WAV byte buffer. */
export function downloadWav(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
  const blob = new Blob([bytes], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".wav") ? filename : `${filename}.wav`;
  a.click();
  URL.revokeObjectURL(url);
}
