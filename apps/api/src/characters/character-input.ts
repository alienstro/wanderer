import { BadRequestException } from "@nestjs/common";
import { type CharacterInput, characterInputSchema } from "@wanderer/shared";
import type { CharacterDetailRow } from "./character-mapper.js";

/** Checks the form fields. A bad body gives 400 with the names of the bad fields. */
export function parseCharacterInput(body: unknown): CharacterInput {
  const parsed = characterInputSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    throw new BadRequestException({ error: "invalid_character", fields });
  }
  return parsed.data;
}

/** The saved character as form fields. A PATCH body changes only the fields that it sends. */
export function rowToInput(row: CharacterDetailRow): CharacterInput {
  return {
    title: row.title,
    chatName: row.chatName,
    bio: row.bio,
    tags: row.tags.map((tag) => tag.tagSlug) as CharacterInput["tags"],
    personality: row.personality,
    scenario: row.scenario,
    openings: row.openings.map((opening) => opening.text),
    exampleDialogs: row.exampleDialogs,
    avatarFileId: row.avatarFileId,
    isPublic: row.isPublic,
    definitionVisible: row.definitionVisible,
    publish: row.status !== "draft",
  };
}

/** Puts the fields of a PATCH body over the saved fields, then checks the result. */
export function mergeCharacterInput(row: CharacterDetailRow, body: unknown): CharacterInput {
  const patch = typeof body === "object" && body !== null && !Array.isArray(body) ? body : {};
  return parseCharacterInput({ ...rowToInput(row), ...patch });
}
