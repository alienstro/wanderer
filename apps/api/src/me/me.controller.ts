import { Controller, Get, UseGuards } from "@nestjs/common";
import type { MeResponse } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";

export function toMeResponse(user: User): MeResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    pictureUrl: user.pictureUrl,
    handle: user.handle,
    role: user.role,
  };
}

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  me(@CurrentUser() user: User): MeResponse {
    return toMeResponse(user);
  }
}
