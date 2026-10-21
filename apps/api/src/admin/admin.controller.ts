import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import type { AdminReport, AdminReportList } from "@wanderer/shared";
import { AdminGuard } from "../auth/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { AdminService } from "./admin.service.js";

@Controller("admin")
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("reports")
  async reports(): Promise<AdminReportList> {
    return { reports: await this.admin.listOpen() };
  }

  @Post("reports/:id/resolve")
  @HttpCode(200)
  resolve(@CurrentUser() admin: User, @Param("id") id: string, @Body() body: unknown): Promise<AdminReport> {
    return this.admin.resolve(admin, id, body);
  }

  @Post("users/:id/ban")
  @HttpCode(200)
  async ban(@Param("id") id: string): Promise<{ ok: true }> {
    await this.admin.ban(id);
    return { ok: true };
  }
}
