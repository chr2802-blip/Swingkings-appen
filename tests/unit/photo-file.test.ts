import { describe, expect, it } from "vitest";
import { MAX_PHOTO_EDGE, MAX_THUMB_BYTES, checkPhotoBytes, readPhotoMeta } from "@/lib/photo-file";
import { MAX_EDGE, THUMB_EDGE } from "@/lib/downscale";
import { jpegBytes, pngBytes, webpExtendedBytes, webpLosslessBytes, webpLossyBytes } from "../helpers/images";

describe("readPhotoMeta", () => {
  it("reads every format the browser can send", () => {
    expect(readPhotoMeta(pngBytes(640, 480))).toEqual({ contentType: "image/png", width: 640, height: 480 });
    expect(readPhotoMeta(jpegBytes(1280, 720))).toEqual({ contentType: "image/jpeg", width: 1280, height: 720 });
    expect(readPhotoMeta(jpegBytes(10, 20, { withApp0: false }))).toEqual({ contentType: "image/jpeg", width: 10, height: 20 });
    expect(readPhotoMeta(webpLossyBytes(300, 200))).toEqual({ contentType: "image/webp", width: 300, height: 200 });
    expect(readPhotoMeta(webpLosslessBytes(300, 200))).toEqual({ contentType: "image/webp", width: 300, height: 200 });
    expect(readPhotoMeta(webpExtendedBytes(5000, 4000))).toEqual({ contentType: "image/webp", width: 5000, height: 4000 });
  });

  it("refuses what is not one of the three, whatever it claims", () => {
    const text = (s: string) => new TextEncoder().encode(s.padEnd(40, " "));
    expect(readPhotoMeta(text("GIF89a"))).toBeNull();
    expect(readPhotoMeta(text("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(readPhotoMeta(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0]))).toBeNull(); // scan before any frame
    expect(readPhotoMeta(new Uint8Array([0xff, 0xd8, 0x00]))).toBeNull();
    expect(readPhotoMeta(pngBytes().slice(0, 20))).toBeNull();
    expect(readPhotoMeta(new Uint8Array())).toBeNull();
  });
});

describe("checkPhotoBytes", () => {
  it("accepts what the browser produces", () => {
    expect(checkPhotoBytes(jpegBytes(MAX_EDGE, MAX_EDGE), 1_000_000)).toMatchObject({ ok: true });
  });

  it("refuses empty, too heavy, too many pixels and not a picture — in Danish", () => {
    expect(checkPhotoBytes(new Uint8Array(), 10)).toEqual({ ok: false, error: "Billedet er tomt." });
    expect(checkPhotoBytes(pngBytes(), 10)).toEqual({ ok: false, error: "Billedet er for stort til at gemme." });
    expect(checkPhotoBytes(pngBytes(MAX_PHOTO_EDGE + 1, 10), 1000)).toEqual({ ok: false, error: "Billedet har for mange pixels." });
    expect(checkPhotoBytes(pngBytes(0, 10), 1000)).toEqual({ ok: false, error: "Billedet skal være JPEG, PNG eller WebP." });
    expect(checkPhotoBytes(new Uint8Array(50).fill(1), 1000)).toEqual({ ok: false, error: "Billedet skal være JPEG, PNG eller WebP." });
  });

  it("leaves the browser's targets room under the server's limits", () => {
    expect(MAX_EDGE).toBeLessThan(MAX_PHOTO_EDGE);
    expect(THUMB_EDGE).toBeLessThan(MAX_EDGE);
    expect(MAX_THUMB_BYTES).toBeGreaterThan(50_000);
  });
});
