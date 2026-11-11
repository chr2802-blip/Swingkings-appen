/**
 * The smallest files `readPhotoMeta` accepts: a valid header stating the dimensions,
 * and nothing after it worth decoding. The server never decodes, so this is enough.
 */
export function pngBytes(width = 4, height = 3): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  view.setUint32(12, 0x49484452); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

export function jpegBytes(width = 4, height = 3, { withApp0 = true } = {}): Uint8Array {
  const app0 = withApp0 ? [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)] : [];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...new Array(12).fill(0)]);
}

function riff(format: string, body: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.max(30, 20 + body.length));
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([...format].map((c) => c.charCodeAt(0)), 12);
  bytes.set(body, 20);
  return bytes;
}

/** Lossy WebP ("VP8 "): 14-bit dimensions at 26 and 28. */
export function webpLossyBytes(width = 4, height = 3): Uint8Array {
  const body = new Array(6).fill(0);
  body.push(width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f);
  return riff("VP8 ", body);
}

/** Extended WebP ("VP8X"): 24-bit dimensions minus one, at 24 and 27. */
export function webpExtendedBytes(width = 4, height = 3): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const body = [0, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff];
  return riff("VP8X", body);
}

/** Lossless WebP ("VP8L"): width-1 and height-1 packed 14 bits each from byte 21. */
export function webpLosslessBytes(width = 4, height = 3): Uint8Array {
  const packed = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  const body = [0x2f, packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >> 24) & 0xff];
  return riff("VP8L", body);
}
