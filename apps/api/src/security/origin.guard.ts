import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ENV, type Env } from "../config/env.js";

const SKIP_ORIGIN_CHECK = "skipOriginCheck";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Turns off the origin check for one route. The route must check the origin itself. */
export const SkipOriginCheck = () => SetMetadata(SKIP_ORIGIN_CHECK, true);

function hasBody(req: Request): boolean {
  const length = req.headers["content-length"];
  return req.headers["transfer-encoding"] !== undefined || (length !== undefined && length !== "0");
}

/**
 * CSRF protection. Both hosts are on alienstro.xyz, so SameSite=Lax does not stop a request
 * from another app on that site. A request that changes data must come from the web origin,
 * and a request with a body must send JSON.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) {
      return true;
    }
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ORIGIN_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }
    if (req.headers.origin !== this.env.WEB_ORIGIN) {
      throw new ForbiddenException({ error: "origin_not_allowed" });
    }
    if (hasBody(req) && !req.is("application/json")) {
      throw new ForbiddenException({ error: "json_required" });
    }
    return true;
  }
}
