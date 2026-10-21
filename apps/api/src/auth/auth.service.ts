import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { GoogleProfile } from "./google-oidc.js";
import { SessionService } from "./session.service.js";

export type LoginResult =
  | { kind: "banned" }
  | { kind: "ok"; token: string; expiresAt: Date; hasHandle: boolean };

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Creates or updates the user from the Google profile. ADMIN_EMAILS is the only source of the
   * admin role, so each login sets the role again. A banned user gets no session and no new terms record.
   */
  async loginWithGoogle(profile: GoogleProfile, termsVersion: string): Promise<LoginResult> {
    const email = profile.email.toLowerCase();
    const role = this.env.ADMIN_EMAILS.includes(email) ? "admin" : "user";
    const fields = { email, name: profile.name, pictureUrl: profile.picture, role } as const;
    const user = await this.prisma.user.upsert({
      where: { googleSub: profile.sub },
      create: { googleSub: profile.sub, ...fields },
      update: fields,
    });
    if (user.bannedAt) {
      return { kind: "banned" };
    }
    await this.prisma.termsAcceptance.create({ data: { userId: user.id, version: termsVersion } });
    const session = await this.sessions.create(user.id);
    return { kind: "ok", ...session, hasHandle: user.handle !== null };
  }
}
