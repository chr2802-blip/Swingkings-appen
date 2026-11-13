import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DEMO_PICTURE, DEMO_SCENES, demoPicture, demoPng } from "@/lib/demo-pictures";
import { MAX_PHOTO_BYTES, MAX_THUMB_BYTES, checkPhotoBytes } from "@/lib/photo-file";

/** The chunks of a PNG, by name, in order. */
function chunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: { type: string; data: Uint8Array }[] = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    out.push({ type: String.fromCharCode(...png.subarray(at + 4, at + 8)), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return out;
}

describe("the demo team's pictures", () => {
  it("are pictures the upload check accepts, at the size the feed shows and its thumbnail", () => {
    for (let scene = 0; scene < DEMO_SCENES; scene++) {
      const { full, thumb } = demoPicture(scene);
      expect(checkPhotoBytes(full, MAX_PHOTO_BYTES)).toEqual({
        ok: true, meta: { contentType: "image/png", width: DEMO_PICTURE.width, height: DEMO_PICTURE.height },
      });
      expect(checkPhotoBytes(thumb, MAX_THUMB_BYTES)).toEqual({
        ok: true, meta: { contentType: "image/png", width: DEMO_PICTURE.thumbWidth, height: DEMO_PICTURE.thumbHeight },
      });
    }
  });

  it("hold every pixel they say they do: a filter byte and three colours a pixel, row by row", () => {
    const parts = chunks(demoPng(0, 40, 30));
    expect(parts.map((part) => part.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(inflateSync(parts[1]!.data)).toHaveLength(30 * (1 + 40 * 3));
  });

  it("draw grass and chalk, and not the same picture for every scene", () => {
    const pixels = inflateSync(chunks(demoPng(0, 40, 30))[1]!.data);
    const colours = new Set<string>();
    for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) colours.add(pixels.subarray(y * 121 + 1 + x * 3, y * 121 + 4 + x * 3).join(","));
    expect(colours.size).toBe(3);
    expect(Buffer.from(demoPng(0, 40, 30)).equals(Buffer.from(demoPng(1, 40, 30)))).toBe(false);
  });

  it("wrap around, so any number is a scene", () => {
    expect(Buffer.from(demoPng(DEMO_SCENES, 40, 30)).equals(Buffer.from(demoPng(0, 40, 30)))).toBe(true);
    expect(Buffer.from(demoPng(-1, 40, 30)).equals(Buffer.from(demoPng(DEMO_SCENES - 1, 40, 30)))).toBe(true);
  });
});
