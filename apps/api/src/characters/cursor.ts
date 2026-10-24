import { z } from "zod";

/** The sort key of the last item of a page. The next page starts after it. */
export interface CursorKey {
  chatCount: number;
  likeCount: number;
  createdAt: string;
  id: string;
}

/** The sort key of the last comment of a page. Comments sort by time, then by ID. */
export interface CommentCursorKey {
  createdAt: string;
  id: string;
}

const cursorKeySchema = z.object({
  chatCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

const commentCursorKeySchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

/** Makes an opaque cursor. The client sends it back without a change. */
function encode(key: object): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

/** Reads a cursor. It gives null for a cursor that the API did not make. */
function decode<T>(cursor: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeCursor(key: CursorKey): string {
  return encode(key);
}

export function decodeCursor(cursor: string): CursorKey | null {
  return decode(cursor, cursorKeySchema);
}

export function encodeCommentCursor(key: CommentCursorKey): string {
  return encode(key);
}

export function decodeCommentCursor(cursor: string): CommentCursorKey | null {
  return decode(cursor, commentCursorKeySchema);
}
