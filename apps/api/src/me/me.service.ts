import { ConflictException, Injectable } from "@nestjs/common";
import { type MeResponse, suggestHandle, type UpdateMeRequest } from "@wanderer/shared";
import { deleteCommentsOf } from "../comments/comments.service.js";
import { Prisma, type User } from "../generated/prisma/client.js";
import { FilesService } from "../files/files.service.js";
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
    replyChoicesOn: user.replyChoicesOn,
    replyChoicesPrompt: user.replyChoicesPrompt,
    activeProxy,
    suggestedHandle: user.handle === null ? suggestHandle(user.email) : null,
  };
}

/**
 * Makes a new proxy the active proxy when the user has no active proxy. The proxies module calls it inside the
 * transaction that saves the proxy. The me module owns the profile columns of users (docs/architecture.md).
 */
export async function activateFirstProxy(tx: Prisma.TransactionClient, userId: string, proxyId: string): Promise<void> {
  await tx.user.updateMany({ where: { id: userId, activeProxyId: null }, data: { activeProxyId: proxyId } });
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /**
   * Deletes the account. The cascades remove the characters, chats, comments, proxies, sessions, and file rows.
   * The comments first leave the comment counts. Reports by the user and about their characters stay without
   * the link. The file bytes go last.
   */
  async remove(user: User): Promise<void> {
    const paths = await this.files.pathsOf(user.id);
    await this.prisma.$transaction(async (tx) => {
      await deleteCommentsOf(tx, user.id);
      await tx.user.delete({ where: { id: user.id } });
    });
    await this.files.removeBytes(paths);
  }

  /** The /me answer of the user, with the active proxy for the model card. */
  async toResponse(user: User): Promise<MeResponse> {
    const activeProxy = user.activeProxyId
      ? await this.prisma.proxy.findUnique({ where: { id: user.activeProxyId }, ...activeProxySelect })
      : null;
    return toMeResponse(user, activeProxy);
  }

  /** Makes a proxy the active proxy. The caller checks that the user owns the proxy. */
  setActiveProxy(userId: string, proxyId: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { activeProxyId: proxyId } });
  }

  /** Picks a free model and clears the active proxy, so that the next reply uses the free model. */
  setFreeModel(userId: string, freeModelId: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { freeModelId, activeProxyId: null } });
  }

  /**
   * Saves the handle, the "Reply choices" switch, and the reply choices instructions.
   * The unique index decides a race between two users, so a taken handle gives 409, not 500.
   */
  async update(current: User, request: UpdateMeRequest): Promise<MeResponse> {
    try {
      const user = await this.prisma.user.update({
        where: { id: current.id },
        data: {
          handle: request.handle,
          replyChoicesOn: request.replyChoicesOn,
          replyChoicesPrompt: request.replyChoicesPrompt,
        },
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
}
