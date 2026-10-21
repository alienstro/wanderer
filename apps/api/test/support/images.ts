import { crc32 } from "node:zlib";
import sharp from "sharp";

/** Makes a small PNG in one color. */
export function pngImage(width = 300, height = 300): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .png()
    .toBuffer();
}

/** Makes a JPEG with EXIF GPS data. */
export function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "1/1 2/1 3/1" } })
    .jpeg()
    .toBuffer();
}

/**
 * Makes a PNG whose header says width × height, without the pixels of that size.
 * The real image is 1×1, so the test does not use a large amount of memory.
 */
export async function pngWithFakeSize(width: number, height: number): Promise<Buffer> {
  const png = Buffer.from(await pngImage(1, 1));
  // The IHDR chunk starts at byte 8: length (4), type (4), width (4), height (4), and 5 more bytes, then the CRC.
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}
