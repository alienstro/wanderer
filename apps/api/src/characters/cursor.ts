import { z } from "zod";

/** The sort key of the last item of a page. The next page starts after it. */
export interface CursorKey {
  chatCount: number;
  likeCount: number;
  createdAt: string;
  id: string;
}

const cursorKeySchema = z.object({
  chatCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

/** Makes an opaque cursor. The client sends it back without a change. */
export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

/** Reads a cursor. It gives null for a cursor that the API did not make. */
export function decodeCursor(cursor: string): CursorKey | null {
  try {
    const parsed = cursorKeySchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
