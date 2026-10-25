import { Inject, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ENV, type Env } from "../config/env.js";
import { sendAppEvent } from "../events/app-events.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { GoogleProfile } from "./google-oidc.js";
import { SessionService } from "./session.service.js";

export type LoginResult =
  | { kind: "banned" }
  | { kind: "email_taken" }
  | { kind: "ok"; token: string; expiresAt: Date; hasHandle: boolean };

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * Creates or updates the user from the Google profile. ADMIN_EMAILS is the only source of the
   * admin role, so each login sets the role again. A banned user gets no session and no new terms record.
   */
  async loginWithGoogle(profile: GoogleProfile, termsVersion: string): Promise<LoginResult> {
    const email = profile.email.toLowerCase();
    const role = this.env.ADMIN_EMAILS.includes(email) ? "admin" : "user";
    const fields = { email, name: profile.name, pictureUrl: profile.picture, role } as const;
    let user;
    try {
      user = await this.prisma.user.upsert({
        where: { googleSub: profile.sub },
        create: { googleSub: profile.sub, ...fields },
        update: fields,
      });
    } catch (error) {
      // Another user row has this email, for example after Google gave the email to a new account.
      // The Google sub is the identity, so the API does not join the two accounts.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { kind: "email_taken" };
      }
      throw error;
    }
    if (user.bannedAt) {
      return { kind: "banned" };
    }
    await this.prisma.termsAcceptance.create({ data: { userId: user.id, version: termsVersion } });
    const session = await this.sessions.create(user.id);
    await sendAppEvent(this.emitter, "login", { userId: user.id });
    return { kind: "ok", ...session, hasHandle: user.handle !== null };
  }
}
