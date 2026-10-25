import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ADMIN_PAGE_SIZE,
  type AdminReport,
  type AdminReportList,
  adminReportListQuerySchema,
  type ReportAction,
  resolveReportRequestSchema,
} from "@wanderer/shared";
import { banUser } from "../auth/session.service.js";
import { CharactersService, deleteCharacter, hideCharacter, hideCharactersOf } from "../characters/characters.service.js";
import { decodeReportCursor, encodeReportCursor } from "../characters/cursor.js";
import { deleteComment, deleteCommentsOf } from "../comments/comments.service.js";
import { isUuid } from "../common/uuid.js";
import type { Prisma, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { closeCharacterReports, closeCommentReports, closeReport } from "../reports/reports.service.js";

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

  /**
   * Gives one page of the open reports. Reports about minors come first, then the oldest first. A page that ends in
   * the minors continues with the rest of the minors, then with the other reports.
   */
  async listOpen(query: unknown): Promise<AdminReportList> {
    const parsed = adminReportListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_query" });
    }
    const { cursor } = parsed.data;
    const after = cursor === undefined ? null : decodeReportCursor(cursor);
    if (cursor !== undefined && after === null) {
      throw new BadRequestException({ error: "invalid_cursor" });
    }
    const afterTime = after ? new Date(after.createdAt) : null;
    const afterRow =
      after && afterTime
        ? { OR: [{ createdAt: { gt: afterTime } }, { createdAt: afterTime, id: { gt: after.id } }] }
        : {};
    const order = [{ createdAt: "asc" }, { id: "asc" }] as const;
    const want = ADMIN_PAGE_SIZE + 1;
    const minors =
      after === null || after.minors
        ? await this.prisma.report.findMany({
            where: { status: "open", reason: "minors", ...afterRow },
            include: reportInclude,
            orderBy: [...order],
            take: want,
          })
        : [];
    const others =
      minors.length < want
        ? await this.prisma.report.findMany({
            where: { status: "open", reason: { not: "minors" }, ...(after?.minors === false ? afterRow : {}) },
            include: reportInclude,
            orderBy: [...order],
            take: want - minors.length,
          })
        : [];
    const rows = [...minors, ...others];
    const page = rows.slice(0, ADMIN_PAGE_SIZE);
    const last = page.at(-1);
    return {
      reports: page.map(toAdminReport),
      nextCursor:
        rows.length > ADMIN_PAGE_SIZE && last
          ? encodeReportCursor({ minors: last.reason === "minors", createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
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
      if (!(await closeReport(tx, report.id, closed))) {
        throw new ConflictException({ error: "report_closed" });
      }
      if (action === "none" || characterId === null) {
        return null;
      }
      if (report.target === "comment" && commentId !== null) {
        await this.resolveCommentInTransaction(tx, commentId, action, closed);
        return null;
      }
      await closeCharacterReports(tx, characterId, closed);
      if (action === "banned") {
        const character = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
        await this.banInTransaction(tx, character.creatorId);
        return null;
      }
      if (action === "hidden") {
        await hideCharacter(tx, characterId);
        return null;
      }
      return deleteCharacter(tx, characterId);
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
    await closeCommentReports(tx, commentId, closed);
    const comment = await tx.characterComment.findUniqueOrThrow({ where: { id: commentId } });
    if (action === "banned") {
      await this.banInTransaction(tx, comment.authorId);
      return;
    }
    await deleteComment(tx, commentId, comment.characterId);
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
    await banUser(tx, userId);
    await hideCharactersOf(tx, userId);
    await deleteCommentsOf(tx, userId);
  }
}
