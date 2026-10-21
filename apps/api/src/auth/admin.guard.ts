import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthedRequest } from "./session.guard.js";

/** Lets a request through only for a user with the admin role. It runs after SessionGuard, which sets req.user. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.role !== "admin") {
      throw new ForbiddenException({ error: "forbidden" });
    }
    return true;
  }
}
