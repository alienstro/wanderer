import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CharacterComment,
  type CommentListResponse,
  COMMENTS_PAGE_SIZE,
  commentListQuerySchema,
  createCommentRequestSchema,
} from "@wanderer/shared";
import { decodeTimeCursor, encodeTimeCursor } from "../characters/cursor.js";
import { assertCharacterAccess, characterAccess } from "../characters/visibility.js";
import { isUuid } from "../common/uuid.js";
import type { Prisma, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const NOT_FOUND = { error: "not_found" };

const commentInclude = {
  author: { select: { handle: true } },
  character: { select: { creatorId: true } },
} satisfies Prisma.CharacterCommentInclude;

type CommentRow = Prisma.CharacterCommentGetPayload<{ include: typeof commentInclude }>;

/** The author, the creator of the character, and an admin can delete a comment. */
function canDelete(row: { authorId: string; character: { creatorId: string } }, viewer: User | null): boolean {
  return viewer !== null && (viewer.id === row.authorId || viewer.id === row.character.creatorId || viewer.role === "admin");
}

function toComment(row: CommentRow, viewer: User | null): CharacterComment {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    authorHandle: row.author.handle,
    isOwn: viewer?.id === row.authorId,
    canDelete: canDelete(row, viewer),
  };
}

/**
 * Deletes all comments of a user and takes them from the counts of the characters. One statement does both,
 * so a comment that the user posts at the same time cannot change the count wrongly. A ban and an account
 * delete use it.
 */
export async function deleteCommentsOf(tx: Prisma.TransactionClient, authorId: string): Promise<void> {
  await tx.$executeRaw`
    WITH gone AS (
      UPDATE character_comments SET deleted_at = now() AT TIME ZONE 'UTC'
      WHERE author_id = ${authorId}::uuid AND deleted_at IS NULL
      RETURNING character_id
    )
    UPDATE characters c SET comment_count = c.comment_count - g.n
    FROM (SELECT character_id, count(*)::int AS n FROM gone GROUP BY character_id) g
    WHERE c.id = g.character_id`;
}

/**
 * Deletes one comment and takes 1 from the count of its character, inside the transaction of the caller. The update
 * accepts only a comment that is not deleted, so it gives false and changes no count for a second delete.
 */
export async function deleteComment(tx: Prisma.TransactionClient, commentId: string, characterId: string): Promise<boolean> {
  const gone = await tx.characterComment.updateMany({ where: { id: commentId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (gone.count === 0) {
    return false;
  }
  await tx.character.update({ where: { id: characterId }, data: { commentCount: { decrement: 1 } } });
  return true;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gives one page of the comments, newest first. The viewer must see the character. */
  async list(characterId: string, viewer: User | null, query: unknown): Promise<CommentListResponse> {
    const parsed = commentListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_query" });
    }
    const { cursor } = parsed.data;
    const after = cursor === undefined ? null : decodeTimeCursor(cursor);
    if (cursor !== undefined && after === null) {
      throw new BadRequestException({ error: "invalid_cursor" });
    }
    const character = await this.findCharacter(characterId);
    assertCharacterAccess(character, viewer);

    const afterKey = after ? new Date(after.createdAt) : null;
    const rows = await this.prisma.characterComment.findMany({
      where: {
        characterId: character.id,
        deletedAt: null,
        ...(after && afterKey
          ? { OR: [{ createdAt: { lt: afterKey } }, { createdAt: afterKey, id: { lt: after.id } }] }
          : {}),
      },
      include: commentInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: COMMENTS_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, COMMENTS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map((row) => toComment(row, viewer)),
      nextCursor:
        rows.length > COMMENTS_PAGE_SIZE && last
          ? encodeTimeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
      count: character.commentCount,
    };
  }

  /** Saves a comment and adds 1 to the count in one transaction. */
  async create(characterId: string, user: User, body: unknown): Promise<CharacterComment> {
    const parsed = createCommentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_request" });
    }
    const character = await this.findCharacter(characterId);
    assertCharacterAccess(character, user);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.characterComment.create({
        data: { characterId: character.id, authorId: user.id, body: parsed.data.body },
        include: commentInclude,
      });
      await tx.character.update({ where: { id: character.id }, data: { commentCount: { increment: 1 } } });
      return created;
    });
    return toComment(row, user);
  }

  /**
   * Deletes a comment. The update accepts only a comment that is not deleted, so a second click takes nothing
   * more from the count. A user who cannot see the character gets 404, so a private character stays secret.
   */
  async remove(commentId: string, user: User): Promise<void> {
    const row = isUuid(commentId)
      ? await this.prisma.characterComment.findUnique({ where: { id: commentId }, include: { character: true } })
      : null;
    if (!row || row.deletedAt !== null) {
      throw new NotFoundException(NOT_FOUND);
    }
    if (!canDelete(row, user)) {
      throw characterAccess(row.character, user) === "ok"
        ? new ForbiddenException({ error: "forbidden" })
        : new NotFoundException(NOT_FOUND);
    }
    await this.prisma.$transaction(async (tx) => {
      if (!(await deleteComment(tx, row.id, row.characterId))) {
        throw new NotFoundException(NOT_FOUND);
      }
    });
  }

  private findCharacter(id: string) {
    return isUuid(id) ? this.prisma.character.findUnique({ where: { id } }) : Promise.resolve(null);
  }
}
