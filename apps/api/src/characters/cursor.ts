import { z } from "zod";

/** The sort key of the last item of a page. The next page starts after it. */
export interface CursorKey {
  chatCount: number;
  likeCount: number;
  createdAt: string;
  id: string;
}

/** The sort key of the last row of a page that sorts by time, then by ID, such as a comment or an app event. */
export interface TimeCursorKey {
  createdAt: string;
  id: string;
}

/** The sort key of the last row of a ranked list, such as the top characters. Rows sort by count, then by ID. */
export interface CountCursorKey {
  count: number;
  id: string;
}

/** The sort key of the last open report of a page. Reports about minors come first, then by time, then by ID. */
export interface ReportCursorKey {
  minors: boolean;
  createdAt: string;
  id: string;
}

const cursorKeySchema = z.object({
  chatCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

const timeCursorKeySchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

const countCursorKeySchema = z.object({
  count: z.number().int().nonnegative(),
  id: z.uuid(),
});

const reportCursorKeySchema = z.object({
  minors: z.boolean(),
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

export function encodeTimeCursor(key: TimeCursorKey): string {
  return encode(key);
}

export function decodeTimeCursor(cursor: string): TimeCursorKey | null {
  return decode(cursor, timeCursorKeySchema);
}

export function encodeCountCursor(key: CountCursorKey): string {
  return encode(key);
}

export function decodeCountCursor(cursor: string): CountCursorKey | null {
  return decode(cursor, countCursorKeySchema);
}

export function encodeReportCursor(key: ReportCursorKey): string {
  return encode(key);
}

export function decodeReportCursor(cursor: string): ReportCursorKey | null {
  return decode(cursor, reportCursorKeySchema);
}
