import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { OverviewStats } from "@wanderer/shared";
import { AdminGuard } from "../auth/admin.guard.js";
import { SessionGuard } from "../auth/session.guard.js";
import { OverviewService, parseOverviewQuery } from "./overview.service.js";

/** The numbers of the admin overview page. Each panel has its own endpoint. */
@Controller("admin/overview")
@UseGuards(SessionGuard, AdminGuard)
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get("stats")
  stats(@Query() query: unknown): Promise<OverviewStats> {
    return this.overview.stats(parseOverviewQuery(query));
  }
}
