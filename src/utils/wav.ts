/**
 * WAV in and out. Kept pure (plain Float32Arrays and bytes, no Web Audio) so it
 * is testable in Node: the browser hands us channel data from an offline render
 * and we hand back a downloadable file, and a recording on disk comes back as
 * channel data with no `AudioContext` anywhere near it.
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

/**
 * Decode a WAV file to channel data.
 *
 * Accepts what a recording actually arrives as rather than only what we write:
 * 8/16/24/32-bit integer PCM and 32/64-bit float, any channel count, any sample
 * rate. Chunks it doesn't know (`LIST`, `bext`, the cue points a DAW leaves
 * behind) are skipped rather than rejected — a valid file from any recorder
 * should decode, and the alternative is telling the user their take is broken
 * when it plays fine everywhere else.
 *
 * `WAVE_FORMAT_EXTENSIBLE` is unwrapped to the format its GUID names, which is
 * what most 24-bit recorders write.
 */
export function decodeWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("decodeWav: not a RIFF/WAVE file");
  }

  let format = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let data: { start: number; length: number } | null = null;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      numChannels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      // Extensible: the real format is the first two bytes of the subformat GUID.
      if (format === 0xfffe && size >= 40) format = view.getUint16(body + 24, true);
    } else if (id === "data") {
      // A streamed file can declare size 0 and run to the end of the file.
      data = { start: body, length: size === 0 ? bytes.byteLength - body : Math.min(size, bytes.byteLength - body) };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (!data) throw new Error("decodeWav: no data chunk");
  if (numChannels < 1 || sampleRate < 1) throw new Error("decodeWav: no usable fmt chunk");

  const bytesPerSample = bitsPerSample / 8;
  const read = sampleReader(format, bitsPerSample);
  const blockAlign = bytesPerSample * numChannels;
  const numFrames = Math.floor(data.length / blockAlign);

  const channels = Array.from({ length: numChannels }, () => new Float32Array(numFrames));
  for (let frame = 0; frame < numFrames; frame++) {
    const base = data.start + frame * blockAlign;
    for (let ch = 0; ch < numChannels; ch++) {
      channels[ch]![frame] = read(view, base + ch * bytesPerSample);
    }
  }
  return { sampleRate, channels };
}

/** One sample → a float in [-1, 1], for the encodings a recorder might hand us. */
function sampleReader(format: number, bits: number): (view: DataView, at: number) => number {
  if (format === 3) {
    if (bits === 32) return (v, at) => v.getFloat32(at, true);
    if (bits === 64) return (v, at) => v.getFloat64(at, true);
  }
  if (format === 1) {
    // 8-bit WAV is unsigned with 128 as silence; every wider depth is signed.
    if (bits === 8) return (v, at) => (v.getUint8(at) - 128) / 128;
    if (bits === 16) return (v, at) => v.getInt16(at, true) / 0x8000;
    if (bits === 24) {
      return (v, at) => {
        const raw = v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getUint8(at + 2) << 16);
        return (raw & 0x800000 ? raw - 0x1000000 : raw) / 0x800000;
      };
    }
    if (bits === 32) return (v, at) => v.getInt32(at, true) / 0x80000000;
  }
  throw new Error(`decodeWav: unsupported format ${format} at ${bits}-bit`);
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

function floatToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
