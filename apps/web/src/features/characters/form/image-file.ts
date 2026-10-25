import { IMAGE_UPLOAD_MAX_BYTES } from "@wanderer/shared";
import { apiFetch } from "@/lib/api";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const BAD_IMAGE_MESSAGE = "Use a PNG, JPEG, or WebP image of 5 MB or less.";

/** True for a file that the API can accept. The API checks the real image again. */
export function isAllowedImage(file: File): boolean {
  return IMAGE_TYPES.has(file.type) && file.size <= IMAGE_UPLOAD_MAX_BYTES;
}

/** Sends one image in the multipart field "file". */
export function uploadImage<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<T>(path, { method: "POST", body });
}
