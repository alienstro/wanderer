import { z } from "zod";

/** The version of the Terms of Service and the Privacy Policy that a user accepts at login. */
export const TERMS_VERSION = "2026-10-21";

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** A handle has 3 to 20 characters: lowercase a-z, 0-9, and _. The schema trims and lowercases the input first. */
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/);

/** Makes a handle suggestion from the part of the email before "@" and before "+". */
export function suggestHandle(email: string): string {
  const local = email.split("@")[0]?.split("+")[0] ?? "";
  const handle = local
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, HANDLE_MAX);
  return handle.length < HANDLE_MIN ? `${handle}_user` : handle;
}

export const meResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  pictureUrl: z.string().nullable(),
  handle: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  /** True when the user sees 18+ characters. It can be true only after the 18+ confirm. */
  showAdult: z.boolean(),
  /** A handle suggestion for the handle step. It is null when the user has a handle. */
  suggestedHandle: z.string().nullable(),
});

export const updateMeRequestSchema = z.object({ handle: handleSchema });

export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

export type MeResponse = z.infer<typeof meResponseSchema>;
