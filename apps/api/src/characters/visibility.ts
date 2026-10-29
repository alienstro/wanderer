import { NotFoundException } from "@nestjs/common";
import type { User } from "../generated/prisma/client.js";

export type CharacterAccess = "ok" | "not_found";

/**
 * Says if the viewer can see a character. The admin always can. An old 18+ character is hidden from all other
 * users until the delete command removes it. The creator sees each own character. Another user sees only a
 * published, public character. The character page, the chats, and the reports use this rule.
 */
export function characterAccess(
  row: { creatorId: string; status: string; isPublic: boolean; isAdult: boolean },
  viewer: User | null,
): CharacterAccess {
  if (viewer?.role === "admin") {
    return "ok";
  }
  if (row.isAdult) {
    return "not_found";
  }
  if (viewer?.id === row.creatorId) {
    return "ok";
  }
  return row.status === "published" && row.isPublic ? "ok" : "not_found";
}

type AccessRow = Parameters<typeof characterAccess>[0];

/** Throws 404 when the viewer cannot see the character. */
export function assertCharacterAccess<T extends AccessRow>(row: T | null, viewer: User | null): asserts row is T {
  if (!row || characterAccess(row, viewer) === "not_found") {
    throw new NotFoundException({ error: "not_found" });
  }
}
