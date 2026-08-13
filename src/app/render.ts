/**
 * WAV export: render a composition offline (faster-than-realtime, silent) into a
 * PCM buffer, then encode to a real 16-bit WAV via the tested `encodeWav` util.
 */
import * as Tone from "tone";
import type { Composition } from "@engine/composition";
import { compositionDurationSeconds } from "@engine/arrange";
import { encodeWav } from "@utils/wav";
import { scheduleComposition } from "./graph";

/** Reverb/release tail added after the last note so it doesn't cut off. */
const TAIL_SECONDS = 4;

export async function renderToWav(comp: Composition): Promise<Uint8Array<ArrayBuffer>> {
  const seconds = compositionDurationSeconds(comp) + TAIL_SECONDS;

  const buffer = await Tone.Offline(() => {
    scheduleComposition(comp);
    Tone.getTransport().start(0);
  }, seconds);

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  return encodeWav({ sampleRate: buffer.sampleRate, channels });
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
