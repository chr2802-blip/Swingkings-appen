import { deflateSync } from "node:zlib";

/**
 * Pictures for the demo team's feed and chat (`src/lib/demo-team.ts`): a football pitch
 * seen from above, drawn here rather than shipped as files, so the demo team brings its
 * own pictures and nobody's photograph is in the repository. Each scene is the same pitch
 * in another light and another crop, which is enough for the feed to look lived in.
 */
type Rgb = readonly [number, number, number];
type Scene = { light: Rgb; dark: Rgb; line: Rgb; x: number; y: number; zoom: number };

const SCENES: readonly Scene[] = [
  { light: [76, 153, 78], dark: [64, 138, 68], line: [240, 244, 240], x: 0, y: 0, zoom: 1 },
  { light: [58, 128, 96], dark: [48, 112, 86], line: [226, 236, 232], x: 0, y: 0.15, zoom: 0.6 },
  { light: [134, 148, 70], dark: [120, 132, 60], line: [250, 240, 214], x: 0.3, y: 0.2, zoom: 0.55 },
  { light: [92, 140, 104], dark: [82, 126, 96], line: [236, 240, 244], x: 0.45, y: 0.1, zoom: 0.55 },
  { light: [48, 104, 72], dark: [40, 90, 64], line: [214, 224, 220], x: 0.2, y: 0.3, zoom: 0.5 },
  { light: [104, 164, 84], dark: [90, 148, 74], line: [255, 255, 255], x: 0.1, y: 0, zoom: 0.8 },
];

export const DEMO_SCENES = SCENES.length;
export const DEMO_PICTURE = { width: 960, height: 720, thumbWidth: 240, thumbHeight: 180 } as const;

/** Whether a point on the pitch (both axes 0–1) is on a chalk line. */
function onLine(u: number, v: number): boolean {
  const t = 0.004;
  const near = (a: number, b: number) => Math.abs(a - b) < t;
  const inside = u > 0.05 - t && u < 0.95 + t && v > 0.06 - t && v < 0.94 + t;
  if (!inside) return false;
  if (near(u, 0.05) || near(u, 0.95) || near(v, 0.06) || near(v, 0.94) || near(u, 0.5)) return true;
  // The picture is 4:3, so a circle on it is drawn with the width stretched back.
  const fromCentre = Math.hypot((u - 0.5) * (4 / 3), v - 0.5);
  if (near(fromCentre, 0.13) || fromCentre < 0.008) return true;
  for (const [edge, depth] of [[0.05, 0.14], [0.95, -0.14]] as const) {
    const front = edge + depth;
    const between = (u - edge) * (front - u) >= 0;
    if (between && (near(v, 0.26) || near(v, 0.74))) return true;
    if (near(u, front) && v > 0.26 && v < 0.74) return true;
  }
  return false;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) crc = CRC[(crc ^ out[i]!) & 0xff]! ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}

/** One scene as a PNG of the size asked for. `scene` wraps, so any number is a picture. */
export function demoPng(scene: number, width: number, height: number): Uint8Array {
  const { light, dark, line, x, y, zoom } = SCENES[((scene % SCENES.length) + SCENES.length) % SCENES.length]!;
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let py = 0; py < height; py++) {
    const v = y + ((py + 0.5) / height) * zoom;
    for (let px = 0; px < width; px++) {
      const u = x + ((px + 0.5) / width) * zoom;
      const colour = onLine(u, v) ? line : Math.floor(u * 12) % 2 ? dark : light;
      const at = py * row + 1 + px * 3;
      raw[at] = colour[0];
      raw[at + 1] = colour[1];
      raw[at + 2] = colour[2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits a channel, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A scene at the size the feed shows and the size of its thumbnail. */
export function demoPicture(scene: number): { full: Uint8Array; thumb: Uint8Array } {
  return {
    full: demoPng(scene, DEMO_PICTURE.width, DEMO_PICTURE.height),
    thumb: demoPng(scene, DEMO_PICTURE.thumbWidth, DEMO_PICTURE.thumbHeight),
  };
}
