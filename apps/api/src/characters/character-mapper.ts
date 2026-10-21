import { type CharacterCard, type CharacterDetail, type Tag, TAGS } from "@wanderer/shared";
import type { Prisma, User } from "../generated/prisma/client.js";
import { fileUrl } from "../files/files.service.js";

/** The relations that a card needs. */
export const characterCardInclude = {
  creator: { select: { handle: true } },
  tags: { select: { tagSlug: true } },
} satisfies Prisma.CharacterInclude;

/** The relations that a character page needs. */
export const characterDetailInclude = {
  ...characterCardInclude,
  openings: { orderBy: { position: "asc" } },
} satisfies Prisma.CharacterInclude;

export type CharacterCardRow = Prisma.CharacterGetPayload<{ include: typeof characterCardInclude }>;
export type CharacterDetailRow = Prisma.CharacterGetPayload<{ include: typeof characterDetailInclude }>;

/** Gives the tags in the order of the tag list, so that the order does not depend on the database. */
function toTags(links: { tagSlug: string }[]): Tag[] {
  const slugs = new Set(links.map((link) => link.tagSlug));
  return TAGS.filter((tag) => slugs.has(tag.slug));
}

export function toCharacterCard(row: CharacterCardRow): CharacterCard {
  return {
    id: row.id,
    title: row.title,
    chatName: row.chatName,
    avatarUrl: row.avatarFileId ? fileUrl(row.avatarFileId) : null,
    isAdult: row.isAdult,
    tags: toTags(row.tags),
    chatCount: row.chatCount,
    creatorHandle: row.creator.handle ?? "",
  };
}

/**
 * The definition is null when the creator hides it and the viewer is not the creator. The admin always gets it,
 * because a report can be about the definition.
 */
export function toCharacterDetail(row: CharacterDetailRow, viewer: User | null): CharacterDetail {
  const isOwner = viewer?.id === row.creatorId;
  return {
    ...toCharacterCard(row),
    bio: row.bio,
    status: row.status,
    isPublic: row.isPublic,
    definitionVisible: row.definitionVisible,
    openings: row.openings.map((opening) => opening.text),
    definition:
      row.definitionVisible || isOwner || viewer?.role === "admin"
        ? { personality: row.personality, scenario: row.scenario, exampleDialogs: row.exampleDialogs }
        : null,
    isOwner,
    createdAt: row.createdAt.toISOString(),
  };
}
