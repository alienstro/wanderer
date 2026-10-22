import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { ReportsService } from "./reports.service.js";

@Controller("characters/:id/report")
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<{ id: string }> {
    return this.reports.create(user, id, body);
  }
}
