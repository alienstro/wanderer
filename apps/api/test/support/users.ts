import type { NestExpressApplication } from "@nestjs/platform-express";
import { SESSION_COOKIE } from "../../src/auth/session-cookie.js";
import { SessionService } from "../../src/auth/session.service.js";
import type { User } from "../../src/generated/prisma/client.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";

export interface TestUser {
  user: User;
  /** The Cookie header for a session of this user. */
  cookie: string;
}

/** Makes a user with a handle and a session. */
export async function userWithSession(
  app: NestExpressApplication,
  n: number,
  data: { showAdult?: boolean; adultConfirmedAt?: Date | null; role?: "user" | "admin" } = {},
): Promise<TestUser> {
  const user = await app.get(PrismaService).user.create({
    data: { email: `user${n}@example.com`, googleSub: `google-sub-${n}`, name: `User ${n}`, handle: `user_${n}`, ...data },
  });
  const { token } = await app.get(SessionService).create(user.id);
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}
