import { describe, it, expect } from "vitest";
import { decodeWav, encodeWav } from "./wav";

function ascii(bytes: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...bytes.slice(start, start + len));
}
function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer).getUint32(at, true);
}

describe("encodeWav", () => {
  it("writes a valid RIFF/WAVE header for mono", () => {
    const wav = encodeWav({ sampleRate: 44100, channels: [new Float32Array([0, 0.5, -0.5, 1])] });
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(u32(wav, 24)).toBe(44100); // sample rate
    expect(wav.length).toBe(44 + 4 * 2); // 4 mono frames * 2 bytes
  });

  it("interleaves stereo frames and reports data size", () => {
    const wav = encodeWav({
      sampleRate: 48000,
      channels: [new Float32Array([0, 1]), new Float32Array([0, -1])],
    });
    expect(u32(wav, 40)).toBe(2 * 2 * 2); // frames * channels * bytesPerSample
    const view = new DataView(wav.buffer);
    // frame 1: left = +full scale, right = -full scale
    expect(view.getInt16(44 + 4, true)).toBe(0x7fff);
    expect(view.getInt16(44 + 6, true)).toBe(-0x8000);
  });

  it("throws on mismatched channel lengths", () => {
    expect(() =>
      encodeWav({ sampleRate: 44100, channels: [new Float32Array(2), new Float32Array(3)] }),
    ).toThrow();
  });

  it("throws when there are no channels", () => {
    expect(() => encodeWav({ sampleRate: 44100, channels: [] })).toThrow();
  });
});

/**
 * Hand-build a WAV in a format `encodeWav` never writes, so the decoder is
 * tested against what other recorders produce rather than only against us.
 * `extraChunks` go between `fmt ` and `data`, where a DAW leaves its metadata.
 */
function buildWav(opts: {
  format: number;
  bits: number;
  sampleRate: number;
  /** Raw sample words, interleaved, already in the file's own encoding. */
  writeSample: (view: DataView, at: number, value: number) => void;
  frames: number[][];
  fmtSize?: number;
  extraChunks?: Array<[id: string, size: number]>;
}): Uint8Array {
  const { format, bits, sampleRate, writeSample, frames, fmtSize = 16, extraChunks = [] } = opts;
  const channels = frames[0]!.length;
  const bytesPerSample = bits / 8;
  const dataSize = frames.length * channels * bytesPerSample;
  const extraSize = extraChunks.reduce((sum, [, size]) => sum + 8 + size, 0);
  const bytes = new Uint8Array(12 + 8 + fmtSize + extraSize + 8 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVE");

  let at = 12;
  ascii(at, "fmt ");
  view.setUint32(at + 4, fmtSize, true);
  view.setUint16(at + 8, format, true);
  view.setUint16(at + 10, channels, true);
  view.setUint32(at + 12, sampleRate, true);
  view.setUint16(at + 22, bits, true);
  if (fmtSize >= 40) {
    view.setUint16(at + 26, 22, true); // cbSize
    view.setUint16(at + 32, 1, true); // subformat GUID: PCM
  }
  at += 8 + fmtSize;

  for (const [id, size] of extraChunks) {
    ascii(at, id);
    view.setUint32(at + 4, size, true);
    at += 8 + size;
  }

  ascii(at, "data");
  view.setUint32(at + 4, dataSize, true);
  at += 8;
  for (const frame of frames) {
    for (const sample of frame) {
      writeSample(view, at, sample);
      at += bytesPerSample;
    }
  }
  return bytes;
}

describe("decodeWav", () => {
  it("round-trips what encodeWav wrote", () => {
    const source = [0, 0.5, -0.5, 0.25];
    const decoded = decodeWav(encodeWav({ sampleRate: 44100, channels: [Float32Array.from(source)] }));
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels).toHaveLength(1);
    for (const [i, expected] of source.entries()) {
      expect(decoded.channels[0]![i]!).toBeCloseTo(expected, 4);
    }
  });

  it("keeps stereo channels apart", () => {
    const wav = encodeWav({
      sampleRate: 48000,
      channels: [new Float32Array([1, 0]), new Float32Array([0, -1])],
    });
    const { channels } = decodeWav(wav);
    expect(channels[0]![0]!).toBeCloseTo(1, 3);
    expect(channels[1]![1]!).toBeCloseTo(-1, 3);
  });

  it("decodes 24-bit PCM, the depth a field recorder writes", () => {
    const wav = buildWav({
      format: 1,
      bits: 24,
      sampleRate: 48000,
      frames: [[0x400000], [-0x400000]],
      writeSample: (view, at, value) => {
        const raw = value < 0 ? value + 0x1000000 : value;
        view.setUint8(at, raw & 0xff);
        view.setUint8(at + 1, (raw >> 8) & 0xff);
        view.setUint8(at + 2, (raw >> 16) & 0xff);
      },
    });
    const { channels } = decodeWav(wav);
    expect(channels[0]![0]!).toBeCloseTo(0.5, 5);
    expect(channels[0]![1]!).toBeCloseTo(-0.5, 5);
  });

  it("decodes 32-bit float", () => {
    const wav = buildWav({
      format: 3,
      bits: 32,
      sampleRate: 44100,
      frames: [[0.75], [-0.75]],
      writeSample: (view, at, value) => view.setFloat32(at, value, true),
    });
    const { channels } = decodeWav(wav);
    expect(channels[0]![0]!).toBeCloseTo(0.75, 6);
  });

  it("decodes 8-bit PCM, which is unsigned with 128 as silence", () => {
    const wav = buildWav({
      format: 1,
      bits: 8,
      sampleRate: 22050,
      frames: [[128], [255], [0]],
      writeSample: (view, at, value) => view.setUint8(at, value),
    });
    const { channels } = decodeWav(wav);
    expect(channels[0]![0]!).toBeCloseTo(0, 5);
    expect(channels[0]![1]!).toBeGreaterThan(0.9);
    expect(channels[0]![2]!).toBe(-1);
  });

  it("unwraps WAVE_FORMAT_EXTENSIBLE to the format its GUID names", () => {
    const wav = buildWav({
      format: 0xfffe,
      bits: 16,
      sampleRate: 44100,
      fmtSize: 40,
      frames: [[0x4000]],
      writeSample: (view, at, value) => view.setInt16(at, value, true),
    });
    expect(decodeWav(wav).channels[0]![0]!).toBeCloseTo(0.5, 4);
  });

  it("skips chunks it does not know rather than rejecting the file", () => {
    const wav = buildWav({
      format: 1,
      bits: 16,
      sampleRate: 44100,
      extraChunks: [["LIST", 10], ["bext", 4]],
      frames: [[0x4000]],
      writeSample: (view, at, value) => view.setInt16(at, value, true),
    });
    expect(decodeWav(wav).channels[0]![0]!).toBeCloseTo(0.5, 4);
  });

  it("rejects what is not a WAV, and formats it cannot read", () => {
    expect(() => decodeWav(new Uint8Array(4))).toThrow(/RIFF/);
    expect(() =>
      decodeWav(
        buildWav({
          format: 2, // ADPCM
          bits: 4,
          sampleRate: 44100,
          frames: [[0]],
          writeSample: () => {},
        }),
      ),
    ).toThrow(/unsupported format/);
  });
});
