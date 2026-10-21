import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { TERMS_VERSION } from "@wanderer/shared";
import type { CookieOptions, Request, Response } from "express";
import { z } from "zod";
import { ENV, type Env } from "../config/env.js";
import { AuthService } from "./auth.service.js";
import { GOOGLE_OIDC, type GoogleOidc } from "./google-oidc.js";
import { clearSessionCookieOptions, SESSION_COOKIE, sessionCookieOptions } from "./session-cookie.js";
import { SessionService } from "./session.service.js";

const OAUTH_COOKIE = "wanderer_oauth";
const clearOauthCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/auth/google",
  signed: true,
};
const oauthCookieOptions: CookieOptions = { ...clearOauthCookieOptions, maxAge: 10 * 60 * 1000 };
const oauthCookieSchema = z.object({ state: z.string(), codeVerifier: z.string(), terms: z.string() });

/** Login is 10 requests each minute for each client IP (spec section 10). */
const LOGIN_LIMIT = { default: { limit: 10, ttl: 60_000 } };

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(GOOGLE_OIDC) private readonly google: GoogleOidc,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Get("google")
  @Throttle(LOGIN_LIMIT)
  async start(@Query("terms") terms: unknown, @Res() res: Response): Promise<void> {
    if (terms !== TERMS_VERSION) {
      return res.redirect(302, this.webUrl("/login?error=terms"));
    }
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    // The redirect URI comes only from the config. Never build it from the request.
    const url = await this.google.authorizationUrl({
      state,
      codeVerifier,
      redirectUri: this.env.GOOGLE_CALLBACK_URL,
    });
    res.cookie(OAUTH_COOKIE, { state, codeVerifier, terms }, oauthCookieOptions);
    res.redirect(302, url);
  }

  @Get("google/callback")
  @Throttle(LOGIN_LIMIT)
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const signed = req.signedCookies as Record<string, unknown> | undefined;
    const stored = oauthCookieSchema.safeParse(signed?.[OAUTH_COOKIE]);
    res.clearCookie(OAUTH_COOKIE, clearOauthCookieOptions);

    const { error, state, code } = req.query;
    if (error !== undefined) {
      return res.redirect(302, this.webUrl("/login?error=cancelled"));
    }
    if (!stored.success || typeof state !== "string" || typeof code !== "string" || !sameText(state, stored.data.state)) {
      throw new BadRequestException("invalid_oauth_state");
    }

    const callbackUrl = new URL(this.env.GOOGLE_CALLBACK_URL);
    callbackUrl.search = new URL(req.originalUrl, "http://localhost").search;
    let profile;
    try {
      profile = await this.google.exchange({ callbackUrl, codeVerifier: stored.data.codeVerifier, state });
    } catch (exchangeError) {
      // The message of the error has no code or token.
      this.logger.warn(`Google code exchange failed: ${(exchangeError as Error).name}`);
      throw new BadRequestException("oauth_exchange_failed");
    }
    if (!profile.emailVerified) {
      return res.redirect(302, this.webUrl("/login?error=email"));
    }

    const result = await this.auth.loginWithGoogle(profile, stored.data.terms);
    if (result.kind === "banned") {
      return res.redirect(302, this.webUrl("/login?error=banned"));
    }
    res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
    res.redirect(302, this.webUrl(result.hasHandle ? "/" : "/onboarding"));
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (token) {
      await this.sessions.revoke(token);
    }
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions);
  }

  private webUrl(path: string): string {
    return `${this.env.WEB_ORIGIN}${path}`;
  }
}
