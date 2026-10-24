import { ForbiddenException, NotFoundException } from "@nestjs/common";
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

/**
 * Throws when the viewer cannot see the character. A missing or private character gives 404, so it stays secret.
 * An 18+ character gives 403 with only the error code, so that the web can show the 18+ warning.
 */
export function assertCharacterAccess<T extends Parameters<typeof characterAccess>[0]>(
  row: T | null,
  viewer: User | null,
): asserts row is T {
  const access = row ? characterAccess(row, viewer) : "not_found";
  if (access === "not_found") {
    throw new NotFoundException({ error: "not_found" });
  }
  if (access === "adult_content") {
    throw new ForbiddenException({ error: "adult_content" });
  }
}
