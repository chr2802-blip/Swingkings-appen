import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/*
 * The badge is the small picture in the phone's status bar when a notification arrives —
 * the crown from the logo. Android draws only its alpha channel, in one colour, so a
 * picture with a background shows up as a plain square.
 */

const root = join(__dirname, "..", "..");
const worker = readFileSync(join(root, "public", "sw.js"), "utf8");

/** Decodes an 8-bit RGBA, non-interlaced PNG — the only kind the badge is saved as. */
function decodeRgba(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString("latin1");
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      // bit depth 8, colour type 6 (RGBA), no interlacing
      expect([body[8], body[9], body[12]]).toEqual([8, 6, 0]);
    }
    if (type === "IDAT") data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];
  return { width, height, pixels, alphaAt };
}

describe("the notification badge", () => {
  const path = /badge:\s*"\/([^"]+)"/.exec(worker)?.[1];

  it("is named by the service worker and is there", () => {
    expect(path).toBe("badge.png");
  });

  const badge = decodeRgba(readFileSync(join(root, "public", path ?? "badge.png")));

  it("is 96 × 96", () => {
    expect([badge.width, badge.height]).toEqual([96, 96]);
  });

  it("is white only, so nothing but the shape decides what is drawn", () => {
    for (let i = 0; i < badge.pixels.length; i += 4) {
      if (badge.pixels[i + 3] === 0) continue;
      expect([badge.pixels[i], badge.pixels[i + 1], badge.pixels[i + 2]]).toEqual([255, 255, 255]);
    }
  });

  it("is a shape on nothing, not a filled square", () => {
    for (const [x, y] of [[0, 0], [95, 0], [0, 95], [95, 95]]) expect(badge.alphaAt(x, y)).toBe(0);
    let solid = 0;
    for (let i = 3; i < badge.pixels.length; i += 4) if (badge.pixels[i] === 255) solid++;
    const share = solid / (96 * 96);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.7);
  });

  it("is the crown: three points at the top, with gaps between them, and the star cut out", () => {
    // Runs of solid pixels along a row: three near the top (the points), and the
    // star makes a hole in the body lower down.
    const runs = (y: number) => {
      let count = 0;
      for (let x = 0; x < 96; x++) if (badge.alphaAt(x, y) > 127 && (x === 0 || badge.alphaAt(x - 1, y) <= 127)) count++;
      return count;
    };
    expect(runs(24)).toBe(3);
    const rows = Array.from({ length: 96 }, (_, y) => runs(y));
    expect(rows.slice(50).some((count) => count === 2)).toBe(true);
    expect(rows[88]).toBe(1);
  });
});
