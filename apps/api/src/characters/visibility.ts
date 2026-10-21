import type { User } from "../generated/prisma/client.js";
import { canSeeAdult } from "./adult.js";

export type CharacterAccess = "ok" | "not_found" | "adult_content";

/**
 * Says if the viewer can see a character. The creator and the admin always can. Another user sees only a
 * published, public character, and an 18+ character only with "Show 18+" on. The character page, the chats,
 * and the reports use this rule.
 */
export function characterAccess(
  row: { creatorId: string; status: string; isPublic: boolean; isAdult: boolean },
  viewer: User | null,
): CharacterAccess {
  if (viewer?.id === row.creatorId || viewer?.role === "admin") {
    return "ok";
  }
  if (row.status !== "published" || !row.isPublic) {
    return "not_found";
  }
  return row.isAdult && !canSeeAdult(viewer) ? "adult_content" : "ok";
}
