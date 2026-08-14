/**
 * MP3 encoding for stored audio.
 *
 * Rendered pieces live in the repo so the app has something to play the moment
 * it loads, and WAV is the wrong format for that: a two-minute piece is ~20 MB,
 * and git keeps every version you ever render. The same piece as a 160 kbps MP3
 * is ~2 MB and sounds the same through the speakers anyone auditions on. WAV
 * remains what you ship — `npm run render -- --wav` writes it, gitignored.
 *
 * Float PCM in, MP3 bytes out. `lamejs` does the encoding; this wraps the parts
 * that are easy to get wrong — float-to-int16 conversion and the interleaving
 * lame expects — and is tested.
 */
import { Mp3Encoder } from "@breezystack/lamejs";

/** Samples handed to the encoder per call. Lame's own recommended block size. */
const BLOCK_SAMPLES = 1152;

export interface Mp3Options {
  sampleRate: number;
  /** Constant bitrate in kbps. 160 is transparent enough for auditioning. */
  bitrateKbps?: number;
}

/**
 * Encode float PCM channels to an MP3.
 *
 * Mono stays mono rather than being doubled into a stereo file — half the bytes
 * for identical audio.
 */
export function encodeMp3(channels: Float32Array[], opts: Mp3Options): Uint8Array {
  if (channels.length === 0) throw new Error("encodeMp3: no channels");
  if (channels.length > 2) {
    throw new Error(`encodeMp3: expected mono or stereo, got ${channels.length} channels`);
  }
  const frames = channels[0]!.length;
  for (const channel of channels) {
    if (channel.length !== frames) throw new Error("encodeMp3: channel length mismatch");
  }
  if (!(opts.sampleRate > 0)) {
    throw new Error(`encodeMp3: sampleRate must be positive, got ${opts.sampleRate}`);
  }

  const stereo = channels.length === 2;
  const encoder = new Mp3Encoder(stereo ? 2 : 1, opts.sampleRate, opts.bitrateKbps ?? 160);
  const left = toInt16(channels[0]!);
  const right = stereo ? toInt16(channels[1]!) : null;

  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < frames; offset += BLOCK_SAMPLES) {
    const end = Math.min(offset + BLOCK_SAMPLES, frames);
    const block = right
      ? encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end))
      : encoder.encodeBuffer(left.subarray(offset, end));
    if (block.length > 0) parts.push(block);
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) parts.push(flushed);

  return concat(parts);
}

/**
 * Float [-1, 1] to signed 16-bit.
 *
 * Clamped before scaling: a render that folded a reverb tail back on itself can
 * sit a hair above 1.0, and letting that wrap around is a loud click rather
 * than a slightly flattened peak.
 */
function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
