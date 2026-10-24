import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { CharacterDetail, CharacterInput } from "@wanderer/shared";
import { isUuid } from "../common/uuid.js";
import { type CharacterStatus, Prisma, type User } from "../generated/prisma/client.js";
import { FilesService } from "../files/files.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { mergeCharacterInput } from "./character-input.js";
import { type CharacterDetailRow, characterDetailInclude, toCharacterDetail } from "./character-mapper.js";
import { assertCharacterAccess } from "./visibility.js";

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

/** Changes a unique index error into 400 or 409, because the unique indexes decide a race. */
function rethrowUniqueError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    if (JSON.stringify(error.meta ?? {}).includes("avatar_file_id")) {
      throw new BadRequestException({ error: "invalid_avatar" });
    }
    throw new ConflictException({ error: "title_taken" });
  }
  throw error;
}

@Injectable()
export class CharactersService {
  private readonly logger = new Logger(CharactersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async create(user: User, input: CharacterInput): Promise<CharacterDetail> {
    await this.assertFreeAvatar(user, input.avatarFileId, null);
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
      .catch(rethrowUniqueError);
    return toCharacterDetail(row, user, false);
  }

  /**
   * Gives the character when the viewer can see it. Another user gets 404, so a private character stays secret.
   * An 18+ character gives 403 with only the error code, so that the web can show the 18+ warning.
   */
  async findVisible(id: string, viewer: User | null): Promise<CharacterDetail> {
    const row = await this.findRow(id);
    assertCharacterAccess(row, viewer);
    const like = viewer
      ? await this.prisma.characterLike.findUnique({
          where: { userId_characterId: { userId: viewer.id, characterId: id } },
          select: { userId: true },
        })
      : null;
    return toCharacterDetail(row, viewer, like !== null);
  }

  /** Changes the fields that the body sends. The other fields keep their saved values. */
  async update(id: string, user: User, body: unknown): Promise<CharacterDetail> {
    const current = await this.findOwnRow(id, user);
    const input = mergeCharacterInput(current, body);
    await this.assertFreeAvatar(user, input.avatarFileId, id);
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
      .catch(rethrowUniqueError);
    if (current.avatarFileId && current.avatarFileId !== row.avatarFileId) {
      await this.removeAvatarFile(current.avatarFileId);
    }
    return toCharacterDetail(row, user, false);
  }

  /** Deletes the character and its avatar file. */
  async remove(id: string, user: User): Promise<void> {
    const current = await this.findOwnRow(id, user);
    await this.prisma.character.delete({ where: { id } });
    if (current.avatarFileId) {
      await this.removeAvatarFile(current.avatarFileId);
    }
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

  /**
   * The change is already saved, so a storage error must not give 500. The error goes to the log,
   * and the file stays on the volume. The admin delete also uses it.
   */
  async removeAvatarFile(fileId: string): Promise<void> {
    try {
      await this.files.remove(fileId);
    } catch (error) {
      this.logger.warn(`The old avatar file ${fileId} was not removed: ${String(error)}`);
    }
  }

  /** A character can use only an avatar that its creator uploaded and that no other character uses. */
  private async assertFreeAvatar(user: User, fileId: string | null, characterId: string | null): Promise<void> {
    if (!fileId) {
      return;
    }
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { ownerId: true, character: { select: { id: true } } },
    });
    const usedByOther = file?.character && file.character.id !== characterId;
    if (file?.ownerId !== user.id || usedByOther) {
      throw new BadRequestException({ error: "invalid_avatar" });
    }
  }
}
