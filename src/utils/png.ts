/**
 * A minimal PNG writer: pixels in, bytes out.
 *
 * Here for exactly one reason — an installable phone app needs a real raster
 * icon. A manifest will take an SVG, but iOS will not: `apple-touch-icon` has
 * to be a PNG or the home screen falls back to a screenshot of the page, which
 * is a grey rectangle of a keyboard nobody recognises. So the icon is *drawn*
 * (see [`scripts/keys-icon.ts`](../../scripts/keys-icon.ts)) rather than
 * committed as a binary, and this is the twenty lines that make a drawing a
 * file.
 *
 * Deliberately the smallest thing that is a valid PNG: 8-bit RGBA, no
 * interlacing, filter type 0 on every scanline. No palette, no colour-type
 * negotiation, no ancillary chunks. A PNG encoder that chose filters well would
 * be a better *compressor*, and the icons it produced would be a few hundred
 * bytes smaller than the ones this produces, which is not a problem anybody has.
 *
 * Node-only — it deflates with `node:zlib`. Nothing in `src/app` may import it;
 * the browser has no need to write an image, and pulling zlib into the bundle to
 * pretend otherwise would cost more than the icon does.
 */
import { deflateSync } from "node:zlib";

/** Bytes 0-3 of every PNG, so a reader can tell one from a text file. */
const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** RGBA, 8 bits per sample — colour type 6 in the spec's table. */
const COLOR_TYPE_RGBA = 6;
const BIT_DEPTH = 8;
const BYTES_PER_PIXEL = 4;

/**
 * Encode `width × height` RGBA pixels as a PNG.
 *
 * `rgba` is row-major, four bytes per pixel, top row first — the same order a
 * canvas `ImageData` uses, so a drawing routine can be written against either.
 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`png: width and height must be positive integers, got ${width}×${height}`);
  }
  const expected = width * height * BYTES_PER_PIXEL;
  if (rgba.length !== expected) {
    throw new Error(`png: ${width}×${height} needs ${expected} RGBA bytes, got ${rgba.length}`);
  }

  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header[8] = BIT_DEPTH;
  header[9] = COLOR_TYPE_RGBA;
  header[10] = 0; // compression: deflate, the only one there is
  header[11] = 0; // filtering: adaptive, the only one there is
  header[12] = 0; // interlacing: none

  return concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(filtered(width, height, rgba))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * The scanlines, each behind its filter byte.
 *
 * Filter 0 is "none" — the row is stored as-is. Every other filter predicts a
 * byte from its neighbours so deflate has smaller numbers to compress, which
 * matters for a photograph and not at all for a flat-coloured icon of six
 * rectangles.
 */
function filtered(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * BYTES_PER_PIXEL;
  const out = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    out[at] = 0;
    out.set(rgba.subarray(y * stride, (y + 1) * stride), at + 1);
  }
  return out;
}

/** One PNG chunk: length, type, data, CRC of type+data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const tag = Uint8Array.from([...type].map((char) => char.charCodeAt(0)));
  const out = new Uint8Array(12 + data.length);
  writeUint32(out, 0, data.length);
  out.set(tag, 4);
  out.set(data, 8);
  writeUint32(out, 8 + data.length, crc32(concat([tag, data])));
  return out;
}

function writeUint32(into: Uint8Array, at: number, value: number): void {
  into[at] = (value >>> 24) & 0xff;
  into[at + 1] = (value >>> 16) & 0xff;
  into[at + 2] = (value >>> 8) & 0xff;
  into[at + 3] = value & 0xff;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The table-driven CRC-32 the PNG spec specifies, built once on first use. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
