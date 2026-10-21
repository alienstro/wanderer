import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { type MeResponse, updateMeRequestSchema } from "@wanderer/shared";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { clearSessionCookieOptions, SESSION_COOKIE } from "../auth/session-cookie.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { MeService } from "./me.service.js";

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: User): Promise<MeResponse> {
    return this.me.toResponse(user);
  }

  @Patch()
  async update(@CurrentUser() user: User, @Body() body: unknown): Promise<MeResponse> {
    const parsed = updateMeRequestSchema.safeParse(body);
    if (!parsed.success) {
      const badHandle = parsed.error.issues.some((issue) => issue.path[0] === "handle");
      throw new BadRequestException({ error: badHandle ? "invalid_handle" : "invalid_request" });
    }
    return this.me.update(user, parsed.data);
  }

  /** The 18+ confirm. It saves the time of the first confirm and turns on "Show 18+". */
  @Post("adult-confirm")
  confirmAdult(@CurrentUser() user: User): Promise<MeResponse> {
    return this.me.confirmAdult(user);
  }

  /** Deletes the account and ends the session in this browser. */
  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.me.remove(user);
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions);
  }
}
