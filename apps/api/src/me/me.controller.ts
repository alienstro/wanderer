import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { type MeResponse, updateMeRequestSchema } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { MeService, toMeResponse } from "./me.service.js";

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: User): MeResponse {
    return toMeResponse(user);
  }

  @Patch()
  async update(@CurrentUser() user: User, @Body() body: unknown): Promise<MeResponse> {
    const parsed = updateMeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_handle" });
    }
    return this.me.setHandle(user.id, parsed.data.handle);
  }
}
