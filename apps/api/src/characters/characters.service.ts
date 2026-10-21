import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CharacterDetail, CharacterInput } from "@wanderer/shared";
import { isUuid } from "../common/uuid.js";
import { type CharacterStatus, Prisma, type User } from "../generated/prisma/client.js";
import { FilesService } from "../files/files.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { type CharacterDetailRow, characterDetailInclude, toCharacterDetail } from "./character-mapper.js";

const NOT_FOUND = { error: "not_found" };

/** The columns that the form writes. The openings and the tags are separate rows. */
function characterColumns(input: CharacterInput) {
  return {
    title: input.title,
    chatName: input.chatName,
    bio: input.bio,
    personality: input.personality,
    scenario: input.scenario,
    exampleDialogs: input.exampleDialogs,
    isAdult: input.isAdult,
    isPublic: input.isPublic,
    definitionVisible: input.definitionVisible,
    avatarFileId: input.avatarFileId,
  };
}

function openingRows(openings: string[]) {
  return openings.map((text, position) => ({ position, text }));
}

function tagRows(tags: string[]) {
  return tags.map((tagSlug) => ({ tagSlug }));
}

/** Changes a duplicate title into 409, because the unique index decides a race. */
function rethrowTitleTaken(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictException({ error: "title_taken" });
  }
  throw error;
}

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async create(user: User, input: CharacterInput): Promise<CharacterDetail> {
    await this.assertOwnAvatar(user, input.avatarFileId);
    const row = await this.prisma.character
      .create({
        data: {
          ...characterColumns(input),
          creatorId: user.id,
          status: input.publish ? "published" : "draft",
          openings: { create: openingRows(input.openings) },
          tags: { create: tagRows(input.tags) },
        },
        include: characterDetailInclude,
      })
      .catch(rethrowTitleTaken);
    return toCharacterDetail(row, user);
  }

  /** Gives the character when the viewer can see it. Another user gets 404, so a private character stays secret. */
  async findVisible(id: string, viewer: User | null): Promise<CharacterDetail> {
    const row = await this.findRow(id);
    if (!row || !this.canView(row, viewer)) {
      throw new NotFoundException(NOT_FOUND);
    }
    return toCharacterDetail(row, viewer);
  }

  async update(id: string, user: User, input: CharacterInput): Promise<CharacterDetail> {
    const current = await this.findOwnRow(id, user);
    await this.assertOwnAvatar(user, input.avatarFileId);
    // A hidden character stays hidden. Only an admin can show it again.
    const status: CharacterStatus = current.status === "hidden" ? "hidden" : input.publish ? "published" : "draft";
    // A nested write runs in one transaction, so the openings and the tags change with the character.
    const row = await this.prisma.character
      .update({
        where: { id },
        data: {
          ...characterColumns(input),
          status,
          openings: { deleteMany: {}, create: openingRows(input.openings) },
          tags: { deleteMany: {}, create: tagRows(input.tags) },
        },
        include: characterDetailInclude,
      })
      .catch(rethrowTitleTaken);
    if (current.avatarFileId && current.avatarFileId !== row.avatarFileId) {
      await this.files.remove(current.avatarFileId);
    }
    return toCharacterDetail(row, user);
  }

  /** Deletes the character and its avatar file. */
  async remove(id: string, user: User): Promise<void> {
    const current = await this.findOwnRow(id, user);
    await this.prisma.character.delete({ where: { id } });
    if (current.avatarFileId) {
      await this.files.remove(current.avatarFileId);
    }
  }

  private canView(row: CharacterDetailRow, viewer: User | null): boolean {
    if (viewer?.id === row.creatorId) {
      return true;
    }
    return row.status === "published" && row.isPublic;
  }

  private findRow(id: string): Promise<CharacterDetailRow | null> {
    if (!isUuid(id)) {
      return Promise.resolve(null);
    }
    return this.prisma.character.findUnique({ where: { id }, include: characterDetailInclude });
  }

  private async findOwnRow(id: string, user: User): Promise<CharacterDetailRow> {
    const row = await this.findRow(id);
    if (!row || row.creatorId !== user.id) {
      throw new NotFoundException(NOT_FOUND);
    }
    return row;
  }

  /** A character can use only an avatar that its creator uploaded. */
  private async assertOwnAvatar(user: User, fileId: string | null): Promise<void> {
    if (!fileId) {
      return;
    }
    const file = await this.prisma.file.findUnique({ where: { id: fileId }, select: { ownerId: true } });
    if (file?.ownerId !== user.id) {
      throw new BadRequestException({ error: "invalid_avatar" });
    }
  }
}
