import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_LIFETIME_MS = 30 * DAY_MS;
/** A session renews on use when it has less than this time left. So it renews at most one time each day. */
const RENEW_BELOW_MS = 29 * DAY_MS;

export interface ValidSession {
  user: User;
  expiresAt: Date;
  renewed: boolean;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Bans a user inside the transaction of the caller: it sets the ban time and ends all sessions at once. A second
 * ban keeps the time of the first ban. The auth module owns the sign-in columns of users (docs/architecture.md).
 */
export async function banUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.user.updateMany({ where: { id: userId, bannedAt: null }, data: { bannedAt: new Date() } });
  await tx.session.deleteMany({ where: { userId } });
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Makes a session. Only the hash of the token goes to the database. */
  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await this.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
    return { token, expiresAt };
  }

  /** Returns the user of the session, or null for an unknown token, an expired session, or a banned user. */
  async validate(token: string): Promise<User | null> {
    return (await this.validateSession(token))?.user ?? null;
  }

  /** Same as validate. It also gives the expiry, so that the caller can renew the cookie. */
  async validateSession(token: string): Promise<ValidSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() <= now || session.user.bannedAt) {
      return null;
    }
    if (session.expiresAt.getTime() - now >= RENEW_BELOW_MS) {
      return { user: session.user, expiresAt: session.expiresAt, renewed: false };
    }
    const expiresAt = new Date(now + SESSION_LIFETIME_MS);
    // updateMany does not throw when a logout deleted the row after the read. No row means no session.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id },
      data: { expiresAt, lastSeenAt: new Date(now) },
    });
    if (count === 0) {
      return null;
    }
    return { user: session.user, expiresAt, renewed: true };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
