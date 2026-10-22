import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import type { User } from "../generated/prisma/client.js";
import { clearSessionCookieOptions, SESSION_COOKIE, sessionCookieOptions } from "./session-cookie.js";
import { SessionService } from "./session.service.js";

export interface AuthedRequest extends Request {
  user?: User;
  sessionToken?: string;
}

/** Lets a request through only with a valid session. It renews the cookie when the session renews. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    const session = token ? await this.sessions.validateSession(token) : null;
    if (!token || !session) {
      res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions);
      throw new UnauthorizedException({ error: "unauthorized" });
    }
    if (session.renewed) {
      res.cookie(SESSION_COOKIE, token, sessionCookieOptions(session.expiresAt));
    }
    req.user = session.user;
    req.sessionToken = token;
    return true;
  }
}

/**
 * Sets req.user when the session cookie is valid, and lets every request through.
 * A route with this guard serves visitors and users, and reads the user with @OptionalUser().
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    const session = token ? await this.sessions.validateSession(token) : null;
    if (token && session) {
      if (session.renewed) {
        http.getResponse<Response>().cookie(SESSION_COOKIE, token, sessionCookieOptions(session.expiresAt));
      }
      req.user = session.user;
      req.sessionToken = token;
    }
    return true;
  }
}
