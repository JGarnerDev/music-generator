/**
 * Encode raw PCM channel data to a 16-bit WAV file. Kept pure (plain
 * Float32Arrays in, bytes out) so it needs no Web Audio to test — the browser
 * hands us channel data from an offline render, we hand back a downloadable WAV.
 */

export interface PcmAudio {
  sampleRate: number;
  /** One Float32Array per channel, each in [-1, 1], all the same length. */
  channels: Float32Array[];
}

/** Encode PCM to a 16-bit little-endian WAV byte buffer. */
export function encodeWav(audio: PcmAudio): Uint8Array<ArrayBuffer> {
  const { sampleRate, channels } = audio;
  if (channels.length === 0) throw new Error("encodeWav: no channels");
  const numChannels = channels.length;
  const numFrames = channels[0]!.length;
  for (const ch of channels) {
    if (ch.length !== numFrames) throw new Error("encodeWav: channel length mismatch");
  }

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels frame by frame.
  let offset = 44;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setInt16(offset, floatToPcm16(channels[ch]![frame]!), true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

function floatToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
