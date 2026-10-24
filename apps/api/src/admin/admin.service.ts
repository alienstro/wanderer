import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { type AdminReport, type ReportAction, resolveReportRequestSchema } from "@wanderer/shared";
import { CharactersService } from "../characters/characters.service.js";
import { deleteCommentsOf } from "../comments/comments.service.js";
import { isUuid } from "../common/uuid.js";
import type { Prisma, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The admin page shows this number of open reports or less. */
const LIST_MAX = 200;

const reportInclude = {
  character: { select: { id: true, creatorId: true, status: true, creator: { select: { handle: true } } } },
  reporter: { select: { handle: true } },
  comment: { select: { id: true, body: true, authorId: true, deletedAt: true, author: { select: { handle: true } } } },
} satisfies Prisma.ReportInclude;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

function toAdminReport(row: ReportRow): AdminReport {
  const { character, comment } = row;
  return {
    id: row.id,
    reason: row.reason,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    characterTitle: row.characterTitle,
    character: character
      ? { id: character.id, creatorId: character.creatorId, creatorHandle: character.creator.handle, status: character.status }
      : null,
    reporterHandle: row.reporter?.handle ?? null,
    target: row.target,
    comment: comment
      ? {
          id: comment.id,
          body: comment.body,
          authorId: comment.authorId,
          authorHandle: comment.author.handle,
          deleted: comment.deletedAt !== null,
        }
      : null,
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characters: CharactersService,
  ) {}

  /** Gives the open reports. Reports about minors come first, then the oldest first. */
  async listOpen(): Promise<AdminReport[]> {
    const order = { createdAt: "asc" } as const;
    const minors = await this.prisma.report.findMany({
      where: { status: "open", reason: "minors" },
      include: reportInclude,
      orderBy: order,
      take: LIST_MAX,
    });
    const others = await this.prisma.report.findMany({
      where: { status: "open", reason: { not: "minors" } },
      include: reportInclude,
      orderBy: order,
      take: LIST_MAX - minors.length,
    });
    return [...minors, ...others].map(toAdminReport);
  }

  /**
   * Closes a report and does its action. The close and the action are in one transaction, and the close
   * accepts only an open report, so a second click gives 409 and does not do the action again.
   * An action on the character also closes all other open character reports of that character. On a comment
   * report, "hidden" and "deleted" delete the comment, "banned" bans its author, and an action closes all other
   * open reports of that comment.
   */
  async resolve(admin: User, reportId: string, body: unknown): Promise<AdminReport> {
    const parsed = resolveReportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_request" });
    }
    const { action } = parsed.data;
    const report = isUuid(reportId) ? await this.prisma.report.findUnique({ where: { id: reportId } }) : null;
    if (!report) {
      throw new NotFoundException({ error: "not_found" });
    }
    if (report.status === "closed") {
      throw new ConflictException({ error: "report_closed" });
    }
    const { characterId, commentId } = report;
    if (action !== "none" && characterId === null) {
      throw new ConflictException({ error: "character_gone" });
    }
    // The comment row goes with an account delete. An action must not then fall through to the character.
    if (action !== "none" && report.target === "comment" && commentId === null) {
      throw new ConflictException({ error: "comment_gone" });
    }
    const closed = { status: "closed" as const, action, resolvedById: admin.id, resolvedAt: new Date() };

    const avatarFileId = await this.prisma.$transaction(async (tx) => {
      const own = await tx.report.updateMany({ where: { id: report.id, status: "open" }, data: closed });
      if (own.count === 0) {
        throw new ConflictException({ error: "report_closed" });
      }
      if (action === "none" || characterId === null) {
        return null;
      }
      if (report.target === "comment" && commentId !== null) {
        await this.resolveCommentInTransaction(tx, commentId, action, closed);
        return null;
      }
      await tx.report.updateMany({ where: { characterId, target: "character", status: "open" }, data: closed });
      if (action === "banned") {
        const character = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
        await this.banInTransaction(tx, character.creatorId);
        return null;
      }
      if (action === "hidden") {
        await tx.character.update({ where: { id: characterId }, data: { status: "hidden" } });
        return null;
      }
      const deleted = await tx.character.delete({ where: { id: characterId }, select: { avatarFileId: true } });
      return deleted.avatarFileId;
    });
    if (avatarFileId) {
      await this.characters.removeAvatarFile(avatarFileId);
    }
    const row = await this.prisma.report.findUniqueOrThrow({ where: { id: report.id }, include: reportInclude });
    return toAdminReport(row);
  }

  /** Does the action of a comment report and closes the other open reports of the comment. */
  private async resolveCommentInTransaction(
    tx: Prisma.TransactionClient,
    commentId: string,
    action: Exclude<ReportAction, "none">,
    closed: Prisma.ReportUpdateManyMutationInput,
  ): Promise<void> {
    await tx.report.updateMany({ where: { commentId, status: "open" }, data: closed });
    const comment = await tx.characterComment.findUniqueOrThrow({ where: { id: commentId } });
    if (action === "banned") {
      await this.banInTransaction(tx, comment.authorId);
      return;
    }
    const gone = await tx.characterComment.updateMany({
      where: { id: commentId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (gone.count > 0) {
      await tx.character.update({ where: { id: comment.characterId }, data: { commentCount: { decrement: 1 } } });
    }
  }

  /** Bans a user. The ban ends their sessions at once and hides their published characters and their comments. */
  async ban(userId: string): Promise<void> {
    if (!isUuid(userId)) {
      throw new NotFoundException({ error: "not_found" });
    }
    await this.prisma.$transaction((tx) => this.banInTransaction(tx, userId));
  }

  /** A second ban keeps the time of the first ban. An admin cannot be banned. */
  private async banInTransaction(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ error: "not_found" });
    }
    if (user.role === "admin") {
      throw new BadRequestException({ error: "cannot_ban_admin" });
    }
    await tx.user.updateMany({ where: { id: userId, bannedAt: null }, data: { bannedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.character.updateMany({ where: { creatorId: userId, status: "published" }, data: { status: "hidden" } });
    await deleteCommentsOf(tx, userId);
  }
}
