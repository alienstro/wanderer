import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createCommentReportRequestSchema, createReportRequestSchema } from "@wanderer/shared";
import { characterAccess } from "../characters/visibility.js";
import { isUuid } from "../common/uuid.js";
import { Prisma, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** A user can send this number of reports in 24 hours. */
export const REPORTS_EACH_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Saves a report. A character that the user cannot see gives 404, so a report does not show that a
   * private character exists.
   */
  async create(user: User, characterId: string, body: unknown): Promise<{ id: string }> {
    const parsed = createReportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_request" });
    }
    const character = isUuid(characterId)
      ? await this.prisma.character.findUnique({ where: { id: characterId } })
      : null;
    if (!character || characterAccess(character, user) !== "ok") {
      throw new NotFoundException({ error: "not_found" });
    }
    if (character.creatorId === user.id) {
      throw new BadRequestException({ error: "own_character" });
    }
    return this.save(user, {
      characterId: character.id,
      characterTitle: character.title,
      reason: parsed.data.reason,
      note: parsed.data.note,
    });
  }

  /**
   * Saves a report about a comment. A deleted comment, or a comment that the user cannot see, gives 404.
   * The report keeps the character, so the admin sees where the comment is.
   */
  async createForComment(user: User, commentId: string, body: unknown): Promise<{ id: string }> {
    const parsed = createCommentReportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_request" });
    }
    const comment = isUuid(commentId)
      ? await this.prisma.characterComment.findUnique({ where: { id: commentId }, include: { character: true } })
      : null;
    if (!comment || comment.deletedAt !== null || characterAccess(comment.character, user) !== "ok") {
      throw new NotFoundException({ error: "not_found" });
    }
    if (comment.authorId === user.id) {
      throw new BadRequestException({ error: "own_comment" });
    }
    return this.save(user, {
      characterId: comment.characterId,
      characterTitle: comment.character.title,
      target: "comment",
      commentId: comment.id,
      reason: parsed.data.reason,
      note: parsed.data.note,
    });
  }

  /**
   * Saves a report within the daily limit. The unique indexes decide a race between two clicks, so the
   * second gives 409.
   */
  private async save(
    user: User,
    data: Omit<Prisma.ReportUncheckedCreateInput, "reporterId">,
  ): Promise<{ id: string }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // The lock holds until the end of the transaction, so two reports at the same time cannot both
        // pass the count. It locks only the reports of this user.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${user.id}`}))`;
        const today = await tx.report.count({
          where: { reporterId: user.id, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
        });
        if (today >= REPORTS_EACH_DAY) {
          throw new HttpException({ error: "report_limit" }, HttpStatus.TOO_MANY_REQUESTS);
        }
        return tx.report.create({ data: { ...data, reporterId: user.id }, select: { id: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ error: "already_reported" });
      }
      throw error;
    }
  }
}
