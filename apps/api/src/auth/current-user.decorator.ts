import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { User } from "../generated/prisma/client.js";
import type { AuthedRequest } from "./session.guard.js";

/** Gives the user that SessionGuard found. Use it only on a route with SessionGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): User => {
  const user = context.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) {
    throw new Error("CurrentUser needs SessionGuard on the route");
  }
  return user;
});
