import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, encodePng } from "./png";

/** Read a big-endian uint32, the only integer PNG uses. */
function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
}

/** Walk the chunk list: [type, data] in file order. */
function chunks(png: Uint8Array): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  let at = 8; // past the signature
  while (at < png.length) {
    const length = u32(png, at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push([type, png.subarray(at + 8, at + 8 + length)]);
    at += 12 + length;
  }
  return out;
}

const RED = Uint8Array.from([255, 0, 0, 255]);

function solid(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) out.set(rgba, i * 4);
  return out;
}

describe("crc32", () => {
  // The spec's own check value, which is the only way to know the table is right.
  it("matches the known CRC of 'IEND'", () => {
    expect(crc32(Uint8Array.from([73, 69, 78, 68]))).toBe(0xae426082);
  });
});

describe("encodePng", () => {
  it("opens with the PNG signature", () => {
    const png = encodePng(1, 1, RED);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("writes IHDR, IDAT and IEND in that order", () => {
    expect(chunks(encodePng(2, 3, solid(2, 3, RED))).map(([type]) => type)).toEqual([
      "IHDR",
      "IDAT",
      "IEND",
    ]);
  });

  it("declares the size, 8-bit depth and RGBA colour type", () => {
    const header = chunks(encodePng(4, 7, solid(4, 7, RED)))[0]![1];
    expect(u32(header, 0)).toBe(4);
    expect(u32(header, 4)).toBe(7);
    expect([...header.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  });

  it("round-trips the pixels through the IDAT, one filter byte per row", () => {
    const rgba = solid(2, 2, RED);
    rgba.set([0, 0, 255, 128], 4); // second pixel of row 1: blue, half alpha
    const idat = chunks(encodePng(2, 2, rgba)).find(([type]) => type === "IDAT")![1];
    const raw = new Uint8Array(inflateSync(idat));
    // 2 rows × (1 filter byte + 2 pixels × 4 bytes)
    expect([...raw]).toEqual([
      0, 255, 0, 0, 255, 0, 0, 255, 128,
      0, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);
  });

  it("checksums every chunk over its type and data", () => {
    const png = encodePng(3, 3, solid(3, 3, RED));
    let at = 8;
    while (at < png.length) {
      const length = u32(png, at);
      const body = png.subarray(at + 4, at + 8 + length); // type + data
      expect(u32(png, at + 8 + length)).toBe(crc32(body));
      at += 12 + length;
    }
  });

  it("refuses a pixel buffer that is not width × height × 4", () => {
    expect(() => encodePng(2, 2, RED)).toThrow(/needs 16 RGBA bytes, got 4/);
  });

  it("refuses a zero or fractional size", () => {
    expect(() => encodePng(0, 4, new Uint8Array(0))).toThrow(/positive integers/);
    expect(() => encodePng(1.5, 4, new Uint8Array(24))).toThrow(/positive integers/);
  });
});
