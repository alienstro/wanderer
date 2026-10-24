import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CharacterLikeState } from "@wanderer/shared";
import { isUuid } from "../common/uuid.js";
import { Prisma, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertCharacterAccess } from "./visibility.js";

/**
 * Likes of a character. A trigger on character_likes keeps characters.like_count, so this service only adds or
 * removes the row. Both calls are idempotent: a retry or a double tap cannot change the count twice.
 */
@Injectable()
export class CharacterLikesService {
  constructor(private readonly prisma: PrismaService) {}

  async like(id: string, user: User): Promise<CharacterLikeState> {
    await this.assertLikeable(id, user);
    await this.prisma.characterLike
      .createMany({ data: [{ userId: user.id, characterId: id }], skipDuplicates: true })
      .catch(rethrowDeletedCharacter);
    return this.state(id, true);
  }

  async unlike(id: string, user: User): Promise<CharacterLikeState> {
    await this.assertLikeable(id, user);
    await this.prisma.characterLike.deleteMany({ where: { userId: user.id, characterId: id } });
    return this.state(id, false);
  }

  /** The user must see the character, as on the character page. A creator cannot like their own character. */
  private async assertLikeable(id: string, user: User): Promise<void> {
    const row = isUuid(id)
      ? await this.prisma.character.findUnique({
          where: { id },
          select: { creatorId: true, status: true, isPublic: true, isAdult: true },
        })
      : null;
    assertCharacterAccess(row, user);
    if (row.creatorId === user.id) {
      throw new BadRequestException({ error: "own_character" });
    }
  }

  private async state(id: string, likedByMe: boolean): Promise<CharacterLikeState> {
    const row = await this.prisma.character.findUnique({ where: { id }, select: { likeCount: true } });
    if (!row) {
      throw new NotFoundException({ error: "not_found" });
    }
    return { likeCount: row.likeCount, likedByMe };
  }
}

/** The creator can delete the character after the check. The foreign key then fails, and the answer is 404. */
function rethrowDeletedCharacter(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    throw new NotFoundException({ error: "not_found" });
  }
  throw error;
}
