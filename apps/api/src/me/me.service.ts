import { ConflictException, Injectable } from "@nestjs/common";
import { type MeResponse, suggestHandle } from "@wanderer/shared";
import { Prisma, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

export function toMeResponse(user: User): MeResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    pictureUrl: user.pictureUrl,
    handle: user.handle,
    role: user.role,
    showAdult: user.showAdult,
    suggestedHandle: user.handle === null ? suggestHandle(user.email) : null,
  };
}

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saves the handle. The unique index decides a race between two users, so a taken handle gives 409, not 500. */
  async setHandle(userId: string, handle: string): Promise<MeResponse> {
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: { handle } });
      return toMeResponse(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ error: "handle_taken" });
      }
      throw error;
    }
  }
}
