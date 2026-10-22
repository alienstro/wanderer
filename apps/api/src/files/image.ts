import { IMAGE_UPLOAD_MAX_BYTES } from "@wanderer/shared";
import sharp from "sharp";

export const AVATAR_WIDTH = 600;
export const AVATAR_HEIGHT = 800;
export const MAX_UPLOAD_BYTES = IMAGE_UPLOAD_MAX_BYTES;

/** A larger image could use all the memory of the server. */
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);

/** The input is not a PNG, JPEG, or WebP image, or it is too large. */
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

/**
 * Makes the stored avatar: a new 600×800 WebP with no metadata.
 * sharp reads the real type from the bytes, not from the file name or the Content-Type.
 */
export async function toAvatarWebp(input: Buffer): Promise<{ data: Buffer; width: 600; height: 800 }> {
  const options = { limitInputPixels: MAX_INPUT_PIXELS };
  const meta = await sharp(input, options)
    .metadata()
    .catch(() => {
      throw new InvalidImageError("The input is not an image");
    });
  const format = meta.format;
  const pixels = (meta.width ?? 0) * (meta.height ?? 0);
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new InvalidImageError(`The format ${format ?? "unknown"} is not allowed`);
  }
  if (pixels === 0 || pixels > MAX_INPUT_PIXELS) {
    throw new InvalidImageError("The image has too many pixels");
  }
  try {
    // rotate() applies the EXIF orientation. sharp writes no metadata unless the code asks for it.
    const data = await sharp(input, options)
      .rotate()
      .resize(AVATAR_WIDTH, AVATAR_HEIGHT, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
    return { data, width: AVATAR_WIDTH, height: AVATAR_HEIGHT };
  } catch {
    throw new InvalidImageError("The image data is broken");
  }
}
