import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createReportRequestSchema } from "@wanderer/shared";
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
   * private character exists. The unique index decides a race between two clicks, so the second gives 409.
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
    const today = await this.prisma.report.count({
      where: { reporterId: user.id, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (today >= REPORTS_EACH_DAY) {
      throw new HttpException({ error: "report_limit" }, HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      const report = await this.prisma.report.create({
        data: {
          characterId: character.id,
          characterTitle: character.title,
          reporterId: user.id,
          reason: parsed.data.reason,
          note: parsed.data.note,
        },
        select: { id: true },
      });
      return report;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ error: "already_reported" });
      }
      throw error;
    }
  }
}
