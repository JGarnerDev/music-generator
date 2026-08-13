import { describe, it, expect } from "vitest";
import { encodeWav } from "./wav";

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
