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

/** Hides a character, inside the transaction of the caller. An admin action on a report uses it. */
export async function hideCharacter(tx: Prisma.TransactionClient, characterId: string): Promise<void> {
  await tx.character.update({ where: { id: characterId }, data: { status: "hidden" } });
}

/** Hides each published character of a creator, inside the transaction of the caller. A ban uses it. */
export async function hideCharactersOf(tx: Prisma.TransactionClient, creatorId: string): Promise<void> {
  await tx.character.updateMany({ where: { creatorId, status: "published" }, data: { status: "hidden" } });
}

/**
 * Deletes a character inside the transaction of the caller, and gives the id of its avatar file. The caller removes
 * the file after the transaction, with CharactersService.removeAvatarFile.
 */
export async function deleteCharacter(tx: Prisma.TransactionClient, characterId: string): Promise<string | null> {
  const deleted = await tx.character.delete({ where: { id: characterId }, select: { avatarFileId: true } });
  return deleted.avatarFileId;
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

  /** Gives the character when the viewer can see it. assertCharacterAccess gives the 404. */
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

  /**
   * Deletes each old 18+ character with its chats, its scene images and its avatar, for the one-time command
   * `delete-adult-characters`. A dry run only counts. The rows go in one transaction, then the bytes go. A storage
   * error goes to the log, because the rows are already deleted. A second run finds nothing.
   */
  async removeAdultCharacters(options: { dryRun: boolean }): Promise<{ characters: number; chats: number; files: number }> {
    const characters = await this.prisma.character.findMany({ where: { isAdult: true }, select: { id: true, avatarFileId: true } });
    const ids = characters.map((character) => character.id);
    const avatarIds = characters.flatMap((character) => (character.avatarFileId ? [character.avatarFileId] : []));
    const files = await this.prisma.file.findMany({
      where: { OR: [{ id: { in: avatarIds } }, { sceneImage: { chat: { characterId: { in: ids } } } }] },
      select: { id: true, path: true },
    });
    const chats = await this.prisma.chat.count({ where: { characterId: { in: ids } } });
    const counts = { characters: ids.length, chats, files: files.length };
    if (options.dryRun || ids.length === 0) {
      return counts;
    }
    // The chats, the messages and the likes of each character go by the cascade of the character row.
    await this.prisma.$transaction([
      this.prisma.character.deleteMany({ where: { id: { in: ids } } }),
      this.files.deleteRows(files.map((file) => file.id)),
    ]);
    await this.files.removeBytes(files.map((file) => file.path));
    return counts;
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
