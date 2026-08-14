/**
 * The page `npm run render` drives.
 *
 * Rendering needs Web Audio, and Web Audio needs a browser — Tone.js talks to
 * the platform through `standardized-audio-context`, which will not run in
 * node (tried; it hangs). So the render script starts Vite, opens this page in
 * a headless Chromium, and calls the function below through it. The audio comes
 * out of the same graph the app has always used, so a rendered file and an
 * Export WAV are the same bytes.
 *
 * PCM leaves through a callback the script installs (`__renderChunk`) rather
 * than as a return value: a few minutes of stereo float audio is tens of
 * megabytes, and handing that back as one serialised blob is slow and fragile.
 * It goes out in slices instead.
 *
 * Dev-only — `render.html` is not an entry point of `vite build`.
 */
import type { Composition } from "@engine/composition";
import { renderComposition } from "@app/render";
import { AUDITION_QUALITY, EXPORT_QUALITY } from "@app/quality";

/** Slice size for handing PCM back to node. Big enough to be few, small enough to be safe. */
const CHUNK_SAMPLES = 1 << 20; // 1M floats ≈ 4 MB

declare global {
  interface Window {
    /** Installed by the render script via `exposeBinding`. */
    __renderChunk?: (payload: { channel: number; base64: string }) => Promise<void>;
    /** Called by the render script. Resolves with the shape of what it sent. */
    renderToPcm?: (
      comp: Composition,
      opts: { loopOnly?: boolean; audition?: boolean },
    ) => Promise<{ sampleRate: number; channels: number; samples: number }>;
  }
}

window.renderToPcm = async (comp, opts) => {
  const audio = await renderComposition(comp, {
    loopOnly: opts.loopOnly,
    quality: opts.audition ? AUDITION_QUALITY : EXPORT_QUALITY,
  });
  const send = window.__renderChunk;
  if (!send) throw new Error("render script did not install __renderChunk");

  for (let channel = 0; channel < audio.channels.length; channel++) {
    const data = audio.channels[channel]!;
    for (let offset = 0; offset < data.length; offset += CHUNK_SAMPLES) {
      const slice = data.subarray(offset, Math.min(offset + CHUNK_SAMPLES, data.length));
      await send({ channel, base64: toBase64(slice) });
    }
  }

  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.length,
    samples: audio.channels[0]?.length ?? 0,
  };
};

/**
 * Float32 samples as base64. `btoa` needs a binary string and blows the call
 * stack if handed a megabyte at once, so the bytes go through it in windows.
 */
function toBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  const WINDOW = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += WINDOW) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + WINDOW, bytes.length)));
  }
  return btoa(binary);
}

document.body.dataset.ready = "true";
