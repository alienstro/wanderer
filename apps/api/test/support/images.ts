import { crc32, deflateSync } from "node:zlib";
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

/** Puts a tEXt chunk with the keyword and the text directly after the IHDR chunk, as a Tavern card does. */
export function withTextChunk(png: Buffer, keyword: string, text: string): Buffer {
  const data = Buffer.concat([Buffer.from(keyword, "latin1"), Buffer.from([0]), Buffer.from(text, "latin1")]);
  return withChunk(png, "tEXt", data);
}

/** Puts a compressed iTXt chunk directly after the IHDR chunk. */
export function withCompressedItxtChunk(png: Buffer, keyword: string, text: string): Buffer {
  const data = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    // The null after the keyword, the compression flag 1, the method 0, an empty language, and an empty translated keyword.
    Buffer.from([0, 1, 0, 0, 0]),
    deflateSync(Buffer.from(text, "utf8")),
  ]);
  return withChunk(png, "iTXt", data);
}

function withChunk(png: Buffer, chunkType: string, data: Buffer): Buffer {
  const type = Buffer.from(chunkType, "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  // The signature has 8 bytes, and the IHDR chunk has 25 bytes.
  const afterIhdr = 8 + 25;
  return Buffer.concat([png.subarray(0, afterIhdr), length, type, data, crc, png.subarray(afterIhdr)]);
}

/** Encodes a card object as the base64 JSON that a Tavern PNG keeps. */
export function cardText(card: unknown): string {
  return Buffer.from(JSON.stringify(card), "utf8").toString("base64");
}
