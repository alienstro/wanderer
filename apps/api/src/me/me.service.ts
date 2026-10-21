import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { type MeResponse, suggestHandle, type UpdateMeRequest } from "@wanderer/shared";
import { Prisma, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The fields of the active proxy that the model card shows. */
export const activeProxySelect = { select: { id: true, name: true, model: true } } as const;

type ActiveProxy = MeResponse["activeProxy"];

export function toMeResponse(user: User, activeProxy: ActiveProxy): MeResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    pictureUrl: user.pictureUrl,
    handle: user.handle,
    role: user.role,
    showAdult: user.showAdult,
    replyChoicesOn: user.replyChoicesOn,
    activeProxy,
    suggestedHandle: user.handle === null ? suggestHandle(user.email) : null,
  };
}

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /** The /me answer of the user, with the active proxy for the model card. */
  async toResponse(user: User): Promise<MeResponse> {
    const activeProxy = user.activeProxyId
      ? await this.prisma.proxy.findUnique({ where: { id: user.activeProxyId }, ...activeProxySelect })
      : null;
    return toMeResponse(user, activeProxy);
  }

  /**
   * Saves the handle and "Show 18+". "Show 18+" can turn on only after the 18+ confirm.
   * The unique index decides a race between two users, so a taken handle gives 409, not 500.
   */
  async update(current: User, request: UpdateMeRequest): Promise<MeResponse> {
    if (request.showAdult === true && current.adultConfirmedAt === null) {
      throw new BadRequestException({ error: "adult_not_confirmed" });
    }
    try {
      const user = await this.prisma.user.update({
        where: { id: current.id },
        data: { handle: request.handle, showAdult: request.showAdult },
        include: { activeProxy: activeProxySelect },
      });
      return toMeResponse(user, user.activeProxy);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ error: "handle_taken" });
      }
      throw error;
    }
  }

  /** Keeps the time of the first confirm, so that a second confirm does not change it. */
  async confirmAdult(current: User): Promise<MeResponse> {
    const user = await this.prisma.user.update({
      where: { id: current.id },
      data: { showAdult: true, adultConfirmedAt: current.adultConfirmedAt ?? new Date() },
      include: { activeProxy: activeProxySelect },
    });
    return toMeResponse(user, user.activeProxy);
  }
}
